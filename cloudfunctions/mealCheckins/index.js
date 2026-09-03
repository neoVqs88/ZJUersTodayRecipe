const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const {command} = db;
const RECORDS_COLLECTION = 'mealRecords';
const USERS_COLLECTION = 'users';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function getUserId(openid) {
  return crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32);
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanProbability(value) {
  const probability = Number(value);
  if (!Number.isFinite(probability)) return 0;
  return Math.min(Math.max(probability, 0), 1);
}

function cleanCalorie(value) {
  const calorie = Number.parseFloat(value);
  if (!Number.isFinite(calorie) || calorie < 0) return null;
  return Math.round(calorie * 10) / 10;
}

function cleanNutritionValue(value) {
  const nutritionValue = Number.parseFloat(value);
  if (!Number.isFinite(nutritionValue) || nutritionValue < 0) return null;
  return Math.round(nutritionValue * 10) / 10;
}

function isRisky(result = {}) {
  const detail = result.result || result;
  return detail.suggest === 'risky' || detail.label === 100 || detail.errCode === 87014;
}

async function checkMealImage(fileID, userId) {
  if (!fileID.includes(`/dish-recognize/${userId}/`)) {
    const error = new Error('只能保存当前账号上传的打卡图片');
    error.code = 'INVALID_IMAGE_OWNER';
    throw error;
  }
  const file = await cloud.downloadFile({ fileID });
  if (!file.fileContent || !file.fileContent.length || file.fileContent.length > 5 * 1024 * 1024) {
    const error = new Error('打卡图片大小无效');
    error.code = 'INVALID_IMAGE_SIZE';
    throw error;
  }
  const header = file.fileContent.slice(0, 4).toString('hex');
  const contentType = header.startsWith('89504e47') ? 'image/png' : header.startsWith('ffd8') ? 'image/jpeg' : '';
  if (!contentType) {
    const error = new Error('打卡图片仅支持 JPG 或 PNG 格式');
    error.code = 'INVALID_IMAGE_TYPE';
    throw error;
  }
  const result = await cloud.openapi.security.imgSecCheck({
    media: { contentType, value: file.fileContent },
  });
  if (isRisky(result)) {
    const error = new Error('打卡图片可能包含不适宜内容，请更换后重试');
    error.code = 'IMAGE_RISKY';
    throw error;
  }
}

function getChinaDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function getDateKey(date = new Date()) {
  const chinaDate = getChinaDate(date);
  const year = chinaDate.getUTCFullYear();
  const month = String(chinaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDateKeys(date = new Date()) {
  const chinaDate = getChinaDate(date);
  const day = chinaDate.getUTCDay() || 7;
  const monday = new Date(chinaDate.getTime() - (day - 1) * 24 * 60 * 60 * 1000);
  return Array.from({ length: 7 }, (_, index) => {
    const target = new Date(monday.getTime() + index * 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
    return getDateKey(target);
  });
}

function getMealType(date = new Date()) {
  const hour = getChinaDate(date).getUTCHours();
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 22) return 'dinner';
  return 'snack';
}

function toPublicRecord(record) {
  return {
    id: record._id,
    imageFileId: record.imageFileId,
    dishName: record.dishName,
    confidence: record.confidence || 0,
    mealType: record.mealType || 'snack',
    dateKey: record.dateKey || '',
    mealTime: record.mealTime || record.createdAt,
    nutritionAnalysis: record.nutritionAnalysis || { status: 'pending' },
    createdAt: record.createdAt,
  };
}

async function readUser(userId) {
  try {
    const result = await db.collection(USERS_COLLECTION).doc(userId).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
}

async function getRecentRecords(userId) {
  const records = [];
  for (let batch = 0; batch < 20; batch += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await db.collection(RECORDS_COLLECTION).where({
      userId,
      status: 'active',
    }).skip(batch * MAX_LIMIT).limit(MAX_LIMIT).get();
    records.push(...result.data);
    if (result.data.length < MAX_LIMIT) break;
  }
  return records.sort((a, b) => {
    const left = new Date(a.mealTime || a.createdAt || 0).getTime();
    const right = new Date(b.mealTime || b.createdAt || 0).getTime();
    return right - left;
  });
}

function calculateStreak(dateKeys) {
  const keys = new Set(dateKeys);
  let cursor = new Date();
  let streak = 0;
  if (!keys.has(getDateKey(cursor))) cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  while (keys.has(getDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

async function buildStats(userId) {
  const [countResult, records] = await Promise.all([
    db.collection(RECORDS_COLLECTION).where({ userId, status: 'active' }).count(),
    getRecentRecords(userId),
  ]);
  const weekDateKeys = getWeekDateKeys();
  const checkedDateKeys = new Set(records.map((record) => record.dateKey).filter(Boolean));
  const weeklyCheckIns = weekDateKeys.map((key) => checkedDateKeys.has(key));
  return {
    totalCount: countResult.total,
    weeklyCount: weeklyCheckIns.filter(Boolean).length,
    weeklyGoal: 7,
    weeklyCheckIns,
    streakDays: calculateStreak(Array.from(checkedDateKeys)),
  };
}

async function createRecord(event, context, userId) {
  const user = await readUser(userId);
  if (!user || user.status !== 'active') {
    return { success: false, code: 'LOGIN_REQUIRED', message: '请先登录后再进行打卡' };
  }

  const imageFileId = cleanText(event.fileID, 500);
  const dish = event.dish || {};
  const dishName = cleanText(dish.name, 50);
  if (!imageFileId || !/^cloud:\/\//.test(imageFileId)) {
    return { success: false, code: 'INVALID_IMAGE', message: '打卡图片无效，请重新上传' };
  }
  if (!dishName) return { success: false, code: 'INVALID_DISH', message: '请确认识别出的菜品名称' };

  const existingResult = await db.collection(RECORDS_COLLECTION).where({
    userId,
    imageFileId,
    status: 'active',
  }).limit(1).get();
  if (existingResult.data.length) {
    return {
      success: true,
      alreadyExists: true,
      record: toPublicRecord(existingResult.data[0]),
      stats: await buildStats(userId),
    };
  }
  await checkMealImage(imageFileId, userId);

  const nutritionSourceData = event.nutrition || dish.nutrition;
  const nutrition = nutritionSourceData && typeof nutritionSourceData === 'object' ? nutritionSourceData : {};
  const nutritionCalorie = cleanCalorie(nutrition.caloriesPer100g);
  const calorie = nutritionCalorie === null ? cleanCalorie(dish.calorie) : nutritionCalorie;
  const protein = cleanNutritionValue(nutrition.proteinPer100g);
  const carbohydrate = cleanNutritionValue(nutrition.carbohydratePer100g);
  const fat = cleanNutritionValue(nutrition.fatPer100g);
  const nutritionSource = nutrition.source === 'hunyuan' ? 'hunyuan' : null;
  let nutritionStatus = 'pending';
  if (nutritionSource) nutritionStatus = 'estimated';
  else if (calorie !== null) nutritionStatus = 'partial';
  const candidates = Array.isArray(event.candidates)
    ? event.candidates.slice(0, 5).map((item) => ({
        name: cleanText(item.name, 50),
        probability: cleanProbability(item.probability),
        calorie: cleanCalorie(item.calorie),
      })).filter((item) => item.name)
    : [];
  const now = new Date();
  const addResult = await db.collection(RECORDS_COLLECTION).add({
    data: {
      _openid: context.OPENID,
      userId,
      imageFileId,
      dishName,
      confidence: cleanProbability(dish.probability),
      recognitionCandidates: candidates,
      recognitionProvider: 'baidu-dish',
      mealType: getMealType(now),
      mealTime: db.serverDate(),
      dateKey: getDateKey(now),
      nutritionAnalysis: {
        status: nutritionStatus,
        caloriesPer100g: calorie,
        protein,
        carbohydrate,
        fat,
        source: nutritionSource || (calorie === null ? null : 'baidu-dish'),
        sourceFood: cleanText(nutrition.sourceFood, 120),
        servingGrams: cleanNutritionValue(nutrition.servingGrams),
        estimatedCalories: cleanNutritionValue(nutrition.estimatedCalories),
        summary: '',
      },
      status: 'active',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });

  const [createdResult, stats] = await Promise.all([
    db.collection(RECORDS_COLLECTION).doc(addResult._id).get(),
    buildStats(userId),
  ]);
  await db.collection(USERS_COLLECTION).doc(userId).update({
    data: {
      checkInCount: stats.totalCount,
      weeklyCheckIns: stats.weeklyCheckIns,
      streakDays: stats.streakDays,
      updatedAt: db.serverDate(),
    },
  });
  return { success: true, record: toPublicRecord(createdResult.data), stats };
}

async function listRecords(event, userId) {
  const page = Math.max(1, Number(event.page) || 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const month = /^\d{4}-\d{2}$/.test(String(event.month || '')) ? String(event.month) : '';
  const condition = { userId, status: 'active' };
  if (month) condition.dateKey = command.gte(`${month}-01`).and(command.lte(`${month}-31`));
  const [recordsResult, countResult, stats] = await Promise.all([
    db.collection(RECORDS_COLLECTION)
      .where(condition)
      .orderBy('mealTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    db.collection(RECORDS_COLLECTION).where(condition).count(),
    buildStats(userId),
  ]);
  return {
    success: true,
    records: recordsResult.data.map(toPublicRecord),
    total: countResult.total,
    hasMore: page * pageSize < countResult.total,
    stats,
  };
}

async function updateRecord(event, userId) {
  const recordId = cleanText(event.recordId, 64);
  const dishName = cleanText(event.dishName, 50);
  if (!recordId || !dishName) return { success: false, code: 'INVALID_RECORD', message: '记录或菜品名称无效' };
  let record;
  try {
    record = (await db.collection(RECORDS_COLLECTION).doc(recordId).get()).data;
  } catch (error) {
    return { success: false, code: 'RECORD_NOT_FOUND', message: '打卡记录不存在' };
  }
  if (record.userId !== userId || record.status !== 'active') {
    return { success: false, code: 'NO_PERMISSION', message: '只能修改自己的有效记录' };
  }
  await db.collection(RECORDS_COLLECTION).doc(recordId).update({
    data: { dishName, correctedByUser: true, updatedAt: db.serverDate() },
  });
  const updated = (await db.collection(RECORDS_COLLECTION).doc(recordId).get()).data;
  return { success: true, record: toPublicRecord(updated) };
}

async function deleteRecord(event, userId) {
  const recordId = cleanText(event.recordId, 64);
  if (!recordId) return { success: false, code: 'INVALID_RECORD', message: '记录信息无效' };
  let record;
  try {
    record = (await db.collection(RECORDS_COLLECTION).doc(recordId).get()).data;
  } catch (error) {
    return { success: true, deleted: true, stats: await buildStats(userId) };
  }
  if (record.userId !== userId) return { success: false, code: 'NO_PERMISSION', message: '只能删除自己的记录' };
  await db.collection(RECORDS_COLLECTION).doc(recordId).update({
    data: { status: 'deleted', deletedAt: db.serverDate(), updatedAt: db.serverDate() },
  });
  if (/^cloud:\/\//.test(record.imageFileId || '')) {
    await cloud.deleteFile({ fileList: [record.imageFileId] }).catch(() => {});
  }
  const stats = await buildStats(userId);
  await db.collection(USERS_COLLECTION).doc(userId).update({
    data: { checkInCount: stats.totalCount, weeklyCheckIns: stats.weeklyCheckIns, streakDays: stats.streakDays, updatedAt: db.serverDate() },
  }).catch(() => {});
  return { success: true, deleted: true, stats };
}

exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext();
    if (!context.OPENID) return { success: false, code: 'LOGIN_REQUIRED', message: '无法获取当前用户身份' };
    const userId = getUserId(context.OPENID);
    if (event.action === 'create') return await createRecord(event, context, userId);
    if (event.action === 'list') return await listRecords(event, userId);
    if (event.action === 'stats') return { success: true, stats: await buildStats(userId) };
    if (event.action === 'update') return await updateRecord(event, userId);
    if (event.action === 'delete') return await deleteRecord(event, userId);
    return { success: false, message: '不支持的打卡操作' };
  } catch (error) {
    const message = error.errMsg || error.message || '打卡服务暂时不可用';
    const missingRecords = /collection.*mealRecords.*not exist|mealRecords.*不存在|-502005/i.test(message);
    return {
      success: false,
      message: missingRecords ? '请先在云开发数据库中创建 mealRecords 集合' : message,
    };
  }
};

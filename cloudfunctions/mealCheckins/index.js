const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
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
  const result = await db.collection(RECORDS_COLLECTION).where({
    userId,
    status: 'active',
  }).limit(MAX_LIMIT).get();
  return result.data.sort((a, b) => {
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

  const calorie = cleanCalorie(dish.calorie);
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
        status: calorie === null ? 'pending' : 'partial',
        caloriesPer100g: calorie,
        protein: null,
        carbohydrate: null,
        fat: null,
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
  const limit = Math.min(Math.max(Number(event.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const records = await getRecentRecords(userId);
  return {
    success: true,
    records: records.slice(0, limit).map(toPublicRecord),
    stats: await buildStats(userId),
  };
}

exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext();
    if (!context.OPENID) return { success: false, code: 'LOGIN_REQUIRED', message: '无法获取当前用户身份' };
    const userId = getUserId(context.OPENID);
    if (event.action === 'create') return await createRecord(event, context, userId);
    if (event.action === 'list') return await listRecords(event, userId);
    if (event.action === 'stats') return { success: true, stats: await buildStats(userId) };
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

const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const COLLECTION = 'mealRecords';
const MIN_MEALS_FOR_ANALYSIS = 3;

function userId(openid) {
  return crypto.createHash('sha256').update(String(openid)).digest('hex').slice(0, 32);
}

function chinaDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function dateKey(date) {
  const value = chinaDate(date);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function weekKeys(date = new Date()) {
  const value = chinaDate(date);
  const day = value.getUTCDay() || 7;
  const monday = new Date(value.getTime() - (day - 1) * 86400000);
  return Array.from({ length: 7 }, (_, index) => dateKey(new Date(monday.getTime() + index * 86400000 - 8 * 60 * 60 * 1000)));
}

function previousWeekKeys(keys) {
  const first = new Date(`${keys[0]}T00:00:00+08:00`);
  return Array.from({ length: 7 }, (_, index) => dateKey(new Date(first.getTime() - (7 - index) * 86400000)));
}

function getMealHour(record) {
  const raw = record.mealTime || record.createdAt;
  const value = raw && raw.$date ? new Date(raw.$date) : new Date(raw || 0);
  if (Number.isNaN(value.getTime())) return null;
  return chinaDate(value).getUTCHours() + chinaDate(value).getUTCMinutes() / 60;
}

function calculateScore(records, keys) {
  if (!records.length) return 0;
  const activeDays = new Set(records.map((record) => record.dateKey).filter((key) => keys.includes(key))).size;
  const mealTypes = new Set(records.map((record) => record.mealType).filter(Boolean)).size;
  const nutritionCount = records.filter((record) => Number.isFinite(Number(record.nutritionAnalysis && record.nutritionAnalysis.caloriesPer100g))).length;
  return Math.min(100, Math.round((activeDays / 7) * 60 + (Math.min(mealTypes, 3) / 3) * 20 + (nutritionCount / records.length) * 20));
}

function buildDailyMeals(records, keys) {
  return keys.map((key) => {
    const dayRecords = records.filter((record) => record.dateKey === key);
    const byType = {};
    dayRecords.forEach((record) => {
      const type = record.mealType || 'snack';
      const hour = getMealHour(record);
      if (hour !== null && byType[type] === undefined) byType[type] = Math.round(hour * 10) / 10;
    });
    return { dateKey: key, count: dayRecords.length, meals: byType };
  });
}

function topDish(records) {
  const counts = records.reduce((result, record) => {
    const name = typeof record.dishName === 'string' ? record.dishName.trim() : '';
    if (name) result[name] = (result[name] || 0) + 1;
    return result;
  }, {});
  const entry = Object.entries(counts).sort((left, right) => right[1] - left[1])[0];
  return entry ? { name: entry[0], count: entry[1] } : null;
}

function getWeekLabel(keys) {
  return `${keys[0].slice(5).replace('-', '月')}日 - ${keys[6].slice(5).replace('-', '月')}日`;
}

exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return { success: false, code: 'LOGIN_REQUIRED', message: '请先登录查看本周数据' };
    const keys = weekKeys();
    const previousKeys = previousWeekKeys(keys);
    const allKeys = [...previousKeys, ...keys];
    const currentUserId = userId(OPENID);
    const [platformResult, mineResult] = await Promise.all([
      db.collection(COLLECTION).where({ status: 'active', dateKey: _.in(keys) }).limit(1000).get(),
      db.collection(COLLECTION).where({ userId: currentUserId, status: 'active', dateKey: _.in(allKeys) }).limit(1000).get(),
    ]);
    const currentRecords = platformResult.data || [];
    const mineAll = mineResult.data || [];
    const mine = mineAll.filter((record) => keys.includes(record.dateKey));
    const previousMine = mineAll.filter((record) => previousKeys.includes(record.dateKey));
    const nutritionRecords = mine.filter((record) => Number.isFinite(Number(record.nutritionAnalysis && record.nutritionAnalysis.caloriesPer100g)));
    const nutritionReady = mine.length >= MIN_MEALS_FOR_ANALYSIS && nutritionRecords.length >= MIN_MEALS_FOR_ANALYSIS;
    const averageCalories = nutritionRecords.length
      ? Math.round(nutritionRecords.reduce((total, record) => total + Number(record.nutritionAnalysis.caloriesPer100g), 0) / nutritionRecords.length)
      : 0;
    return {
      success: true,
      weekLabel: getWeekLabel(keys),
      favoriteDish: topDish(mine),
      popularDish: topDish(currentRecords),
      platformMealCount: currentRecords.length,
      score: calculateScore(mine, keys),
      previousScore: calculateScore(previousMine, previousKeys),
      dailyMeals: buildDailyMeals(mine, keys),
      nutrition: {
        ready: nutritionReady,
        mealCount: mine.length,
        calorieCount: nutritionRecords.length,
        averageCalories,
        minimumMeals: MIN_MEALS_FOR_ANALYSIS,
        message: nutritionReady
          ? '基于本周已记录且有热量数据的餐次估算'
          : `至少记录 ${MIN_MEALS_FOR_ANALYSIS} 餐，并完成对应菜品识别后展示趋势`,
      },
    };
  } catch (error) {
    const message = error.errMsg || error.message || '本周数据暂时不可用';
    return { success: false, message: /mealRecords.*not exist|mealRecords.*不存在|-502005/i.test(message) ? '请先部署打卡功能并创建 mealRecords 集合' : message };
  }
};

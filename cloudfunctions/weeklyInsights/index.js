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
    const result = await db.collection(COLLECTION).where({ status: 'active', dateKey: _.in(keys) }).limit(1000).get();
    const records = result.data || [];
    const mine = records.filter((record) => record.userId === userId(OPENID));
    const nutritionRecords = mine.filter((record) => Number.isFinite(Number(record.nutritionAnalysis && record.nutritionAnalysis.caloriesPer100g)));
    const nutritionReady = mine.length >= MIN_MEALS_FOR_ANALYSIS && nutritionRecords.length >= MIN_MEALS_FOR_ANALYSIS;
    const averageCalories = nutritionRecords.length
      ? Math.round(nutritionRecords.reduce((total, record) => total + Number(record.nutritionAnalysis.caloriesPer100g), 0) / nutritionRecords.length)
      : 0;
    return {
      success: true,
      weekLabel: getWeekLabel(keys),
      favoriteDish: topDish(mine),
      popularDish: topDish(records),
      platformMealCount: records.length,
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

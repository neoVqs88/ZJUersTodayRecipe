export async function fetchDishNutrition(query, fileID) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }
  const response = await wx.cloud.callFunction({
    name: 'nutritionLookup',
    data: { query, fileID },
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || '营养数据查询失败');
    error.code = result.code || '';
    throw error;
  }
  return result.nutrition || null;
}

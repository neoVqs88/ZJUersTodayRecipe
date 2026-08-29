export async function fetchWeeklyInsights() {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }
  const response = await wx.cloud.callFunction({ name: 'weeklyInsights' });
  const result = response.result || {};
  if (!result.success) throw new Error(result.message || '本周数据暂时不可用');
  return result;
}

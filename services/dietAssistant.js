export async function askDietAssistant(message, history = []) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }
  const response = await wx.cloud.callFunction({
    name: 'dietAssistant',
    data: { message, history },
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || '饮食助手暂时不可用');
    error.code = result.code || '';
    throw error;
  }
  return result;
}

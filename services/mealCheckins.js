async function callMealCheckins(action, data = {}) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }

  const response = await wx.cloud.callFunction({
    name: 'mealCheckins',
    data: { action, ...data },
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || '打卡服务暂时不可用');
    error.code = result.code || '';
    throw error;
  }
  return result;
}

export function createMealCheckin({ fileID, dish, candidates = [] }) {
  return callMealCheckins('create', {
    fileID,
    dish,
    candidates,
  });
}

export function fetchMealCheckins(limit = 50) {
  return callMealCheckins('list', { limit });
}

export function fetchMealCheckinStats() {
  return callMealCheckins('stats');
}

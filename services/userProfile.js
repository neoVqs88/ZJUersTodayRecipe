import { replaceCurrentUser } from '~/services/auth';

async function callUserProfile(action, data = {}) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }

  const response = await wx.cloud.callFunction({
    name: 'ensureUser',
    data: { action, ...data },
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || '用户资料服务暂时不可用');
    error.code = result.code || '';
    throw error;
  }
  return result;
}

export function fetchUserProfile(userId) {
  return callUserProfile('getProfile', { userId: String(userId || '') });
}

export async function updateMyProfile(profile) {
  const result = await callUserProfile('updateProfile', { profile });
  replaceCurrentUser(result.user);
  return result.user;
}

import { handleAuthError } from '~/services/auth';

async function callUserSocial(action, data = {}) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }
  const response = await wx.cloud.callFunction({
    name: 'userSocial',
    data: { action, ...data },
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || '用户服务暂时不可用');
    error.code = result.code || '';
    handleAuthError(error);
    throw error;
  }
  return result;
}

export function fetchSocialDashboard(userId, limit = 30) {
  return callUserSocial('dashboard', { userId: String(userId || ''), limit });
}

export function followUser(userId) {
  return callUserSocial('follow', { userId: String(userId || '') });
}

export function unfollowUser(userId) {
  return callUserSocial('unfollow', { userId: String(userId || '') });
}

export function fetchFollowUsers(userId, mode, limit = 50) {
  return callUserSocial('listFollows', { userId: String(userId || ''), mode, limit });
}

export function fetchPrivacySettings() {
  return callUserSocial('getPrivacy');
}

export function savePrivacySettings(privacy) {
  return callUserSocial('updatePrivacy', { privacy });
}

export function recordBrowsingHistory(item) {
  return callUserSocial('recordHistory', { item });
}

export function fetchBrowsingHistory(type = '', limit = 100) {
  return callUserSocial('listHistory', { type, limit });
}

export function removeBrowsingHistory(historyId) {
  return callUserSocial('removeHistory', { historyId: String(historyId || '') });
}

export function clearBrowsingHistory() {
  return callUserSocial('clearHistory');
}

const TOKEN_KEY = 'community_admin_token';
const EXPIRES_KEY = 'community_admin_expires_at';

function clearAdminSession() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(EXPIRES_KEY);
}

function getAdminToken() {
  const token = wx.getStorageSync(TOKEN_KEY);
  const expiresAt = Number(wx.getStorageSync(EXPIRES_KEY)) || 0;
  if (!token || expiresAt <= Date.now()) {
    clearAdminSession();
    return '';
  }
  return token;
}

async function callAdmin(action, data = {}, requireSession = true) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') throw new Error('当前基础库不支持云开发');
  const token = requireSession ? getAdminToken() : '';
  if (requireSession && !token) {
    const error = new Error('管理会话已失效，请重新输入密钥');
    error.code = 'ADMIN_SESSION_INVALID';
    throw error;
  }
  const response = await wx.cloud.callFunction({
    name: 'adminCommunity',
    data: { action, token, ...data },
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || '社区管理服务暂时不可用');
    error.code = result.code || '';
    if (error.code === 'ADMIN_SESSION_INVALID') clearAdminSession();
    throw error;
  }
  return result;
}

export async function loginCommunityAdmin(key) {
  const result = await callAdmin('login', { key }, false);
  wx.setStorageSync(TOKEN_KEY, result.token);
  wx.setStorageSync(EXPIRES_KEY, result.expiresAt);
  return result;
}

export function fetchAdminPosts(page = 1, pageSize = 20) {
  return callAdmin('listPosts', { page, pageSize });
}

export function deleteAdminPost(postId, reason) {
  return callAdmin('deletePost', { postId, reason });
}

export function fetchAdminReports(page = 1, pageSize = 20, status = 'pending') {
  return callAdmin('listReports', { page, pageSize, status });
}

export function resolveAdminReport(reportId, resolution) {
  return callAdmin('resolveReport', { reportId, resolution });
}

export function migrateLegacyPostLikes(page = 1) {
  return callAdmin('migrateLegacyLikes', { page });
}

export function hasAdminSession() {
  return Boolean(getAdminToken());
}

export { clearAdminSession };

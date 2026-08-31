const TOKEN_KEY = 'access_token';
const USER_KEY = 'current_user';
const CLOUD_SESSION_PREFIX = 'cloud-session:';
const SESSION_CHECK_KEY = 'session_checked_at';
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;
const INVALID_ACCOUNT_CODES = ['ACCOUNT_DELETED', 'SESSION_INVALID', 'USER_DISABLED', 'USER_NOT_FOUND', 'LOGIN_REQUIRED'];

function updateGlobalUser(user) {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.userInfo = user || null;
  } catch (error) {
    // App 初始化前调用时仅保留本地登录态。
  }
}

function emitAuthChange(user, reason = '') {
  try {
    const app = getApp();
    if (app && app.eventBus) app.eventBus.emit('auth-change', { user: user || null, reason });
  } catch (error) {
    // App 初始化前无需广播。
  }
}

function getCloudProfile(user = {}) {
  return {
    nickName: user.nickName || user.name || '',
    avatarUrl: user.avatarUrl || user.image || '',
  };
}

function getCloudSessionToken(user) {
  return CLOUD_SESSION_PREFIX + user.id;
}

export function saveSession({ token, user }) {
  if (!token) throw new Error('登录响应中缺少会话标识');
  if (!user || !user.id) throw new Error('登录响应中缺少用户信息');
  wx.setStorageSync(TOKEN_KEY, token);
  wx.setStorageSync(USER_KEY, user);
  updateGlobalUser(user);
  emitAuthChange(user);
}

export function clearSession(reason = '') {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
  wx.removeStorageSync(SESSION_CHECK_KEY);
  updateGlobalUser(null);
  emitAuthChange(null, reason);
}

export function isLoggedIn() {
  const token = wx.getStorageSync(TOKEN_KEY);
  const user = wx.getStorageSync(USER_KEY);
  return Boolean(token && user && user.id);
}

export function getCurrentUser() {
  return wx.getStorageSync(USER_KEY) || null;
}

export function replaceCurrentUser(user) {
  if (!user || !user.id) throw new Error('用户信息无效');
  const token = wx.getStorageSync(TOKEN_KEY) || getCloudSessionToken(user);
  saveSession({ token, user });
  return user;
}

function createServiceError(result, fallback) {
  const error = new Error(result.message || fallback);
  error.code = result.code || '';
  return error;
}

export function handleAuthError(error) {
  if (error && INVALID_ACCOUNT_CODES.includes(error.code)) clearSession(error.code);
  return error;
}

async function callEnsureUser(data) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }
  const response = await wx.cloud.callFunction({ name: 'ensureUser', data });
  return response.result || {};
}

export function getWechatCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code, errMsg }) => {
        if (code) resolve(code);
        else reject(new Error(errMsg || '未能获取微信登录凭证'));
      },
      fail: reject,
    });
  });
}

export function getWechatProfile() {
  if (typeof wx.getUserProfile !== 'function') return Promise.resolve({});
  return new Promise((resolve) => {
    wx.getUserProfile({
      desc: '用于完善校园美食社区中的头像和昵称',
      success: ({ userInfo }) => resolve(userInfo || {}),
      fail: () => resolve({}),
    });
  });
}

export async function ensureCloudUser({ profile = {}, loginMethod = 'wechat', consent = {} } = {}) {
  const result = await callEnsureUser({ profile: getCloudProfile(profile), loginMethod, consent });
  if (!result.success || !result.user) {
    throw createServiceError(result, '云端用户初始化失败');
  }
  return result;
}

export async function validateCloudSession({ force = false } = {}) {
  if (!isLoggedIn()) return null;
  const checkedAt = Number(wx.getStorageSync(SESSION_CHECK_KEY)) || 0;
  if (!force && Date.now() - checkedAt < SESSION_CHECK_INTERVAL) return getCurrentUser();
  const result = await callEnsureUser({ action: 'validateSession' });
  if (!result.success || !result.user) {
    const error = createServiceError(result, '登录状态校验失败');
    handleAuthError(error);
    throw error;
  }
  const token = wx.getStorageSync(TOKEN_KEY) || getCloudSessionToken(result.user);
  saveSession({ token, user: result.user });
  wx.setStorageSync(SESSION_CHECK_KEY, Date.now());
  return result.user;
}

export function refreshCloudUser() {
  return validateCloudSession({ force: true });
}

export async function deleteCloudAccount() {
  const result = await callEnsureUser({ action: 'deleteAccount', confirmation: 'DELETE_ACCOUNT' });
  if (!result.success || result.deleted !== true || result.deletionVersion !== 1) {
    throw createServiceError(result, '账号注销未完成，请确认 ensureUser 云函数已更新');
  }
  clearSession('ACCOUNT_DELETED');
  return result;
}

export async function reactivateCloudAccount(profile = {}, consent = {}) {
  const result = await callEnsureUser({ action: 'reactivateAccount', profile: getCloudProfile(profile), consent });
  if (!result.success || !result.user) throw createServiceError(result, '重新创建账号失败');
  saveSession({ token: getCloudSessionToken(result.user), user: result.user });
  wx.setStorageSync(SESSION_CHECK_KEY, Date.now());
  return result;
}

export async function loginWithWechat({ reactivate = false, consent = {} } = {}) {
  const profile = await getWechatProfile();
  const result = reactivate
    ? await reactivateCloudAccount(profile, consent)
    : await ensureCloudUser({ profile, loginMethod: 'wechat', consent });
  saveSession({
    token: getCloudSessionToken(result.user),
    user: result.user,
  });
  wx.setStorageSync(SESSION_CHECK_KEY, Date.now());
  return result;
}

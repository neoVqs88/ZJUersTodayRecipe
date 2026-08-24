import request from '~/api/request';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'current_user';
const CLOUD_SESSION_PREFIX = 'cloud-session:';

function updateGlobalUser(user) {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.userInfo = user || null;
  } catch (error) {
    // App 初始化前调用时仅保留本地登录态。
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
}

export function clearSession() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
  updateGlobalUser(null);
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

export async function ensureCloudUser({ profile = {}, loginMethod = 'wechat' } = {}) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }

  const response = await wx.cloud.callFunction({
    name: 'ensureUser',
    data: {
      profile: getCloudProfile(profile),
      loginMethod,
    },
  });
  const result = response.result || {};
  if (!result.success || !result.user) {
    throw new Error(result.message || '云端用户初始化失败');
  }
  return result;
}

export async function refreshCloudUser() {
  const cachedUser = getCurrentUser() || {};
  const result = await ensureCloudUser({
    profile: cachedUser,
    loginMethod: 'restore',
  });
  const token = wx.getStorageSync(TOKEN_KEY) || getCloudSessionToken(result.user);
  saveSession({ token, user: result.user });
  return result.user;
}

export async function loginWithWechat() {
  const profile = await getWechatProfile();
  const result = await ensureCloudUser({
    profile,
    loginMethod: 'wechat',
  });
  saveSession({
    token: getCloudSessionToken(result.user),
    user: result.user,
  });
  return result;
}

export function sendSmsCode(phoneNumber) {
  return request('/auth/sms/send', 'POST', { phoneNumber });
}

export async function loginWithSms(phoneNumber, verifyCode) {
  const response = await request('/auth/sms/login', 'POST', { phoneNumber, verifyCode });
  const cloudResult = await ensureCloudUser({
    profile: response.data.user || {},
    loginMethod: 'sms',
  });
  saveSession({
    token: response.data.token || getCloudSessionToken(cloudResult.user),
    user: cloudResult.user,
  });
  return {
    ...response.data,
    isNewUser: cloudResult.isNewUser,
    user: cloudResult.user,
  };
}

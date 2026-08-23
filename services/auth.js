import request from '~/api/request';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'current_user';

function updateGlobalUser(user) {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.userInfo = user || null;
  } catch (error) {
    // App 初始化前调用时仅保留本地登录态。
  }
}

export function saveSession({ token, user }) {
  if (!token) throw new Error('登录响应中缺少 token');
  wx.setStorageSync(TOKEN_KEY, token);
  if (user) wx.setStorageSync(USER_KEY, user);
  updateGlobalUser(user);
}

export function clearSession() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
  updateGlobalUser(null);
}

export function isLoggedIn() {
  return Boolean(wx.getStorageSync(TOKEN_KEY));
}

export function getCurrentUser() {
  return wx.getStorageSync(USER_KEY) || null;
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

export async function loginWithWechat() {
  const code = await getWechatCode();
  const response = await request('/auth/wechat/login', 'POST', { code });
  saveSession(response.data);
  return response.data;
}

export function sendSmsCode(phoneNumber) {
  return request('/auth/sms/send', 'POST', { phoneNumber });
}

export async function loginWithSms(phoneNumber, verifyCode) {
  const response = await request('/auth/sms/login', 'POST', { phoneNumber, verifyCode });
  saveSession(response.data);
  return response.data;
}

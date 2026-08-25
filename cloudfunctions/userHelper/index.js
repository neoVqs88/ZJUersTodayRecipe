// 云函数：用户助手
// 本期只有一个用途：告诉前端"你是谁"（openid 是敏感身份标识，只有云函数拿得到）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  return { success: true, openid: OPENID };
};

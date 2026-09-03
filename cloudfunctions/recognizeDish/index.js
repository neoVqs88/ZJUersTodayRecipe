// 云函数：识别菜肴图片，返回菜名
// 调用链：小程序把图片传到云存储 → 把 fileID 传给本函数 → 本函数调百度菜品识别 API → 返回菜名
const crypto = require('crypto');
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ⚠️ 密钥从云函数的"环境变量"里读取（在云开发控制台配置），绝不写进代码！
const API_KEY = process.env.BAIDU_API_KEY;
const SECRET_KEY = process.env.BAIDU_SECRET_KEY;
const USERS_COLLECTION = 'users';
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// 百度 access_token 有效期约 30 天，缓存复用，不必每次都去换
let tokenCache = { value: null, expireAt: 0 };

function getUserId(openid) {
  return crypto.createHash('sha256').update(String(openid)).digest('hex').slice(0, 32);
}

function toTimestamp(value) {
  const date = value && value.$date ? new Date(value.$date) : new Date(value || 0);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function requireActiveUserAndConsumeQuota(openid) {
  if (!openid) {
    const error = new Error('请先登录后再识别菜品');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  const userId = getUserId(openid);
  await db.runTransaction(async (transaction) => {
    const userRef = transaction.collection(USERS_COLLECTION).doc(userId);
    let user;
    try {
      user = (await userRef.get()).data;
    } catch (error) {
      user = null;
    }
    if (!user || user.status !== 'active') {
      const error = new Error('请先完成微信登录');
      error.code = 'LOGIN_REQUIRED';
      throw error;
    }
    const now = Date.now();
    const windowStartedAt = toTimestamp(user.recognizeWindowStartedAt);
    const inWindow = windowStartedAt && now - windowStartedAt < RATE_WINDOW_MS;
    const count = inWindow ? Number(user.recognizeWindowCount || 0) : 0;
    if (count >= RATE_LIMIT) {
      const error = new Error('识别请求较频繁，请稍后再试');
      error.code = 'RATE_LIMITED';
      throw error;
    }
    await userRef.update({
      data: {
        recognizeWindowStartedAt: new Date(inWindow ? windowStartedAt : now),
        recognizeWindowCount: count + 1,
        updatedAt: db.serverDate(),
      },
    });
  });
  return userId;
}

function isRisky(result = {}) {
  const detail = result.result || result;
  return detail.suggest === 'risky' || detail.label === 100 || detail.errCode === 87014;
}

async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expireAt) {
    return tokenCache.value;
  }
  const res = await axios.get('https://aip.baidubce.com/oauth/2.0/token', {
    params: {
      grant_type: 'client_credentials',
      client_id: API_KEY,
      client_secret: SECRET_KEY,
    },
  });
  tokenCache = {
    value: res.data.access_token,
    expireAt: Date.now() + 25 * 24 * 3600 * 1000, // 保守起见只缓存 25 天
  };
  return tokenCache.value;
}

exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext();
    const userId = await requireActiveUserAndConsumeQuota(context.OPENID);
    if (!API_KEY || !SECRET_KEY) {
      return { success: false, code: 'RECOGNITION_NOT_CONFIGURED', message: '菜品识别服务尚未配置' };
    }
    if (!event.fileID) {
      return { success: false, message: '缺少图片 fileID' };
    }
    const fileID = String(event.fileID);
    if (!fileID.includes(`/dish-recognize/${userId}/`)) {
      return { success: false, code: 'INVALID_IMAGE_OWNER', message: '只能识别当前账号上传的图片' };
    }

    // 1. 从云存储下载图片，转成 base64
    const file = await cloud.downloadFile({ fileID });
    if (!file.fileContent || !file.fileContent.length || file.fileContent.length > MAX_IMAGE_BYTES) {
      return { success: false, code: 'INVALID_IMAGE_SIZE', message: '图片大小无效，请选择 5MB 以内的图片' };
    }
    const header = file.fileContent.slice(0, 4).toString('hex');
    let contentType = '';
    if (header.startsWith('89504e47')) contentType = 'image/png';
    else if (header.startsWith('ffd8')) contentType = 'image/jpeg';
    if (!contentType) return { success: false, code: 'INVALID_IMAGE_TYPE', message: '仅支持 JPG 或 PNG 图片' };
    const securityResult = await cloud.openapi.security.imgSecCheck({
      media: { contentType, value: file.fileContent },
    });
    if (isRisky(securityResult)) {
      return { success: false, code: 'IMAGE_RISKY', message: '图片可能包含不适宜内容，请更换后重试' };
    }
    const imageBase64 = file.fileContent.toString('base64');

    // 2. 调用百度菜品识别接口
    const token = await getAccessToken();
    const url = `https://aip.baidubce.com/rest/2.0/image-classify/v2/dish?access_token=${token}`;
    const res = await axios.post(
      url,
      `image=${encodeURIComponent(imageBase64)}&top_num=5`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (res.data.error_code) {
      return { success: false, message: `百度接口错误 ${res.data.error_code}: ${res.data.error_msg}` };
    }

    // 3. 整理返回：候选菜名列表，按置信度从高到低
    return {
      success: true,
      dishes: (res.data.result || []).map((d) => ({
        name: d.name,               // 菜名
        probability: d.probability, // 置信度，0~1
        calorie: d.calorie,         // 每百克卡路里（部分菜品无此字段）
      })),
    };
  } catch (err) {
    console.error('recognizeDish failed', err && err.code, err && err.message);
    return {
      success: false,
      code: err.code || 'RECOGNITION_FAILED',
      message: ['LOGIN_REQUIRED', 'RATE_LIMITED'].includes(err.code) ? err.message : '菜品识别暂时不可用，请稍后再试',
    };
  }
};

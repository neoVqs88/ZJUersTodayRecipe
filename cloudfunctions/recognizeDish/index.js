// 云函数：识别菜肴图片，返回菜名
// 调用链：小程序把图片传到云存储 → 把 fileID 传给本函数 → 本函数调百度菜品识别 API → 返回菜名
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ⚠️ 密钥从云函数的"环境变量"里读取（在云开发控制台配置），绝不写进代码！
const API_KEY = process.env.BAIDU_API_KEY;
const SECRET_KEY = process.env.BAIDU_SECRET_KEY;

// 百度 access_token 有效期约 30 天，缓存复用，不必每次都去换
let tokenCache = { value: null, expireAt: 0 };

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

exports.main = async (event) => {
  try {
    if (!event.fileID) {
      return { success: false, message: '缺少图片 fileID' };
    }

    // 1. 从云存储下载图片，转成 base64
    const file = await cloud.downloadFile({ fileID: event.fileID });
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
    return { success: false, message: err.message };
  }
};

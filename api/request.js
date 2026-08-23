import config from '~/config';

const { baseUrl } = config;
const delay = config.isMock ? 500 : 0;

function normalizeResponse(response) {
  const hasHttpStatus = typeof response.statusCode === 'number';
  const statusCode = hasHttpStatus ? response.statusCode : 200;
  const body = hasHttpStatus ? response.data : response;

  if (statusCode < 200 || statusCode >= 300) {
    throw body || { message: `HTTP ${statusCode}` };
  }

  if (body && (body.success === false || (body.code !== undefined && ![0, 200].includes(body.code)))) {
    throw body;
  }

  return body;
}

function request(url, method = 'GET', data = {}) {
  const header = {
    'content-type': 'application/json',
    // 有其他content-type需求加点逻辑判断处理即可
  };
  // 获取token，有就丢进请求头
  const tokenString = wx.getStorageSync('access_token');
  if (tokenString) {
    header.Authorization = `Bearer ${tokenString}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + url,
      method,
      data,
      dataType: 'json', // 微信官方文档中介绍会对数据进行一次JSON.parse
      header,
      success(res) {
        setTimeout(() => {
          try {
            resolve(normalizeResponse(res));
          } catch (error) {
            if (res.statusCode === 401) wx.removeStorageSync('access_token');
            reject(error);
          }
        }, delay);
      },
      fail(err) {
        setTimeout(() => {
          // 断网、服务器挂了都会fail回调，直接reject即可
          reject(err);
        }, delay);
      },
    });
  });
}

// 导出请求和服务地址
export default request;

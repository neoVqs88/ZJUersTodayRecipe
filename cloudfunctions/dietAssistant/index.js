const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TOKENHUB_BASE_URL = (process.env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com/v1').replace(/\/+$/, '');
const TOKENHUB_URL = `${TOKENHUB_BASE_URL}/chat/completions`;
const MAX_MESSAGE_LENGTH = 300;
const MAX_HISTORY_LENGTH = 6;
const DIET_TOPIC = /饮食|营养|食物|食品|菜品|吃|餐|早餐|午餐|晚餐|加餐|零食|热量|卡路里|蛋白质|蛋白|碳水|脂肪|维生素|矿物质|盐|糖|水分|饮料|体重|减肥|增肌|过敏|食堂|食谱|烹饪|食品安全|健康/;

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
    const error = new Error('请先登录后再使用饮食助手');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  const userId = getUserId(openid);
  await db.runTransaction(async (transaction) => {
    const userRef = transaction.collection('users').doc(userId);
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
    const startedAt = toTimestamp(user.assistantWindowStartedAt);
    const inWindow = startedAt && now - startedAt < 60 * 60 * 1000;
    const count = inWindow ? Number(user.assistantWindowCount || 0) : 0;
    if (count >= 30) {
      const error = new Error('咨询次数较多，请稍后再试');
      error.code = 'RATE_LIMITED';
      throw error;
    }
    await userRef.update({ data: {
      assistantWindowStartedAt: new Date(inWindow ? startedAt : now),
      assistantWindowCount: count + 1,
      updatedAt: db.serverDate(),
    } });
  });
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isDietQuestion(value) {
  return DIET_TOPIC.test(value);
}

function parseAnswer(response) {
  const content = response.data && response.data.choices && response.data.choices[0]
    && response.data.choices[0].message && response.data.choices[0].message.content;
  if (Array.isArray(content)) return content.map((part) => part.text || '').join('').trim();
  return cleanText(content, 1200);
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_HISTORY_LENGTH).reduce((messages, item) => {
    const role = item && item.role === 'assistant' ? 'assistant' : 'user';
    const content = cleanText(item && item.content, MAX_MESSAGE_LENGTH);
    if (content) messages.push({ role, content });
    return messages;
  }, []);
}

exports.main = async (event = {}) => {
  try {
    await requireActiveUserAndConsumeQuota(cloud.getWXContext().OPENID);
    const message = cleanText(event.message, MAX_MESSAGE_LENGTH);
    if (!message) return { success: false, code: 'INVALID_MESSAGE', message: '请输入想咨询的饮食问题' };
    if (!isDietQuestion(message)) {
      return {
        success: true,
        answered: false,
        answer: '我只回答饮食、营养和食品安全相关问题。你可以问我这顿饭怎么搭配、如何看待热量，或怎样让饮食更均衡。',
      };
    }
    const apiKey = cleanText(process.env.TOKENHUB_API_KEY || process.env.HUNYUAN_API_KEY, 300)
      .replace(/^Bearer\s+/i, '').trim();
    if (!apiKey) return { success: false, code: 'ASSISTANT_NOT_CONFIGURED', message: '饮食助手暂未配置，请稍后再试' };
    const history = cleanHistory(event.history).filter((item) => item.content !== message);
    const response = await axios.post(TOKENHUB_URL, {
      // 识图函数可能使用视觉模型；文字助手必须使用独立的文本模型配置。
      model: process.env.TOKENHUB_MODEL || 'hy3',
      messages: [
        {
          role: 'system',
          content: '你是本小程序的饮食健康咨询助手，只回答饮食、营养、食品安全和校园餐饮相关问题。非上述主题只回复“我只回答饮食、营养和食品安全相关问题”。回答简洁、具体、易执行；不要编造精确诊断，不提供疾病诊断、处方或替代医生。如果涉及严重不适、过敏反应、进食障碍或慢性病治疗，建议尽快咨询专业医务人员。明确说明内容仅供健康管理参考。',
        },
        ...history,
        { role: 'user', content: message },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    const answer = parseAnswer(response);
    if (!answer) return { success: false, code: 'EMPTY_ANSWER', message: '助手暂时没有生成回答，请换个问法' };
    return { success: true, answered: true, answer };
  } catch (error) {
    if (['LOGIN_REQUIRED', 'RATE_LIMITED'].includes(error.code)) {
      return { success: false, code: error.code, message: error.message };
    }
    const status = error.response && error.response.status;
    const errorCode = status ? `ASSISTANT_API_${status}` : 'ASSISTANT_REQUEST_FAILED';
    console.error('饮食助手调用失败', status, error.response && error.response.data, error.message);
    return { success: false, code: errorCode, message: status === 401 ? '饮食助手密钥无效或未配置' : '助手暂时不可用，请稍后再试' };
  }
};

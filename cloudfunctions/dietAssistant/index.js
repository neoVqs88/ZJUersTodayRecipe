const crypto = require('crypto');
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TOKENHUB_BASE_URL = (process.env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com/v1').replace(/\/+$/, '');
const TOKENHUB_URL = `${TOKENHUB_BASE_URL}/chat/completions`;
const MAX_MESSAGE_LENGTH = 300;
const MAX_HISTORY_LENGTH = 6;
const MEAL_RECORDS = 'mealRecords';
const WEEK_TOPIC = /最近一周|本周|这周|过去七天|饮食情况|饮食记录|吃得怎么样/;
const DIET_TOPIC = /饮食|营养|食物|食品|菜品|吃|餐|早餐|午餐|晚餐|加餐|零食|热量|卡路里|蛋白质|蛋白|碳水|脂肪|维生素|矿物质|盐|糖|水分|饮料|体重|减肥|增肌|过敏|食堂|档口|窗口|食谱|烹饪|食品安全|健康|推荐|怎么吃|玉泉|浙大|浙江大学|一食堂|二食堂|四食堂|五食堂|民族食堂|靓园|怡膳堂/;
const CAMPUS_TOPIC = /玉泉|浙大|浙江大学|食堂|档口|窗口|推荐|怎么吃|午饭|晚饭|早饭/;

const SYSTEM_PROMPT = `你是“饭团”，浙江大学玉泉校区学生使用的饮食 AI 助手。
你的首要服务范围是浙江大学玉泉校区的食堂、档口、窗口和校园饮食；回答推荐问题时，优先结合玉泉校区场景，考虑用餐时段、预算、口味、营养目标和步行便利性。
玉泉校区可优先参考这些就餐地点：玉泉一食堂、玉泉二食堂、玉泉四食堂、玉泉五食堂、玉泉民族食堂、玉泉靓园、怡膳堂和麦斯威咖啡吧。涉及具体菜品或档口时，只使用用户提供的信息或已知信息，不要编造实时营业状态、库存、价格、排队人数或不存在的档口；不确定时明确提醒用户以现场为准。
你可以帮助用户做校园内的吃饭选择、菜品搭配、营养估算、预算规划和食品安全建议。非饮食、营养、食品安全或校园餐饮问题，只回复“我主要帮助解决浙大玉泉校区的饮食和营养问题”。
回答具体、可执行；只输出最终答复，不输出思考过程、草稿或分析步骤。不要编造精确诊断，不提供疾病诊断、处方或替代医生。涉及严重不适、过敏反应、进食障碍或慢性病治疗，建议尽快咨询专业人士。所有营养和热量内容都要说明是参考或 AI 估算，不能替代专业医疗建议。`;

const CAMPUS_MENU_CONTEXT = `菜单表中的档口分类概览：玉泉二食堂包含川味拌粉、川味小吃、番茄系列、风味手工面、杭帮手擀面、火锅系列、江西小炒、精品炒饭、明档小炒、泡椒米线、清汤系列、求是小点、酸菜系列、特色砂锅、西式简餐、蒸之味、重庆米线和重庆小面；怡膳堂包含二楼玫瑰简餐、怡家馆、小乐惠、一楼食街、蒸菜、小点、煲仔饭、粤味、淮南鲜汤、西餐和轻食；玉泉民族食堂包含烤肉拌饭、烧烤、面食、清真炒饭和汤类；玉泉四食堂菜单中包含主食窗口。以上是菜单表分类摘要，不代表实时营业状态或当前库存。`;

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
  return userId;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isDietQuestion(value) {
  return DIET_TOPIC.test(value);
}

function parseAnswer(response) {
  let payload = response.data || {};
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (error) {
      return cleanText(payload, 900);
    }
  }
  const toText = (value) => {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return '';
    return value.map((part) => typeof part === 'string' ? part : part && (part.text || part.content || '')).join('');
  };
  const findText = (value, allowReasoning = false) => {
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
      return value.map((item) => findText(item, allowReasoning)).find(Boolean) || '';
    }
    const directText = ['content', 'output_text', 'text']
      .map((key) => toText(value[key]))
      .find((found) => found.trim());
    if (directText) return directText;
    if (allowReasoning) {
      const reasoningText = ['reasoning_content', 'reasoning']
        .map((key) => toText(value[key]))
        .find((found) => found.trim());
      if (reasoningText) return reasoningText;
    }
    return Object.keys(value)
      .filter((key) => allowReasoning || !/reasoning|think|analysis/i.test(key))
      .map((key) => findText(value[key], allowReasoning))
      .find(Boolean) || '';
  };
  const finalText = findText(payload) || findText(payload, true);
  const finalMarker = finalText.match(/(?:因此，?答复可以是|答复可以是|最终答案|最终回答|答复|结论|final answer|final)\s*[:：]?\s*([\s\S]+)/i);
  const text = finalMarker ? finalMarker[1] : finalText;
  return cleanText(String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/^(?:思考过程|思考|分析过程|分析)\s*[:：][\s\S]*?(?=(?:最终答案|最终回答|答复|结论)\s*[:：]?)/i, '')
    .trim(), 3000);
}

function chinaDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function recentDateKeys(date = new Date()) {
  const today = chinaDate(date);
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(today.getTime() - index * 86400000);
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  });
}

function getMealNames(record) {
  if (Array.isArray(record.dishes) && record.dishes.length) {
    return record.dishes.map((dish) => cleanText(dish.name, 40)).filter(Boolean);
  }
  return [cleanText(record.dishName, 40)].filter(Boolean);
}

function buildWeekContext(records, keys) {
  const names = records.flatMap(getMealNames);
  const counts = names.reduce((result, name) => {
    result[name] = (result[name] || 0) + 1;
    return result;
  }, {});
  const popular = Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([name, count]) => `${name}(${count})`)
    .join('、');
  const mealTypes = records.reduce((result, record) => {
    const type = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }[record.mealType] || '其他';
    result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  const typeText = Object.entries(mealTypes).map(([type, count]) => `${type}${count}次`).join('、') || '暂无餐次';
  const nutritionCount = records.filter((record) => {
    const nutrition = record.nutritionAnalysis || {};
    return Number.isFinite(Number(nutrition.caloriesPer100g));
  }).length;
  return `统计范围：最近7天（${keys[6]}至${keys[0]}）；已记录${records.length}餐；餐次：${typeText}；常吃：${popular || '暂无菜品数据'}；有热量参考的餐次：${nutritionCount}餐。`;
}

async function getRecentWeekContext(userId) {
  const keys = recentDateKeys();
  const result = await db.collection(MEAL_RECORDS).where({
    userId,
    status: 'active',
    dateKey: db.command.in(keys),
  }).limit(100).get();
  return buildWeekContext(result.data || [], keys);
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_HISTORY_LENGTH).reduce((messages, item) => {
    if (!item || item.role !== 'user') return messages;
    const role = 'user';
    const content = cleanText(item && item.content, MAX_MESSAGE_LENGTH);
    if (content) messages.push({ role, content });
    return messages;
  }, []);
}

exports.main = async (event = {}) => {
  try {
    const userId = await requireActiveUserAndConsumeQuota(cloud.getWXContext().OPENID);
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
    const weekContext = WEEK_TOPIC.test(message)
      ? await getRecentWeekContext(userId)
      : '用户未请求最近一周分析，本次不加载个人饮食记录。';
    const campusMenuContext = CAMPUS_TOPIC.test(message) ? `\n\n【玉泉菜单表摘要】\n${CAMPUS_MENU_CONTEXT}` : '';
    const response = await axios.post(TOKENHUB_URL, {
      // 识图函数可能使用视觉模型；文字助手必须使用独立的文本模型配置。
      model: process.env.TOKENHUB_MODEL || 'hy3',
      messages: [
        {
          role: 'system',
          content: `${SYSTEM_PROMPT}${campusMenuContext}\n\n【用户最近一周饮食摘要】\n${weekContext}\n请仅基于这份摘要分析，不要虚构未记录的餐次。`,
        },
        ...history,
        { role: 'user', content: message },
      ],
      temperature: 0.3,
      enable_thinking: false,
      max_tokens: 1500,
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    const answer = parseAnswer(response);
    if (!answer) {
      console.error('饮食助手返回空内容', {
        keys: Object.keys(response.data || {}),
        choices: Array.isArray(response.data && (response.data.choices || (response.data.data && response.data.data.choices)
          || (response.data.output && response.data.output.choices)))
          ? (response.data.choices || (response.data.data && response.data.data.choices) || response.data.output.choices).length : 0,
        finishReason: response.data && response.data.choices && response.data.choices[0]
          ? response.data.choices[0].finish_reason || '' : '',
        responsePreview: JSON.stringify(response.data || {}).slice(0, 1000),
      });
      return { success: false, code: 'EMPTY_ANSWER', message: '模型返回了空回答，请稍后重试' };
    }
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

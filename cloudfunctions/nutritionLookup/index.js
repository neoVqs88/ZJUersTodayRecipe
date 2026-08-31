const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const HUNYUAN_URL = 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions';

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanNumber(value, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(Math.min(number, max) * 10) / 10;
}

function parseModelResponse(response) {
  const content = response.data && response.data.choices && response.data.choices[0]
    && response.data.choices[0].message && response.data.choices[0].message.content;
  const text = Array.isArray(content) ? content.map((part) => part.text || '').join('') : content;
  if (!text) return null;
  const jsonText = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    return null;
  }
}

function toNutrition(estimate, query) {
  const servingGrams = cleanNumber(estimate && estimate.servingGrams, 2000);
  const estimatedCalories = cleanNumber(estimate && estimate.calories, 5000);
  const protein = cleanNumber(estimate && estimate.protein, 500);
  const carbohydrate = cleanNumber(estimate && estimate.carbohydrate, 1000);
  const fat = cleanNumber(estimate && estimate.fat, 500);
  if (servingGrams === null || (estimatedCalories === null && protein === null && carbohydrate === null && fat === null)) {
    return null;
  }
  const per100g = (value) => (value === null ? null : Math.round((value / servingGrams) * 100 * 10) / 10);
  return {
    status: 'estimated',
    caloriesPer100g: per100g(estimatedCalories),
    proteinPer100g: per100g(protein),
    carbohydratePer100g: per100g(carbohydrate),
    fatPer100g: per100g(fat),
    servingGrams,
    estimatedCalories,
    source: 'hunyuan',
    sourceFood: cleanText((estimate && estimate.dishName) || query, 120),
    query,
  };
}

exports.main = async (event = {}) => {
  const query = cleanText(event.query, 80);
  if (!query) return { success: false, code: 'INVALID_QUERY', message: '缺少菜品名称' };

  if (!event.fileID) return { success: false, code: 'INVALID_IMAGE', message: '缺少打卡图片' };
  const { HUNYUAN_API_KEY: apiKey } = process.env;
  if (!apiKey) {
    return { success: true, nutrition: null, code: 'NUTRITION_NOT_CONFIGURED' };
  }

  try {
    const file = await cloud.downloadFile({ fileID: event.fileID });
    const model = process.env.HUNYUAN_MODEL || 'hunyuan-turbos-vision';
    const response = await axios.post(HUNYUAN_URL, {
      model,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `你是校园餐饮营养估算助手。图片中的用户确认菜名是“${query}”。请结合图片估算这一份实际餐食，只返回 JSON，不要 Markdown：{"dishName":"菜名","servingGrams":数字,"calories":数字,"protein":数字,"carbohydrate":数字,"fat":数字}。所有营养数字均为这一份餐食的估计值，单位分别是克重、千卡、克、克、克。无法判断时仍给出合理范围内的估计，不要返回 null。`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${file.fileContent.toString('base64')}`,
            },
          },
        ],
      }],
      temperature: 0.2,
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    return { success: true, nutrition: toNutrition(parseModelResponse(response), query) };
  } catch (error) {
    console.warn('混元营养查询失败', error.response && error.response.status, error.message);
    return { success: false, code: 'NUTRITION_LOOKUP_FAILED', message: '营养数据查询失败' };
  }
};

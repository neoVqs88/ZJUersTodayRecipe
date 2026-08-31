import { isLoggedIn } from '~/services/auth';
import { fetchMealCheckins } from '~/services/mealCheckins';

const MEAL_LABELS = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.$date) return new Date(value.$date);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value, dateKey) {
  const date = parseDate(value);
  if (!date) return dateKey || '刚刚';
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function getValidCalories(value) {
  if (value === null || value === undefined || value === '') return null;
  const calories = Number(value);
  return Number.isFinite(calories) && calories >= 0 ? calories : null;
}

function formatRecord(record) {
  const nutrition = record.nutritionAnalysis || {};
  const calories = getValidCalories(nutrition.caloriesPer100g);
  const estimatedCalories = getValidCalories(nutrition.estimatedCalories);
  const servingGrams = getValidCalories(nutrition.servingGrams);
  const hasCalories = calories !== null;
  const macroText = [
    nutrition.protein === null || nutrition.protein === undefined ? '' : `蛋白质 ${nutrition.protein}克`,
    nutrition.carbohydrate === null || nutrition.carbohydrate === undefined ? '' : `碳水 ${nutrition.carbohydrate}克`,
    nutrition.fat === null || nutrition.fat === undefined ? '' : `脂肪 ${nutrition.fat}克`,
  ].filter(Boolean).join(' · ');
  let nutritionTitle = '营养分析待完善';
  if (estimatedCalories !== null) {
    nutritionTitle = `约 ${estimatedCalories} 千卡 / 份${servingGrams === null ? '' : `（估计 ${servingGrams} 克）`}`;
  } else if (hasCalories) {
    nutritionTitle = `约 ${calories} 千卡 / 100克`;
  }
  return {
    ...record,
    mealLabel: MEAL_LABELS[record.mealType] || '加餐',
    displayTime: formatDateTime(record.mealTime || record.createdAt, record.dateKey),
    confidenceText: record.confidence ? `${(record.confidence * 100).toFixed(1)}%` : '待确认',
    nutritionTitle,
    nutritionDesc: nutrition.summary || (macroText || (hasCalories ? '当前为菜品识别接口提供的参考热量' : '等待营养数据')),
    nutritionReady: hasCalories,
  };
}

Page({
  data: {
    loading: true,
    refreshing: false,
    activeFilter: 'all',
    filters: [
      { label: '全部', value: 'all' },
      { label: '早餐', value: 'breakfast' },
      { label: '午餐', value: 'lunch' },
      { label: '晚餐', value: 'dinner' },
      { label: '加餐', value: 'snack' },
    ],
    records: [],
    displayRecords: [],
    stats: {
      totalCount: 0,
      weeklyCount: 0,
      weeklyGoal: 7,
      streakDays: 0,
    },
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
    }
  },

  onShow() {
    if (isLoggedIn()) this.loadRecords();
  },

  filterRecords(records, filter) {
    return filter === 'all' ? records : records.filter((record) => record.mealType === filter);
  },

  async loadRecords() {
    try {
      const result = await fetchMealCheckins(100);
      const records = (result.records || []).map(formatRecord);
      this.setData({
        records,
        displayRecords: this.filterRecords(records, this.data.activeFilter),
        stats: result.stats || this.data.stats,
      });
    } catch (error) {
      wx.showToast({ title: error.message || '打卡记录加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  refreshRecords() {
    this.setData({ refreshing: true });
    this.loadRecords();
  },

  selectFilter(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      activeFilter: value,
      displayRecords: this.filterRecords(this.data.records, value),
    });
  },

  previewImage(event) {
    const { url } = event.currentTarget.dataset;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  showNutrition(event) {
    const { id } = event.currentTarget.dataset;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.showModal({
      title: `${record.dishName} · 营养分析`,
      content: `${record.nutritionTitle}\n${record.nutritionDesc}`,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  goCheckIn() {
    wx.switchTab({ url: '/pages/home/index' });
  },
});

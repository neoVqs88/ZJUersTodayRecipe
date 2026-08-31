import { isLoggedIn } from '~/services/auth';
import { fetchMealCheckins } from '~/services/mealCheckins';

const MEAL_LABELS = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

const THUMB_POSITIONS = ['north-east', 'south-east', 'south-west', 'north-west'];

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
    imageUrl: record.imageUrl || record.imageFileId || record.fileID || '',
    // 日期格式化函数定义在下方，运行时仍会先完成模块初始化。
    // eslint-disable-next-line no-use-before-define
    recordDateKey: getRecordDateKey(record),
    mealLabel: MEAL_LABELS[record.mealType] || '加餐',
    displayTime: formatDateTime(record.mealTime || record.createdAt, record.dateKey),
    confidenceText: record.confidence ? `${(record.confidence * 100).toFixed(1)}%` : '待确认',
    nutritionTitle,
    nutritionDesc: nutrition.summary || (macroText || (hasCalories ? '当前为菜品识别接口提供的参考热量' : '等待营养数据')),
    nutritionReady: hasCalories,
  };
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRecordDateKey(record) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(record.dateKey || '')) return record.dateKey;
  const date = parseDate(record.mealTime || record.createdAt);
  return date ? getLocalDateKey(date) : '';
}

function getSelectedDateLabel(dateKey) {
  if (!dateKey) return '';
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const prefix = dateKey === getLocalDateKey() ? '今天' : `${month} / ${day}`;
  return `${prefix} · ${weekdays[date.getDay()]}`;
}

Page({
  data: {
    loading: true,
    refreshing: false,
    activeFilter: 'all',
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    filters: [
      { label: '全部', value: 'all' },
      { label: '早餐', value: 'breakfast' },
      { label: '午餐', value: 'lunch' },
      { label: '晚餐', value: 'dinner' },
      { label: '加餐', value: 'snack' },
    ],
    records: [],
    displayRecords: [],
    calendarDays: [],
    selectedRecord: null,
    selectedDateKey: '',
    selectedDateLabel: '',
    selectedDayRecords: [],
    currentMonth: '',
    stats: {
      totalCount: 0,
      weeklyCount: 0,
      weeklyGoal: 7,
      streakDays: 0,
    },
  },

  onLoad() {
    if (!isLoggedIn()) {
      const selectedDateKey = getLocalDateKey();
      this.setData({
        loading: false,
        currentMonth: this.getMonthLabel(),
        selectedDateKey,
        selectedDateLabel: getSelectedDateLabel(selectedDateKey),
        calendarDays: this.buildCalendar([], selectedDateKey),
      });
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
      const todayKey = getLocalDateKey();
      const monthPrefix = todayKey.slice(0, 7);
      const selectedDateKey = records.some((record) => record.recordDateKey === todayKey)
        ? todayKey
        : (records.find((record) => record.recordDateKey.startsWith(monthPrefix)) || {}).recordDateKey || todayKey;
      const selectedDayRecords = records.filter((record) => record.recordDateKey === selectedDateKey);
      this.setData({
        records,
        displayRecords: this.filterRecords(records, this.data.activeFilter),
        calendarDays: this.buildCalendar(records, selectedDateKey),
        selectedDateKey,
        selectedDateLabel: getSelectedDateLabel(selectedDateKey),
        selectedDayRecords,
        selectedRecord: selectedDayRecords[0] || null,
        currentMonth: this.getMonthLabel(),
        stats: result.stats || this.data.stats,
      });
    } catch (error) {
      wx.showToast({ title: error.message || '打卡记录加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  getMonthLabel() {
    const date = new Date();
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
  },

  buildCalendar(records, selectedDateKey = getLocalDateKey()) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const recordsByDate = records.reduce((result, record) => {
      if (!record.recordDateKey.startsWith(monthPrefix)) return result;
      if (!result[record.recordDateKey]) result[record.recordDateKey] = [];
      result[record.recordDateKey].push(record);
      return result;
    }, {});
    const days = Array.from({ length: firstWeekday }, () => ({ empty: true }));
    for (let day = 1; day <= count; day += 1) {
      const dateKey = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      const dayRecords = recordsByDate[dateKey] || [];
      const recordsWithImage = dayRecords.filter((record) => record.imageUrl);
      const representative = recordsWithImage.length
        ? recordsWithImage[Math.floor(Math.random() * recordsWithImage.length)]
        : null;
      days.push({
        day,
        dateKey,
        hasMeal: dayRecords.length > 0,
        today: day === now.getDate(),
        selected: dateKey === selectedDateKey,
        representativeImage: representative ? representative.imageUrl : '',
        representativeName: representative ? representative.dishName : '',
        thumbPosition: THUMB_POSITIONS[Math.floor(Math.random() * THUMB_POSITIONS.length)],
      });
    }
    return days;
  },

  selectDay(event) {
    const { date } = event.currentTarget.dataset;
    if (!date) return;
    const selectedDayRecords = this.data.records.filter((record) => record.recordDateKey === date);
    this.setData({
      selectedDateKey: date,
      selectedDateLabel: getSelectedDateLabel(date),
      selectedDayRecords,
      selectedRecord: selectedDayRecords[0] || null,
      calendarDays: this.data.calendarDays.map((item) => ({
        ...item,
        selected: item.dateKey === date,
      })),
    });
  },

  selectRecord(event) {
    const record = this.data.records.find((item) => String(item.id) === String(event.currentTarget.dataset.id));
    if (record) this.setData({ selectedRecord: record });
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
    wx.reLaunch({ url: '/pages/home/index' });
  },
});

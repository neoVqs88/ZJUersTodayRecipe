import { isLoggedIn } from '~/services/auth';
import { createMealCheckin, deleteMealCheckin, fetchMealCheckins, updateMealCheckin } from '~/services/mealCheckins';
import { fetchDishNutrition } from '~/services/nutrition';
import recognizeDish from '~/utils/recognizeDish';
import appearanceBehavior from '~/behaviors/appearance';

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

function stableIndex(value, length) {
  if (!length) return 0;
  const hash = String(value).split('').reduce((total, char) => ((total * 31) + char.charCodeAt(0)) % 4294967296, 7);
  return hash % length;
}

Page({
  behaviors: [appearanceBehavior],
  data: {
    loading: true,
    refreshing: false,
    activeView: 'month',
    viewTabs: [
      { label: '▣ 月', value: 'month' },
      { label: '◷ 周', value: 'week' },
      { label: '⌁ 味觉云', value: 'taste' },
    ],
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    records: [],
    weekRecords: [],
    tasteCloud: [],
    calendarDays: [],
    selectedRecord: null,
    selectedDateKey: '',
    selectedDateLabel: '',
    selectedDayRecords: [],
    currentMonth: '',
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),
    monthCount: 0,
    page: 1,
    pageSize: 50,
    hasMore: true,
    loadingMore: false,
    checkInBusy: false,
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
        currentMonth: this.getMonthLabel(this.data.viewYear, this.data.viewMonth),
        selectedDateKey,
        selectedDateLabel: getSelectedDateLabel(selectedDateKey),
        calendarDays: this.buildCalendar([], selectedDateKey),
      });
    }
  },

  onShow() {
    if (isLoggedIn()) this.loadRecords(true);
  },

  async loadRecords(reset = false) {
    if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
    const page = reset ? 1 : this.data.page;
    const month = `${this.data.viewYear}-${String(this.data.viewMonth + 1).padStart(2, '0')}`;
    this.setData(reset ? { loading: true, hasMore: true } : { loadingMore: true });
    try {
      const result = await fetchMealCheckins({ page, pageSize: this.data.pageSize, month });
      const nextRecords = (result.records || []).map(formatRecord);
      const records = reset ? nextRecords : [...this.data.records, ...nextRecords];
      const todayKey = getLocalDateKey();
      const preservedDateKey = !reset && this.data.selectedDateKey.startsWith(month) ? this.data.selectedDateKey : '';
      const selectedDateKey = preservedDateKey || (
        month === todayKey.slice(0, 7) && records.some((record) => record.recordDateKey === todayKey)
          ? todayKey
          : (records.find((record) => record.recordDateKey.startsWith(month)) || {}).recordDateKey || `${month}-01`
      );
      const selectedDayRecords = records.filter((record) => record.recordDateKey === selectedDateKey);
      this.setData({
        records,
        weekRecords: this.buildWeekRecords(records, selectedDateKey),
        tasteCloud: this.buildTasteCloud(records),
        calendarDays: this.buildCalendar(records, selectedDateKey, this.data.viewYear, this.data.viewMonth),
        selectedDateKey,
        selectedDateLabel: getSelectedDateLabel(selectedDateKey),
        selectedDayRecords,
        selectedRecord: selectedDayRecords[0] || null,
        currentMonth: this.getMonthLabel(this.data.viewYear, this.data.viewMonth),
        monthCount: Number(result.total) || records.length,
        page: page + 1,
        hasMore: Boolean(result.hasMore),
        stats: result.stats || this.data.stats,
      });
    } catch (error) {
      wx.showToast({ title: error.message || '打卡记录加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false, loadingMore: false });
    }
  },

  getMonthLabel(year = this.data.viewYear, month = this.data.viewMonth) {
    return `${year} 年 ${month + 1} 月`;
  },

  buildCalendar(records, selectedDateKey = getLocalDateKey(), year = this.data.viewYear, month = this.data.viewMonth) {
    const now = new Date();
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
        ? recordsWithImage[stableIndex(dateKey, recordsWithImage.length)]
        : null;
      days.push({
        day,
        dateKey,
        hasMeal: dayRecords.length > 0,
        today: day === now.getDate() && month === now.getMonth() && year === now.getFullYear(),
        selected: dateKey === selectedDateKey,
        representativeImage: representative ? representative.imageUrl : '',
        representativeName: representative ? representative.dishName : '',
        thumbPosition: THUMB_POSITIONS[stableIndex(`${dateKey}:position`, THUMB_POSITIONS.length)],
      });
    }
    return days;
  },

  buildWeekRecords(records, anchorDateKey) {
    const [year, month, day] = String(anchorDateKey || getLocalDateKey()).split('-').map(Number);
    const anchor = new Date(year, month - 1, day);
    const weekday = anchor.getDay() || 7;
    const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - weekday + 1);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const start = getLocalDateKey(monday);
    const end = getLocalDateKey(sunday);
    return records.filter((record) => record.recordDateKey >= start && record.recordDateKey <= end);
  },

  buildTasteCloud(records) {
    const counts = records.reduce((result, record) => {
      const name = String(record.dishName || '').trim();
      if (name) result[name] = (result[name] || 0) + 1;
      return result;
    }, {});
    const max = Math.max(1, ...Object.values(counts));
    return Object.entries(counts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 18)
      .map(([name, count]) => ({ name, count, weight: 1 + Math.round((count / max) * 2) }));
  },

  selectView(event) {
    this.setData({ activeView: event.currentTarget.dataset.value });
  },

  selectDay(event) {
    const { date } = event.currentTarget.dataset;
    if (!date) return;
    const selectedDayRecords = this.data.records.filter((record) => record.recordDateKey === date);
    this.setData({
      selectedDateKey: date,
      selectedDateLabel: getSelectedDateLabel(date),
      selectedDayRecords,
      weekRecords: this.buildWeekRecords(this.data.records, date),
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
    this.loadRecords(true);
  },

  loadMore() {
    this.loadRecords(false);
  },

  changeMonth(step) {
    const date = new Date(this.data.viewYear, this.data.viewMonth + step, 1);
    this.setData({
      viewYear: date.getFullYear(),
      viewMonth: date.getMonth(),
      currentMonth: this.getMonthLabel(date.getFullYear(), date.getMonth()),
      records: [],
      weekRecords: [],
      tasteCloud: [],
    });
    this.loadRecords(true);
  },

  previousMonth() { this.changeMonth(-1); },
  nextMonth() { this.changeMonth(1); },

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
    this.checkIn();
  },

  async checkIn() {
    if (this.data.checkInBusy) return;
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({ checkInBusy: true });
    let result;
    try {
      result = await recognizeDish();
    } catch (error) {
      this.setData({ checkInBusy: false });
      return;
    }
    if (!result.success || !Array.isArray(result.dishes) || !result.dishes.length) {
      wx.showToast({ title: result.message || '识别失败，请重试', icon: 'none' });
      this.setData({ checkInBusy: false });
      return;
    }

    let dish;
    try {
      const tapIndex = await new Promise((resolve, reject) => {
        wx.showActionSheet({
          itemList: result.dishes.map((item) => item.name),
          success: ({ tapIndex: index }) => resolve(index),
          fail: reject,
        });
      });
      dish = result.dishes[tapIndex];
    } catch (error) {
      if (result.fileID) wx.cloud.deleteFile({ fileList: [result.fileID] }).catch(() => {});
      this.setData({ checkInBusy: false });
      return;
    }

    wx.showLoading({ title: '保存打卡中…', mask: true });
    try {
      let nutrition = null;
      try {
        nutrition = await fetchDishNutrition(dish.name, result.fileID);
      } catch (error) {
        // 营养服务不可用时仍使用识别结果完成打卡。
      }
      await createMealCheckin({
        fileID: result.fileID,
        dish: { ...dish, nutrition },
        candidates: result.dishes,
      });
      wx.showToast({ title: '已记下一餐', icon: 'success' });
      await this.loadRecords(true);
    } catch (error) {
      wx.showToast({ title: error.message || '打卡保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ checkInBusy: false });
    }
  },

  editRecord(event) {
    const { id } = event.currentTarget.dataset;
    const record = this.data.records.find((item) => String(item.id) === String(id));
    if (!record) return;
    wx.showModal({
      title: '修正菜品名称',
      editable: true,
      placeholderText: record.dishName,
      content: record.dishName,
      success: async ({ confirm, content }) => {
        if (!confirm || !String(content || '').trim()) return;
        try {
          await updateMealCheckin(record.id, String(content).trim());
          wx.showToast({ title: '已更新', icon: 'success' });
          this.loadRecords(true);
        } catch (error) {
          wx.showToast({ title: error.message || '修改失败', icon: 'none' });
        }
      },
    });
  },

  deleteRecord(event) {
    const { id } = event.currentTarget.dataset;
    wx.showModal({
      title: '删除这条打卡？',
      content: '删除后图片和识别记录也会从云端移除。',
      confirmText: '删除',
      confirmColor: '#df6548',
      success: async ({ confirm }) => {
        if (!confirm) return;
        try {
          await deleteMealCheckin(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadRecords(true);
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      },
    });
  },
});

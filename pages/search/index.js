import { fetchDishCatalog, getPopularSearchWords, searchCatalog } from '~/services/catalog';
import appearanceBehavior from '~/behaviors/appearance';

const HISTORY_KEY = 'dish_search_history';

Page({
  behaviors: [appearanceBehavior],
  data: {
    historyWords: [],
    popularWords: [],
    catalog: [],
    searchValue: '',
    hasSearched: false,
    quickWords: ['酸汤', '离我近', '少排队', '清淡', '热乎'],
    results: [],
    dialog: {
      title: '确认删除当前历史记录',
      showCancelButton: true,
      message: '',
    },
    dialogShow: false,
  },

  deleteType: 0,
  deleteIndex: '',

  async onLoad() {
    this.queryHistory();
    await this.queryPopular();
  },

  queryHistory() {
    const historyWords = wx.getStorageSync(HISTORY_KEY);
    this.setData({ historyWords: Array.isArray(historyWords) ? historyWords.slice(0, 12) : [] });
  },

  async queryPopular() {
    const catalog = await fetchDishCatalog();
    this.setData({ catalog, popularWords: getPopularSearchWords(catalog) });
  },

  setHistoryWords(searchValue) {
    if (!searchValue) return;

    const historyWords = [...this.data.historyWords];
    const index = historyWords.indexOf(searchValue);

    if (index !== -1) {
      historyWords.splice(index, 1);
    }
    historyWords.unshift(searchValue);
    const limitedHistory = historyWords.slice(0, 12);
    wx.setStorageSync(HISTORY_KEY, limitedHistory);

    this.setData({
      searchValue,
      historyWords: limitedHistory,
      hasSearched: true,
      results: this.runSearch(searchValue),
    });
  },

  runSearch(searchValue) {
    const keyword = String(searchValue || '').trim();
    let matches = searchCatalog(this.data.catalog, keyword);
    if (/少排队/.test(keyword)) matches = this.data.catalog.filter((dish) => dish.waitMinutes > 0 && dish.waitMinutes <= 8);
    else if (/离我近|玉泉/.test(keyword)) matches = this.data.catalog.filter((dish) => dish.campus === '玉泉');
    else if (/15元|预算/.test(keyword)) matches = this.data.catalog.filter((dish) => {
      const price = String(dish.price).match(/\d+/);
      return price && Number(price[0]) <= 15;
    });
    else if (/热的|热乎/.test(keyword)) matches = searchCatalog(this.data.catalog, '热乎');
    return matches.map((dish, index) => ({
      ...dish,
      match: `${Math.max(72, 96 - index * 4)}%`,
    }));
  },

  confirm() {
    const historyWords = [...this.data.historyWords];
    const { deleteType, deleteIndex } = this;

    if (deleteType === 0) {
      historyWords.splice(deleteIndex, 1);
      wx.setStorageSync(HISTORY_KEY, historyWords);
      this.setData({
        historyWords,
        dialogShow: false,
      });
    } else {
      wx.removeStorageSync(HISTORY_KEY);
      this.setData({ historyWords: [], dialogShow: false });
    }
  },

  close() {
    this.setData({ dialogShow: false });
  },

  handleClearHistory() {
    const { dialog } = this.data;
    this.deleteType = 1;
    this.setData({
      dialog: {
        ...dialog,
        message: '确认删除所有历史记录',
      },
      dialogShow: true,
    });
  },

  deleteCurr(e) {
    const { index } = e.currentTarget.dataset;
    const { dialog } = this.data;
    this.deleteIndex = index;
    this.deleteType = 0;
    this.setData({
      dialog: {
        ...dialog,
        message: '确认删除当前历史记录',
      },
      dialogShow: true,
    });
  },

  handleHistoryTap(e) {
    const { historyWords } = this.data;
    const { index } = e.currentTarget.dataset;
    const searchValue = historyWords[index || 0] || '';

    this.setHistoryWords(searchValue);
  },

  handlePopularTap(e) {
    const { popularWords } = this.data;
    const { index } = e.currentTarget.dataset;
    const searchValue = popularWords[index || 0] || '';

    this.setHistoryWords(searchValue);
  },

  handleQuickTap(e) {
    this.setHistoryWords(e.currentTarget.dataset.value || '');
  },

  rotatePopular() {
    const words = [...this.data.popularWords];
    if (words.length > 1) words.push(words.shift());
    this.setData({ popularWords: words });
  },

  openDish(e) {
    const dish = this.data.results[e.currentTarget.dataset.index];
    wx.navigateTo({ url: `/pages/dish/index?name=${encodeURIComponent(dish.name)}` });
  },

  clearSearch() {
    this.setData({ searchValue: '', hasSearched: false, results: [] });
  },

  handleSubmit(e) {
    const { value } = e.detail;
    if (value.length === 0) return;

    this.setHistoryWords(value);
  },

  actionHandle() {
    this.setData({
      searchValue: '',
    });
    wx.reLaunch({ url: '/pages/home/index' });
  },
});

import { clearSession, isLoggedIn } from '~/services/auth';
import {
  getAppearanceClass,
  getFontSizeLabel,
  getPreferences,
  savePreferences,
} from '~/services/preferences';

const FONT_SIZE_OPTIONS = [
  { label: '小', value: 'small' },
  { label: '标准', value: 'standard' },
  { label: '大', value: 'large' },
];

Page({
  data: {
    loggedIn: false,
    darkMode: false,
    notificationsEnabled: true,
    fontSize: 'standard',
    fontSizeLabel: '标准',
    appearanceClass: 'theme-light font-standard',
  },

  onLoad() {
    const app = getApp();
    this.handlePreferencesChange = (preferences) => this.applyPreferences(preferences);
    app.eventBus.on('preferences-change', this.handlePreferencesChange);
  },

  onShow() {
    this.setData({ loggedIn: isLoggedIn() });
    this.applyPreferences();
  },

  onUnload() {
    getApp().eventBus.off('preferences-change', this.handlePreferencesChange);
  },

  applyPreferences(preferences = getPreferences()) {
    this.setData({
      ...preferences,
      fontSizeLabel: getFontSizeLabel(preferences.fontSize),
      appearanceClass: getAppearanceClass(preferences),
    });
  },

  toggleDarkMode(event) {
    savePreferences({ darkMode: Boolean(event.detail.value) });
  },

  toggleNotifications(event) {
    const notificationsEnabled = Boolean(event.detail.value);
    savePreferences({ notificationsEnabled });
    wx.showToast({
      title: notificationsEnabled ? '通知已开启' : '通知已关闭',
      icon: 'none',
    });
  },

  chooseFontSize() {
    wx.showActionSheet({
      itemList: FONT_SIZE_OPTIONS.map((item) => item.label),
      success: ({ tapIndex }) => {
        const option = FONT_SIZE_OPTIONS[tapIndex];
        if (option) savePreferences({ fontSize: option.value });
      },
    });
  },

  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '将清除搜索记录和临时草稿，不会退出登录或删除账号数据。',
      confirmColor: '#3478f6',
      success: ({ confirm }) => {
        if (!confirm) return;
        wx.removeStorageSync('search_history');
        wx.removeStorageSync('draft_cache');
        wx.showToast({ title: '缓存已清理', icon: 'success' });
      },
    });
  },

  openPrivacy() {
    if (!this.data.loggedIn) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.navigateTo({ url: '/pages/social/privacy/index' });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后不会删除你的历史数据，下次登录仍可查看。',
      confirmColor: '#3478f6',
      success: ({ confirm }) => {
        if (!confirm) return;
        clearSession();
        wx.showToast({ title: '已退出登录', icon: 'success' });
        wx.switchTab({ url: '/pages/my/index' });
      },
    });
  },
});

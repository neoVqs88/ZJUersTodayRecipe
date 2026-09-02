import { clearSession, deleteCloudAccount, isLoggedIn } from '~/services/auth';
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
    deletingAccount: false,
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

  goBack() {
    wx.navigateBack();
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
        wx.removeStorageSync('dish_search_history');
        wx.removeStorageSync('community_post_draft');
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

  openLegal(event) {
    const { type } = event.currentTarget.dataset;
    wx.navigateTo({
      url: type === 'privacy'
        ? '/pages/legal/privacy/index'
        : '/pages/legal/agreement/index',
    });
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
        wx.reLaunch({ url: '/pages/my/index' });
      },
    });
  },

  deleteAccount() {
    if (this.data.deletingAccount) return;
    wx.showModal({
      title: '确认注销账号？',
      content: '注销后个人资料、打卡、帖子、评论、关注关系和浏览足迹将被删除，且无法恢复。',
      confirmText: '继续注销',
      confirmColor: '#d92d20',
      success: ({ confirm }) => {
        if (confirm) this.confirmDeleteAccount();
      },
    });
  },

  confirmDeleteAccount() {
    wx.showModal({
      title: '最后确认',
      content: '请输入“注销账号”以确认操作',
      editable: true,
      placeholderText: '注销账号',
      confirmText: '永久注销',
      confirmColor: '#d92d20',
      success: async ({ confirm, content }) => {
        if (!confirm) return;
        if (String(content || '').trim() !== '注销账号') {
          wx.showToast({ title: '输入内容不正确，已取消注销', icon: 'none' });
          return;
        }
        this.setData({ deletingAccount: true });
        wx.showLoading({ title: '正在注销', mask: true });
        try {
          await deleteCloudAccount();
          wx.hideLoading();
          wx.showToast({ title: '账号已注销', icon: 'success' });
          setTimeout(() => wx.reLaunch({ url: '/pages/my/index' }), 600);
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '注销失败，请稍后重试', icon: 'none', duration: 2600 });
        } finally {
          this.setData({ deletingAccount: false, loggedIn: isLoggedIn() });
        }
      },
    });
  },
});

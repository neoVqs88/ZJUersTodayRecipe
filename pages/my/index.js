import { getCurrentUser, isLoggedIn, refreshCloudUser } from '~/services/auth';
import { fetchMealCheckinStats } from '~/services/mealCheckins';
import { getAppearanceClass, getPreferences } from '~/services/preferences';

const MENU_GROUPS = [
  [
    { name: '我的打卡', icon: 'calendar', color: 'green', type: 'checkins' },
    { name: '我的帖子', icon: 'root-list', color: 'blue', type: 'posts' },
    { name: '我的收藏', icon: 'star', color: 'orange', type: 'favorites' },
    { name: '浏览记录', icon: 'time', color: 'purple', type: 'history' },
    { name: '饭搭子', icon: 'usergroup', color: 'green', type: 'partners', note: '一起干饭更快乐' },
  ],
  [
    { name: '我的举报', icon: 'error-circle', color: 'red', type: 'reports' },
    { name: '意见反馈', icon: 'chat', color: 'blue', type: 'feedback' },
    { name: '设置', icon: 'setting', color: 'gray', type: 'settings', url: '/pages/setting/index' },
  ],
];

Page({
  data: {
    isLoggedIn: false,
    isDarkMode: false,
    appearanceClass: 'theme-light font-standard',
    personalInfo: {},
    stats: [],
    weekDays: [
      { label: '一', checked: false },
      { label: '二', checked: false },
      { label: '三', checked: false },
      { label: '四', checked: false },
      { label: '五', checked: false },
      { label: '六', checked: false },
      { label: '日', checked: false },
    ],
    streakDays: 0,
    weeklyCheckInCount: 0,
    weeklyGoal: 7,
    menuGroups: MENU_GROUPS,
  },

  onLoad() {
    const app = getApp();
    this.handlePreferencesChange = (preferences) => this.applyPreferences(preferences);
    app.eventBus.on('preferences-change', this.handlePreferencesChange);
  },

  onUnload() {
    getApp().eventBus.off('preferences-change', this.handlePreferencesChange);
  },

  async onShow() {
    this.applyPreferences();
    const loggedIn = isLoggedIn();
    const cachedUser = loggedIn ? getCurrentUser() || {} : {};
    this.setData({
      isLoggedIn: loggedIn,
      personalInfo: cachedUser,
      stats: this.buildStats(cachedUser, loggedIn),
      weekDays: this.buildWeekDays(cachedUser.weeklyCheckIns),
      streakDays: loggedIn ? cachedUser.streakDays || 0 : 0,
      weeklyCheckInCount: loggedIn ? this.countCheckedDays(cachedUser.weeklyCheckIns) : 0,
    });
    if (!loggedIn) return;

    try {
      const personalInfo = await this.getPersonalInfo();
      this.setData({
        personalInfo,
        stats: this.buildStats(personalInfo, true),
        weekDays: this.buildWeekDays(personalInfo.weeklyCheckIns),
        streakDays: personalInfo.streakDays || 0,
      });
    } catch (error) {
      // 接口失败时继续展示登录接口缓存的基础用户信息。
    }
    this.loadCheckInStats();
  },

  applyPreferences(preferences = getPreferences()) {
    this.setData({
      appearanceClass: getAppearanceClass(preferences),
      isDarkMode: preferences.darkMode,
    });
  },

  buildStats(user, loggedIn) {
    return [
      { label: '我的打卡', value: loggedIn ? user.checkInCount || 0 : 0, unit: '次', icon: 'calendar', color: 'green', type: 'checkins' },
      { label: '我的帖子', value: loggedIn ? user.postCount || 0 : 0, unit: '篇', icon: 'root-list', color: 'blue' },
      { label: '我的收藏', value: loggedIn ? user.favoriteCount || 0 : 0, unit: '个', icon: 'star', color: 'orange' },
    ];
  },

  buildWeekDays(records = []) {
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    return labels.map((label, index) => ({ label, checked: Boolean(records[index]) }));
  },

  getPersonalInfo() {
    return refreshCloudUser();
  },

  countCheckedDays(records = []) {
    return records.filter(Boolean).length;
  },

  async loadCheckInStats() {
    try {
      const { stats } = await fetchMealCheckinStats();
      const personalInfo = {
        ...this.data.personalInfo,
        checkInCount: stats.totalCount || 0,
        weeklyCheckIns: stats.weeklyCheckIns || [],
        streakDays: stats.streakDays || 0,
      };
      this.setData({
        personalInfo,
        stats: this.buildStats(personalInfo, true),
        weekDays: this.buildWeekDays(stats.weeklyCheckIns),
        weeklyCheckInCount: stats.weeklyCount || 0,
        weeklyGoal: stats.weeklyGoal || 7,
        streakDays: stats.streakDays || 0,
      });
    } catch (error) {
      // 云端打卡功能未部署时继续展示用户缓存数据。
    }
  },

  requireLogin() {
    if (this.data.isLoggedIn) return true;
    wx.navigateTo({ url: '/pages/login/login' });
    return false;
  },

  editProfile() {
    if (!this.requireLogin()) return;
    wx.navigateTo({ url: '/pages/my/info-edit/index' });
  },

  openMyProfile() {
    if (!this.requireLogin()) return;
    const user = this.data.personalInfo || {};
    const query = user.id ? `?userId=${  encodeURIComponent(user.id)}` : '';
    wx.navigateTo({
      url: `/pages/profile/index${  query}`,
      success: ({ eventChannel }) => eventChannel.emit('profilePreview', user),
    });
  },

  handleStatTap(event) {
    if (!this.requireLogin()) return;
    const { label, type } = event.currentTarget.dataset.item;
    if (type === 'checkins') {
      this.openCheckinHistory();
      return;
    }
    wx.showToast({ title: `${label}页面待完善`, icon: 'none' });
  },

  openCheckinHistory() {
    if (!this.requireLogin()) return;
    wx.navigateTo({ url: '/pages/checkins/index' });
  },

  handleMenuTap(event) {
    const { item } = event.currentTarget.dataset;
    if (item.type !== 'settings' && !this.requireLogin()) return;
    if (item.type === 'checkins') {
      this.openCheckinHistory();
      return;
    }
    if (item.url) {
      wx.navigateTo({ url: item.url });
      return;
    }
    wx.showToast({ title: `${item.name}功能待完善`, icon: 'none' });
  },
});

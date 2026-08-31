import { getCurrentUser, isLoggedIn, refreshCloudUser } from '~/services/auth';
import { fetchMealCheckinStats } from '~/services/mealCheckins';
import { getAppearanceClass, getPreferences } from '~/services/preferences';
import { fetchWeeklyInsights } from '~/services/weeklyInsights';

const MENU_GROUPS = [
  [
    { name: '我的收藏', caption: '收好的味道', icon: 'star', type: 'favorites', url: '/pages/social/favorites/index' },
    { name: '关注与饭友', caption: '一起吃饭的人', icon: 'usergroup', type: 'following', url: '/pages/social/list/index?type=following' },
    { name: '消息', caption: '互动与邀约', icon: 'notification', type: 'message', url: '/pages/message/index' },
    { name: '浏览足迹', caption: '最近看过', icon: 'time', type: 'history', url: '/pages/social/history/index' },
  ],
  [
    { name: '管理入口', caption: '内容治理', icon: 'secured', type: 'admin', url: '/pages/admin/login/index' },
    { name: '隐私与通知', caption: '可见范围', icon: 'lock-on', type: 'privacy', url: '/pages/social/privacy/index' },
    { name: '账号设置', caption: '外观与账号', icon: 'setting', type: 'settings', url: '/pages/setting/index' },
    { name: '意见反馈', caption: '告诉我们', icon: 'chat', type: 'feedback', url: '/pages/social/feedback/index' },
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
    weeklyInsights: null,
    tasteBars: [
      { label: '早餐', value: 0, percent: '0%' },
      { label: '午餐', value: 0, percent: '0%' },
      { label: '晚餐', value: 0, percent: '0%' },
    ],
    tasteCaption: '记录一餐后生成本周用餐节奏',
    socialCount: 0,
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
      socialCount: loggedIn ? (Number(cachedUser.favoriteCount) || 0) + (Number(cachedUser.followingCount) || 0) : 0,
    });
    if (!loggedIn) return;

    try {
      const personalInfo = await this.getPersonalInfo();
      this.setData({
        personalInfo,
        stats: this.buildStats(personalInfo, true),
        weekDays: this.buildWeekDays(personalInfo.weeklyCheckIns),
        streakDays: personalInfo.streakDays || 0,
        socialCount: (Number(personalInfo.favoriteCount) || 0) + (Number(personalInfo.followingCount) || 0),
      });
    } catch (error) {
      // 接口失败时继续展示登录接口缓存的基础用户信息。
    }
    this.loadCheckInStats();
    this.loadWeeklyInsights();
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
      { label: '我的帖子', value: loggedIn ? user.postCount || 0 : 0, unit: '篇', icon: 'root-list', color: 'blue', type: 'posts' },
      { label: '我的收藏', value: loggedIn ? user.favoriteCount || 0 : 0, unit: '个', icon: 'star', color: 'orange', type: 'favorites' },
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

  async loadWeeklyInsights() {
    try {
      const weeklyInsights = await fetchWeeklyInsights();
      const rhythm = this.buildMealRhythm(weeklyInsights.dailyMeals || []);
      this.setData({ weeklyInsights, tasteBars: rhythm.bars, tasteCaption: rhythm.caption });
    } catch (error) {
      // 没有打卡记录或云函数未部署时，不影响个人中心其他内容。
    }
  },

  buildMealRhythm(days) {
    const types = [
      { type: 'breakfast', label: '早餐' },
      { type: 'lunch', label: '午餐' },
      { type: 'dinner', label: '晚餐' },
    ];
    const counts = types.map(({ type }) => days.filter((day) => day.meals && day.meals[type] !== undefined).length);
    const total = counts.reduce((sum, count) => sum + count, 0);
    return {
      bars: types.map((item, index) => {
        const percent = total ? Math.round((counts[index] / total) * 100) : 0;
        return { ...item, value: percent, percent: `${percent}%` };
      }),
      caption: total ? `本周已记录 ${total} 个正餐时段` : '记录一餐后生成本周用餐节奏',
    };
  },

  openWeeklyInsights() {
    if (!this.requireLogin()) return;
    wx.navigateTo({ url: '/pages/weeklyInsights/index' });
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
    if (type === 'posts') {
      this.openMyProfile();
      return;
    }
    if (type === 'favorites') {
      wx.navigateTo({ url: '/pages/social/favorites/index' });
      return;
    }
    wx.showToast({ title: `${label}暂时没有内容`, icon: 'none' });
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
    if (item.type === 'posts') {
      this.openMyProfile();
      return;
    }
    if (item.url) {
      wx.navigateTo({ url: item.url });
      return;
    }
    wx.showToast({ title: `${item.name}暂时没有内容`, icon: 'none' });
  },
});

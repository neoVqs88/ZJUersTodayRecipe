import { getAppearanceClass, getPreferences } from '~/services/preferences';

const ITEMS = [
  { key: 'today', label: '今日推荐', icon: '/static/figma/nav-home.svg', activeIcon: '/static/figma/nav-home-active.svg', url: '/pages/home/index' },
  { key: 'canteen', label: '食堂与菜品', icon: '/static/figma/nav-discover.svg', activeIcon: '/static/figma/nav-discover-active.svg', url: '/pages/canteen/index' },
  { key: 'history', label: '食历', icon: '/static/figma/nav-calendar.svg', activeIcon: '/static/figma/nav-calendar-active.svg', url: '/pages/checkins/index' },
  { key: 'community', label: '饭桌边', icon: '/static/figma/nav-community.svg', activeIcon: '/static/figma/nav-community-active.svg', url: '/pages/community/index' },
  { key: 'health', label: '饮食洞察', icon: '/static/figma/nav-health.svg', activeIcon: '/static/figma/nav-health-active.svg', url: '/pages/weeklyInsights/index' },
  { key: 'my', label: '我的', icon: '/static/figma/nav-profile.svg', activeIcon: '/static/figma/nav-profile-active.svg', url: '/pages/my/index' },
];

Component({
  properties: {
    active: { type: String, value: 'today' },
  },
  data: { items: ITEMS, appearanceClass: 'theme-light font-standard' },
  lifetimes: {
    attached() {
      this.applyAppearance();
      this.appearanceHandler = (preferences) => this.applyAppearance(preferences);
      getApp().eventBus.on('preferences-change', this.appearanceHandler);
    },
    detached() {
      if (this.appearanceHandler) getApp().eventBus.off('preferences-change', this.appearanceHandler);
    },
  },
  pageLifetimes: {
    show() { this.applyAppearance(); },
  },
  methods: {
    applyAppearance(preferences = getPreferences()) {
      this.setData({ appearanceClass: getAppearanceClass(preferences) });
    },
    changePage(event) {
      const { key, url } = event.currentTarget.dataset;
      if (key === this.data.active) return;
      wx.reLaunch({ url });
    },
  },
});

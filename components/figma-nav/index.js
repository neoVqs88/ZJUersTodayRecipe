const ITEMS = [
  { key: 'today', icon: '/static/figma/nav-home.svg', url: '/pages/home/index' },
  { key: 'canteen', icon: '/static/figma/nav-discover.svg', url: '/pages/canteen/index' },
  { key: 'history', icon: '/static/figma/nav-calendar.svg', url: '/pages/checkins/index' },
  { key: 'community', icon: '/static/figma/nav-community.svg', url: '/pages/community/index' },
  { key: 'health', icon: '/static/figma/nav-health.svg', url: '/pages/weeklyInsights/index' },
  { key: 'my', icon: '/static/figma/nav-profile.svg', url: '/pages/my/index' },
];

Component({
  properties: {
    active: { type: String, value: 'today' },
  },
  data: { items: ITEMS },
  methods: {
    changePage(event) {
      const { key, url } = event.currentTarget.dataset;
      if (key === this.data.active) return;
      wx.reLaunch({ url });
    },
  },
});

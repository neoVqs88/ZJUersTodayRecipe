import { fetchCanteens, fetchDishCatalog } from '~/services/catalog';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: {
    activeFilter: '全部',
    filters: ['全部', '营业中', '少排队'],
    allEateries: [],
    eateries: [],
  },

  onLoad() {
    this.loadCatalog();
  },

  async loadCatalog() {
    const [eateries, dishes] = await Promise.all([fetchCanteens(), fetchDishCatalog()]);
    const grouped = eateries.map((eatery) => ({
      ...eatery,
      windows: [...new Set(dishes
        .filter((dish) => this.matchesEatery(dish, eatery))
        .map((dish) => this.getWindowName(dish, eatery))
        .filter(Boolean))].slice(0, 8),
    }));
    this.setData({ allEateries: grouped, eateries: grouped });
  },

  selectFilter(event) {
    const activeFilter = event.currentTarget.dataset.value;
    const eateries = this.filterEateries(this.data.allEateries, activeFilter);
    this.setData({ activeFilter, eateries });
  },
  filterEateries(eateries, filter) {
    if (filter === '全部') return eateries;
    if (filter === '营业中') return eateries.filter((eatery) => eatery.open !== false);
    if (filter === '少排队') return eateries.filter((eatery) => eatery.waitLevel === 'quiet');
    return eateries;
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/index' });
  },
  openCampusMap() {
    wx.navigateTo({ url: '/pages/campusMap/index' });
  },
  openEatery(event) {
    const eatery = this.data.eateries[event.currentTarget.dataset.index];
    wx.navigateTo({
      url: `/pages/campusMap/index?canteen=${encodeURIComponent(eatery.name)}`,
    });
  },
  openRanking() {
    wx.navigateTo({ url: '/pages/ranking/index' });
  },
  matchesEatery(dish, eatery) {
    return dish.canteen === eatery.name || String(dish.canteen || '').startsWith(eatery.name);
  },
  getWindowName(dish, eatery) {
    const place = String(dish.place || '').replace(`${eatery.name} · `, '');
    return place && place !== eatery.name ? place : '综合窗口';
  },
});

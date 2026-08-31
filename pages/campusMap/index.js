import { fetchCanteens } from '~/services/catalog';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: {
    routeVisible: false,
    filters: ['食堂', '营业中', '少排队'],
    activeFilter: '食堂',
    allEateries: [],
    eateries: [],
    selected: {},
  },

  async onLoad(options = {}) {
    const eateries = await fetchCanteens();
    const requested = decodeURIComponent(options.canteen || '');
    const selected = eateries.find((item) => requested && (requested.includes(item.name) || item.name.includes(requested))) || eateries[0] || {};
    this.setData({ allEateries: eateries, eateries, selected });
  },

  goBack() {
    wx.navigateBack();
  },

  selectEatery(event) {
    const selected = this.data.eateries.find((item) => item.id === event.currentTarget.dataset.id);
    if (!selected) return;
    this.setData({
      selected,
      routeVisible: false,
    });
  },

  selectFilter(event) {
    const activeFilter = event.currentTarget.dataset.value;
    let eateries = this.data.allEateries;
    if (activeFilter === '营业中') eateries = eateries.filter((item) => item.open !== false);
    if (activeFilter === '少排队') eateries = eateries.filter((item) => item.waitLevel === 'quiet');
    this.setData({
      activeFilter,
      eateries,
      selected: eateries.some((item) => item.id === this.data.selected.id) ? this.data.selected : eateries[0] || {},
      routeVisible: false,
    });
  },

  startWalk() {
    this.setData({ routeVisible: true });
    wx.showToast({ title: `已在校内图标出前往${this.data.selected.name}的路线`, icon: 'none' });
  },
});

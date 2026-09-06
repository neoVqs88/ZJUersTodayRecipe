import { fetchCanteens } from '~/services/catalog';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: {
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
    });
  },

  startWalk() {
    const { selected } = this.data;
    const latitude = Number(selected.latitude);
    const longitude = Number(selected.longitude);
    if (!selected.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      wx.showToast({ title: '暂时没有这个地点的坐标', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude,
      longitude,
      name: selected.name,
      address: `浙江大学玉泉校区 · ${selected.name}`,
      scale: 18,
      fail: () => wx.showToast({ title: '地图打开失败，请稍后重试', icon: 'none' }),
    });
  },
});

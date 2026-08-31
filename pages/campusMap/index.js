Page({
  data: {
    routeVisible: false,
    filters: ['食堂', '营业中', '少排队'],
    eateries: [
      { name: '玉泉食堂', subtitle: '主食堂 · 步行 4 分钟', people: 36, wait: '不挤', waitDetail: '预计等候 3–5 分钟', left: 48, top: 49 },
      { name: '一、四食堂', subtitle: '风味档口 · 步行 7 分钟', people: 52, wait: '适中', waitDetail: '预计等候 6–8 分钟', left: 71, top: 32 },
      { name: '怡膳堂', subtitle: '简餐与面食 · 步行 9 分钟', people: 24, wait: '宽松', waitDetail: '预计等候 2–4 分钟', left: 66, top: 70 },
    ],
    selectedIndex: 0,
    selected: { name: '玉泉食堂', subtitle: '主食堂 · 步行 4 分钟', people: 36, wait: '不挤', waitDetail: '预计等候 3–5 分钟' },
  },

  goBack() {
    wx.navigateBack();
  },

  selectEatery(event) {
    const selectedIndex = Number(event.currentTarget.dataset.index);
    this.setData({
      selectedIndex,
      selected: this.data.eateries[selectedIndex],
      routeVisible: false,
    });
  },

  startWalk() {
    this.setData({ routeVisible: true });
    wx.showToast({ title: `已在校内图标出前往${this.data.selected.name}的路线`, icon: 'none' });
  },
});

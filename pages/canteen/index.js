Page({
  data: {
    activeFilter: '全部',
    filters: ['全部', '玉泉', '紫金港', '清淡', '高蛋白'],
    dishes: [
      { name: '番茄肥牛饭', place: '玉泉一食堂 · 二楼', price: '¥15', score: '4.9', image: '/static/figma/canteen-tomato-beef.webp', tag: '本周第一' },
      { name: '山野菌菇面', place: '怡膳堂 · 一楼', price: '¥13', score: '4.8', image: '/static/figma/canteen-mushroom-noodle.webp', tag: '清淡鲜香' },
      { name: '石锅拌饭', place: '玉泉二食堂 · 风味档', price: '¥16', score: '4.7', image: '/static/figma/canteen-stone-pot.webp', tag: '热度上升' },
    ],
  },
  selectFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.value });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/index' });
  },
  openCampusMap() {
    wx.navigateTo({ url: '/pages/campusMap/index' });
  },
  openDish(event) {
    const dish = this.data.dishes[event.currentTarget.dataset.index];
    wx.navigateTo({ url: `/pages/dish/index?name=${encodeURIComponent(dish.name)}` });
  },
  openRanking() {
    wx.showToast({ title: '完整榜单即将上线', icon: 'none' });
  },
});

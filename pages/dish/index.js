const DISHES = [
  { name: '山野菌菇面', english: 'WILD MUSHROOM NOODLES', image: '/static/figma/rank-mushroom-noodle.webp', place: '怡膳堂 · 一楼', price: '¥13', score: '4.8', flavor: ['清淡', '菌香', '热乎'], desc: '菌菇的鲜味慢慢融进汤底，面条温润，是忙碌一天里让胃安静下来的选择。' },
  { name: '酸汤肥牛', english: 'SOUR SOUP BEEF', image: '/static/figma/rank-sour-beef.webp', place: '玉泉二食堂 · 风味档', price: '¥16', score: '4.7', flavor: ['酸香', '微辣', '下饭'], desc: '明亮的酸味先醒胃，肥牛柔软，配米饭正合适。' },
  { name: '石锅拌饭', english: 'STONE POT RICE', image: '/static/figma/rank-stone-pot.webp', place: '玉泉四食堂 · 一楼', price: '¥16', score: '4.6', flavor: ['咸香', '丰富', '饱腹'], desc: '蔬菜与米饭在石锅里保持热度，拌开后每一口都有不同层次。' },
  { name: '番茄肥牛饭', english: 'TOMATO BEEF RICE', image: '/static/figma/rank-tomato-beef.webp', place: '玉泉一食堂 · 二楼', price: '¥15', score: '4.9', flavor: ['酸甜', '浓郁', '下饭'], desc: '番茄的酸甜包住肥牛，米饭吸满汤汁，是很难出错的一餐。' },
];

Page({
  data: { dish: DISHES[0], collected: false },
  onLoad(options) {
    const name = decodeURIComponent(options.name || '');
    this.setData({ dish: DISHES.find((item) => item.name === name) || DISHES[0] });
  },
  goBack() { wx.navigateBack(); },
  toggleCollect() { this.setData({ collected: !this.data.collected }); wx.showToast({ title: this.data.collected ? '已收藏' : '已取消收藏', icon: 'none' }); },
  openLocation() { wx.showToast({ title: this.data.dish.place, icon: 'none' }); },
  recordMeal() { wx.reLaunch({ url: '/pages/home/index?checkin=1' }); },
});

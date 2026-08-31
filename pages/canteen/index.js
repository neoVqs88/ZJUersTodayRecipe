import { fetchDishCatalog } from '~/services/catalog';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: {
    activeFilter: '全部',
    filters: ['全部', '玉泉', '清淡', '高蛋白', '少排队'],
    allDishes: [],
    dishes: [],
    ranked: false,
  },

  onLoad() {
    this.loadCatalog();
  },

  async loadCatalog() {
    const dishes = await fetchDishCatalog();
    this.setData({ allDishes: dishes, dishes });
  },

  selectFilter(event) {
    const activeFilter = event.currentTarget.dataset.value;
    const dishes = this.filterDishes(this.data.allDishes, activeFilter);
    this.setData({ activeFilter, dishes });
  },
  filterDishes(dishes, filter) {
    if (filter === '全部') return dishes;
    if (filter === '玉泉') return dishes.filter((dish) => dish.campus === '玉泉');
    if (filter === '少排队') return dishes.filter((dish) => dish.waitMinutes > 0 && dish.waitMinutes <= 8);
    return dishes.filter((dish) => [...(dish.flavor || []), ...(dish.tags || [])].includes(filter));
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
    const ranked = !this.data.ranked;
    const dishes = ranked
      ? [...this.filterDishes(this.data.allDishes, this.data.activeFilter)].sort((a, b) => b.score - a.score)
      : this.filterDishes(this.data.allDishes, this.data.activeFilter);
    this.setData({ ranked, dishes });
    wx.showToast({ title: ranked ? '已按评分排序' : '已恢复推荐顺序', icon: 'none' });
  },
});

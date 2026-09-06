import { getLocalDishCatalog } from '~/data/campusCatalog';
import appearanceBehavior from '~/behaviors/appearance';

function getRankingImage(image) {
  const matched = String(image || '').match(/\/([^/]+\.[a-zA-Z0-9]+)$/);
  return matched ? `catalog/${matched[1]}` : '../../static/figma/tomato-rice.webp';
}

Page({
  behaviors: [appearanceBehavior],
  data: { dishes: [] },

  onLoad() {
    this.loadRanking();
  },

  async loadRanking() {
    try {
      const dishes = [...getLocalDishCatalog()]
        .sort((a, b) => (b.popularity - a.popularity) || (b.score - a.score))
        .slice(0, 50)
        .map((dish) => ({
          ...dish,
          rankingImage: getRankingImage(dish.image),
        }));
      this.setData({ dishes });
    } catch (error) {
      wx.showToast({ title: '榜单加载失败', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack();
  },

  openDish(event) {
    const dish = this.data.dishes[Number(event.currentTarget.dataset.index)];
    if (!dish) return;
    wx.navigateTo({
      url: `/pages/dish/index?id=${encodeURIComponent(dish.id)}&name=${encodeURIComponent(dish.name)}`,
    });
  },
});

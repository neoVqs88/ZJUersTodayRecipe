import { fetchDishByName } from '~/services/catalog';
import { fetchDishFavoriteState, toggleDishFavorite } from '~/services/communityPosts';
import { isLoggedIn } from '~/services/auth';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: { dish: { flavor: [] }, collected: false, loading: true },
  async onLoad(options) {
    const name = decodeURIComponent(options.name || '');
    const dish = await fetchDishByName(name);
    this.setData({ dish, loading: false });
    if (isLoggedIn()) {
      try {
        const result = await fetchDishFavoriteState(dish.id);
        this.setData({ collected: result.collected });
      } catch (error) {
        // 收藏状态失败不影响菜品浏览。
      }
    }
  },
  goBack() { wx.navigateBack(); },
  async toggleCollect() {
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    try {
      const result = await toggleDishFavorite(this.data.dish.id);
      this.setData({ collected: result.collected });
      wx.showToast({ title: result.collected ? '已收藏' : '已取消收藏', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '收藏失败', icon: 'none' });
    }
  },
  openLocation() {
    wx.navigateTo({ url: `/pages/campusMap/index?canteen=${encodeURIComponent(this.data.dish.canteen || this.data.dish.place)}` });
  },
  recordMeal() { wx.reLaunch({ url: '/pages/home/index?checkin=1' }); },
});

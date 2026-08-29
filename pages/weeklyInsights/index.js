import { isLoggedIn } from '~/services/auth';
import { fetchWeeklyInsights } from '~/services/weeklyInsights';

Page({
  data: { loading: true, insights: null },

  onLoad() {
    if (!isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.loadInsights();
  },

  async loadInsights() {
    try {
      const result = await fetchWeeklyInsights();
      this.setData({ insights: {
        ...result,
        favoriteDesc: result.favoriteDish ? `本周吃过 ${result.favoriteDish.count} 次` : '上传一餐，开始积累你的口味偏好',
        popularDesc: result.popularDish ? `本周被记录 ${result.popularDish.count} 次` : '更多同学记录后会产生热门美食',
      } });
    } catch (error) {
      wx.showToast({ title: error.message || '报告加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});

import { isLoggedIn } from '~/services/auth';
import { fetchWeeklyInsights } from '~/services/weeklyInsights';

Page({
  data: {
    loading: true,
    insights: null,
    score: 82,
    trend: [42, 66, 54, 78, 62, 84, 72],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
  },

  onLoad() {
    if (!isLoggedIn()) {
      this.setData({ loading: false });
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
      }, score: result.nutrition && result.nutrition.ready ? 88 : 82 });
    } catch (error) {
      wx.showToast({ title: error.message || '报告加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  goRecord() {
    wx.reLaunch({ url: '/pages/home/index' });
  },

  goAssistant() {
    wx.navigateTo({ url: '/pages/dietAssistant/index' });
  },
});

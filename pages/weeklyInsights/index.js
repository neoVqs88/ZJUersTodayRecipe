import { isLoggedIn } from '~/services/auth';
import { fetchWeeklyInsights } from '~/services/weeklyInsights';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: {
    loading: true,
    insights: null,
    score: 0,
    scoreDeltaText: '开始记录后生成趋势',
    headline: '记录一餐，开始了解自己的饮食节奏',
    adviceTitle: '先完成今天的一餐记录',
    adviceDesc: '连续记录后，我们会根据真实用餐时间给出建议。',
    chartRows: [],
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
      const delta = Number(result.score) - Number(result.previousScore);
      const chartRows = ['breakfast', 'lunch', 'dinner'].map((type) => ({
        type,
        label: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }[type],
        range: { breakfast: '07:00–09:30', lunch: '11:00–13:30', dinner: '17:00–20:00' }[type],
        days: (result.dailyMeals || []).map((day, index) => ({ key: `${type}-${index}`, active: day.meals[type] !== undefined })),
      }));
      const activeDays = (result.dailyMeals || []).filter((day) => day.count > 0).length;
      this.setData({ insights: {
        ...result,
        favoriteDesc: result.favoriteDish ? `本周吃过 ${result.favoriteDish.count} 次` : '上传一餐，开始积累你的口味偏好',
        popularDesc: result.popularDish ? `本周被记录 ${result.popularDish.count} 次` : '更多同学记录后会产生热门美食',
      },
      score: Number(result.score) || 0,
      scoreDeltaText: delta === 0 ? '与上周持平' : `比上周 ${delta > 0 ? '+' : ''}${delta}`,
      headline: activeDays >= 5 ? '这周多数日子都认真吃了饭' : `本周已有 ${activeDays} 天留下饮食记录`,
      adviceTitle: activeDays >= 5 ? '继续保持稳定记录' : '先把下一餐记下来',
      adviceDesc: result.nutrition && result.nutrition.ready
        ? `当前已记录 ${result.nutrition.mealCount} 餐，参考平均热量 ${result.nutrition.averageCalories} 千卡/100克。`
        : (result.nutrition ? result.nutrition.message : '记录越完整，分析越可靠。'),
      chartRows,
      });
    } catch (error) {
      wx.showToast({ title: error.message || '报告加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  goRecord() {
    wx.reLaunch({ url: '/pages/home/index' });
  },
});

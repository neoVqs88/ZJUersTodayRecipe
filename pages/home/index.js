import recognizeDish from '../../utils/recognizeDish';
import { getCurrentUser, isLoggedIn } from '~/services/auth';
import { createMealCheckin, fetchMealCheckinStats } from '~/services/mealCheckins';
import { recordBrowsingHistory } from '~/services/userSocial';

Page({
  data: {
    newDishes: [
      { name: '黄焖鸡米饭', location: '第一食堂 · 二楼', shortLocation: '一食堂', score: '4.8', image: '/static/home/card0.png' },
      { name: '照烧鸡排饭', location: '第二食堂 · 一楼', shortLocation: '二食堂', score: '4.7', image: '/static/home/card1.png' },
      { name: '红烧牛肉面', location: '风味窗口 · 面之道', shortLocation: '风味窗口', score: '4.6', image: '/static/home/card2.png' },
    ],
    checkInDays: 0,
    weeklyGoal: 7,
  },

  onShow() {
    this.loadCheckInStats();
  },

  async loadCheckInStats() {
    if (!isLoggedIn()) {
      this.setData({ checkInDays: 0, weeklyGoal: 7 });
      return;
    }
    try {
      const { stats } = await fetchMealCheckinStats();
      this.setData({
        checkInDays: stats.weeklyCount || 0,
        weeklyGoal: stats.weeklyGoal || 7,
      });
    } catch (error) {
      // 云函数尚未部署时不影响首页其余内容使用。
    }
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/index' });
  },

  makeDecision() {
    wx.navigateTo({ url: '/pages/roulette/index' });
  },

  viewDish(event) {
    const dishIndex = Number(event.currentTarget.dataset.index);
    const dish = this.data.newDishes[dishIndex];
    if (isLoggedIn()) {
      recordBrowsingHistory({
        type: 'dish',
        targetId: `home-dish-${dishIndex}`,
        title: dish.name,
        subtitle: `${dish.location} · 推荐评分 ${dish.score}`,
        image: dish.image,
        route: '/pages/home/index',
      }).catch(() => {});
    }
    wx.showModal({
      title: dish.name,
      content: `${dish.location}\n推荐评分 ${dish.score}`,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  async checkIn() {
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    let r;
    try {
      r = await recognizeDish();
    } catch (e) {
      // 用户在选图界面点了取消等情况，静默返回即可
      return;
    }
    if (!r.success || !r.dishes.length) {
      wx.showToast({ title: r.message || '识别失败，请重试', icon: 'none' });
      return;
    }
    // 识别可能不准，让用户从候选菜名里挑一个确认。
    let dish;
    try {
      const tapIndex = await new Promise((resolve, reject) => {
        wx.showActionSheet({
          itemList: r.dishes.map((item) => item.name),
          success: ({ tapIndex: index }) => resolve(index),
          fail: reject,
        });
      });
      dish = r.dishes[tapIndex];
    } catch (error) {
      return;
    }

    wx.showLoading({ title: '保存打卡中…', mask: true });
    try {
      const result = await createMealCheckin({
        fileID: r.fileID,
        dish,
        candidates: r.dishes,
      });
      this.setData({
        checkInDays: result.stats.weeklyCount || 0,
        weeklyGoal: result.stats.weeklyGoal || 7,
      });
      const currentUser = getCurrentUser() || {};
      getApp().eventBus.emit('meal-checkin-change', {
        ...result.stats,
        userId: currentUser.id || '',
      });
      const calorieText = dish.calorie ? `\n参考热量：${dish.calorie} 千卡/100克` : '';
      wx.showModal({
        title: '打卡成功',
        content: `今日菜品：${dish.name}\n识别置信度：${(dish.probability * 100).toFixed(1)}%${calorieText}`,
        showCancel: false,
        confirmText: '查看记录',
        success: ({ confirm }) => {
          if (confirm) this.showCheckInHistory();
        },
      });
    } catch (error) {
      if (error.code === 'LOGIN_REQUIRED') {
        wx.navigateTo({ url: '/pages/login/login' });
      } else {
        wx.showToast({ title: error.message || '打卡保存失败', icon: 'none' });
      }
    } finally {
      wx.hideLoading();
    }
  },

  showMore() {
    wx.showToast({ title: '菜品列表即将上线', icon: 'none' });
  },

  showCheckInHistory() {
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.navigateTo({ url: '/pages/checkins/index' });
  },
});

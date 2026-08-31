import recognizeDish from '../../utils/recognizeDish';
import { getCurrentUser, isLoggedIn } from '~/services/auth';
import { createMealCheckin, fetchMealCheckinStats } from '~/services/mealCheckins';
import { recordBrowsingHistory } from '~/services/userSocial';
import { fetchDishCatalog } from '~/services/catalog';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: {
    dateLabel: '',
    mealTickets: [
      {
        name: '桂花糖藕',
        campus: '玉泉',
        time: '12:20',
        note: '江南的甜，适合今天这场小雨。',
        match: 92,
        flavor: '清甜',
        price: '¥8–12',
        image: '/static/figma/ticket-lotus-opaque.webp',
      },
      {
        name: '山野菌菇面',
        campus: '怡膳堂一楼',
        time: '12:26',
        note: '一碗热汤面，把午后的疲惫慢慢熨平。',
        match: 89,
        flavor: '清淡鲜香',
        price: '¥10–15',
        image: '/static/figma/ticket-mushroom-noodle.webp',
      },
      {
        name: '酸汤肥牛',
        campus: '玉泉二食堂',
        time: '12:31',
        note: '酸香醒胃，适合需要一点精神的今天。',
        match: 86,
        flavor: '酸辣',
        price: '¥15–20',
        image: '/static/figma/ticket-sour-beef.webp',
      },
      {
        name: '番茄肥牛饭',
        campus: '玉泉一食堂',
        time: '12:35',
        note: '酸甜浓郁，是不会轻易出错的午餐答案。',
        match: 94,
        flavor: '酸甜',
        price: '¥15–20',
        image: '/static/figma/ticket-tomato-beef.webp',
      },
    ],
    activeTicket: {
      name: '桂花糖藕',
      campus: '玉泉',
      time: '12:20',
      note: '江南的甜，适合今天这场小雨。',
      match: 92,
      flavor: '清甜',
      price: '¥8–12',
      image: '/static/figma/ticket-lotus-opaque.webp',
    },
    ticketIndex: 0,
    isShuffling: false,
    newDishes: [
      { name: '番茄肥牛饭', location: '玉泉一食堂 · 二楼', shortLocation: '酸甜浓郁', score: '4.9', image: '/static/figma/rank-tomato-beef.webp' },
      { name: '山野菌菇面', location: '怡膳堂 · 一楼', shortLocation: '清淡鲜香', score: '4.8', image: '/static/figma/rank-mushroom-noodle.webp' },
      { name: '酸汤肥牛', location: '玉泉二食堂 · 风味档', shortLocation: '酸辣开胃', score: '4.7', image: '/static/figma/rank-sour-beef.webp' },
      { name: '石锅拌饭', location: '玉泉四食堂 · 一楼', shortLocation: '咸香热辣', score: '4.6', image: '/static/figma/rank-stone-pot.webp' },
    ],
    moments: ['想吃热乎的', '预算 15 元内', '离我近一点'],
    checkInDays: 0,
    weeklyGoal: 7,
  },

  onLoad(options = {}) {
    const date = new Date();
    const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    this.setData({ dateLabel: `${weekdays[date.getDay()]} · ${months[date.getMonth()]} ${date.getDate()}` });
    if (options.checkin === '1') setTimeout(() => this.checkIn(), 350);
    this.loadCatalog();
  },

  async loadCatalog() {
    try {
      const catalog = await fetchDishCatalog();
      if (!catalog.length) return;
      const ranked = [...catalog].sort((a, b) => b.popularity - a.popularity);
      const mealTickets = ranked.slice(0, 6).map((dish, index) => ({
        ...dish,
        campus: dish.canteen || dish.campus,
        time: index % 2 ? '12:26' : '12:20',
        note: dish.desc,
        match: Math.min(100, Math.max(0, Math.round((Number(dish.score) || 0) / 5 * 100))),
        flavor: dish.flavorText || (dish.flavor || []).join(' · '),
      }));
      const newDishes = ranked.slice(0, 6).map((dish) => ({
        ...dish,
        location: dish.place,
        shortLocation: dish.flavorText,
      }));
      this.setData({
        mealTickets,
        activeTicket: mealTickets[0],
        ticketIndex: 0,
        newDishes,
      });
    } catch (error) {
      // 云端目录不可用时继续展示内置玉泉菜品。
    }
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
    if (this.data.isShuffling) return;

    const { mealTickets, ticketIndex } = this.data;
    let step = 0;
    let nextIndex = ticketIndex;
    this.setData({ isShuffling: true });

    this.ticketTimer = setInterval(() => {
      nextIndex = (nextIndex + 1) % mealTickets.length;
      step += 1;
      this.setData({
        activeTicket: mealTickets[nextIndex],
        ticketIndex: nextIndex,
      });

      if (step < 10) return;
      clearInterval(this.ticketTimer);
      this.ticketTimer = null;
      this.setData({ isShuffling: false });
      wx.vibrateShort({ type: 'light' });
    }, 105);
  },

  openFeatured() {
    if (this.data.isShuffling) return;
    wx.navigateTo({ url: `/pages/dish/index?name=${encodeURIComponent(this.data.activeTicket.name)}` });
  },

  onUnload() {
    if (this.ticketTimer) clearInterval(this.ticketTimer);
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
    wx.navigateTo({ url: `/pages/dish/index?name=${encodeURIComponent(dish.name)}` });
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
    if (!r.success || !Array.isArray(r.dishes) || !r.dishes.length) {
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
      if (r.fileID) wx.cloud.deleteFile({ fileList: [r.fileID] }).catch(() => {});
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
      const confidence = Math.min(100, Math.max(0, Number(dish.probability) * 100 || 0));
      wx.showModal({
        title: '打卡成功',
        content: `今日菜品：${dish.name}\n识别置信度：${confidence.toFixed(1)}%${calorieText}`,
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
    wx.reLaunch({ url: '/pages/canteen/index' });
  },

  showCheckInHistory() {
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.navigateTo({ url: '/pages/checkins/index' });
  },
});

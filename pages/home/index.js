import recognizeDish from '../../utils/recognizeDish';

Page({
  data: {
    newDishes: [
      { name: '黄焖鸡米饭', location: '第一食堂 · 二楼', shortLocation: '一食堂', score: '4.8', image: '/static/home/card0.png' },
      { name: '照烧鸡排饭', location: '第二食堂 · 一楼', shortLocation: '二食堂', score: '4.7', image: '/static/home/card1.png' },
      { name: '红烧牛肉面', location: '风味窗口 · 面之道', shortLocation: '风味窗口', score: '4.6', image: '/static/home/card2.png' },
    ],
    checkInDays: 3,
    monthlyGoal: 30,
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/index' });
  },

  makeDecision() {
    wx.navigateTo({ url: '/pages/roulette/index' });
  },

  viewDish(event) {
    const dish = this.data.newDishes[event.currentTarget.dataset.index];
    wx.showModal({
      title: dish.name,
      content: `${dish.location}\n推荐评分 ${dish.score}`,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  onShow() {
    this.refreshCheckInDays();
  },

  // 本周打卡天数：直接数 checkins 集合里的记录数（权限自动只数自己的）
  async refreshCheckInDays() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('checkins').count();
      this.setData({ checkInDays: res.total });
    } catch (err) {
      console.error('获取打卡天数失败', err);
    }
  },

  async checkIn() {
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
    // 识别可能不准，让用户从候选菜名里挑一个确认
    wx.showActionSheet({
      itemList: r.dishes.map((d) => d.name),
      success: async (res) => {
        const dish = r.dishes[res.tapIndex];
        await this.saveCheckIn(dish);
      },
    });
  },

  // 打卡落库：写一条打卡记录 + 给自己发一条打卡消息（messages 权限允许写给自己的）
  async saveCheckIn(dish) {
    try {
      const db = wx.cloud.database();
      await db.collection('checkins').add({
        data: { dishName: dish.name, createdAt: new Date() },
      });
      await db.collection('messages').add({
        data: {
          category: 'checkin',
          senderName: '打卡提醒',
          action: '打卡成功 🎉',
          content: `你记录了「${dish.name}」，坚持就是胜利！`,
          targetDesc: '',
          read: false,
          createdAt: new Date(),
        },
      });
      await this.refreshCheckInDays();
      wx.showModal({
        title: '打卡成功',
        content: `今日菜品：${dish.name}\n已同步到消息中心`,
        showCancel: false,
        confirmText: '好的',
      });
    } catch (err) {
      console.error('打卡保存失败', err);
      wx.showToast({ title: '打卡保存失败，请重试', icon: 'none' });
    }
  },

  showMore() {
    wx.showToast({ title: '菜品列表即将上线', icon: 'none' });
  },

  showCheckInHistory() {
    wx.showToast({ title: '打卡记录即将上线', icon: 'none' });
  },
});

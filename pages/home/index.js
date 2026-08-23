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
      success: (res) => {
        const dish = r.dishes[res.tapIndex];
        wx.showModal({
          title: '打卡成功',
          content: `今日菜品：${dish.name}\n置信度：${(dish.probability * 100).toFixed(1)}%`,
          showCancel: false,
          confirmText: '好的',
        });
      },
    });
  },

  showMore() {
    wx.showToast({ title: '菜品列表即将上线', icon: 'none' });
  },

  showCheckInHistory() {
    wx.showToast({ title: '打卡记录即将上线', icon: 'none' });
  },
});

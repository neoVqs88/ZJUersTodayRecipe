const interactionMessages = [
  {
    id: 'comments',
    title: '点赞与评论',
    summary: '小鹿爱吃饭 赞了你的照片',
    detail: '桂花糖藕：这家看起来好好吃！',
    time: '10:36',
    unread: 3,
    icon: 'thumb-up',
    theme: 'green',
  },
  {
    id: 'system',
    title: '系统通知',
    summary: '本周打卡进度更新',
    detail: '你已完成 3/21 天打卡，继续加油！',
    time: '09:18',
    unread: 0,
    icon: 'notification',
    theme: 'blue',
  },
  {
    id: 'companion',
    title: '饭搭子邀约',
    summary: '小周同学 邀请你一起吃午餐',
    detail: '五道口 · 黄焖鸡米饭',
    time: '昨天 19:24',
    unread: 1,
    tag: '新邀约',
    tagTheme: 'orange',
    icon: 'usergroup',
    theme: 'orange',
  },
  {
    id: 'checkin',
    title: '打卡提醒',
    summary: '午餐打卡时间到啦 ☀️',
    detail: '记得记录今天的美食，保持好习惯～',
    time: '昨天 12:00',
    unread: 2,
    icon: 'calendar',
    theme: 'green',
  },
  {
    id: 'activity',
    title: '活动通知',
    summary: '“寻找饭搭子”春日活动开始啦！',
    detail: '参与抽奖赢取美食优惠券',
    time: '4月20日 18:30',
    unread: 0,
    tag: '官方',
    tagTheme: 'blue',
    icon: 'sound',
    theme: 'purple',
  },
];

const systemMessages = [
  {
    id: 'system',
    title: '系统通知',
    summary: '本周打卡进度更新',
    detail: '你已完成 3/21 天打卡，继续加油！',
    time: '09:18',
    unread: 0,
    icon: 'notification',
    theme: 'blue',
  },
  {
    id: 'checkin',
    title: '打卡提醒',
    summary: '午餐打卡时间到啦 ☀️',
    detail: '记得记录今天的美食，保持好习惯～',
    time: '昨天 12:00',
    unread: 2,
    icon: 'calendar',
    theme: 'green',
  },
  {
    id: 'activity',
    title: '活动通知',
    summary: '“寻找饭搭子”春日活动开始啦！',
    detail: '参与抽奖赢取美食优惠券',
    time: '4月20日 18:30',
    unread: 0,
    tag: '官方',
    tagTheme: 'blue',
    icon: 'sound',
    theme: 'purple',
  },
];

Page({
  data: {
    activeTab: 'interaction',
    interactionMessages,
    systemMessages,
    displayMessages: interactionMessages,
  },

  switchMessageTab(event) {
    const { tab } = event.currentTarget.dataset;
    this.setData({
      activeTab: tab,
      displayMessages: tab === 'system' ? this.data.systemMessages : this.data.interactionMessages,
    });
  },

  openMessage(event) {
    const { id } = event.currentTarget.dataset;
    const item = this.data.displayMessages.find((message) => message.id === id);
    if (!item) return;

    const displayMessages = this.data.displayMessages.map((message) => (
      message.id === id ? { ...message, unread: 0 } : message
    ));
    const listKey = this.data.activeTab === 'system' ? 'systemMessages' : 'interactionMessages';
    this.setData({
      displayMessages,
      [listKey]: displayMessages,
    });

    wx.showToast({
      title: item.title + '详情即将上线',
      icon: 'none',
    });
  },

  goCompanion() {
    wx.switchTab({ url: '/pages/community/index' });
  },
});

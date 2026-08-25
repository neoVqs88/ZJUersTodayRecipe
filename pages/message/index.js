// 消息主页：分类卡片（点赞与评论 / 饭搭子邀约 / 系统通知…）
// 数据来自云数据库 messages 集合（权限：仅创建者可读写，天然只看到自己的消息）
// 卡片 = 把该分类下的消息事件聚合而成：最新一条做摘要 + 未读条数

import formatTime from '../../utils/formatTime';

// 分类的展示配置：标题、图标、配色、归属哪个标签页
const CATEGORIES = {
  like_comment: { title: '点赞与评论', icon: 'thumb-up', theme: 'green', tab: 'interaction' },
  invite: { title: '饭搭子邀约', icon: 'usergroup', theme: 'orange', tab: 'interaction', tag: '新邀约', tagTheme: 'orange' },
  system: { title: '系统通知', icon: 'notification', theme: 'blue', tab: 'system' },
  checkin: { title: '打卡提醒', icon: 'calendar', theme: 'green', tab: 'system' },
  activity: { title: '活动通知', icon: 'sound', theme: 'purple', tab: 'system', tag: '官方', tagTheme: 'blue' },
};

Page({
  data: {
    activeTab: 'interaction',
    cards: [], // 全部分类卡片
    displayCards: [], // 当前标签页要展示的卡片
    loading: true,
  },

  // 每次进入页面都拉最新数据（从详情页返回时也会触发，未读数自动刷新）
  onShow() {
    this.fetchMessages();
  },

  async fetchMessages() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('messages').orderBy('createdAt', 'desc').get();
      const messages = res.data.map((m) => ({ ...m, displayTime: formatTime(m.createdAt) }));
      const cards = this.buildCards(messages);
      this.setData({
        cards,
        displayCards: cards.filter((c) => c.tab === this.data.activeTab),
        loading: false,
      });
      // 联动底部导航的未读角标（app.js 里的现成方法，内部会广播给 tabBar）
      getApp().setUnreadNum(messages.filter((m) => !m.read).length);
    } catch (err) {
      console.error('拉取消息失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '消息加载失败', icon: 'none' });
    }
  },

  // 把消息事件按分类聚合成卡片：最新一条做摘要，统计未读条数
  buildCards(messages) {
    return Object.entries(CATEGORIES)
      .map(([category, meta]) => {
        const list = messages.filter((m) => m.category === category);
        if (list.length === 0) return null; // 该分类没消息就不显示卡片
        const latest = list[0]; // 已按时间倒序，第一条就是最新
        return {
          category,
          ...meta,
          summary: `${latest.senderName} ${latest.action}`,
          detail: latest.content || latest.targetDesc,
          displayTime: latest.displayTime,
          unreadCount: list.filter((m) => !m.read).length,
        };
      })
      .filter(Boolean);
  },

  switchMessageTab(event) {
    const { tab } = event.currentTarget.dataset;
    this.setData({
      activeTab: tab,
      displayCards: this.data.cards.filter((c) => c.tab === tab),
    });
  },

  // 点击分类卡片 → 进入该分类的完整消息列表
  openCategory(event) {
    const { category, title } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/message/detail/index?category=${category}&title=${title}` });
  },

  // 开发调试：给自己生成一批示例消息（上线前删除本函数和对应按钮）
  async seedMessages() {
    wx.showLoading({ title: '生成中…', mask: true });
    try {
      await wx.cloud.callFunction({ name: 'messageHelper', data: { action: 'seed' } });
      await this.fetchMessages();
      wx.showToast({ title: '已生成示例消息', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: `生成失败：${err.message}`, icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goCompanion() {
    wx.switchTab({ url: '/pages/community/index' });
  },
});

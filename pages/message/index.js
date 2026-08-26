// 消息页：数据来自云数据库 messages 集合
// 集合权限为"仅创建者可读写"，所以前端查到天然只有当前用户自己的消息

// 把云端时间格式化成友好文案：今天显示时分，昨天显示"昨天"，更早显示月日
function formatTime(dateInput) {
  const date = new Date(dateInput);
  const nowDate = new Date();
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === nowDate.toDateString()) return hm;
  const yesterday = new Date(nowDate.getTime() - 24 * 3600 * 1000);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

Page({
  data: {
    activeTab: 'interaction',
    interactionMessages: [],
    systemMessages: [],
    displayMessages: [],
    loading: true,
  },

  // 每次进入页面都拉最新数据（onShow 而不是 onLoad，从别的页面切回来也会刷新）
  onShow() {
    this.fetchMessages();
  },

  async fetchMessages() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('messages').orderBy('createdAt', 'desc').get();
      const messages = res.data.map((m) => ({ ...m, displayTime: formatTime(m.createdAt) }));
      const interactionMessages = messages.filter((m) => m.type === 'interaction');
      const systemMessages = messages.filter((m) => m.type === 'system');
      this.setData({
        interactionMessages,
        systemMessages,
        displayMessages: this.data.activeTab === 'system' ? systemMessages : interactionMessages,
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

  switchMessageTab(event) {
    const { tab } = event.currentTarget.dataset;
    this.setData({
      activeTab: tab,
      displayMessages: tab === 'system' ? this.data.systemMessages : this.data.interactionMessages,
    });
  },

  // 点开一条消息：标记已读 + 展示完整内容
  openMessage(event) {
    const { id } = event.currentTarget.dataset;
    const item = this.data.displayMessages.find((m) => m._id === id);
    if (!item) return;

    if (!item.read) {
      // 云端标记已读（只能改自己的消息，越权会被数据库权限自动拦截）
      const db = wx.cloud.database();
      db.collection('messages').doc(id).update({ data: { read: true } })
        .catch((err) => console.error('标记已读失败', err));
      // 本地同步刷新，不必重新拉取整个列表
      const patch = (list) => list.map((m) => (m._id === id ? { ...m, read: true } : m));
      const interactionMessages = patch(this.data.interactionMessages);
      const systemMessages = patch(this.data.systemMessages);
      this.setData({
        interactionMessages,
        systemMessages,
        displayMessages: this.data.activeTab === 'system' ? systemMessages : interactionMessages,
      });
      const unread = [...interactionMessages, ...systemMessages].filter((m) => !m.read).length;
      getApp().setUnreadNum(unread);
    }

    if (item.actorUserId) {
      wx.navigateTo({ url: `/pages/profile/index?userId=${item.actorUserId}` });
      return;
    }

    // 暂无业务跳转的普通消息使用弹窗展示完整内容。
    wx.showModal({
      title: item.title,
      content: item.detail,
      showCancel: false,
      confirmText: '知道了',
    });
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

// 消息详情页：展示某个分类下的全部消息（B 站式列表）
// 体验设计：进入时正常展示（未读的带红点），离开页面时批量标记已读——"看过就算读了"
// 返回主页时主页的 onShow 会重新拉数据，所以未读角标自动更新，无需额外通知

import formatTime from '../../../utils/formatTime';

const AVATAR_COLORS = ['#2d78da', '#34a853', '#f29900', '#d93025', '#7c4dff', '#00a5a8'];

Page({
  data: {
    messages: [],
    loading: true,
  },

  onLoad(options) {
    // 主页跳转时带过来的参数：分类标识 + 分类名称
    this.category = options.category;
    wx.setNavigationBarTitle({ title: options.title || '消息详情' });
    this.fetchList();
  },

  async fetchList() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('messages')
        .where({ category: this.category })
        .orderBy('createdAt', 'desc')
        .get();
      const messages = res.data.map((m) => ({
        ...m,
        displayTime: formatTime(m.createdAt),
        // 头像占位：昵称首字 + 按昵称挑一个颜色（将来换成真实头像 URL 即可）
        senderInitial: (m.senderName || '·').slice(0, 1),
        avatarColor: AVATAR_COLORS[(m.senderName || '').length % AVATAR_COLORS.length],
      }));
      this.setData({ messages, loading: false });
    } catch (err) {
      console.error('拉取消息详情失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  openSenderProfile(event) {
    const { userId } = event.currentTarget.dataset;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/profile/index?userId=${encodeURIComponent(userId)}` });
  },

  onUnload() {
    // 批量把本页未读消息标记为已读（只能改自己的消息，数据库权限自动拦截越权）
    const db = wx.cloud.database();
    this.data.messages
      .filter((m) => !m.read)
      .forEach((m) => {
        db.collection('messages').doc(m._id).update({ data: { read: true } })
          .catch((err) => console.error('标记已读失败', err));
      });
  },
});

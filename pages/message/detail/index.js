// 消息详情页：展示某个分类下的全部消息（B 站式列表）
// 体验设计：进入时正常展示（未读的带红点），离开页面时批量标记已读——"看过就算读了"
// 返回主页时主页的 onShow 会重新拉数据，所以未读角标自动更新，无需额外通知

import formatTime from '../../../utils/formatTime';
import appearanceBehavior from '~/behaviors/appearance';

const AVATAR_COLORS = ['#2d78da', '#34a853', '#f29900', '#d93025', '#7c4dff', '#00a5a8'];

Page({
  behaviors: [appearanceBehavior],
  data: {
    messages: [],
    loading: true,
    loadingMore: false,
    page: 0,
    pageSize: 20,
    hasMore: true,
  },

  onLoad(options) {
    // 主页跳转时带过来的参数：分类标识 + 分类名称
    this.category = options.category;
    wx.setNavigationBarTitle({ title: options.title || '消息详情' });
    this.fetchList(true);
  },

  async fetchList(reset = false) {
    if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
    const page = reset ? 0 : this.data.page;
    this.setData(reset ? { loading: true, hasMore: true } : { loadingMore: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('messages')
        .where({ category: this.category })
        .orderBy('createdAt', 'desc')
        .skip(page * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();
      const incoming = res.data.map((m) => ({
        ...m,
        displayTime: formatTime(m.createdAt),
        // 没有头像的历史消息使用昵称首字作为降级展示。
        senderInitial: (m.senderName || '·').slice(0, 1),
        avatarColor: AVATAR_COLORS[(m.senderName || '').length % AVATAR_COLORS.length],
      }));
      this.setData({
        messages: reset ? incoming : [...this.data.messages, ...incoming],
        loading: false,
        loadingMore: false,
        page: page + 1,
        hasMore: incoming.length === this.data.pageSize,
      });
    } catch (err) {
      console.error('拉取消息详情失败', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  loadMore() {
    this.fetchList(false);
  },

  openSenderProfile(event) {
    const { userId } = event.currentTarget.dataset;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/profile/index?userId=${encodeURIComponent(userId)}` });
  },

  onUnload() {
    if (!this.data.messages.some((message) => !message.read)) return;
    wx.cloud.callFunction({
      name: 'messageHelper',
      data: { action: 'markCategoryRead', category: this.category },
    }).then(() => getApp().getUnreadNum()).catch((error) => console.error('标记已读失败', error));
  },
});

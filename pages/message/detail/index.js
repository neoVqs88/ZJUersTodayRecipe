// 消息详情页：展示某个分类下的全部消息（B 站式列表）
// 首次成功拉取分类消息后批量标记已读，避免退出页面钩子未执行时遗漏。

import formatTime from '../../../utils/formatTime';
import appearanceBehavior from '~/behaviors/appearance';

const AVATAR_COLORS = ['#2d78da', '#34a853', '#f29900', '#d93025', '#7c4dff', '#00a5a8'];

Page({
  behaviors: [appearanceBehavior],
  data: {
    title: '消息详情',
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
    this.setData({ title: options.title || '消息详情' });
    this.fetchList(true);
  },

  async fetchList(reset = false) {
    if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
    const page = reset ? 0 : this.data.page;
    this.setData(reset ? { loading: true, hasMore: true } : { loadingMore: true });
    try {
      const response = await wx.cloud.callFunction({
        name: 'messageHelper',
        data: { action: 'list', category: this.category, page, pageSize: this.data.pageSize },
      });
      const result = response.result || {};
      if (!result.success) throw new Error(result.message || '消息加载失败');
      const incoming = (result.messages || []).map((m) => ({
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
        hasMore: Boolean(result.hasMore),
      });
      if (reset && incoming.some((message) => !message.read)) this.markCategoryRead();
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

  async markCategoryRead() {
    if (this.markingRead) return;
    this.markingRead = true;
    try {
      const response = await wx.cloud.callFunction({
        name: 'messageHelper',
        data: { action: 'markCategoryRead', category: this.category },
      });
      const result = response.result || {};
      if (!result.success) throw new Error(result.message || '标记已读失败');
      this.setData({ messages: this.data.messages.map((message) => ({ ...message, read: true })) });
      await getApp().getUnreadNum();
    } catch (error) {
      console.error('标记已读失败', error);
    } finally {
      this.markingRead = false;
    }
  },
});

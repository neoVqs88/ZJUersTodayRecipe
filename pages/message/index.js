// 消息主页：分类卡片（点赞与评论 / 饭搭子邀约 / 系统通知…）
// 数据来自云数据库 messages 集合（权限：仅创建者可读写，天然只看到自己的消息）
// 卡片 = 把该分类下的消息事件聚合而成：最新一条做摘要 + 未读条数

import formatTime from '../../utils/formatTime';
import appearanceBehavior from '~/behaviors/appearance';

// 分类的展示配置：标题、图标、配色、归属哪个标签页
const CATEGORIES = {
  like_comment: { title: '点赞与评论', icon: 'thumb-up', theme: 'green', tab: 'interaction' },
  follow: { title: '新的关注', icon: 'user-add', theme: 'blue', tab: 'interaction' },
  invite: { title: '饭搭子邀约', icon: 'usergroup', theme: 'orange', tab: 'dining', tag: '新邀约', tagTheme: 'orange' },
  system: { title: '系统通知', icon: 'notification', theme: 'blue', tab: 'system' },
  checkin: { title: '打卡提醒', icon: 'calendar', theme: 'green', tab: 'system' },
  activity: { title: '活动通知', icon: 'sound', theme: 'purple', tab: 'system', tag: '官方', tagTheme: 'blue' },
};

Page({
  behaviors: [appearanceBehavior],
  data: {
    activeTab: 'all',
    messages: [],
    cards: [], // 全部分类卡片
    displayCards: [], // 当前标签页要展示的卡片
    loading: true,
    loadingMore: false,
    page: 0,
    pageSize: 20,
    hasMore: true,
    unreadTotal: 0,
  },

  goBack() { wx.navigateBack(); },

  async markAllRead() {
    if (!this.data.unreadTotal) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      const response = await wx.cloud.callFunction({ name: 'messageHelper', data: { action: 'markAllRead' } });
      const result = response.result || {};
      if (!result.success) throw new Error(result.message || '操作失败');
      const messages = this.data.messages.map((message) => ({ ...message, read: true }));
      const cards = this.data.cards.map((card) => ({ ...card, unreadCount: 0 }));
      this.setData({
        messages,
        cards,
        displayCards: this.filterCards(cards, this.data.activeTab),
        unreadTotal: 0,
      });
      getApp().setUnreadNum(0);
      wx.showToast({ title: '已全部标为已读', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 每次进入页面都拉最新数据（从详情页返回时也会触发，未读数自动刷新）
  onShow() {
    this.fetchMessages(true);
  },

  async fetchMessages(reset = false) {
    if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
    const page = reset ? 0 : this.data.page;
    this.setData(reset ? { loading: true, hasMore: true } : { loadingMore: true });
    try {
      const [listResponse, overviewResponse] = await Promise.all([
        wx.cloud.callFunction({
          name: 'messageHelper',
          data: { action: 'list', page, pageSize: this.data.pageSize },
        }),
        reset
          ? wx.cloud.callFunction({ name: 'messageHelper', data: { action: 'overview' } })
          : Promise.resolve(null),
      ]);
      const listResult = listResponse.result || {};
      if (!listResult.success) throw new Error(listResult.message || '消息加载失败');
      const nextMessages = (listResult.messages || []).map((m) => ({ ...m, displayTime: formatTime(m.createdAt) }));
      const messages = reset ? nextMessages : [...this.data.messages, ...nextMessages];
      const overviewResult = overviewResponse && overviewResponse.result;
      const cards = reset && overviewResult && overviewResult.success
        ? this.buildOverviewCards(overviewResult.overview)
        : this.data.cards;
      const unreadTotal = reset && overviewResult && overviewResult.success
        ? Math.max(0, Number(overviewResult.unreadCount) || 0)
        : this.data.unreadTotal;
      this.setData({
        messages,
        cards,
        displayCards: this.filterCards(cards, this.data.activeTab),
        loading: false,
        loadingMore: false,
        page: page + 1,
        hasMore: Boolean(listResult.hasMore),
        unreadTotal,
      });
      getApp().setUnreadNum(unreadTotal);
    } catch (err) {
      console.error('拉取消息失败', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '消息加载失败', icon: 'none' });
    }
  },

  loadMore() {
    this.fetchMessages(false);
  },

  switchMessageTab(event) {
    const { tab } = event.currentTarget.dataset;
    this.setData({
      activeTab: tab,
      displayCards: this.filterCards(this.data.cards, tab),
    });
  },

  buildOverviewCards(overview = []) {
    const overviewMap = Object.fromEntries(overview.map((item) => [item.category, item]));
    return Object.entries(CATEGORIES).map(([category, meta]) => {
      const item = overviewMap[category];
      if (!item || !item.latest) return null;
      const {latest} = item;
      return {
        category,
        ...meta,
        summary: `${latest.senderName || '系统'} ${latest.action || ''}`.trim(),
        detail: latest.content || latest.targetDesc,
        displayTime: formatTime(latest.createdAt),
        unreadCount: Math.max(0, Number(item.unreadCount) || 0),
      };
    }).filter(Boolean);
  },

  filterCards(cards, tab) {
    return tab === 'all' ? cards : cards.filter((card) => card.tab === tab);
  },

  // 点击分类卡片 → 进入该分类的完整消息列表
  openCategory(event) {
    const { category, title } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/message/detail/index?category=${category}&title=${title}` });
  },

  goCompanion() {
    wx.reLaunch({ url: '/pages/community/index' });
  },
});

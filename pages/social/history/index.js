import { isLoggedIn } from '~/services/auth';
import { clearBrowsingHistory, fetchBrowsingHistory, removeBrowsingHistory } from '~/services/userSocial';
import appearanceBehavior from '~/behaviors/appearance';

const TYPE_META = {
  profile: { label: '用户主页', icon: 'user-circle' },
  post: { label: '社区帖子', icon: 'root-list' },
  dish: { label: '菜品', icon: 'rice' },
  canteen: { label: '食堂窗口', icon: 'shop' },
};

function parseDate(value) {
  if (!value) return null;
  if (value.$date) return new Date(value.$date);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = parseDate(value);
  if (!date) return '';
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`;
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function formatHistory(history = []) {
  return history.map((item) => ({
    ...item,
    typeLabel: TYPE_META[item.type] ? TYPE_META[item.type].label : '浏览内容',
    icon: TYPE_META[item.type] ? TYPE_META[item.type].icon : 'browse',
    displayTime: formatTime(item.visitedAt),
  }));
}

Page({
  behaviors: [appearanceBehavior],
  data: {
    loading: true,
    clearing: false,
    activeFilter: 'all',
    filters: [
      { label: '全部', value: 'all' },
      { label: '主页', value: 'profile' },
      { label: '帖子', value: 'post' },
      { label: '菜品', value: 'dish' },
      { label: '食堂', value: 'canteen' },
    ],
    history: [],
    displayHistory: [],
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
    }
  },

  onShow() {
    if (isLoggedIn()) this.loadHistory();
  },

  filterHistory(history, filter) {
    return filter === 'all' ? history : history.filter((item) => item.type === filter);
  },

  async loadHistory() {
    try {
      const result = await fetchBrowsingHistory('', 100);
      const history = formatHistory(result.history || []);
      this.setData({
        history,
        displayHistory: this.filterHistory(history, this.data.activeFilter),
      });
    } catch (error) {
      wx.showToast({ title: error.message || '足迹加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  selectFilter(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      activeFilter: value,
      displayHistory: this.filterHistory(this.data.history, value),
    });
  },

  openHistory(event) {
    const { item } = event.currentTarget.dataset;
    if (!item || !item.route) return;
    const tabPages = ['/pages/home/index', '/pages/community/index', '/pages/message/index', '/pages/my/index'];
    if (tabPages.includes(item.route)) {
      wx.reLaunch({ url: item.route });
      return;
    }
    wx.navigateTo({
      url: item.route,
      success: ({ eventChannel }) => {
        if (item.type !== 'post') return;
        eventChannel.emit('post', {
          id: item.targetId,
          dish: item.title,
          content: item.subtitle,
          avatar: item.image,
          author: '校园美食分享',
        });
      },
    });
  },

  removeHistory(event) {
    const { id } = event.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['删除这条足迹'],
      success: async ({ tapIndex }) => {
        if (tapIndex !== 0) return;
        try {
          await removeBrowsingHistory(id);
          const history = this.data.history.filter((item) => item._id !== id);
          this.setData({
            history,
            displayHistory: this.filterHistory(history, this.data.activeFilter),
          });
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      },
    });
  },

  clearAll() {
    if (!this.data.history.length || this.data.clearing) return;
    wx.showModal({
      title: '清空浏览足迹',
      content: '该操作无法撤销，不会影响帖子、收藏或打卡数据。',
      confirmText: '清空',
      confirmColor: '#e5484d',
      success: async ({ confirm }) => {
        if (!confirm) return;
        this.setData({ clearing: true });
        try {
          await clearBrowsingHistory();
          this.setData({ history: [], displayHistory: [] });
          wx.showToast({ title: '足迹已清空', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message || '清空失败', icon: 'none' });
        } finally {
          this.setData({ clearing: false });
        }
      },
    });
  },
});

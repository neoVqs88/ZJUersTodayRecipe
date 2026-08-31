import {
  clearAdminSession,
  deleteAdminPost,
  fetchAdminPosts,
  fetchAdminReports,
  migrateLegacyPostLikes,
  resolveAdminReport,
} from '~/services/adminCommunity';
import appearanceBehavior from '~/behaviors/appearance';

const PAGE_SIZE = 15;
const CATEGORY_LABELS = {
  food: '美食分享',
  explore: '探店打卡',
  companion: '约饭拼桌',
};

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.$date) return new Date(value.$date);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = parseDate(value);
  if (!date) return '时间未知';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPosts(posts = []) {
  return posts.map((post) => ({
    ...post,
    categoryLabel: CATEGORY_LABELS[post.category] || '其他内容',
    displayTime: formatTime(post.createdAt),
    displayImage: post.image || (post.images && post.images[0]) || '',
  }));
}

Page({
  behaviors: [appearanceBehavior],
  data: {
    posts: [],
    reports: [],
    activeMode: 'posts',
    total: 0,
    page: 1,
    hasMore: false,
    loading: true,
    loadingMore: false,
    deletingId: '',
    migratingLikes: false,
  },

  onLoad() {
    this.loadPosts(true);
  },

  async loadPosts(reset = false) {
    if ((this.data.loadingMore && !reset) || this.requesting) return;
    const page = reset ? 1 : this.data.page;
    this.requesting = true;
    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const result = await fetchAdminPosts(page, PAGE_SIZE);
      const incoming = formatPosts(result.posts);
      this.setData({
        posts: reset ? incoming : [...this.data.posts, ...incoming],
        total: Number(result.total) || 0,
        page: page + 1,
        hasMore: Boolean(result.hasMore),
      });
    } catch (error) {
      this.handleServiceError(error, '帖子加载失败');
    } finally {
      this.requesting = false;
      this.setData({ loading: false, loadingMore: false });
      wx.stopPullDownRefresh();
    }
  },

  onPullDownRefresh() {
    if (this.data.activeMode === 'reports') this.loadReports(true);
    else this.loadPosts(true);
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    if (this.data.activeMode === 'reports') this.loadReports(false);
    else this.loadPosts(false);
  },

  switchMode(event) {
    const activeMode = event.currentTarget.dataset.mode;
    if (activeMode === this.data.activeMode) return;
    this.setData({ activeMode, page: 1, hasMore: false });
    if (activeMode === 'reports') this.loadReports(true);
    else this.loadPosts(true);
  },

  async loadReports(reset = false) {
    if ((this.data.loadingMore && !reset) || this.requesting) return;
    const page = reset ? 1 : this.data.page;
    this.requesting = true;
    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const result = await fetchAdminReports(page, PAGE_SIZE, 'pending');
      const incoming = (result.reports || []).map((report) => ({
        ...report,
        displayTime: formatTime(report.createdAt),
      }));
      this.setData({
        reports: reset ? incoming : [...this.data.reports, ...incoming],
        total: Number(result.total) || 0,
        page: page + 1,
        hasMore: Boolean(result.hasMore),
      });
    } catch (error) {
      this.handleServiceError(error, '举报加载失败');
    } finally {
      this.requesting = false;
      this.setData({ loading: false, loadingMore: false });
      wx.stopPullDownRefresh();
    }
  },

  handleReport(event) {
    const reportId = event.currentTarget.dataset.id;
    const resolution = event.currentTarget.dataset.resolution;
    wx.showModal({
      title: resolution === 'delete' ? '删除被举报帖子？' : '驳回这条举报？',
      content: resolution === 'delete' ? '帖子及关联评论、点赞和图片会被删除。' : '举报将标记为已驳回，帖子继续保留。',
      confirmText: '确认处理',
      success: async ({ confirm }) => {
        if (!confirm) return;
        try {
          await resolveAdminReport(reportId, resolution);
          this.setData({
            reports: this.data.reports.filter((report) => report.id !== reportId),
            total: Math.max(0, this.data.total - 1),
          });
          wx.showToast({ title: '处理完成', icon: 'success' });
        } catch (error) {
          this.handleServiceError(error, '举报处理失败');
        }
      },
    });
  },

  handleServiceError(error, fallback) {
    if (error && error.code === 'ADMIN_SESSION_INVALID') {
      wx.showToast({ title: '管理会话已失效', icon: 'none' });
      setTimeout(() => wx.redirectTo({ url: '/pages/admin/login/index' }), 500);
      return;
    }
    wx.showToast({ title: (error && error.message) || fallback, icon: 'none', duration: 2600 });
  },

  previewImage(event) {
    const { id, src } = event.currentTarget.dataset;
    const post = this.data.posts.find((item) => item.id === id);
    const urls = post && post.images && post.images.length ? post.images : [src].filter(Boolean);
    if (urls.length) wx.previewImage({ current: src || urls[0], urls });
  },

  viewPost(event) {
    const { id } = event.currentTarget.dataset;
    const post = this.data.posts.find((item) => item.id === id);
    if (!post) return;
    wx.navigateTo({
      url: `/pages/comments/index?postId=${encodeURIComponent(id)}`,
      success: ({ eventChannel }) => eventChannel.emit('post', {
        ...post,
        _id: post.id,
        author: post.authorName,
      }),
    });
  },

  requestDelete(event) {
    const { id } = event.currentTarget.dataset;
    const post = this.data.posts.find((item) => item.id === id);
    if (!post || this.data.deletingId) return;
    wx.showModal({
      title: '删除这篇帖子？',
      content: `作者：${post.authorName}\n删除后社区中将不再显示，操作会写入管理日志。`,
      confirmText: '继续',
      confirmColor: '#e34d59',
      success: ({ confirm }) => {
        if (confirm) this.askDeleteReason(post);
      },
    });
  },

  askDeleteReason(post) {
    wx.showModal({
      title: '填写删除原因',
      editable: true,
      placeholderText: '例如：违规广告、攻击他人、泄露隐私',
      confirmText: '确认删除',
      confirmColor: '#e34d59',
      success: ({ confirm, content }) => {
        if (confirm) this.confirmDelete(post, String(content || '').trim());
      },
    });
  },

  async confirmDelete(post, reason) {
    if (this.data.deletingId) return;
    this.setData({ deletingId: post.id });
    try {
      await deleteAdminPost(post.id, reason || '管理员删除');
      const posts = this.data.posts.filter((item) => item.id !== post.id);
      this.setData({ posts, total: Math.max(0, this.data.total - 1) });
      wx.showToast({ title: '帖子已删除', icon: 'success' });
    } catch (error) {
      this.handleServiceError(error, '删除失败，请重试');
    } finally {
      this.setData({ deletingId: '' });
    }
  },

  exitAdmin() {
    wx.showModal({
      title: '退出管理模式？',
      content: '退出后再次进入需要重新输入管理密钥。',
      confirmText: '退出',
      success: ({ confirm }) => {
        if (!confirm) return;
        clearAdminSession();
        wx.redirectTo({ url: '/pages/admin/login/index' });
      },
    });
  },

  migrateLikes() {
    if (this.data.migratingLikes) return;
    wx.showModal({
      title: '迁移旧点赞数据？',
      content: '该操作会把旧帖中的公开点赞者数组迁入私有集合，并移除旧字段。每个云环境只需执行一次。',
      confirmText: '开始迁移',
      success: ({ confirm }) => {
        if (confirm) this.runLikeMigration();
      },
    });
  },

  async runLikeMigration() {
    this.setData({ migratingLikes: true });
    wx.showLoading({ title: '迁移点赞中', mask: true });
    let migratedPosts = 0;
    let migratedLikes = 0;
    try {
      let hasMore = true;
      let batches = 0;
      let page = 1;
      while (hasMore && batches < 100) {
        // 每次云函数只处理少量帖子，避免单次运行超时。
        // eslint-disable-next-line no-await-in-loop
        const result = await migrateLegacyPostLikes(page);
        migratedPosts += Number(result.migratedPosts) || 0;
        migratedLikes += Number(result.migratedLikes) || 0;
        hasMore = Boolean(result.hasMore);
        page = Number(result.nextPage) || page + 1;
        batches += 1;
      }
      wx.hideLoading();
      wx.showModal({
        title: '迁移完成',
        content: `已处理 ${migratedPosts} 篇旧帖子，迁移 ${migratedLikes} 条点赞记录。`,
        showCancel: false,
      });
      this.loadPosts(true);
    } catch (error) {
      wx.hideLoading();
      this.handleServiceError(error, '旧点赞数据迁移失败');
    } finally {
      this.setData({ migratingLikes: false });
    }
  },
});

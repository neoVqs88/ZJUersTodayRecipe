import { fetchFavoritePosts } from '~/services/communityPosts';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: {
    posts: [],
    page: 1,
    pageSize: 20,
    loading: true,
    loadingMore: false,
    hasMore: true,
  },

  onShow() {
    this.loadPosts(true);
  },

  async loadPosts(reset = false) {
    if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
    const page = reset ? 1 : this.data.page;
    this.setData(reset ? { loading: true, hasMore: true } : { loadingMore: true });
    try {
      const result = await fetchFavoritePosts(page, this.data.pageSize);
      const next = (result.posts || []).map((post) => ({
        ...post,
        image: post.image || (Array.isArray(post.images) ? post.images[0] : '') || '',
      }));
      this.setData({
        posts: reset ? next : [...this.data.posts, ...next],
        page: page + 1,
        hasMore: Boolean(result.hasMore),
      });
    } catch (error) {
      wx.showToast({ title: error.message || '收藏加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  loadMore() {
    this.loadPosts(false);
  },

  openPost(event) {
    const postId = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/comments/index?postId=${encodeURIComponent(postId)}` });
  },
});

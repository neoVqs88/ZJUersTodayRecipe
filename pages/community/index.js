// 社区页：动态来自云数据库 posts 集合
// 集合权限：所有用户可读、客户端不可写；发布和互动由云函数校验身份后完成。

import { fetchCommentCounts } from '~/services/comments';
import { isLoggedIn } from '~/services/auth';
import { recordBrowsingHistory } from '~/services/userSocial';
import {
  fetchCommunityStates,
  hidePost,
  reportPost,
  togglePostFavorite,
} from '~/services/communityPosts';
import appearanceBehavior from '~/behaviors/appearance';
import formatTime from '../../utils/formatTime';

const CATEGORIES = [
  { label: '全部动态', value: 'all', icon: '▱' },
  { label: '美食分享', value: 'food', icon: '🍲' },
  { label: '约饭拼桌', value: 'companion', icon: '🥂' },
  { label: '探店打卡', value: 'explore', icon: '▤' },
];
const CATEGORY_LABELS = { food: '美食分享', companion: '约饭拼桌', explore: '探店打卡', poll: '新菜公投' };

Page({
  behaviors: [appearanceBehavior],
  data: {
    categories: CATEGORIES,
    activeCategory: 'all',
    posts: [],
    displayPosts: [],
    loading: true,
    loadingMore: false,
    page: 0,
    pageSize: 20,
    hasMore: true,
    activeCommunityTab: 'posts',
    unreadNum: 0,
    communityTabs: [
      { label: '饭帖', value: 'posts' },
      { label: '找同桌', value: 'companion' },
      { label: '新菜公投', value: 'poll' },
    ],
  },

  // 每次进入页面都拉最新数据（从发布页返回、别人点了赞，都能反映出来）
  onShow() {
    this.loadUnreadNum();
    this.fetchPosts(true);
  },

  onLoad(options) {
    this.unreadHandler = (unreadNum) => this.setData({ unreadNum: Math.max(0, Number(unreadNum) || 0) });
    getApp().eventBus.on('unread-num-change', this.unreadHandler);
    if (!options.oper) return;
    wx.showToast({
      title: options.oper === 'release' ? '发布成功' : '保存成功',
      icon: 'success',
    });
  },

  onUnload() {
    if (this.unreadHandler) getApp().eventBus.off('unread-num-change', this.unreadHandler);
  },

  async fetchPosts(reset = false) {
    if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
    const page = reset ? 0 : this.data.page;
    this.setData(reset ? { loading: true, hasMore: true } : { loadingMore: true });
    try {
      const db = wx.cloud.database();
      const {command} = db;
      const res = await db.collection('posts')
        .where({ status: command.in(['published', 'active']) })
        .orderBy('createdAt', 'desc')
        .skip(page * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();
      const visibleData = res.data.filter((post) => {
        const status = post.post_status || post.status || 'published';
        return status === 'published' || status === 'active';
      });
      const nextPosts = visibleData.map((p) => {
        const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
        let locationName = p.locationName || '';
        if (typeof p.location === 'string') locationName = p.location;
        if (p.location && p.location.name) locationName = p.location.name;
        return {
          ...p,
          images,
          image: p.image || images[0] || '',
          locationName,
          displayTime: formatTime(p.createdAt),
          categoryLabel: CATEGORY_LABELS[p.category] || '校园美食',
          liked: false,
          collected: false,
          hidden: false,
        };
      });
      const posts = reset ? nextPosts : [...this.data.posts, ...nextPosts];
      this.setData({
        posts,
        displayPosts: this.filterPosts(posts, this.data.activeCategory),
        loading: false,
        loadingMore: false,
        page: page + 1,
        hasMore: res.data.length === this.data.pageSize,
      });
      this.syncLikeStates();
      this.syncCommentCounts(nextPosts.map((post) => post._id));
      this.syncCommunityStates();
    } catch (err) {
      console.error('拉取动态失败', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '动态加载失败', icon: 'none' });
    }
  },

  loadMore() {
    this.fetchPosts(false);
  },

  async loadUnreadNum() {
    if (!isLoggedIn()) {
      this.setData({ unreadNum: 0 });
      return;
    }
    try {
      const unreadNum = await getApp().getUnreadNum();
      this.setData({ unreadNum: Math.max(0, Number(unreadNum) || 0) });
    } catch (error) {
      // 消息集合尚未创建或暂时不可访问时，不显示错误的红点。
      this.setData({ unreadNum: 0 });
    }
  },

  selectCommunityTab(event) {
    const {value} = event.currentTarget.dataset;
    const category = value === 'posts' ? 'all' : value;
    this.setData({
      activeCommunityTab: value,
      activeCategory: category,
      displayPosts: this.filterPosts(this.data.posts, category),
    });
  },

  async syncCommunityStates() {
    if (!isLoggedIn() || !this.data.posts.length) return;
    try {
      const result = await fetchCommunityStates(this.data.posts.map((post) => post._id));
      const states = result.states || {};
      const posts = this.data.posts.map((post) => ({
        ...post,
        collected: Boolean(states[String(post._id)] && states[String(post._id)].collected),
        hidden: Boolean(states[String(post._id)] && states[String(post._id)].hidden),
      }));
      this.setData({ posts, displayPosts: this.filterPosts(posts, this.data.activeCategory) });
    } catch (error) {
      // 登录态同步失败不影响帖子浏览。
    }
  },

  async syncLikeStates() {
    if (!isLoggedIn() || !this.data.posts.length) return;
    try {
      const response = await wx.cloud.callFunction({
        name: 'likePost',
        data: {
          action: 'states',
          postIds: this.data.posts.map((post) => post._id),
        },
      });
      const result = response.result || {};
      if (!result.success) return;
      const states = result.states || {};
      const posts = this.data.posts.map((post) => ({
        ...post,
        liked: Boolean(states[String(post._id)]),
      }));
      this.setData({
        posts,
        displayPosts: this.filterPosts(posts, this.data.activeCategory),
      });
    } catch (error) {
      // 点赞状态加载失败不影响帖子浏览。
    }
  },

  // 补充每条动态的真实评论数（来自队友的评论云函数）
  async syncCommentCounts(postIds = []) {
    try {
      if (!postIds.length) return;
      const { counts } = await fetchCommentCounts(postIds);
      const posts = this.data.posts.map((p) => ({
        ...p,
        commentsCount: counts[String(p._id)] || 0,
      }));
      this.setData({
        posts,
        displayPosts: this.filterPosts(posts, this.data.activeCategory),
      });
    } catch (error) {
      // 评论服务未就绪时不影响动态浏览
    }
  },

  selectCategory(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      activeCategory: value,
      displayPosts: this.filterPosts(this.data.posts, value),
    });
  },

  filterPosts(posts, category) {
    const visible = posts.filter((post) => !post.hidden);
    return category === 'all' ? visible : visible.filter((post) => post.category === category);
  },

  updatePost(postId, updater) {
    const posts = this.data.posts.map((post) => (post._id === postId ? updater(post) : post));
    this.setData({
      posts,
      displayPosts: this.filterPosts(posts, this.data.activeCategory),
    });
  },

  // 点赞/取消点赞：云函数返回的是权威结果，以它为准刷新 UI
  // （进阶做法是先本地变红再对账，叫"乐观更新"，下期可以聊）
  async toggleLike(event) {
    const { id } = event.currentTarget.dataset;
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.showLoading({ title: '请稍候…', mask: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'likePost', data: { action: 'toggle', postId: id } });
      const result = res.result || {};
      if (!result.success) throw new Error(result.message || '点赞失败，请重试');
      const { liked, likes } = result;
      this.updatePost(id, (post) => ({ ...post, liked, likes }));
    } catch (err) {
      console.error('点赞失败', err);
      wx.showToast({ title: '点赞失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async toggleCollect(event) {
    const { id } = event.currentTarget.dataset;
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    try {
      const result = await togglePostFavorite(id);
      this.updatePost(id, (post) => ({
        ...post,
        collected: result.collected,
        collections: result.collections,
      }));
      wx.showToast({ title: result.collected ? '已收好' : '已取消收藏', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '收藏失败，请重试', icon: 'none' });
    }
  },

  openComments(event) {
    const { id } = event.currentTarget.dataset;
    const post = this.data.posts.find((item) => item._id === id);
    if (!post) return;

    if (isLoggedIn()) {
      recordBrowsingHistory({
        type: 'post',
        targetId: String(post._id),
        title: post.dish || '校园美食分享',
        subtitle: post.content,
        image: post.image || post.avatar || '',
        route: `/pages/comments/index?postId=${post._id}`,
      }).catch(() => {});
    }

    wx.navigateTo({
      url: `/pages/comments/index?postId=${post._id}`,
      success: ({ eventChannel }) => {
        eventChannel.emit('post', {
          ...post,
          id: post._id,
          author: post.authorName,
          authorId: post.authorId || post.userId || '',
        });
        eventChannel.on('commentCountChange', ({ postId, total }) => {
          this.updatePost(String(postId), (item) => ({ ...item, commentsCount: total }));
        });
      },
    });
  },

  openAuthorProfile(event) {
    const { id } = event.currentTarget.dataset;
    const post = this.data.posts.find((item) => item._id === id);
    if (!post) return;
    const userId = post.authorId || post.userId || '';
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '?preview=1';
    wx.navigateTo({
      url: `/pages/profile/index${query}`,
      success: ({ eventChannel }) => eventChannel.emit('profilePreview', {
        id: userId,
        name: post.authorName,
        image: post.avatar,
        introduction: post.authorIntroduction || '在校园里认真吃饭，也认真分享每一次美食发现。',
        campus: post.campus || '玉泉校区',
        star: '浙江大学生',
        postCount: 1,
      }),
    });
  },

  showPostMenu(event) {
    const { id } = event.currentTarget.dataset;
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.showActionSheet({
      itemList: ['不感兴趣', '举报内容'],
      success: async ({ tapIndex }) => {
        if (tapIndex === 0) {
          try {
            await hidePost(id);
            this.updatePost(id, (post) => ({ ...post, hidden: true }));
            wx.showToast({ title: '已减少此类内容', icon: 'success' });
          } catch (error) {
            wx.showToast({ title: error.message || '操作失败', icon: 'none' });
          }
          return;
        }
        wx.showActionSheet({
          itemList: ['广告营销', '辱骂攻击', '隐私泄露', '虚假信息', '不适内容', '其他'],
          success: async ({ tapIndex: reasonIndex }) => {
            const reasons = ['广告营销', '辱骂攻击', '隐私泄露', '虚假信息', '不适内容', '其他'];
            try {
              await reportPost(id, reasons[reasonIndex]);
              wx.showToast({ title: '举报已提交', icon: 'success' });
            } catch (error) {
              wx.showToast({ title: error.message || '举报失败', icon: 'none' });
            }
          },
        });
      },
    });
  },

  publishInvitation() {
    wx.navigateTo({ url: '/pages/release/index?type=invitation' });
  },

  viewActivities() {
    this.setData({
      activeCommunityTab: 'companion',
      activeCategory: 'companion',
      displayPosts: this.filterPosts(this.data.posts, 'companion'),
    });
  },

  goRelease() {
    wx.navigateTo({ url: '/pages/release/index' });
  },

  goMessages() {
    wx.navigateTo({ url: '/pages/message/index' });
  },
});

// 社区页：动态来自云数据库 posts 集合
// 集合权限：所有用户可读（大家都能刷社区），仅创建者可写（只能改自己的动态）
// 点赞走云函数 likePost（因为要修改别人的动态、还要给作者写消息）

import { fetchCommentCounts } from '~/services/comments';
import { isLoggedIn } from '~/services/auth';
import { recordBrowsingHistory } from '~/services/userSocial';
import formatTime from '../../utils/formatTime';

const CATEGORIES = [
  { label: '全部动态', value: 'all', icon: '▱' },
  { label: '美食分享', value: 'food', icon: '🍲' },
  { label: '约饭拼桌', value: 'companion', icon: '🥂' },
  { label: '探店打卡', value: 'explore', icon: '▤' },
];

Page({
  data: {
    categories: CATEGORIES,
    activeCategory: 'all',
    posts: [],
    displayPosts: [],
    loading: true,
  },

  // 每次进入页面都拉最新数据（从发布页返回、别人点了赞，都能反映出来）
  onShow() {
    this.fetchPosts();
  },

  onLoad(options) {
    if (!options.oper) return;
    wx.showToast({
      title: options.oper === 'release' ? '发布成功' : '保存成功',
      icon: 'success',
    });
  },

  async fetchPosts() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('posts').orderBy('createdAt', 'desc').get();
      const myOpenid = getApp().globalData.openid;
      const posts = res.data.map((p) => {
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
          liked: (p.likers || []).includes(myOpenid), // 我点过赞没有
        };
      });
      this.setData({
        posts,
        displayPosts: this.filterPosts(posts, this.data.activeCategory),
        loading: false,
      });
      this.syncCommentCounts();
    } catch (err) {
      console.error('拉取动态失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '动态加载失败', icon: 'none' });
    }
  },

  // 补充每条动态的真实评论数（来自队友的评论云函数）
  async syncCommentCounts() {
    try {
      const postIds = this.data.posts.map((p) => p._id);
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
    return category === 'all' ? posts : posts.filter((post) => post.category === category);
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
    wx.showLoading({ title: '请稍候…', mask: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'likePost', data: { postId: id } });
      const { liked, likes } = res.result;
      this.updatePost(id, (post) => ({ ...post, liked, likes }));
    } catch (err) {
      console.error('点赞失败', err);
      wx.showToast({ title: '点赞失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  toggleCollect() {
    wx.showToast({ title: '收藏功能即将接入', icon: 'none' });
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

  showPostMenu() {
    wx.showActionSheet({
      itemList: ['不感兴趣', '举报内容'],
      success: ({ tapIndex }) => {
        wx.showToast({
          title: tapIndex === 0 ? '将减少此类推荐' : '已进入举报流程',
          icon: 'none',
        });
      },
    });
  },

  publishInvitation() {
    wx.navigateTo({ url: '/pages/release/index?type=invitation' });
  },

  viewActivities() {
    this.setData({
      activeCategory: 'companion',
      displayPosts: this.filterPosts(this.data.posts, 'companion'),
    });
  },

  goRelease() {
    wx.navigateTo({ url: '/pages/release/index' });
  },
});

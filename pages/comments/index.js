import { createComment, fetchComments, removeComment } from '~/services/comments';
import { getCurrentUser, isLoggedIn } from '~/services/auth';
import { joinCompanionPost } from '~/services/companion';
import appearanceBehavior from '~/behaviors/appearance';
import { fetchPollState, fetchPublicPost, reportComment, voteInPoll as submitPollVote } from '~/services/communityPosts';

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.$date) return new Date(value.$date);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCommentTime(value) {
  const date = parseDate(value);
  if (!date) return '刚刚';
  const now = new Date();
  const distance = now.getTime() - date.getTime();
  if (distance < 60 * 1000) return '刚刚';
  if (distance < 60 * 60 * 1000) return `${Math.floor(distance / (60 * 1000))  } 分钟前`;
  if (distance < 24 * 60 * 60 * 1000) return `${Math.floor(distance / (60 * 60 * 1000))  } 小时前`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1  }月${  date.getDate()  }日`;
  }
  return `${date.getFullYear()  }年${  date.getMonth() + 1  }月${  date.getDate()  }日`;
}

function formatComments(comments) {
  return comments.map((comment) => ({
    ...comment,
    displayTime: formatCommentTime(comment.createdAt),
  }));
}

function normalizePost(post = {}) {
  const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
  if (!images.length && post.image) images.push(post.image);
  return {
    ...post,
    displayImages: images.slice(0, 4),
  };
}

Page({
  behaviors: [appearanceBehavior],
  data: {
    post: null,
    postImages: [],
    comments: [],
    total: 0,
    loading: true,
    refreshing: false,
    submitting: false,
    inputValue: '',
    inputFocus: false,
    replyTarget: null,
    companion: null,
    joiningCompanion: false,
    loggedIn: false,
    currentUserImage: '/static/miniprogram-icon-zju-bowl-144.png',
    page: 1,
    pageSize: 30,
    hasMore: true,
    loadingMore: false,
    poll: null,
  },

  goBack() { wx.navigateBack(); },

  onLoad(options) {
    this.postId = String(options.postId || '');
    this.eventChannel = this.getOpenerEventChannel();
    if (this.eventChannel && this.eventChannel.on) {
      this.eventChannel.on('post', (post) => {
        this.applyPost(post);
      });
    }
    this.loadPostSummary();
    this.loadComments(true);
  },

  async loadPostSummary() {
    if (!this.postId) return;
    try {
      const result = await fetchPublicPost(this.postId);
      if (result.post) {
        const post = {
          ...result.post,
          id: result.post._id,
          author: result.post.authorName,
          authorId: result.post.authorId || result.post.userId || '',
        };
        this.applyPost(post);
      }
    } catch (error) {
      // 从社区页进入时已有页面通道数据，数据库补读失败不影响评论功能。
    }
  },

  previewPostImage(event) {
    const urls = this.data.postImages || [];
    if (!urls.length) return;
    wx.previewImage({ current: event.currentTarget.dataset.src || urls[0], urls });
  },

  applyPost(source) {
    const post = normalizePost(source);
    let companion = null;
    if (post.category === 'companion') {
      const user = getCurrentUser() || {};
      const authorId = post.authorId || post.userId || '';
      const participantIds = Array.isArray(post.participantIds) ? post.participantIds.filter(Boolean) : [];
      const normalizedIds = Array.from(new Set(authorId ? [authorId, ...participantIds] : participantIds));
      const minParticipants = Math.min(Math.max(Number(post.minParticipants) || 2, 2), 20);
      const maxParticipants = Math.max(minParticipants, Math.min(Math.max(Number(post.maxParticipants) || 4, 2), 20));
      const participantCount = Math.max(normalizedIds.length, Number(post.participantCount) || 1);
      const isAuthor = Boolean(user.id && user.id === authorId);
      const joined = Boolean(post.joined || (user.id && normalizedIds.includes(user.id)));
      const full = participantCount >= maxParticipants;
      let buttonText = '参加约饭';
      if (isAuthor) buttonText = '你发起的约饭';
      else if (joined) buttonText = '已参加约饭';
      else if (full) buttonText = '报名已满';
      companion = {
        minParticipants,
        maxParticipants,
        participantCount,
        isAuthor,
        joined,
        full,
        buttonText,
      };
    }
    this.setData({ post, postImages: post.displayImages, companion });
    if (post.category === 'poll') this.loadPollState();
  },

  async loadPollState() {
    if (!isLoggedIn()) {
      const options = this.data.post.pollOptions || ['想尝鲜', '先观望'];
      this.setData({ poll: { options, counts: this.data.post.pollCounts || [0, 0], selectedIndex: -1 } });
      return;
    }
    try {
      const result = await fetchPollState(this.postId);
      this.setData({ poll: result });
    } catch (error) {
      // 投票状态失败不影响帖子和评论浏览。
    }
  },

  async voteInPoll(event) {
    if (!isLoggedIn()) {
      this.goLogin();
      return;
    }
    try {
      const result = await submitPollVote(this.postId, Number(event.currentTarget.dataset.index));
      this.setData({ poll: result });
      wx.showToast({ title: '投票成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '投票失败', icon: 'none' });
    }
  },

  async joinCompanion() {
    if (this.data.joiningCompanion || !this.data.companion) return;
    if (!isLoggedIn()) {
      this.goLogin();
      return;
    }
    if (this.data.companion.isAuthor || this.data.companion.joined || this.data.companion.full) return;
    this.setData({ joiningCompanion: true });
    try {
      const result = await joinCompanionPost(this.postId);
      const companion = {
        ...this.data.companion,
        participantCount: result.participantCount,
        joined: true,
        full: result.full,
        buttonText: '已参加约饭',
      };
      const currentUser = getCurrentUser() || {};
      const participantIds = Array.from(new Set([
        ...(this.data.post.participantIds || []),
        currentUser.id,
      ].filter(Boolean)));
      this.setData({
        companion,
        'post.participantCount': result.participantCount,
        'post.participantIds': participantIds,
      });
      wx.showToast({ title: result.alreadyJoined ? '你已经报名过啦' : '报名成功', icon: 'success' });
    } catch (error) {
      if (error.code === 'LOGIN_REQUIRED') this.goLogin();
      else {
        if (error.code === 'COMPANION_FULL') {
          this.setData({ 'companion.full': true, 'companion.buttonText': '报名已满' });
        }
        wx.showToast({ title: error.message || '报名失败，请重试', icon: 'none' });
      }
    } finally {
      this.setData({ joiningCompanion: false });
    }
  },

  onShow() {
    const loggedIn = isLoggedIn();
    const user = loggedIn ? getCurrentUser() || {} : {};
    this.setData({
      loggedIn,
      currentUserImage: user.image || '/static/miniprogram-icon-zju-bowl-144.png',
    });
    if (this.data.post) this.applyPost(this.data.post);
  },

  emitCommentCount(total) {
    if (this.eventChannel && this.eventChannel.emit) {
      this.eventChannel.emit('commentCountChange', {
        postId: this.postId,
        total,
      });
    }
  },

  async loadComments(reset = false) {
    if (!this.postId) {
      wx.showToast({ title: '帖子信息无效', icon: 'none' });
      this.setData({ loading: false, refreshing: false });
      return;
    }

    try {
      if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
      const page = reset ? 1 : this.data.page;
      this.setData(reset ? { loading: true, hasMore: true } : { loadingMore: true });
      const result = await fetchComments(this.postId, page, this.data.pageSize);
      const incoming = formatComments(result.comments || []);
      const comments = reset ? incoming : [...this.data.comments, ...incoming];
      this.setData({
        comments,
        total: result.total || 0,
        page: page + 1,
        hasMore: Boolean(result.hasMore),
      });
      this.emitCommentCount(result.total || 0);
    } catch (error) {
      wx.showToast({ title: error.message || '评论加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false, loadingMore: false });
    }
  },

  refreshComments() {
    this.setData({ refreshing: true });
    this.loadComments(true);
  },

  loadMoreComments() {
    this.loadComments(false);
  },

  onInput(event) {
    this.setData({ inputValue: event.detail.value });
  },

  startReply(event) {
    const { id, name } = event.currentTarget.dataset;
    this.setData({
      replyTarget: { id, name },
      inputFocus: true,
    });
  },

  clearReply() {
    this.setData({
      replyTarget: null,
      inputFocus: false,
    });
  },

  openUserProfile(event) {
    const { userId = '', source = '', id = '' } = event.currentTarget.dataset;
    let profile = null;
    if (source === 'post') profile = this.data.post;
    else profile = this.data.comments.find((item) => item.id === id);
    if (!profile) return;

    const targetId = userId || profile.userId || profile.authorId || '';
    const query = targetId ? `?userId=${  encodeURIComponent(targetId)}` : '?preview=1';
    wx.navigateTo({
      url: `/pages/profile/index${  query}`,
      success: ({ eventChannel }) => {
        eventChannel.emit('profilePreview', {
          id: targetId,
          name: profile.authorName || profile.author,
          image: profile.authorImage || profile.avatar,
          introduction: profile.authorIntroduction || '在校园里认真吃饭，也认真分享每一次美食发现。',
          campus: profile.campus || '玉泉校区',
          star: '浙江大学生',
        });
      },
    });
  },

  goLogin() {
    const redirect = encodeURIComponent(`/pages/comments/index?postId=${  this.postId}`);
    wx.navigateTo({ url: `/pages/login/login?redirect=${  redirect}` });
  },

  async submitComment() {
    if (this.data.submitting) return;
    if (!isLoggedIn()) {
      wx.showModal({
        title: '登录后参与讨论',
        content: '登录后可以发表评论和回复同学。',
        confirmText: '去登录',
        success: ({ confirm }) => {
          if (confirm) this.goLogin();
        },
      });
      return;
    }

    const content = this.data.inputValue.trim();
    if (!content) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const parentId = this.data.replyTarget ? this.data.replyTarget.id : '';
      const result = await createComment(this.postId, content, parentId);
      const comment = formatComments([result.comment])[0];
      this.setData({
        comments: [comment, ...this.data.comments],
        total: result.total,
        inputValue: '',
        inputFocus: false,
        replyTarget: null,
      });
      this.emitCommentCount(result.total);
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (error) {
      if (error.code === 'LOGIN_REQUIRED') this.goLogin();
      else wx.showToast({ title: error.message || '评论失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  handleCommentLongPress(event) {
    const { id } = event.currentTarget.dataset;
    const comment = this.data.comments.find((item) => item.id === id);
    if (!comment) return;

    wx.showActionSheet({
      itemList: comment.isMine ? ['删除评论'] : ['举报评论'],
      success: async ({ tapIndex }) => {
        if (tapIndex !== 0) return;
        if (!comment.isMine) {
          wx.showActionSheet({
            itemList: ['广告营销', '辱骂攻击', '隐私泄露', '虚假信息', '不适内容', '其他'],
            success: async ({ tapIndex: reasonIndex }) => {
              const reasons = ['广告营销', '辱骂攻击', '隐私泄露', '虚假信息', '不适内容', '其他'];
              try {
                await reportComment(id, reasons[reasonIndex]);
                wx.showToast({ title: '举报已提交', icon: 'success' });
              } catch (error) {
                wx.showToast({ title: error.message || '举报失败', icon: 'none' });
              }
            },
          });
          return;
        }
        try {
          const result = await removeComment(id);
          this.setData({
            comments: this.data.comments.filter((item) => item.id !== id),
            total: result.total,
          });
          this.emitCommentCount(result.total);
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      },
    });
  },
});

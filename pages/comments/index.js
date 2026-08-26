import { createComment, fetchComments, removeComment } from '~/services/comments';
import { getCurrentUser, isLoggedIn } from '~/services/auth';

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

Page({
  data: {
    post: null,
    comments: [],
    total: 0,
    loading: true,
    refreshing: false,
    submitting: false,
    inputValue: '',
    inputFocus: false,
    replyTarget: null,
    loggedIn: false,
    currentUserImage: '/static/miniprogram-icon-zju-bowl-144.png',
  },

  onLoad(options) {
    this.postId = String(options.postId || '');
    this.eventChannel = this.getOpenerEventChannel();
    if (this.eventChannel && this.eventChannel.on) {
      this.eventChannel.on('post', (post) => {
        this.setData({ post });
      });
    }
    this.loadComments();
  },

  onShow() {
    const loggedIn = isLoggedIn();
    const user = loggedIn ? getCurrentUser() || {} : {};
    this.setData({
      loggedIn,
      currentUserImage: user.image || '/static/miniprogram-icon-zju-bowl-144.png',
    });
  },

  emitCommentCount(total) {
    if (this.eventChannel && this.eventChannel.emit) {
      this.eventChannel.emit('commentCountChange', {
        postId: this.postId,
        total,
      });
    }
  },

  async loadComments() {
    if (!this.postId) {
      wx.showToast({ title: '帖子信息无效', icon: 'none' });
      this.setData({ loading: false, refreshing: false });
      return;
    }

    try {
      const result = await fetchComments(this.postId);
      const comments = formatComments(result.comments || []);
      this.setData({
        comments,
        total: result.total || 0,
      });
      this.emitCommentCount(result.total || 0);
    } catch (error) {
      wx.showToast({ title: error.message || '评论加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  refreshComments() {
    this.setData({ refreshing: true });
    this.loadComments();
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
    if (!comment || !comment.isMine) return;

    wx.showActionSheet({
      itemList: ['删除评论'],
      success: async ({ tapIndex }) => {
        if (tapIndex !== 0) return;
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

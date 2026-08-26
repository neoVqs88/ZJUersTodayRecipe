import { fetchFollowUsers } from '~/services/userSocial';

Page({
  data: {
    title: '关注',
    mode: 'following',
    userId: '',
    loading: true,
    hidden: false,
    users: [],
  },

  onLoad(options) {
    const mode = options.mode === 'followers' ? 'followers' : 'following';
    this.setData({
      mode,
      userId: String(options.userId || ''),
      title: mode === 'followers' ? '粉丝' : '关注',
    });
  },

  onShow() {
    this.loadUsers();
  },

  async loadUsers() {
    this.setData({ loading: true });
    try {
      const result = await fetchFollowUsers(this.data.userId, this.data.mode, 50);
      this.setData({ users: result.users || [], hidden: Boolean(result.hidden) });
    } catch (error) {
      wx.showToast({ title: error.message || '列表加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openProfile(event) {
    const { user } = event.currentTarget.dataset;
    if (!user || !user.id) return;
    wx.navigateTo({
      url: `/pages/profile/index?userId=${user.id}`,
      success: ({ eventChannel }) => eventChannel.emit('profilePreview', user),
    });
  },
});

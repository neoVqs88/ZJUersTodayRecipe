import { isLoggedIn } from '~/services/auth';
import { hasAdminSession, loginCommunityAdmin } from '~/services/adminCommunity';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: {
    key: '',
    loading: false,
    showKey: false,
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({
        url: `/pages/login/login?redirect=${encodeURIComponent('/pages/admin/login/index')}`,
      });
      return;
    }
    if (hasAdminSession()) wx.redirectTo({ url: '/pages/admin/posts/index' });
  },

  onKeyInput(event) {
    this.setData({ key: event.detail.value || '' });
  },

  toggleKeyVisibility() {
    this.setData({ showKey: !this.data.showKey });
  },

  goBack() {
    wx.navigateBack();
  },

  async submit() {
    if (this.data.loading) return;
    const key = this.data.key.trim();
    if (!key) {
      wx.showToast({ title: '请输入管理密钥', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      await loginCommunityAdmin(key);
      this.setData({ key: '' });
      wx.showToast({ title: '验证成功', icon: 'success' });
      setTimeout(() => wx.redirectTo({ url: '/pages/admin/posts/index' }), 350);
    } catch (error) {
      wx.showToast({ title: error.message || '密钥验证失败', icon: 'none', duration: 2600 });
    } finally {
      this.setData({ loading: false });
    }
  },
});

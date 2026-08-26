import Toast from 'tdesign-miniprogram/toast/index';
import { loginWithWechat } from '~/services/auth';

Page({
  data: {
    agreed: false,
    loadingType: '',
  },

  onLoad(options) {
    this.redirect = options.redirect ? decodeURIComponent(options.redirect) : '';
  },

  showMessage(message, theme = 'error') {
    Toast({ context: this, selector: '#login-toast', message, theme });
  },

  onAgreementChange(event) {
    this.setData({ agreed: event.detail.value === 'agree' });
  },

  ensureAgreement() {
    if (this.data.agreed) return true;
    this.showMessage('请先阅读并同意用户协议和隐私政策');
    return false;
  },

  async loginWithWechat() {
    if (!this.ensureAgreement() || this.data.loadingType) return;
    this.setData({ loadingType: 'wechat' });
    try {
      await loginWithWechat();
      this.finishLogin();
    } catch (error) {
      this.showMessage(error.message || error.errMsg || '微信登录失败，请稍后重试');
    } finally {
      this.setData({ loadingType: '' });
    }
  },

  finishLogin() {
    wx.showToast({ title: '登录成功', icon: 'success' });
    if (this.redirect) {
      wx.redirectTo({ url: this.redirect });
      return;
    }
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/my/index' });
  },

  showAgreement(event) {
    const { type } = event.currentTarget.dataset;
    this.showMessage(type === 'privacy' ? '隐私政策页面待接入' : '用户协议页面待接入', 'warning');
  },
});

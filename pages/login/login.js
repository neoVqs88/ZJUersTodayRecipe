import Toast from 'tdesign-miniprogram/toast/index';
import { loginWithWechat } from '~/services/auth';
import { getLegalConsent } from '~/config/legal';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
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
      await loginWithWechat({ consent: getLegalConsent() });
      this.finishLogin();
    } catch (error) {
      if (error.code === 'ACCOUNT_DELETED') {
        this.confirmReactivation();
        return;
      }
      this.showMessage(error.message || error.errMsg || '微信登录失败，请稍后重试');
    } finally {
      this.setData({ loadingType: '' });
    }
  },

  confirmReactivation() {
    wx.showModal({
      title: '账号已注销',
      content: '该微信身份之前注销过账号。重新创建后将获得一个空白账号，已删除的数据无法恢复。',
      confirmText: '重新创建',
      confirmColor: '#3478f6',
      success: async ({ confirm }) => {
        if (!confirm || this.data.loadingType) return;
        this.setData({ loadingType: 'wechat' });
        try {
          await loginWithWechat({ reactivate: true, consent: getLegalConsent() });
          this.finishLogin();
        } catch (error) {
          this.showMessage(error.message || error.errMsg || '重新创建账号失败');
        } finally {
          this.setData({ loadingType: '' });
        }
      },
    });
  },

  finishLogin() {
    wx.showToast({ title: '登录成功', icon: 'success' });
    if (this.redirect) {
      wx.redirectTo({ url: this.redirect });
      return;
    }
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/my/index' });
  },

  showAgreement(event) {
    const { type } = event.currentTarget.dataset;
    wx.navigateTo({
      url: type === 'privacy'
        ? '/pages/legal/privacy/index'
        : '/pages/legal/agreement/index',
    });
  },
});

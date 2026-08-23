import Toast from 'tdesign-miniprogram/toast/index';
import { loginWithWechat, sendSmsCode } from '~/services/auth';

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

Page({
  data: {
    phoneNumber: '',
    isPhoneNumber: false,
    agreed: false,
    loadingType: '',
  },

  onLoad(options) {
    this.redirect = options.redirect ? decodeURIComponent(options.redirect) : '';
  },

  showMessage(message, theme = 'error') {
    Toast({ context: this, selector: '#login-toast', message, theme });
  },

  onPhoneInput(event) {
    const phoneNumber = event.detail.value.trim();
    this.setData({ phoneNumber, isPhoneNumber: PHONE_PATTERN.test(phoneNumber) });
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

  async sendCode() {
    if (!this.ensureAgreement() || this.data.loadingType) return;
    if (!this.data.isPhoneNumber) {
      this.showMessage('请输入正确的手机号码');
      return;
    }

    this.setData({ loadingType: 'sms' });
    try {
      await sendSmsCode(this.data.phoneNumber);
      const phoneNumber = encodeURIComponent(this.data.phoneNumber);
      const redirect = encodeURIComponent(this.redirect || '');
      wx.navigateTo({
        url: `/pages/loginCode/loginCode?phoneNumber=${phoneNumber}&redirect=${redirect}`,
      });
    } catch (error) {
      this.showMessage(error.message || '验证码发送失败，请稍后重试');
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

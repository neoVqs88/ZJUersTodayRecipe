import Toast from 'tdesign-miniprogram/toast/index';
import config from '~/config';
import { loginWithSms, sendSmsCode } from '~/services/auth';

const COUNTDOWN_SECONDS = 60;

Page({
  data: {
    phoneNumber: '',
    maskedPhone: '',
    sendCodeCount: COUNTDOWN_SECONDS,
    verifyCode: '',
    submitting: false,
    sending: false,
    isMock: config.isMock,
  },

  timer: null,

  onLoad(options) {
    const phoneNumber = decodeURIComponent(options.phoneNumber || '');
    this.redirect = options.redirect ? decodeURIComponent(options.redirect) : '';
    if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
      wx.showToast({ title: '手机号无效', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.setData({ phoneNumber, maskedPhone: `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}` });
    this.startCountdown();
  },

  onUnload() {
    this.clearTimer();
  },

  showMessage(message, theme = 'error') {
    Toast({ context: this, selector: '#code-toast', message, theme });
  },

  onVerifyCodeChange(event) {
    const verifyCode = String(event.detail.value || '').replace(/\D/g, '').slice(0, 6);
    this.setData({ verifyCode });
  },

  clearTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  startCountdown() {
    this.clearTimer();
    this.setData({ sendCodeCount: COUNTDOWN_SECONDS });
    this.timer = setInterval(() => {
      const nextCount = this.data.sendCodeCount - 1;
      this.setData({ sendCodeCount: Math.max(nextCount, 0) });
      if (nextCount <= 0) this.clearTimer();
    }, 1000);
  },

  async resendCode() {
    if (this.data.sendCodeCount > 0 || this.data.sending) return;
    this.setData({ sending: true });
    try {
      await sendSmsCode(this.data.phoneNumber);
      this.startCountdown();
      this.showMessage('验证码已重新发送', 'success');
    } catch (error) {
      this.showMessage(error.message || '验证码发送失败，请稍后重试');
    } finally {
      this.setData({ sending: false });
    }
  },

  async login() {
    if (this.data.verifyCode.length !== 6 || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await loginWithSms(this.data.phoneNumber, this.data.verifyCode);
      this.finishLogin();
    } catch (error) {
      this.showMessage(error.message || '验证码错误或已失效');
    } finally {
      this.setData({ submitting: false });
    }
  },

  finishLogin() {
    wx.showToast({ title: '登录成功', icon: 'success' });
    if (this.redirect) {
      wx.redirectTo({ url: this.redirect });
      return;
    }
    wx.switchTab({ url: '/pages/my/index' });
  },
});

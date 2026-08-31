// app.js
import config from './config';
import createBus from './utils/eventBus';
import { getCurrentUser, isLoggedIn, validateCloudSession } from './services/auth';
import { getPreferences } from './services/preferences';

// 初始化云开发（菜品识别、社区和用户数据均依赖同一环境）。
if (wx.cloud) {
  wx.cloud.init({
    env: config.cloudEnvId,
    traceUser: true,
  });
}

App({
  onLaunch() {
    this.globalData.userInfo = getCurrentUser();
    this.checkSession();
    this.globalData.preferences = getPreferences();
    this.eventBus.on('auth-change', () => this.getUnreadNum());
    this.eventBus.on('preferences-change', (preferences) => {
      this.globalData.preferences = preferences;
      if (preferences.notificationsEnabled) this.getUnreadNum();
      else this.setUnreadNum(0);
    });
    const updateManager = wx.getUpdateManager();

    updateManager.onCheckForUpdate((res) => {
      // console.log(res.hasUpdate)
    });

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        },
      });
    });

    this.getUnreadNum();
  },
  onShow() {
    this.checkSession();
    this.getUnreadNum();
  },
  globalData: {
    userInfo: null,
    unreadNum: 0, // 未读消息数量
    preferences: null,
  },

  /** 全局事件总线 */
  eventBus: createBus(),

  async checkSession() {
    if (this.sessionChecking) return;
    this.sessionChecking = true;
    try {
      await validateCloudSession();
    } catch (error) {
      // 明确失效的账号会由 auth 服务清理；断网等临时错误保留本地状态。
      console.warn('登录状态校验未完成', error);
    } finally {
      this.sessionChecking = false;
    }
  },

  /** 获取未读消息数量 */
  async getUnreadNum() {
    if (!isLoggedIn() || !wx.cloud || !getPreferences().notificationsEnabled) {
      this.setUnreadNum(0);
      return 0;
    }
    try {
      const response = await wx.cloud.callFunction({ name: 'messageHelper', data: { action: 'unreadCount' } });
      const result = response.result || {};
      if (!result.success) throw new Error(result.message || '读取未读消息失败');
      const unreadNum = Math.max(0, Number(result.unreadCount) || 0);
      this.setUnreadNum(unreadNum);
      return unreadNum;
    } catch (error) {
      // 未部署 messages 集合或网络暂不可用时，保留当前数值，避免显示模拟红点。
      return this.globalData.unreadNum;
    }
  },

  /** 设置未读消息数量 */
  setUnreadNum(unreadNum) {
    this.globalData.unreadNum = unreadNum;
    this.eventBus.emit('unread-num-change', unreadNum);
  },
});

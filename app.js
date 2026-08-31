// app.js
import config from './config';
import Mock from './mock/index';
import createBus from './utils/eventBus';
import { connectSocket, fetchUnreadNum } from './mock/chat';
import { getCurrentUser, validateCloudSession } from './services/auth';
import { getPreferences } from './services/preferences';

// 初始化云开发（菜品识别等功能依赖）
// TODO: 把下面的环境 ID 换成你们云开发控制台里的环境 ID
if (wx.cloud) {
  wx.cloud.init({
    env: 'cloudbase-d6gm52tal9a059bd4',
    traceUser: true,
  });
}

if (config.isMock) {
  Mock();
}

App({
  onLaunch() {
    this.globalData.userInfo = getCurrentUser();
    this.checkSession();
    this.globalData.preferences = getPreferences();
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
    this.connect();
  },
  onShow() {
    this.checkSession();
  },
  globalData: {
    userInfo: null,
    unreadNum: 0, // 未读消息数量
    socket: null, // SocketTask 对象
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

  /** 初始化WebSocket */
  connect() {
    const socket = connectSocket();
    socket.onMessage((data) => {
      data = JSON.parse(data);
      if (data.type === 'message' && !data.data.message.read) this.setUnreadNum(this.globalData.unreadNum + 1);
    });
    this.globalData.socket = socket;
  },

  /** 获取未读消息数量 */
  getUnreadNum() {
    fetchUnreadNum().then(({ data }) => {
      this.globalData.unreadNum = data;
      this.eventBus.emit('unread-num-change', data);
    });
  },

  /** 设置未读消息数量 */
  setUnreadNum(unreadNum) {
    this.globalData.unreadNum = unreadNum;
    this.eventBus.emit('unread-num-change', unreadNum);
  },
});

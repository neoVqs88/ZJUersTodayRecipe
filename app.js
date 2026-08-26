// app.js
import config from './config';
import Mock from './mock/index';
import createBus from './utils/eventBus';
import { connectSocket, fetchUnreadNum } from './mock/chat';
import { getCurrentUser } from './services/auth';
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
    // 启动时拿到自己的 openid（判断"我有没有点过赞"等场景要用），存全局
    wx.cloud.callFunction({ name: 'userHelper' })
      .then((res) => { this.globalData.openid = res.result.openid; })
      .catch((err) => console.error('获取 openid 失败', err));

    this.globalData.userInfo = getCurrentUser();
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
  globalData: {
    userInfo: null,
    openid: null, // 自己的身份标识（启动时通过 userHelper 云函数获取）
    unreadNum: 0, // 未读消息数量
    socket: null, // SocketTask 对象
    preferences: null,
  },

  /** 全局事件总线 */
  eventBus: createBus(),

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

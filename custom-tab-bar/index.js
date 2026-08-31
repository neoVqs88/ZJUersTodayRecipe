import { getAppearanceClass, getPreferences } from '../services/preferences';

const app = getApp();

Component({
  data: {
    value: '', // 初始值设置为空，避免第一次加载时闪烁
    unreadNum: 0, // 未读消息数量
    appearanceClass: 'theme-light font-standard',
    list: [
      {
        icon: 'home',
        value: 'home',
        label: '首页',
      },
      {
        icon: 'usergroup',
        value: 'community',
        label: '社区',
      },
      {
        icon: 'notification',
        value: 'message',
        label: '消息',
      },
      {
        icon: 'user',
        value: 'my',
        label: '我的',
      },
    ],
  },
  lifetimes: {
    ready() {
      this.handlePreferencesChange = (preferences) => {
        this.setData({ appearanceClass: getAppearanceClass(preferences) });
      };
      this.handlePreferencesChange(getPreferences());
      app.eventBus.on('preferences-change', this.handlePreferencesChange);

      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      if (curPage) {
        const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
        if (nameRe === null) return;
        if (nameRe[1] && nameRe) {
          this.setData({
            value: nameRe[1],
          });
        }
      }

      // 同步全局未读消息数量
      this.setUnreadNum(app.globalData.unreadNum);
      app.eventBus.on('unread-num-change', (unreadNum) => {
        this.setUnreadNum(unreadNum);
      });
    },
    detached() {
      app.eventBus.off('preferences-change', this.handlePreferencesChange);
    },
  },
  methods: {
    handleChange(e) {
      const { value } = e.detail;
      wx.reLaunch({ url: `/pages/${value}/index` });
    },

    /** 设置未读消息数量 */
    setUnreadNum(unreadNum) {
      this.setData({ unreadNum });
    },
  },
});

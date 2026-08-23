import Message from 'tdesign-miniprogram/message/index';
import request from '~/api/request';

Page({
  data: {
    enable: false,
    swiperList: [],
    cardInfo: [],
  },

  async onReady() {
    const [cardRes, swiperRes] = await Promise.all([
      request('/home/cards').then((res) => res.data),
      request('/home/swipers').then((res) => res.data),
    ]);

    this.setData({
      cardInfo: cardRes.data,
      focusCardInfo: cardRes.data.slice(0, 3),
      swiperList: swiperRes.data,
    });
  },

  onLoad(options) {
    if (!options.oper) return;
    const content = options.oper === 'release' ? '发布成功' : '保存成功';
    this.showOperMsg(content);
  },

  onRefresh() {
    this.refresh();
  },

  async refresh() {
    this.setData({ enable: true });
    const [cardRes, swiperRes] = await Promise.all([
      request('/home/cards').then((res) => res.data),
      request('/home/swipers').then((res) => res.data),
    ]);

    setTimeout(() => {
      this.setData({
        enable: false,
        cardInfo: cardRes.data,
        swiperList: swiperRes.data,
      });
    }, 1500);
  },

  showOperMsg(content) {
    Message.success({
      context: this,
      offset: [120, 32],
      duration: 4000,
      content,
    });
  },

  goRelease() {
    wx.navigateTo({ url: '/pages/release/index' });
  },
});

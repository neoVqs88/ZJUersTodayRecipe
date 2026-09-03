Component({
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    tag: { type: String, value: '' },
  },
  methods: {
    goBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) wx.navigateBack();
      else wx.reLaunch({ url: '/pages/my/index' });
    },
    tapTag() {
      this.triggerEvent('tagtap');
    },
  },
});

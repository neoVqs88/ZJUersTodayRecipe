import { submitFeedback } from '~/services/communityPosts';
import appearanceBehavior from '~/behaviors/appearance';

Page({
  behaviors: [appearanceBehavior],
  data: { content: '', contact: '', submitting: false },
  onContent(event) { this.setData({ content: event.detail.value || '' }); },
  onContact(event) { this.setData({ contact: event.detail.value || '' }); },
  async submit() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await submitFeedback(this.data.content, this.data.contact);
      wx.showToast({ title: '感谢你的反馈', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});

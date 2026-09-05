import { submitFeedback } from '~/services/communityPosts';
import { getCurrentUser } from '~/services/auth';
import appearanceBehavior from '~/behaviors/appearance';

function getFileExtension(file = {}) {
  const source = String(file.name || file.url || '');
  const matched = source.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  return matched ? matched[1].toLowerCase() : 'jpg';
}

Page({
  behaviors: [appearanceBehavior],
  data: {
    content: '',
    contact: '',
    originFiles: [],
    gridConfig: { column: 4, width: 140, height: 140 },
    uploadConfig: { count: 4 },
    submitting: false,
  },
  goBack() { wx.navigateBack(); },
  onContent(event) { this.setData({ content: event.detail.value || '' }); },
  onContact(event) { this.setData({ contact: event.detail.value || '' }); },
  handleUploadSuccess(event) { this.setData({ originFiles: event.detail.files || [] }); },
  handleUploadRemove(event) {
    const originFiles = this.data.originFiles.filter((item, index) => index !== event.detail.index);
    this.setData({ originFiles });
  },
  async uploadImages(userId) {
    const files = this.data.originFiles.filter((file) => file && file.url);
    return Promise.all(files.map(async (file, index) => {
      if (/^cloud:\/\//.test(file.url)) return file.url;
      const extension = getFileExtension(file);
      const cloudPath = `feedback/${userId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const result = await wx.cloud.uploadFile({ cloudPath, filePath: file.url });
      return result.fileID;
    }));
  },
  async submit() {
    if (this.data.submitting) return;
    const user = getCurrentUser();
    if (!user || !user.id) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({ submitting: true });
    let uploadedImages = [];
    try {
      uploadedImages = await this.uploadImages(user.id);
      await submitFeedback(this.data.content, this.data.contact, uploadedImages);
      wx.showToast({ title: '感谢你的反馈', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      if (uploadedImages.length && wx.cloud) wx.cloud.deleteFile({ fileList: uploadedImages }).catch(() => {});
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});

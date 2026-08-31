import { isLoggedIn } from '~/services/auth';
import { fetchPrivacySettings, savePrivacySettings } from '~/services/userSocial';
import appearanceBehavior from '~/behaviors/appearance';

const VISIBILITY_OPTIONS = [
  { label: '所有人可见', value: 'public' },
  { label: '仅关注我的人可见', value: 'followers' },
  { label: '仅自己可见', value: 'private' },
];

function getVisibilityLabel(value) {
  const option = VISIBILITY_OPTIONS.find((item) => item.value === value);
  return option ? option.label : VISIBILITY_OPTIONS[0].label;
}

Page({
  behaviors: [appearanceBehavior],
  data: {
    loading: true,
    saving: false,
    privacy: {
      profileVisibility: 'public',
      activityVisibility: 'public',
      showCheckins: false,
      showFollowing: true,
      showFollowers: true,
      allowFollow: true,
      historyEnabled: true,
    },
    profileVisibilityLabel: '所有人可见',
    activityVisibilityLabel: '所有人可见',
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.loadPrivacy();
  },

  applyPrivacy(privacy) {
    this.setData({
      privacy,
      profileVisibilityLabel: getVisibilityLabel(privacy.profileVisibility),
      activityVisibilityLabel: getVisibilityLabel(privacy.activityVisibility),
      loading: false,
    });
  },

  async loadPrivacy() {
    try {
      const result = await fetchPrivacySettings();
      this.applyPrivacy(result.privacy);
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || '隐私设置加载失败', icon: 'none' });
    }
  },

  chooseVisibility(event) {
    const { field } = event.currentTarget.dataset;
    wx.showActionSheet({
      itemList: VISIBILITY_OPTIONS.map((item) => item.label),
      success: ({ tapIndex }) => {
        const option = VISIBILITY_OPTIONS[tapIndex];
        if (!option) return;
        this.setData({
          [`privacy.${field}`]: option.value,
          [`${field}Label`]: option.label,
        });
      },
    });
  },

  toggleSetting(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [`privacy.${field}`]: Boolean(event.detail.value) });
  },

  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const result = await savePrivacySettings(this.data.privacy);
      this.applyPrivacy(result.privacy);
      wx.showToast({ title: '隐私设置已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});

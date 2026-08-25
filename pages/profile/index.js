import { getCurrentUser, isLoggedIn } from '~/services/auth';
import { fetchUserProfile } from '~/services/userProfile';

const DEFAULT_AVATAR = '/static/miniprogram-icon-zju-bowl-144.png';

function normalizeProfile(profile = {}) {
  const id = profile.id || '';
  return {
    id,
    displayId: id ? id.slice(0, 8) : '',
    name: profile.name || 'zjuer_同学',
    image: profile.image || profile.avatar || DEFAULT_AVATAR,
    introduction: profile.introduction || profile.brief || '热爱校园美食，也期待认识更多饭搭子。',
    campus: profile.campus || '玉泉校区',
    star: profile.star || '浙江大学生',
    gender: profile.gender || '保密',
    grade: profile.grade || '保密',
    college: profile.college || '',
    hometown: profile.hometown || '',
    foodPreferences: Array.isArray(profile.foodPreferences) ? profile.foodPreferences : [],
    checkInCount: profile.checkInCount || 0,
    postCount: profile.postCount || 0,
    favoriteCount: profile.favoriteCount || 0,
  };
}

Page({
  data: {
    loading: true,
    loadFailed: false,
    isMine: false,
    profile: normalizeProfile(),
    stats: [],
    detailRows: [],
  },

  onLoad(options) {
    this.userId = String(options.userId || '');
    this.previewOnly = options.preview === '1';
    this.previewProfile = null;
    this.eventChannel = this.getOpenerEventChannel();
    if (this.eventChannel && this.eventChannel.on) {
      this.eventChannel.on('profilePreview', (profile) => {
        this.previewProfile = profile || {};
        this.applyProfile(this.previewProfile);
      });
    }
  },

  onShow() {
    this.loadProfile();
  },

  applyProfile(rawProfile, options = {}) {
    const profile = normalizeProfile(rawProfile);
    const currentUser = isLoggedIn() ? getCurrentUser() || {} : {};
    const isMine = Boolean(currentUser.id && profile.id && currentUser.id === profile.id);
    const detailRows = [
      { label: '身份', value: profile.grade !== '保密' ? profile.grade : profile.star, icon: 'education' },
      { label: '性别', value: profile.gender !== '保密' ? profile.gender : '', icon: 'user' },
      { label: '院系', value: profile.college, icon: 'building' },
      { label: '校区', value: profile.campus, icon: 'location' },
      { label: '家乡', value: profile.hometown, icon: 'map' },
    ].filter((item) => item.value);

    this.setData({
      profile,
      isMine,
      loading: false,
      loadFailed: Boolean(options.loadFailed),
      stats: [
        { label: '打卡', value: profile.checkInCount },
        { label: '帖子', value: profile.postCount },
        { label: '收藏', value: profile.favoriteCount },
      ],
      detailRows,
    });
  },

  async loadProfile() {
    const currentUser = isLoggedIn() ? getCurrentUser() || {} : {};
    const targetUserId = this.previewOnly ? '' : this.userId || currentUser.id || '';
    if (!targetUserId) {
      if (this.previewProfile) this.applyProfile(this.previewProfile);
      else this.setData({ loading: false, loadFailed: true });
      return;
    }

    if (!this.data.profile.id && currentUser.id === targetUserId) this.applyProfile(currentUser);
    try {
      const result = await fetchUserProfile(targetUserId);
      this.applyProfile(result.user);
    } catch (error) {
      const fallback = this.previewProfile || (currentUser.id === targetUserId ? currentUser : null);
      if (fallback) this.applyProfile(fallback, { loadFailed: true });
      else {
        this.setData({ loading: false, loadFailed: true });
        wx.showToast({ title: error.message || '资料加载失败', icon: 'none' });
      }
    }
  },

  editProfile() {
    if (!this.data.isMine) return;
    wx.navigateTo({ url: '/pages/my/info-edit/index' });
  },

  showDeveloping() {
    wx.showToast({ title: '相关内容页待后续接入', icon: 'none' });
  },
});

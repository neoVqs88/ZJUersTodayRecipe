import { getCurrentUser, isLoggedIn } from '~/services/auth';
import { fetchUserProfile, updateMyProfile } from '~/services/userProfile';

const DEFAULT_AVATAR = '/static/miniprogram-icon-zju-bowl-144.png';
const CAMPUS_OPTIONS = ['玉泉校区', '紫金港校区', '西溪校区', '华家池校区', '之江校区', '舟山校区', '海宁校区', '其他'];
const GENDER_OPTIONS = ['保密', '男', '女'];
const GRADE_OPTIONS = ['保密', '本科生', '硕士生', '博士生', '教职工', '校友'];
const PREFERENCE_OPTIONS = ['清淡', '嗜辣', '甜食', '面食', '米饭', '素食', '咖啡', '夜宵'];

function normalizeProfile(profile = {}) {
  return {
    id: profile.id || '',
    image: profile.image || DEFAULT_AVATAR,
    name: profile.name || '',
    introduction: profile.introduction || '',
    campus: profile.campus || CAMPUS_OPTIONS[0],
    gender: profile.gender || GENDER_OPTIONS[0],
    grade: profile.grade || GRADE_OPTIONS[0],
    college: profile.college || '',
    hometown: profile.hometown || '',
    foodPreferences: Array.isArray(profile.foodPreferences) ? profile.foodPreferences : [],
  };
}

Page({
  data: {
    loading: true,
    saving: false,
    profile: normalizeProfile(),
    campusOptions: CAMPUS_OPTIONS,
    genderOptions: GENDER_OPTIONS,
    gradeOptions: GRADE_OPTIONS,
    preferenceItems: PREFERENCE_OPTIONS.map((value) => ({ value, selected: false })),
    campusIndex: 0,
    genderIndex: 0,
    gradeIndex: 0,
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.loadProfile();
  },

  applyProfile(rawProfile) {
    const profile = normalizeProfile(rawProfile);
    this.setData({
      profile,
      campusIndex: Math.max(CAMPUS_OPTIONS.indexOf(profile.campus), 0),
      genderIndex: Math.max(GENDER_OPTIONS.indexOf(profile.gender), 0),
      gradeIndex: Math.max(GRADE_OPTIONS.indexOf(profile.grade), 0),
      preferenceItems: PREFERENCE_OPTIONS.map((value) => ({
        value,
        selected: profile.foodPreferences.includes(value),
      })),
      loading: false,
    });
  },

  async loadProfile() {
    const cachedUser = getCurrentUser() || {};
    this.applyProfile(cachedUser);
    if (!cachedUser.id) return;
    try {
      const result = await fetchUserProfile(cachedUser.id);
      this.applyProfile(result.user);
    } catch (error) {
      // 云函数不可用时仍允许用户基于本地资料编辑，保存时会再次提示。
    }
  },

  onChooseAvatar(event) {
    const {avatarUrl} = event.detail;
    if (avatarUrl) this.setData({ 'profile.image': avatarUrl });
  },

  onFieldInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [`profile.${field}`]: event.detail.value });
  },

  onPickerChange(event) {
    const { field } = event.currentTarget.dataset;
    const index = Number(event.detail.value);
    const options = this.data[`${field}Options`];
    if (!options || !options[index]) return;
    this.setData({
      [`${field}Index`]: index,
      [`profile.${field}`]: options[index],
    });
  },

  togglePreference(event) {
    const { value } = event.currentTarget.dataset;
    const selected = this.data.profile.foodPreferences.slice();
    const index = selected.indexOf(value);
    if (index >= 0) selected.splice(index, 1);
    else if (selected.length < 6) selected.push(value);
    else {
      wx.showToast({ title: '最多选择 6 个口味标签', icon: 'none' });
      return;
    }
    this.setData({
      'profile.foodPreferences': selected,
      preferenceItems: PREFERENCE_OPTIONS.map((item) => ({
        value: item,
        selected: selected.includes(item),
      })),
    });
  },

  uploadAvatar(filePath) {
    if (!filePath || /^(cloud|https?):\/\//.test(filePath) || filePath.startsWith('/static/')) {
      return Promise.resolve(filePath || DEFAULT_AVATAR);
    }
    const user = getCurrentUser() || {};
    const extensionMatch = filePath.match(/\.([a-zA-Z0-9]+)$/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg';
    const cloudPath = `user-avatars/${user.id || 'unknown'}/${Date.now()}.${extension}`;
    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: ({ fileID }) => resolve(fileID),
        fail: reject,
      });
    });
  },

  async saveProfile() {
    if (this.data.saving) return;
    const name = this.data.profile.name.trim();
    if (!name) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      const image = await this.uploadAvatar(this.data.profile.image);
      const user = await updateMyProfile({
        ...this.data.profile,
        name,
        image,
        introduction: this.data.profile.introduction.trim(),
        college: this.data.profile.college.trim(),
        hometown: this.data.profile.hometown.trim(),
      });
      this.applyProfile(user);
      getApp().eventBus.emit('user-profile-change', user);
      wx.showToast({ title: '资料已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },
});

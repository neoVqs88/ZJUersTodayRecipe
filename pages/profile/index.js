import { getCurrentUser, isLoggedIn } from '~/services/auth';
import appearanceBehavior from '~/behaviors/appearance';
import {
  fetchSocialDashboard,
  followUser,
  recordBrowsingHistory,
  unfollowUser,
} from '~/services/userSocial';

const DEFAULT_AVATAR = '/static/miniprogram-icon-zju-bowl-144.png';
const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

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
    gender: profile.gender || '',
    grade: profile.grade || '',
    college: profile.college || '',
    hometown: profile.hometown || '',
    foodPreferences: Array.isArray(profile.foodPreferences) ? profile.foodPreferences : [],
    checkInCount: profile.checkInCount || 0,
    postCount: profile.postCount || 0,
  };
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.$date) return new Date(value.$date);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = parseDate(value);
  if (!date) return '刚刚';
  const now = new Date();
  const distance = now.getTime() - date.getTime();
  if (distance < 60 * 1000) return '刚刚';
  if (distance < 60 * 60 * 1000) return `${Math.floor(distance / 60000)} 分钟前`;
  if (distance < 24 * 60 * 60 * 1000) return `${Math.floor(distance / 3600000)} 小时前`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDynamics(dynamics = []) {
  return dynamics.map((item) => ({
    ...item,
    displayTime: formatTime(item.createdAt),
    typeLabel: item.type === 'checkin' ? `${MEAL_LABELS[item.mealType] || '三餐'}打卡` : '美食分享',
    icon: item.type === 'checkin' ? 'camera' : 'edit-1',
  }));
}

Page({
  behaviors: [appearanceBehavior],
  data: {
    loading: true,
    loadFailed: false,
    isMine: false,
    restricted: false,
    followLoading: false,
    profile: normalizeProfile(),
    social: {
      followingCount: 0,
      followerCount: 0,
      isFollowing: false,
      followsMe: false,
      canFollow: true,
      canViewActivity: true,
      showCheckins: true,
      showFollowing: true,
      showFollowers: true,
    },
    stats: [],
    detailRows: [],
    activeDynamicFilter: 'all',
    dynamicFilters: [
      { label: '全部', value: 'all' },
      { label: '分享', value: 'post' },
      { label: '打卡', value: 'checkin' },
    ],
    dynamics: [],
    displayDynamics: [],
  },

  onLoad(options) {
    this.userId = String(options.userId || '');
    this.previewOnly = options.preview === '1';
    this.previewProfile = null;
    this.eventChannel = this.getOpenerEventChannel();
    if (this.eventChannel && this.eventChannel.on) {
      this.eventChannel.on('profilePreview', (profile) => {
        this.previewProfile = profile || {};
        this.applyDashboard({ profile: this.previewProfile });
      });
    }
  },

  onShow() {
    this.loadProfile();
  },

  buildDetailRows(profile) {
    return [
      { label: '身份', value: profile.grade && profile.grade !== '保密' ? profile.grade : profile.star, icon: 'education' },
      { label: '性别', value: profile.gender && profile.gender !== '保密' ? profile.gender : '', icon: 'user' },
      { label: '院系', value: profile.college, icon: 'building' },
      { label: '校区', value: profile.campus, icon: 'location' },
      { label: '家乡', value: profile.hometown, icon: 'map' },
    ].filter((item) => item.value);
  },

  filterDynamics(dynamics, filter) {
    return filter === 'all' ? dynamics : dynamics.filter((item) => item.type === filter);
  },

  applyDashboard(dashboard = {}, options = {}) {
    const profile = normalizeProfile(dashboard.profile || {});
    const currentUser = isLoggedIn() ? getCurrentUser() || {} : {};
    const isMine = typeof dashboard.isMine === 'boolean'
      ? dashboard.isMine
      : Boolean(currentUser.id && profile.id && currentUser.id === profile.id);
    const social = { ...this.data.social, ...(dashboard.social || {}) };
    if (!profile.id && !isMine) social.canFollow = false;
    const dynamics = formatDynamics(dashboard.dynamics || []);
    const visibleCheckInCount = social.showCheckins === false ? 0 : profile.checkInCount;
    const activityCount = social.canViewActivity === false ? '—' : profile.postCount + visibleCheckInCount;
    this.setData({
      profile,
      social,
      isMine,
      restricted: Boolean(dashboard.social && !dashboard.social.canViewProfile),
      loading: false,
      loadFailed: Boolean(options.loadFailed),
      stats: [
        { label: '动态', value: activityCount, type: 'activity', enabled: social.canViewActivity !== false },
        { label: '打卡', value: social.showCheckins === false ? '—' : profile.checkInCount, type: 'checkins', enabled: isMine },
        { label: '关注', value: social.showFollowing === false ? '—' : social.followingCount || 0, type: 'following', enabled: social.showFollowing !== false },
        { label: '粉丝', value: social.showFollowers === false ? '—' : social.followerCount || 0, type: 'followers', enabled: social.showFollowers !== false },
      ],
      detailRows: this.buildDetailRows(profile),
      dynamics,
      displayDynamics: this.filterDynamics(dynamics, this.data.activeDynamicFilter),
    });
  },

  async loadProfile() {
    const currentUser = isLoggedIn() ? getCurrentUser() || {} : {};
    const targetUserId = this.previewOnly ? '' : this.userId || currentUser.id || '';
    if (!targetUserId) {
      if (this.previewProfile) this.applyDashboard({ profile: this.previewProfile });
      else this.setData({ loading: false, loadFailed: true });
      return;
    }

    if (!this.data.profile.id && currentUser.id === targetUserId) {
      this.applyDashboard({ profile: currentUser, isMine: true });
    }
    try {
      const result = await fetchSocialDashboard(targetUserId, 30);
      this.applyDashboard(result);
    } catch (error) {
      const fallback = this.previewProfile || (currentUser.id === targetUserId ? currentUser : null);
      if (fallback) this.applyDashboard({ profile: fallback }, { loadFailed: true });
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

  openPrivacy() {
    if (!this.data.isMine) return;
    wx.navigateTo({ url: '/pages/social/privacy/index' });
  },

  async toggleFollow() {
    if (this.data.isMine || this.data.followLoading) return;
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (!this.data.profile.id) {
      wx.showToast({ title: '演示用户暂不支持关注', icon: 'none' });
      return;
    }
    if (!this.data.social.canFollow && !this.data.social.isFollowing) {
      wx.showToast({ title: '该用户暂不接受关注', icon: 'none' });
      return;
    }
    this.setData({ followLoading: true });
    try {
      const result = this.data.social.isFollowing
        ? await unfollowUser(this.data.profile.id)
        : await followUser(this.data.profile.id);
      const social = {
        ...this.data.social,
        isFollowing: result.isFollowing,
        ...(result.counts || {}),
      };
      this.setData({
        social,
        stats: this.data.stats.map((item) => {
          if (item.type === 'followers') {
            return { ...item, value: social.showFollowers === false ? '—' : social.followerCount || 0 };
          }
          return item;
        }),
      });
      wx.showToast({ title: result.isFollowing ? '已关注' : '已取消关注', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ followLoading: false });
    }
  },

  handleStatTap(event) {
    const { item } = event.currentTarget.dataset;
    if (!item || !item.enabled) {
      wx.showToast({ title: '该内容未公开', icon: 'none' });
      return;
    }
    if (item.type === 'following' || item.type === 'followers') {
      wx.navigateTo({
        url: `/pages/social/list/index?userId=${this.data.profile.id}&mode=${item.type}`,
      });
      return;
    }
    if (item.type === 'checkins' && this.data.isMine) {
      wx.navigateTo({ url: '/pages/checkins/index' });
      return;
    }
    if (item.type === 'activity') this.setData({ activeDynamicFilter: 'all', displayDynamics: this.data.dynamics });
  },

  selectDynamicFilter(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      activeDynamicFilter: value,
      displayDynamics: this.filterDynamics(this.data.dynamics, value),
    });
  },

  openDynamic(event) {
    const { id } = event.currentTarget.dataset;
    const item = this.data.dynamics.find((dynamic) => dynamic.id === id);
    if (!item) return;
    if (item.type === 'checkin' && item.image) {
      wx.previewImage({ current: item.image, urls: item.images || [item.image] });
      return;
    }
    if (item.route) {
      if (isLoggedIn()) {
        recordBrowsingHistory({
          type: 'post',
          targetId: item.id,
          title: item.title,
          subtitle: item.content,
          image: item.image,
          route: item.route,
        }).catch(() => {});
      }
      wx.navigateTo({
        url: item.route,
        success: ({ eventChannel }) => eventChannel.emit('post', {
          id: item.id,
          authorId: this.data.profile.id,
          author: this.data.profile.name,
          avatar: this.data.profile.image,
          content: item.content,
          location: item.location,
        }),
      });
    }
  },
});

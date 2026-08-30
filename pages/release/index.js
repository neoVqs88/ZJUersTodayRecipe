import { getCurrentUser, isLoggedIn } from '~/services/auth';

const POST_TYPES = [
  { label: '美食分享', value: 'food', icon: '🍲', emoji: '🍚', tone: 'orange' },
  { label: '探店打卡', value: 'explore', icon: '📍', emoji: '🍜', tone: 'green' },
  { label: '约饭拼桌', value: 'companion', icon: '🥂', emoji: '👥', tone: 'blue' },
];

const TOPIC_TAGS = [
  '食堂推荐',
  '新品尝鲜',
  '平价美食',
  '健康轻食',
  '早餐',
  '午餐',
  '晚餐',
  '夜宵',
  '甜品饮品',
  '排队提醒',
  '踩雷避坑',
  '寻找饭搭子',
].map((label) => ({ label, checked: false }));

const DRAFT_KEY = 'community_post_draft';
const MAX_TOPIC_TAGS = 4;

function getFileExtension(file = {}) {
  const source = String(file.name || file.url || '');
  const matched = source.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  return matched ? matched[1].toLowerCase() : 'jpg';
}

Page({
  data: {
    originFiles: [],
    gridConfig: { column: 4, width: 160, height: 160 },
    uploadConfig: { count: 4 },
    textareaAutosize: { minHeight: 128, maxHeight: 220 },
    content: '',
    postTypes: POST_TYPES,
    selectedType: 'food',
    topicTags: TOPIC_TAGS,
    selectedTagCount: 0,
    companionMin: 2,
    companionMax: 4,
    shareLocation: false,
    location: null,
    publishing: false,
  },

  onLoad(options = {}) {
    if (!isLoggedIn()) {
      const query = options.type ? `?type=${encodeURIComponent(options.type)}` : '';
      wx.redirectTo({
        url: `/pages/login/login?redirect=${encodeURIComponent(`/pages/release/index${query}`)}`,
      });
      return;
    }
    this.restoreDraft(options.type);
  },

  restoreDraft(requestedType) {
    const draft = wx.getStorageSync(DRAFT_KEY) || {};
    let selectedType = POST_TYPES.some((item) => item.value === draft.selectedType) ? draft.selectedType : 'food';
    if (requestedType === 'invitation') selectedType = 'companion';
    const selectedLabels = Array.isArray(draft.topicTags) ? draft.topicTags : [];
    const topicTags = TOPIC_TAGS.map((item) => ({ ...item, checked: selectedLabels.includes(item.label) }));
    const companionMin = Math.min(Math.max(Number(draft.companionMin) || 2, 2), 20);
    const companionMax = Math.max(companionMin, Math.min(Math.max(Number(draft.companionMax) || 4, 2), 20));
    this.setData({
      content: requestedType ? '' : draft.content || '',
      selectedType,
      topicTags,
      selectedTagCount: topicTags.filter((item) => item.checked).length,
      shareLocation: requestedType ? false : Boolean(draft.shareLocation && draft.location),
      location: requestedType ? null : draft.location || null,
      companionMin,
      companionMax,
    });
  },

  handleSuccess(event) {
    this.setData({ originFiles: event.detail.files || [] });
  },

  handleRemove(event) {
    const originFiles = this.data.originFiles.filter((item, index) => index !== event.detail.index);
    this.setData({ originFiles });
  },

  handleContentChange(event) {
    this.setData({ content: event.detail.value || '' });
  },

  selectPostType(event) {
    this.setData({ selectedType: event.currentTarget.dataset.value });
  },

  changeCompanionMin(event) {
    const companionMin = Math.min(Math.max(Number(event.detail.value) || 2, 2), 20);
    this.setData({
      companionMin,
      companionMax: Math.max(companionMin, this.data.companionMax),
    });
  },

  changeCompanionMax(event) {
    const companionMax = Math.min(Math.max(Number(event.detail.value) || 2, 2), 20);
    this.setData({
      companionMax,
      companionMin: Math.min(companionMax, this.data.companionMin),
    });
  },

  toggleTopicTag(event) {
    const { label } = event.currentTarget.dataset;
    const checked = Boolean(event.detail.checked);
    if (checked && this.data.selectedTagCount >= MAX_TOPIC_TAGS) {
      wx.showToast({ title: `最多选择 ${MAX_TOPIC_TAGS} 个附加标签`, icon: 'none' });
      return;
    }
    const topicTags = this.data.topicTags.map((item) => (
      item.label === label ? { ...item, checked } : item
    ));
    this.setData({
      topicTags,
      selectedTagCount: topicTags.filter((item) => item.checked).length,
    });
  },

  toggleLocation(event) {
    const enabled = Boolean(event.detail.value);
    this.setData({ shareLocation: enabled, ...(enabled ? {} : { location: null }) });
    if (enabled && !this.data.location) this.chooseLocation();
  },

  chooseLocation() {
    wx.chooseLocation({
      success: ({ name, address, latitude, longitude }) => {
        this.setData({
          shareLocation: true,
          location: {
            name: String(name || address || '已选择位置').slice(0, 50),
            address: String(address || '').slice(0, 100),
            latitude: Number(latitude),
            longitude: Number(longitude),
          },
        });
      },
      fail: (error) => {
        const message = error.errMsg || '';
        if (/cancel/i.test(message)) {
          this.setData({ shareLocation: false, location: null });
          return;
        }
        this.setData({ shareLocation: false, location: null });
        wx.showModal({
          title: '无法选择位置',
          content: '请在小程序设置中允许位置信息权限后重试。',
          confirmText: '去设置',
          success: ({ confirm }) => {
            if (confirm) wx.openSetting();
          },
        });
      },
    });
  },

  getSelectedTopicLabels() {
    return this.data.topicTags.filter((item) => item.checked).map((item) => item.label);
  },

  saveDraft() {
    wx.setStorageSync(DRAFT_KEY, {
      content: this.data.content.trim(),
      selectedType: this.data.selectedType,
      topicTags: this.getSelectedTopicLabels(),
      shareLocation: this.data.shareLocation,
      location: this.data.shareLocation ? this.data.location : null,
      companionMin: this.data.companionMin,
      companionMax: this.data.companionMax,
    });
    wx.reLaunch({ url: '/pages/community/index?oper=save' });
  },

  async uploadImages(userId) {
    const files = this.data.originFiles.filter((file) => file && file.url);
    return Promise.all(files.map(async (file, index) => {
      if (/^cloud:\/\//.test(file.url)) return file.url;
      const extension = getFileExtension(file);
      const cloudPath = `posts/${userId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const result = await wx.cloud.uploadFile({ cloudPath, filePath: file.url });
      return result.fileID;
    }));
  },

  async release() {
    if (this.data.publishing) return;
    const content = this.data.content.trim();
    if (!content) {
      wx.showToast({ title: '请先写下想分享的内容', icon: 'none' });
      return;
    }
    if (this.data.shareLocation && !this.data.location) {
      wx.showToast({ title: '请选择要分享的位置', icon: 'none' });
      return;
    }

    const user = getCurrentUser();
    if (!user || !user.id) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const type = POST_TYPES.find((item) => item.value === this.data.selectedType) || POST_TYPES[0];
    let uploadedImages = [];
    this.setData({ publishing: true });
    wx.showLoading({ title: '正在发布', mask: true });
    try {
      uploadedImages = await this.uploadImages(user.id);
      const location = this.data.shareLocation ? this.data.location : null;
      const topicTags = this.getSelectedTopicLabels();
      const db = wx.cloud.database();
      await db.collection('posts').add({
        data: {
          userId: user.id,
          authorId: user.id,
          authorName: user.name || 'zjuer_同学',
          avatar: user.image || '/static/miniprogram-icon-zju-bowl-144.png',
          campus: user.campus || '玉泉校区',
          level: 1,
          category: type.value,
          content,
          tags: [type.label, ...topicTags],
          images: uploadedImages,
          image: uploadedImages[0] || '',
          shareLocation: Boolean(location),
          location: location ? location.name : '',
          locationAddress: location ? location.address : '',
          latitude: location ? location.latitude : null,
          longitude: location ? location.longitude : null,
          dish: type.label,
          visualDesc: location ? location.name : '校园美食新动态',
          emoji: type.emoji,
          tone: type.tone,
          likes: 0,
          commentsCount: 0,
          collections: 0,
          status: 'published',
          post_status: 'published',
          minParticipants: type.value === 'companion' ? this.data.companionMin : null,
          maxParticipants: type.value === 'companion' ? this.data.companionMax : null,
          participantCount: type.value === 'companion' ? 1 : 0,
          participantIds: type.value === 'companion' ? [user.id] : [],
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
      wx.removeStorageSync(DRAFT_KEY);
      wx.hideLoading();
      wx.reLaunch({ url: '/pages/community/index?oper=release' });
    } catch (error) {
      wx.hideLoading();
      if (uploadedImages.length) wx.cloud.deleteFile({ fileList: uploadedImages }).catch(() => {});
      const denied = error.errCode === -502003 || error.errCode === -502000
        || /permission denied/i.test(error.errMsg || error.message || '');
      wx.showToast({
        title: denied ? '请检查 posts 集合写入权限' : error.errMsg || error.message || '发布失败，请重试',
        icon: 'none',
        duration: 2600,
      });
    } finally {
      this.setData({ publishing: false });
    }
  },
});

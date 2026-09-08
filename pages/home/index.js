import { isLoggedIn } from '~/services/auth';
import { fetchMealCheckinStats } from '~/services/mealCheckins';
import { recordBrowsingHistory } from '~/services/userSocial';
import { fetchDishCatalog, getRankedDishes } from '~/services/catalog';
import appearanceBehavior from '~/behaviors/appearance';

const HOME_FILTERS = [
  { label: '想吃热乎的', icon: '♨' },
  { label: '预算 15 元内', icon: '¥' },
  { label: '酸甜', icon: '◌' },
  { label: '辣', icon: '✦' },
  { label: '清淡一点', icon: '◒', match: '清淡' },
];

const DEFAULT_IMAGE = '/static/figma/tomato-rice.webp';
const RANKING_IMAGE_PREFIX = ['/pages', 'ranking', ''].join('/');
const HOME_RANKING_IMAGES = [
  '/static/catalog/dish-1-1.jpg',
  '/static/catalog/dish-2-1.jpg',
  '/static/catalog/dish-1-2.jpg',
  '/static/catalog/dish-2-2.jpg',
  '/static/catalog/dish-1-3.jpg',
];

function getHomeImage(dish, fallbackIndex = 0) {
  const image = String(dish.image || '');
  return image.startsWith(RANKING_IMAGE_PREFIX)
    ? HOME_RANKING_IMAGES[fallbackIndex % HOME_RANKING_IMAGES.length]
    : image || DEFAULT_IMAGE;
}

function getDishDisplayLabel(dish) {
  const canteen = String(dish.canteen || dish.place || '').trim();
  const stall = String(dish.place || '').replace(`${canteen} · `, '').trim();
  return [canteen, stall !== canteen ? stall : '', dish.name].filter(Boolean).join(' · ');
}

function getMealPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 6 && hour < 11) return { label: '早餐', description: '让早饭像抽一张温柔又古怪的签。' };
  if (hour >= 11 && hour < 14) return { label: '午餐', description: '让午饭像抽一张温柔又古怪的签。' };
  return { label: '晚餐', description: '让晚饭像抽一张温柔又古怪的签。' };
}

function buildTicket(dish, selectedLabels = []) {
  const matchedCount = selectedLabels.filter((label) => (
    (dish.tags || []).includes(label) || (dish.flavor || []).includes(label)
  )).length;
  const match = selectedLabels.length
    ? Math.round((matchedCount / selectedLabels.length) * 100)
    : Math.min(99, Math.max(70, Math.round((Number(dish.score) || 4) / 5 * 100)));
  return {
    ...dish,
    displayLabel: getDishDisplayLabel(dish),
    campus: dish.canteen || dish.campus,
    time: '12:20',
    note: dish.desc || `${dish.canteen || '玉泉校区'} · 今天也要好好吃饭。`,
    match,
    flavor: dish.flavorText || (dish.flavor || []).join(' · ') || '今日风味',
  };
}

Page({
  behaviors: [appearanceBehavior],
  data: {
    dateLabel: '',
    mealLabel: getMealPeriod().label,
    mealDescription: getMealPeriod().description,
    mealTickets: [
      {
        name: '桂花糖藕',
        campus: '玉泉',
        time: '12:20',
        note: '江南的甜，适合今天这场小雨。',
        match: 92,
        flavor: '清甜',
        price: '¥8–12',
      },
      {
        name: '山野菌菇面',
        campus: '怡膳堂一楼',
        time: '12:26',
        note: '一碗热汤面，把午后的疲惫慢慢熨平。',
        match: 89,
        flavor: '清淡鲜香',
        price: '¥10–15',
      },
      {
        name: '酸汤肥牛',
        campus: '玉泉二食堂',
        time: '12:31',
        note: '酸香醒胃，适合需要一点精神的今天。',
        match: 86,
        flavor: '酸辣',
        price: '¥15–20',
      },
      {
        name: '番茄肥牛饭',
        campus: '玉泉一食堂',
        time: '12:35',
        note: '酸甜浓郁，是不会轻易出错的午餐答案。',
        match: 94,
        flavor: '酸甜',
        price: '¥15–20',
      },
    ],
    activeTicket: {
      name: '桂花糖藕',
      displayLabel: '玉泉五食堂 · 甜品档 · 桂花糖藕',
      campus: '玉泉',
      time: '12:20',
      note: '江南的甜，适合今天这场小雨。',
      match: 92,
      flavor: '清甜',
      price: '¥8–12',
    },
    ticketIndex: 0,
    isShuffling: false,
    newDishes: [],
    moments: HOME_FILTERS.map((item) => ({ ...item, selected: false })),
    selectedMoments: [],
    catalog: [],
    checkInDays: 0,
    weeklyGoal: 7,
  },

  onLoad(options = {}) {
    const date = new Date();
    const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const mealPeriod = getMealPeriod(date);
    this.setData({
      dateLabel: `${weekdays[date.getDay()]} · ${months[date.getMonth()]} ${date.getDate()}`,
      mealLabel: mealPeriod.label,
      mealDescription: mealPeriod.description,
    });
    if (options.checkin === '1') setTimeout(() => this.checkIn(), 350);
    this.loadCatalog();
  },

  async loadCatalog() {
    const newDishes = getRankedDishes(5).map((dish, index) => ({
      ...dish,
      location: dish.place,
      shortLocation: dish.flavorText,
      image: getHomeImage(dish, index),
    }));
    this.setData({ newDishes });
    try {
      const catalog = await fetchDishCatalog();
      if (!catalog.length) return;
      this.setData({ catalog, newDishes });
      this.applyPreferences();
    } catch (error) {
      // 云端目录不可用时继续展示内置玉泉菜品。
    }
  },

  onShow() {
    const mealPeriod = getMealPeriod();
    this.setData({ mealLabel: mealPeriod.label, mealDescription: mealPeriod.description });
    this.loadCheckInStats();
  },

  async loadCheckInStats() {
    if (!isLoggedIn()) {
      this.setData({ checkInDays: 0, weeklyGoal: 7 });
      return;
    }
    try {
      const { stats } = await fetchMealCheckinStats();
      this.setData({
        checkInDays: stats.weeklyCount || 0,
        weeklyGoal: stats.weeklyGoal || 7,
      });
    } catch (error) {
      // 云函数尚未部署时不影响首页其余内容使用。
    }
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/index' });
  },

  selectMoment(event) {
    const index = Number(event.currentTarget.dataset.index);
    const selectedMoments = this.data.moments.map((item, itemIndex) => (
      itemIndex === index ? { ...item, selected: !item.selected } : item
    ));
    this.setData({
      moments: selectedMoments,
      selectedMoments: selectedMoments.filter((item) => item.selected).map((item) => item.match || item.label),
    });
    this.applyPreferences(true);
  },

  applyPreferences(randomize = false) {
    const catalog = Array.isArray(this.data.catalog) && this.data.catalog.length
      ? this.data.catalog
      : [];
    if (!catalog.length) return;
    const selectedLabels = this.data.selectedMoments || [];
    const scored = catalog.map((dish) => ({
      dish,
      matched: selectedLabels.filter((label) => (dish.tags || []).includes(label) || (dish.flavor || []).includes(label)).length,
    }));
    const bestMatch = selectedLabels.length ? Math.max(...scored.map((item) => item.matched)) : 0;
    const candidates = scored
      .filter((item) => !selectedLabels.length || item.matched === bestMatch)
      .sort((a, b) => b.dish.popularity - a.dish.popularity)
      .map((item) => buildTicket(item.dish, selectedLabels));
    if (!candidates.length) return;
    const currentIndex = randomize ? Math.floor(Math.random() * candidates.length) : 0;
    this.setData({
      mealTickets: candidates,
      activeTicket: candidates[currentIndex],
      ticketIndex: currentIndex,
    });
  },

  makeDecision() {
    if (this.data.isShuffling) return;

    const { mealTickets, ticketIndex } = this.data;
    if (!Array.isArray(mealTickets) || mealTickets.length < 2) return;
    const targetIndex = (ticketIndex + 1 + Math.floor(Math.random() * (mealTickets.length - 1))) % mealTickets.length;
    const targetOffset = (targetIndex - ticketIndex + mealTickets.length) % mealTickets.length;
    // Keep the animation short even when the full catalog has thousands of candidates.
    const totalSteps = 16 + (targetOffset % 8);
    let step = 0;
    let nextIndex = ticketIndex;
    this.setData({ isShuffling: true });

    this.ticketTimer = setInterval(() => {
      nextIndex = (nextIndex + 1) % mealTickets.length;
      step += 1;
      this.setData({
        activeTicket: mealTickets[nextIndex],
        ticketIndex: nextIndex,
      });

      if (step < totalSteps) return;
      clearInterval(this.ticketTimer);
      this.ticketTimer = null;
      clearTimeout(this.shuffleStopTimer);
      this.shuffleStopTimer = null;
      this.setData({ isShuffling: false });
      wx.vibrateShort({ type: 'light' });
    }, 105);
    this.shuffleStopTimer = setTimeout(() => {
      if (this.ticketTimer) clearInterval(this.ticketTimer);
      this.ticketTimer = null;
      this.shuffleStopTimer = null;
      this.setData({ isShuffling: false });
    }, (totalSteps + 2) * 105);
  },

  openFeatured() {
    if (this.data.isShuffling) return;
    wx.navigateTo({
      url: `/pages/dish/index?id=${encodeURIComponent(this.data.activeTicket.id || '')}&name=${encodeURIComponent(this.data.activeTicket.name)}`,
    });
  },

  onUnload() {
    if (this.ticketTimer) clearInterval(this.ticketTimer);
    if (this.shuffleStopTimer) clearTimeout(this.shuffleStopTimer);
  },

  viewDish(event) {
    const dishIndex = Number(event.currentTarget.dataset.index);
    const dish = this.data.newDishes[dishIndex];
    if (isLoggedIn()) {
      recordBrowsingHistory({
        type: 'dish',
        targetId: `home-dish-${dishIndex}`,
        title: dish.name,
        subtitle: `${dish.location} · 推荐评分 ${dish.score}`,
        image: dish.image,
        route: '/pages/home/index',
      }).catch(() => {});
    }
    wx.navigateTo({
      url: `/pages/dish/index?id=${encodeURIComponent(dish.id || '')}&name=${encodeURIComponent(dish.name)}`,
    });
  },

  async checkIn() {
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.navigateTo({ url: '/pages/checkins/index?start=1' });
  },

  showMore() {
    wx.navigateTo({ url: '/pages/ranking/index' });
  },

  showCheckInHistory() {
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.navigateTo({ url: '/pages/checkins/index' });
  },
});

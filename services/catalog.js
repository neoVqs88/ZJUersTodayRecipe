import { CAMPUS_CANTEENS, CAMPUS_DISHES, normalizeDish } from '~/data/campusCatalog';

const CATALOG_CACHE_KEY = 'campus_dish_catalog_cache';
const CACHE_DURATION = 10 * 60 * 1000;

function readCache() {
  const cache = wx.getStorageSync(CATALOG_CACHE_KEY) || {};
  if (!Array.isArray(cache.data) || Date.now() - Number(cache.updatedAt) > CACHE_DURATION) return null;
  return cache.data.map(normalizeDish);
}

export async function fetchDishCatalog({ force = false } = {}) {
  if (!force) {
    const cache = readCache();
    if (cache && cache.length) return cache;
  }
  if (wx.cloud) {
    try {
      const result = await wx.cloud.database().collection('dishes').orderBy('popularity', 'desc').limit(100).get();
      if (result.data.length) {
        const dishes = result.data.map(normalizeDish);
        wx.setStorageSync(CATALOG_CACHE_KEY, { data: dishes, updatedAt: Date.now() });
        return dishes;
      }
    } catch (error) {
      // 云端菜品目录尚未建立时使用随代码发布的玉泉基础目录。
    }
  }
  return CAMPUS_DISHES.map(normalizeDish);
}

export async function fetchDishByName(name) {
  const catalog = await fetchDishCatalog();
  return catalog.find((dish) => dish.name === name) || catalog[0];
}

export function searchCatalog(catalog, keyword) {
  const words = String(keyword || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return catalog;
  return catalog.filter((dish) => {
    const haystack = [dish.name, dish.english, dish.place, dish.canteen, dish.campus, ...(dish.flavor || []), ...(dish.tags || [])]
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function getPopularSearchWords(catalog) {
  return [...catalog]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 6)
    .map((dish) => dish.name);
}

export async function fetchCanteens() {
  if (wx.cloud) {
    try {
      const result = await wx.cloud.database().collection('canteens').orderBy('sortOrder', 'asc').limit(100).get();
      if (result.data.length) return result.data.map((item, index) => {
        const fallback = CAMPUS_CANTEENS.find((canteen) => (
          canteen.id === item.id || canteen.name === item.name
        )) || CAMPUS_CANTEENS[index % CAMPUS_CANTEENS.length] || {};
        return {
          ...fallback,
          ...item,
          id: String(item._id || item.id || fallback.id || index),
          left: Number.isFinite(Number(item.left)) ? Number(item.left) : fallback.left,
          top: Number.isFinite(Number(item.top)) ? Number(item.top) : fallback.top,
        };
      });
    } catch (error) {
      // 云端食堂状态尚未接入时使用基础导览数据。
    }
  }
  return CAMPUS_CANTEENS.map((item) => ({ ...item }));
}

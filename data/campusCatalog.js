export const CAMPUS_DISHES = [
  { id: 'tomato-beef-rice', name: '番茄肥牛饭', english: 'TOMATO BEEF RICE', image: '/static/dishes/tomato-beef-rice.webp', ticketImage: '/static/figma/tomato-rice.webp', place: '玉泉一食堂 · 二楼', canteen: '玉泉一食堂', campus: '玉泉', price: '¥15', score: 4.9, popularity: 426, flavor: ['酸甜', '浓郁', '下饭'], tags: ['午餐', '晚餐'], waitMinutes: 8, desc: '番茄的酸甜包住肥牛，米饭吸满汤汁，是很难出错的一餐。' },
  { id: 'mushroom-noodle', name: '山野菌菇面', english: 'WILD MUSHROOM NOODLES', image: '/static/figma/dish-mushroom-noodle-transparent.png', ticketImage: '/static/figma/dish-mushroom-noodle-transparent.png', place: '怡膳堂 · 一楼', canteen: '怡膳堂一楼', campus: '玉泉', price: '¥13', score: 4.8, popularity: 381, flavor: ['清淡', '菌香', '热乎'], tags: ['清淡', '素食'], waitMinutes: 6, desc: '菌菇的鲜味慢慢融进汤底，面条温润，是忙碌一天里让胃安静下来的选择。' },
  { id: 'sour-beef', name: '酸汤肥牛', english: 'SOUR SOUP BEEF', image: '/static/figma/sour-beef.webp', ticketImage: '/static/figma/sour-beef.webp', place: '玉泉二食堂 · 风味档', canteen: '玉泉二食堂', campus: '玉泉', price: '¥16', score: 4.7, popularity: 344, flavor: ['酸香', '微辣', '下饭'], tags: ['晚餐', '高蛋白'], waitMinutes: 12, desc: '明亮的酸味先醒胃，肥牛柔软，配米饭正合适。' },
  { id: 'stone-pot-rice', name: '石锅拌饭', english: 'STONE POT RICE', image: '/static/dishes/bibimbap.webp', place: '玉泉四食堂 · 一楼', canteen: '玉泉四食堂', campus: '玉泉', price: '¥16', score: 4.6, popularity: 298, flavor: ['咸香', '丰富', '饱腹'], tags: ['午餐', '高蛋白'], waitMinutes: 10, desc: '蔬菜与米饭在石锅里保持热度，拌开后每一口都有不同层次。' },
  { id: 'lotus-root', name: '桂花糖藕', english: 'OSMANTHUS LOTUS ROOT', image: '/static/figma/lotus-root.webp', ticketImage: '/static/figma/lotus-root.webp', place: '玉泉五食堂 · 甜品档', canteen: '玉泉五食堂', campus: '玉泉', price: '¥8–12', score: 4.5, popularity: 232, flavor: ['清甜', '软糯'], tags: ['甜品饮品'], waitMinutes: 4, desc: '桂花香气轻柔，糯米与莲藕软糯清甜，适合当作一餐温柔的句号。' },
  { id: 'cross-bridge-noodle', name: '过桥米线', english: 'CROSS-BRIDGE RICE NOODLES', image: '/static/figma/dish-mushroom-noodle-transparent.png', ticketImage: '/static/figma/dish-mushroom-noodle-transparent.png', place: '怡膳堂二楼 · 米线档', canteen: '怡膳堂二楼小乐惠', campus: '玉泉', price: '¥14', score: 4.5, popularity: 276, flavor: ['热乎', '鲜香'], tags: ['午餐', '晚餐'], waitMinutes: 9, desc: '热汤与米线组合得干净利落，配菜丰富，适合需要迅速恢复精神的时候。' },
  { id: 'braised-platter', name: '一食堂卤味', english: 'BRAISED PLATTER', image: '/static/dishes/plum-shiso-chicken.webp', place: '玉泉一食堂 · 卤味窗口', canteen: '玉泉一食堂', campus: '玉泉', price: '¥12–18', score: 4.6, popularity: 315, flavor: ['咸香', '下饭'], tags: ['高蛋白', '晚餐'], waitMinutes: 7, desc: '卤香扎实，荤素可以自由搭配，是日常里稳定又满足的一餐。' },
  { id: 'rose-set', name: '玫瑰简餐', english: 'ROSE SET MEAL', image: '/static/dishes/tomato-egg-rice.webp', ticketImage: '/static/figma/tomato-rice.webp', place: '怡膳堂二楼 · 玫瑰简餐', canteen: '怡膳堂二楼玫瑰简餐', campus: '玉泉', price: '¥15', score: 4.4, popularity: 248, flavor: ['清爽', '均衡'], tags: ['清淡', '午餐'], waitMinutes: 5, desc: '出餐迅速，搭配清爽均衡，适合课间时间不多的日子。' },
];

export const CAMPUS_CANTEENS = [
  { id: 'yq-1', name: '玉泉一食堂', subtitle: '综合食堂 · 步行 4 分钟', people: 36, wait: '不挤', waitLevel: 'quiet', waitDetail: '预计等候 3–5 分钟', open: true, left: 48, top: 49 },
  { id: 'yq-4', name: '玉泉四食堂', subtitle: '风味档口 · 步行 7 分钟', people: 52, wait: '适中', waitLevel: 'medium', waitDetail: '预计等候 6–8 分钟', open: true, left: 71, top: 32 },
  { id: 'yishan', name: '怡膳堂', subtitle: '简餐与面食 · 步行 9 分钟', people: 24, wait: '宽松', waitLevel: 'quiet', waitDetail: '预计等候 2–4 分钟', open: true, left: 66, top: 70 },
  { id: 'yq-2', name: '玉泉二食堂', subtitle: '风味窗口 · 步行 6 分钟', people: 45, wait: '适中', waitLevel: 'medium', waitDetail: '预计等候 5–7 分钟', open: true, left: 34, top: 67 },
  { id: 'maxwell', name: '麦斯威咖啡吧', subtitle: '咖啡轻食 · 步行 5 分钟', people: 18, wait: '宽松', waitLevel: 'quiet', waitDetail: '预计等候 2–3 分钟', open: true, left: 27, top: 34 },
];

const TRANSPARENT_DISH_IMAGES = {
  'tomato-beef-rice': '/static/figma/tomato-rice.webp',
  'mushroom-noodle': '/static/figma/dish-mushroom-noodle-transparent.png',
  'sour-beef': '/static/figma/sour-beef.webp',
  'stone-pot-rice': '/static/dishes/bibimbap.webp',
  'lotus-root': '/static/figma/lotus-root.webp',
  'cross-bridge-noodle': '/static/figma/dish-mushroom-noodle-transparent.png',
  'braised-platter': '/static/dishes/plum-shiso-chicken.webp',
  'rose-set': '/static/figma/tomato-rice.webp',
};

function resolveDishImage(dish, id) {
  const image = String(dish.image || '');
  const legacyFigmaAsset = /^\/static\/figma\/(?:rank-|ticket-|canteen-)/.test(image);
  if (!image || legacyFigmaAsset) {
    return TRANSPARENT_DISH_IMAGES[id] || '/static/figma/tomato-rice.webp';
  }
  return image;
}

export function normalizeDish(dish = {}) {
  const id = String(dish._id || dish.id || dish.name || '');
  const flavor = Array.isArray(dish.flavor) ? dish.flavor : [];
  const tags = Array.isArray(dish.tags) ? dish.tags : [];
  return {
    ...dish,
    id,
    image: resolveDishImage(dish, id),
    name: String(dish.name || '未命名菜品'),
    place: String(dish.place || dish.canteen || '玉泉校区'),
    campus: String(dish.campus || '玉泉'),
    price: String(dish.price || '价格待更新'),
    score: Number(dish.score) || 0,
    popularity: Number(dish.popularity) || 0,
    waitMinutes: Number(dish.waitMinutes) || 0,
    flavor,
    flavorText: flavor.join(' · '),
    tags,
  };
}

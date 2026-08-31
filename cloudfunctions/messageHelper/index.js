// 消息助手：只处理当前微信用户自己的消息状态。
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const MESSAGES_COLLECTION = 'messages';
const BATCH_SIZE = 100;
const MESSAGE_CATEGORIES = ['like_comment', 'follow', 'invite', 'system', 'checkin', 'activity'];

async function markAllRead(openid) {
  let updated = 0;
  // 云数据库单次查询有数量上限，循环处理，直到没有未读消息。
  for (let batch = 0; batch < 20; batch += 1) {
    const result = await db.collection(MESSAGES_COLLECTION)
      .where({ _openid: openid, read: false })
      .limit(BATCH_SIZE)
      .get();
    if (!result.data.length) break;
    await Promise.all(result.data.map((message) => (
      db.collection(MESSAGES_COLLECTION).doc(message._id).update({
        data: { read: true, readAt: db.serverDate(), updatedAt: db.serverDate() },
      })
    )));
    updated += result.data.length;
    if (result.data.length < BATCH_SIZE) break;
  }
  return updated;
}

async function markCategoryRead(openid, category) {
  const safeCategory = String(category || '').trim().slice(0, 40);
  if (!safeCategory) return 0;
  let updated = 0;
  for (let batch = 0; batch < 20; batch += 1) {
    const result = await db.collection(MESSAGES_COLLECTION)
      .where({ _openid: openid, category: safeCategory, read: false })
      .limit(BATCH_SIZE)
      .get();
    if (!result.data.length) break;
    await Promise.all(result.data.map((message) => (
      db.collection(MESSAGES_COLLECTION).doc(message._id).update({
        data: { read: true, readAt: db.serverDate(), updatedAt: db.serverDate() },
      })
    )));
    updated += result.data.length;
    if (result.data.length < BATCH_SIZE) break;
  }
  return updated;
}

async function getOverview(openid) {
  const overview = await Promise.all(MESSAGE_CATEGORIES.map(async (category) => {
    const [latestResult, unreadResult] = await Promise.all([
      db.collection(MESSAGES_COLLECTION)
        .where({ _openid: openid, category })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get(),
      db.collection(MESSAGES_COLLECTION)
        .where({ _openid: openid, category, read: false })
        .count(),
    ]);
    return {
      category,
      latest: latestResult.data[0] || null,
      unreadCount: unreadResult.total,
    };
  }));
  return overview.filter((item) => item.latest);
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, code: 'LOGIN_REQUIRED', message: '请先登录' };

  if (event.action === 'markAllRead') {
    const updated = await markAllRead(OPENID);
    return { success: true, updated };
  }

  if (event.action === 'markCategoryRead') {
    const updated = await markCategoryRead(OPENID, event.category);
    return { success: true, updated };
  }

  if (event.action === 'unreadCount') {
    const result = await db.collection(MESSAGES_COLLECTION).where({ _openid: OPENID, read: false }).count();
    return { success: true, unreadCount: result.total };
  }

  if (event.action === 'overview') {
    const overview = await getOverview(OPENID);
    return {
      success: true,
      overview,
      unreadCount: overview.reduce((total, item) => total + item.unreadCount, 0),
    };
  }

  return { success: false, code: 'UNSUPPORTED_ACTION', message: '不支持的消息操作' };
};

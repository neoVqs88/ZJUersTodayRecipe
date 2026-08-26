const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS_COLLECTION = 'users';
const FOLLOWS_COLLECTION = 'follows';
const HISTORY_COLLECTION = 'browsingHistory';
const POSTS_COLLECTION = 'posts';
const MEALS_COLLECTION = 'mealRecords';
const MESSAGES_COLLECTION = 'messages';
const DEFAULT_AVATAR = '/static/miniprogram-icon-zju-bowl-144.png';
const DEFAULT_PRIVACY = {
  profileVisibility: 'public',
  activityVisibility: 'public',
  showCheckins: false,
  showFollowing: true,
  showFollowers: true,
  allowFollow: true,
  historyEnabled: true,
};

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getUserId(openid) {
  return sha256(openid).slice(0, 32);
}

function getFollowId(followerId, followingId) {
  return sha256(`follow:${followerId}:${followingId}`).slice(0, 32);
}

function cleanUserId(value) {
  const userId = String(value || '').trim();
  return /^[a-f0-9]{32}$/.test(userId) ? userId : '';
}

function cleanId(value, maxLength = 80) {
  const id = String(value || '').trim();
  return id && id.length <= maxLength && /^[a-zA-Z0-9_:-]+$/.test(id) ? id : '';
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizePrivacy(value = {}) {
  const visibilityOptions = ['public', 'followers', 'private'];
  return {
    profileVisibility: visibilityOptions.includes(value.profileVisibility) ? value.profileVisibility : DEFAULT_PRIVACY.profileVisibility,
    activityVisibility: visibilityOptions.includes(value.activityVisibility) ? value.activityVisibility : DEFAULT_PRIVACY.activityVisibility,
    showCheckins: typeof value.showCheckins === 'boolean' ? value.showCheckins : DEFAULT_PRIVACY.showCheckins,
    showFollowing: typeof value.showFollowing === 'boolean' ? value.showFollowing : DEFAULT_PRIVACY.showFollowing,
    showFollowers: typeof value.showFollowers === 'boolean' ? value.showFollowers : DEFAULT_PRIVACY.showFollowers,
    allowFollow: typeof value.allowFollow === 'boolean' ? value.allowFollow : DEFAULT_PRIVACY.allowFollow,
    historyEnabled: typeof value.historyEnabled === 'boolean' ? value.historyEnabled : DEFAULT_PRIVACY.historyEnabled,
  };
}

function isMissingCollection(error) {
  const message = error.errMsg || error.message || '';
  return /collection.*not exist|集合.*不存在|-502005/i.test(message);
}

async function readUser(userId) {
  if (!userId) return null;
  try {
    const result = await db.collection(USERS_COLLECTION).doc(userId).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
}

function requireActiveUser(user) {
  if (!user || user.status !== 'active') {
    const error = new Error('请先登录后再使用该功能');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
}

async function readFollow(followerId, followingId) {
  if (!followerId || !followingId || followerId === followingId) return null;
  try {
    const result = await db.collection(FOLLOWS_COLLECTION).doc(getFollowId(followerId, followingId)).get();
    return result.data && result.data.status === 'active' ? result.data : null;
  } catch (error) {
    return null;
  }
}

function toBasicProfile(user) {
  return {
    id: user._id,
    name: user.name || 'zjuer_同学',
    image: user.image || DEFAULT_AVATAR,
    campus: user.campus || '玉泉校区',
    star: user.star || '浙江大学生',
    introduction: user.introduction || '',
    checkInCount: user.checkInCount || 0,
    postCount: user.postCount || 0,
  };
}

function toListProfile(user) {
  return {
    id: user._id,
    name: user.name || 'zjuer_同学',
    image: user.image || DEFAULT_AVATAR,
    campus: user.campus || '玉泉校区',
    star: user.star || '浙江大学生',
    introduction: '',
  };
}

function toVisibleProfile(user, canViewDetails) {
  const profile = toBasicProfile(user);
  if (!canViewDetails) {
    return {
      ...profile,
      introduction: '该用户设置了资料可见范围',
      gender: '',
      grade: '',
      college: '',
      hometown: '',
      foodPreferences: [],
    };
  }
  return {
    ...profile,
    gender: user.gender || '保密',
    grade: user.grade || '保密',
    college: user.college || '',
    hometown: user.hometown || '',
    foodPreferences: Array.isArray(user.foodPreferences) ? user.foodPreferences : [],
  };
}

function canViewByRule(rule, isMine, isFollowing) {
  if (isMine) return true;
  if (rule === 'public') return true;
  return rule === 'followers' && isFollowing;
}

async function safeReadCollection(collectionName, query) {
  try {
    const result = await query(db.collection(collectionName)).limit(100).get();
    return result.data || [];
  } catch (error) {
    if (isMissingCollection(error)) return [];
    throw error;
  }
}

function getTimestamp(value) {
  const date = value && value.$date ? new Date(value.$date) : new Date(value || 0);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizePost(post) {
  const images = Array.isArray(post.images) ? post.images.filter(Boolean).slice(0, 3) : [];
  const postId = String(post._id || post.id || '');
  return {
    id: postId,
    type: 'post',
    title: cleanText(post.title, 60) || '校园美食分享',
    content: cleanText(post.content, 220),
    image: images[0] || post.image || '',
    images,
    location: cleanText(post.location || post.placeName, 50),
    createdAt: post.publishedAt || post.createdAt,
    route: postId ? `/pages/comments/index?postId=${encodeURIComponent(postId)}` : '',
  };
}

function normalizeMeal(record) {
  return {
    id: String(record._id || ''),
    type: 'checkin',
    title: cleanText(record.dishName, 50) || '三餐打卡',
    content: '记录了一次校园美食打卡',
    image: record.imageFileId || '',
    images: record.imageFileId ? [record.imageFileId] : [],
    location: cleanText(record.placeName, 50),
    mealType: record.mealType || 'snack',
    nutritionAnalysis: record.nutritionAnalysis || null,
    createdAt: record.mealTime || record.createdAt,
    route: '',
  };
}

function canViewDynamicItem(item, isMine, isFollowing) {
  if (isMine) return true;
  const visibility = item.visibility || 'public';
  if (visibility === 'public') return true;
  return (visibility === 'friends' || visibility === 'followers') && isFollowing;
}

async function listDynamics(userId, privacy, canViewActivity, isMine, isFollowing, limit = 20) {
  if (!canViewActivity) return [];
  const [authoredPosts, legacyPosts, documentedPosts, meals] = await Promise.all([
    safeReadCollection(POSTS_COLLECTION, (collection) => collection.where({ userId })),
    safeReadCollection(POSTS_COLLECTION, (collection) => collection.where({ authorId: userId })),
    safeReadCollection(POSTS_COLLECTION, (collection) => collection.where({ user_id: userId })),
    privacy.showCheckins || isMine
      ? safeReadCollection(MEALS_COLLECTION, (collection) => collection.where({ userId, status: 'active' }))
      : Promise.resolve([]),
  ]);

  const postMap = new Map();
  [...authoredPosts, ...legacyPosts, ...documentedPosts]
    .filter((post) => {
      const status = post.post_status || post.status;
      return ['published', 'active', undefined].includes(status) && canViewDynamicItem(post, isMine, isFollowing);
    })
    .forEach((post) => postMap.set(String(post._id || post.id), normalizePost(post)));
  const dynamics = [
    ...Array.from(postMap.values()),
    ...meals.filter((meal) => canViewDynamicItem(meal, isMine, isFollowing)).map(normalizeMeal),
  ].sort((left, right) => getTimestamp(right.createdAt) - getTimestamp(left.createdAt));
  return dynamics.slice(0, Math.min(Math.max(Number(limit) || 20, 1), 50));
}

async function getFollowCounts(userId) {
  try {
    const [followingResult, followerResult] = await Promise.all([
      db.collection(FOLLOWS_COLLECTION).where({ followerId: userId, status: 'active' }).count(),
      db.collection(FOLLOWS_COLLECTION).where({ followingId: userId, status: 'active' }).count(),
    ]);
    return { followingCount: followingResult.total, followerCount: followerResult.total };
  } catch (error) {
    if (isMissingCollection(error)) return { followingCount: 0, followerCount: 0 };
    throw error;
  }
}

async function saveHistory(currentUser, item) {
  if (!currentUser || currentUser.status !== 'active') return;
  const privacy = normalizePrivacy(currentUser.privacy);
  if (!privacy.historyEnabled) return;
  const type = ['profile', 'post', 'dish', 'canteen'].includes(item.type) ? item.type : '';
  const targetId = cleanId(item.targetId);
  if (!type || !targetId) return;
  const route = cleanText(item.route, 300);
  if (route && !route.startsWith('/pages/')) return;
  const documentId = sha256(`history:${currentUser._id}:${type}:${targetId}`).slice(0, 32);
  let existing = null;
  try {
    existing = (await db.collection(HISTORY_COLLECTION).doc(documentId).get()).data || null;
  } catch (error) {
    // 第一次访问时没有历史文档。
  }
  await db.collection(HISTORY_COLLECTION).doc(documentId).set({
    data: {
      _openid: currentUser._openid,
      userId: currentUser._id,
      type,
      targetId,
      title: cleanText(item.title, 80) || '浏览内容',
      subtitle: cleanText(item.subtitle, 120),
      image: cleanText(item.image, 500),
      route,
      visitCount: (existing && existing.visitCount ? existing.visitCount : 0) + 1,
      firstVisitedAt: existing ? existing.firstVisitedAt || db.serverDate() : db.serverDate(),
      visitedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
}

async function getDashboard(event, currentUserId, currentUser) {
  const targetUserId = cleanUserId(event.userId) || currentUserId;
  const targetUser = await readUser(targetUserId);
  if (!targetUser || targetUser.status !== 'active') {
    return { success: false, code: 'USER_NOT_FOUND', message: '用户不存在或主页不可用' };
  }
  const isMine = currentUserId === targetUserId;
  const followingRelation = isMine ? null : await readFollow(currentUserId, targetUserId);
  const reverseRelation = isMine ? null : await readFollow(targetUserId, currentUserId);
  const isFollowing = Boolean(followingRelation);
  const privacy = normalizePrivacy(targetUser.privacy);
  const canViewProfile = canViewByRule(privacy.profileVisibility, isMine, isFollowing);
  const canViewActivity = canViewByRule(privacy.activityVisibility, isMine, isFollowing);
  const [counts, dynamics] = await Promise.all([
    getFollowCounts(targetUserId),
    listDynamics(targetUserId, privacy, canViewActivity, isMine, isFollowing, event.limit),
  ]);

  if (!isMine) {
    try {
      await saveHistory(currentUser, {
        type: 'profile',
        targetId: targetUserId,
        title: targetUser.name || '用户主页',
        subtitle: targetUser.campus || '',
        image: targetUser.image || DEFAULT_AVATAR,
        route: `/pages/profile/index?userId=${targetUserId}`,
      });
    } catch (error) {
      // 足迹是增强功能，不应因集合未部署或短暂故障阻断主页加载。
      console.warn('记录主页足迹失败', error);
    }
  }

  const visibleProfile = toVisibleProfile(targetUser, canViewProfile);
  if (!isMine && !privacy.showCheckins) visibleProfile.checkInCount = 0;
  if (!isMine && !canViewActivity) visibleProfile.postCount = 0;

  return {
    success: true,
    profile: visibleProfile,
    isMine,
    privacy: isMine ? privacy : null,
    social: {
      ...counts,
      isFollowing,
      followsMe: Boolean(reverseRelation),
      canFollow: !isMine && privacy.allowFollow,
      canViewProfile,
      canViewActivity,
      showCheckins: isMine || privacy.showCheckins,
      showFollowing: isMine || privacy.showFollowing,
      showFollowers: isMine || privacy.showFollowers,
    },
    dynamics,
  };
}

async function toggleFollow(event, currentUserId, currentUser, active) {
  requireActiveUser(currentUser);
  const targetUserId = cleanUserId(event.userId);
  if (!targetUserId || targetUserId === currentUserId) {
    return { success: false, code: 'INVALID_TARGET', message: '不能关注自己' };
  }
  const targetUser = await readUser(targetUserId);
  if (!targetUser || targetUser.status !== 'active') {
    return { success: false, code: 'USER_NOT_FOUND', message: '该用户不存在' };
  }
  const privacy = normalizePrivacy(targetUser.privacy);
  if (active && !privacy.allowFollow) {
    return { success: false, code: 'FOLLOW_DISABLED', message: '该用户暂不接受关注' };
  }
  const followId = getFollowId(currentUserId, targetUserId);
  const existing = await readFollow(currentUserId, targetUserId);
  await db.collection(FOLLOWS_COLLECTION).doc(followId).set({
    data: {
      _openid: currentUser._openid,
      followerId: currentUserId,
      followingId: targetUserId,
      status: active ? 'active' : 'deleted',
      createdAt: existing ? existing.createdAt || db.serverDate() : db.serverDate(),
      updatedAt: db.serverDate(),
      ...(active ? {} : { deletedAt: db.serverDate() }),
    },
  });
  if (active && !existing && targetUser._openid) {
    try {
      await db.collection(MESSAGES_COLLECTION).add({
        data: {
          _openid: targetUser._openid,
          type: 'interaction',
          title: '新关注',
          summary: `${currentUser.name || '一位同学'} 关注了你`,
          detail: '去个人主页看看这位校园美食伙伴吧。',
          icon: 'user-add',
          theme: 'blue',
          read: false,
          actorUserId: currentUserId,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
    } catch (error) {
      // 关注关系已成功写入，消息通知失败时不回滚主操作。
      console.warn('发送关注通知失败', error);
    }
  }
  return { success: true, isFollowing: active, counts: await getFollowCounts(targetUserId) };
}

async function listFollowUsers(event, currentUserId) {
  const targetUserId = cleanUserId(event.userId) || currentUserId;
  const mode = event.mode === 'followers' ? 'followers' : 'following';
  const targetUser = await readUser(targetUserId);
  if (!targetUser || targetUser.status !== 'active') {
    return { success: false, code: 'USER_NOT_FOUND', message: '用户不存在' };
  }
  const privacy = normalizePrivacy(targetUser.privacy);
  const visible = targetUserId === currentUserId || (mode === 'followers' ? privacy.showFollowers : privacy.showFollowing);
  if (!visible) return { success: true, hidden: true, users: [] };

  const queryField = mode === 'followers' ? 'followingId' : 'followerId';
  const userField = mode === 'followers' ? 'followerId' : 'followingId';
  const relations = await safeReadCollection(FOLLOWS_COLLECTION, (collection) => collection.where({
    [queryField]: targetUserId,
    status: 'active',
  }));
  relations.sort((left, right) => getTimestamp(right.updatedAt) - getTimestamp(left.updatedAt));
  const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50);
  const users = (await Promise.all(relations.slice(0, limit).map((relation) => readUser(relation[userField]))))
    .filter((user) => user && user.status === 'active')
    .map(toListProfile);
  return { success: true, hidden: false, users, total: relations.length };
}

async function getPrivacy(currentUser) {
  requireActiveUser(currentUser);
  return { success: true, privacy: normalizePrivacy(currentUser.privacy) };
}

async function updatePrivacy(event, currentUserId, currentUser) {
  requireActiveUser(currentUser);
  const privacy = normalizePrivacy(event.privacy);
  await db.collection(USERS_COLLECTION).doc(currentUserId).update({
    data: { privacy, updatedAt: db.serverDate() },
  });
  return { success: true, privacy };
}

async function recordHistory(event, currentUser) {
  requireActiveUser(currentUser);
  await saveHistory(currentUser, event.item || {});
  return { success: true };
}

async function listHistory(event, currentUserId, currentUser) {
  requireActiveUser(currentUser);
  const records = await safeReadCollection(HISTORY_COLLECTION, (collection) => collection.where({ userId: currentUserId }));
  const type = ['profile', 'post', 'dish', 'canteen'].includes(event.type) ? event.type : '';
  const filtered = records
    .filter((item) => !type || item.type === type)
    .sort((left, right) => getTimestamp(right.visitedAt) - getTimestamp(left.visitedAt));
  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100);
  return { success: true, history: filtered.slice(0, limit) };
}

async function removeHistory(event, currentUserId, currentUser) {
  requireActiveUser(currentUser);
  const historyId = cleanId(event.historyId);
  if (!historyId) return { success: false, message: '历史记录无效' };
  let record;
  try {
    record = (await db.collection(HISTORY_COLLECTION).doc(historyId).get()).data;
  } catch (error) {
    return { success: true };
  }
  if (record.userId !== currentUserId) return { success: false, message: '无权删除该记录' };
  await db.collection(HISTORY_COLLECTION).doc(historyId).remove();
  return { success: true };
}

async function clearHistory(currentUserId, currentUser) {
  requireActiveUser(currentUser);
  for (let page = 0; page < 100; page += 1) {
    const records = await db.collection(HISTORY_COLLECTION).where({ userId: currentUserId }).limit(100).get();
    if (!records.data.length) break;
    await Promise.all(records.data.map((record) => db.collection(HISTORY_COLLECTION).doc(record._id).remove()));
  }
  return { success: true };
}

exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext();
    if (!context.OPENID) return { success: false, code: 'LOGIN_REQUIRED', message: '无法获取当前用户身份' };
    const currentUserId = getUserId(context.OPENID);
    const currentUser = await readUser(currentUserId);

    if (event.action === 'dashboard') return await getDashboard(event, currentUserId, currentUser);
    if (event.action === 'follow') return await toggleFollow(event, currentUserId, currentUser, true);
    if (event.action === 'unfollow') return await toggleFollow(event, currentUserId, currentUser, false);
    if (event.action === 'listFollows') return await listFollowUsers(event, currentUserId);
    if (event.action === 'getPrivacy') return await getPrivacy(currentUser);
    if (event.action === 'updatePrivacy') return await updatePrivacy(event, currentUserId, currentUser);
    if (event.action === 'recordHistory') return await recordHistory(event, currentUser);
    if (event.action === 'listHistory') return await listHistory(event, currentUserId, currentUser);
    if (event.action === 'removeHistory') return await removeHistory(event, currentUserId, currentUser);
    if (event.action === 'clearHistory') return await clearHistory(currentUserId, currentUser);
    return { success: false, message: '不支持的用户社交操作' };
  } catch (error) {
    return {
      success: false,
      code: error.code || 'SOCIAL_SERVICE_ERROR',
      message: isMissingCollection(error) ? '请先创建用户社交功能所需的云数据库集合' : error.errMsg || error.message || '用户社交服务暂时不可用',
    };
  }
};

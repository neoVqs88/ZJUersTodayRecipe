const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { command } = db;

const POSTS = 'posts';
const USERS = 'users';
const FAVORITES = 'postFavorites';
const HIDDEN = 'hiddenPosts';
const REPORTS = 'reports';
const COMMENTS = 'comments';
const FEEDBACK = 'feedback';
const DISH_FAVORITES = 'dishFavorites';
const POLL_VOTES = 'postPollVotes';
const CATEGORIES = ['food', 'explore', 'companion', 'poll'];
const REPORT_REASONS = ['广告营销', '辱骂攻击', '隐私泄露', '虚假信息', '不适内容', '其他'];

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function cleanText(value, max = 1000) {
  return String(value || '').split('\u0000').join('').trim().slice(0, max);
}

function userIdFromOpenid(openid) {
  return hash(openid);
}

async function readUser(userId) {
  try {
    const user = (await db.collection(USERS).doc(userId).get()).data;
    if (!user || user.status === 'deleted' || user.status === 'disabled') return null;
    return user;
  } catch (error) {
    return null;
  }
}

async function requireUser(openid) {
  if (!openid) {
    const error = new Error('请先登录');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  const userId = userIdFromOpenid(openid);
  const user = await readUser(userId);
  if (!user) {
    const error = new Error('请先完成微信登录');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  return { userId, user };
}

function isRisky(result = {}) {
  const detail = result.result || result;
  return detail.suggest === 'risky' || detail.label === 100 || detail.errCode === 87014;
}

async function checkText(openid, content) {
  const result = await cloud.openapi.security.msgSecCheck({
    openid,
    scene: 2,
    version: 2,
    content,
  });
  if (isRisky(result)) {
    const error = new Error('内容可能包含不适宜信息，请修改后再发布');
    error.code = 'CONTENT_RISKY';
    throw error;
  }
}

async function checkImages(images) {
  // 图片审核必须逐张执行，避免同时下载大量图片。
  // eslint-disable-next-line no-restricted-syntax
  for (const fileID of images) {
    // eslint-disable-next-line no-await-in-loop
    const file = await cloud.downloadFile({ fileID });
    const header = file.fileContent.slice(0, 4).toString('hex');
    const contentType = header.startsWith('89504e47') ? 'image/png' : 'image/jpeg';
    // eslint-disable-next-line no-await-in-loop
    const result = await cloud.openapi.security.imgSecCheck({
      media: { contentType, value: file.fileContent },
    });
    if (isRisky(result)) {
      const error = new Error('图片可能包含不适宜内容，请更换后再发布');
      error.code = 'IMAGE_RISKY';
      throw error;
    }
  }
}

async function publish(openid, source = {}) {
  const { userId, user } = await requireUser(openid);
  const content = cleanText(source.content, 1000);
  if (!content) {
    const error = new Error('请先写下想分享的内容');
    error.code = 'INVALID_CONTENT';
    throw error;
  }
  const category = CATEGORIES.includes(source.category) ? source.category : 'food';
  const images = Array.isArray(source.images)
    ? source.images.filter((item) => /^cloud:\/\//.test(String(item))).slice(0, 4)
    : [];
  const tags = Array.isArray(source.tags) ? source.tags.map((item) => cleanText(item, 20)).filter(Boolean).slice(0, 5) : [];
  const location = source.location && typeof source.location === 'object' ? source.location : null;
  const minParticipants = category === 'companion'
    ? Math.min(Math.max(Number(source.minParticipants) || 2, 2), 20)
    : null;
  const maxParticipants = category === 'companion'
    ? Math.max(minParticipants, Math.min(Math.max(Number(source.maxParticipants) || 4, 2), 20))
    : null;

  await checkText(openid, [content, ...tags, location && location.name].filter(Boolean).join(' '));
  if (images.length) await checkImages(images);

  const result = await db.collection(POSTS).add({
    data: {
      _openid: openid,
      userId,
      authorId: userId,
      authorName: cleanText(user.name || user.nickName || 'zjuer_同学', 30),
      avatar: cleanText(user.image || user.avatarUrl || '/static/miniprogram-icon-zju-bowl-144.png', 500),
      campus: cleanText(user.campus || '玉泉校区', 30),
      level: Math.max(1, Number(user.level) || 1),
      category,
      content,
      tags,
      images,
      image: images[0] || '',
      shareLocation: Boolean(location),
      location: location ? cleanText(location.name || location.address, 50) : '',
      locationAddress: location ? cleanText(location.address, 100) : '',
      latitude: location && Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : null,
      longitude: location && Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : null,
      dish: cleanText(source.dish || tags[0] || '校园美食分享', 50),
      visualDesc: location ? cleanText(location.name, 50) : '校园美食新动态',
      emoji: cleanText(source.emoji, 4),
      tone: cleanText(source.tone, 12),
      likes: 0,
      commentsCount: 0,
      collections: 0,
      status: 'published',
      post_status: 'published',
      reviewStatus: 'approved',
      minParticipants,
      maxParticipants,
      participantCount: category === 'companion' ? 1 : 0,
      participantIds: category === 'companion' ? [userId] : [],
      pollOptions: category === 'poll' ? ['想尝鲜', '先观望'] : [],
      pollCounts: category === 'poll' ? [0, 0] : [],
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  await db.collection(USERS).doc(userId).update({
    data: { postCount: command.inc(1), updatedAt: db.serverDate() },
  }).catch(() => {});
  return { postId: result._id };
}

async function getPost(postId) {
  try {
    return (await db.collection(POSTS).doc(postId).get()).data;
  } catch (error) {
    const next = new Error('帖子不存在或已删除');
    next.code = 'POST_NOT_FOUND';
    throw next;
  }
}

async function toggleFavorite(openid, postId) {
  const { userId } = await requireUser(openid);
  await getPost(postId);
  const favoriteId = hash(`favorite:${userId}:${postId}`);
  const result = await db.runTransaction(async (transaction) => {
    let existing = null;
    try {
      existing = (await transaction.collection(FAVORITES).doc(favoriteId).get()).data;
    } catch (error) {
      existing = null;
    }
    const postRef = transaction.collection(POSTS).doc(postId);
    const post = (await postRef.get()).data;
    const currentCount = Math.max(0, Number(post.collections) || 0);
    if (existing) {
      await transaction.collection(FAVORITES).doc(favoriteId).remove();
      await postRef.update({ data: { collections: Math.max(0, currentCount - 1), updatedAt: db.serverDate() } });
      return { collected: false, collections: Math.max(0, currentCount - 1) };
    }
    await transaction.collection(FAVORITES).doc(favoriteId).set({
      data: { userId, postId, createdAt: db.serverDate() },
    });
    await postRef.update({ data: { collections: currentCount + 1, updatedAt: db.serverDate() } });
    return { collected: true, collections: currentCount + 1 };
  });
  const favoriteCount = await db.collection(FAVORITES).where({ userId }).count().then((count) => count.total).catch(() => null);
  if (favoriteCount !== null) {
    await db.collection(USERS).doc(userId).update({
      data: { favoriteCount, updatedAt: db.serverDate() },
    }).catch(() => {});
  }
  return result;
}

async function getStates(openid, postIds) {
  const { userId } = await requireUser(openid);
  const ids = Array.isArray(postIds) ? postIds.map(String).filter(Boolean).slice(0, 100) : [];
  const states = {};
  await Promise.all(ids.map(async (postId) => {
    const favoriteId = hash(`favorite:${userId}:${postId}`);
    const hiddenId = hash(`hidden:${userId}:${postId}`);
    const [favorite, hidden] = await Promise.all([
      db.collection(FAVORITES).doc(favoriteId).get().then(() => true).catch(() => false),
      db.collection(HIDDEN).doc(hiddenId).get().then(() => true).catch(() => false),
    ]);
    states[postId] = { collected: favorite, hidden };
  }));
  return states;
}

async function hide(openid, postId) {
  const { userId } = await requireUser(openid);
  await getPost(postId);
  const id = hash(`hidden:${userId}:${postId}`);
  await db.collection(HIDDEN).doc(id).set({
    data: { userId, postId, createdAt: db.serverDate() },
  });
  return { hidden: true };
}

async function report(openid, postId, reason, details) {
  const { userId } = await requireUser(openid);
  await getPost(postId);
  const normalizedReason = REPORT_REASONS.includes(reason) ? reason : '其他';
  const id = hash(`report:${userId}:${postId}`);
  await db.collection(REPORTS).doc(id).set({
    data: {
      userId,
      targetType: 'post',
      postId,
      reason: normalizedReason,
      details: cleanText(details, 200),
      status: 'pending',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return { reported: true };
}

async function reportComment(openid, commentId, reason, details) {
  const { userId } = await requireUser(openid);
  let comment;
  try {
    comment = (await db.collection(COMMENTS).doc(commentId).get()).data;
  } catch (error) {
    const next = new Error('评论不存在或已删除');
    next.code = 'COMMENT_NOT_FOUND';
    throw next;
  }
  const normalizedReason = REPORT_REASONS.includes(reason) ? reason : '其他';
  const id = hash(`report-comment:${userId}:${commentId}`);
  await db.collection(REPORTS).doc(id).set({
    data: {
      userId,
      targetType: 'comment',
      commentId,
      postId: comment.postId || '',
      reason: normalizedReason,
      details: cleanText(details, 200),
      status: 'pending',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return { reported: true };
}

async function listFavorites(openid, page, pageSize) {
  const { userId } = await requireUser(openid);
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(20, Math.max(1, Number(pageSize) || 20));
  const result = await db.collection(FAVORITES)
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .skip((safePage - 1) * safeSize)
    .limit(safeSize)
    .get();
  const postIds = result.data.map((item) => item.postId);
  if (!postIds.length) return { posts: [], hasMore: false };
  const posts = await db.collection(POSTS).where({ _id: command.in(postIds) }).get();
  const byId = Object.fromEntries(posts.data.map((post) => [post._id, post]));
  return {
    posts: postIds.map((id) => byId[id]).filter(Boolean),
    hasMore: result.data.length === safeSize,
  };
}

async function submitFeedback(openid, content, contact) {
  const { userId } = await requireUser(openid);
  const normalizedContent = cleanText(content, 800);
  if (normalizedContent.length < 5) {
    const error = new Error('请至少填写 5 个字的反馈内容');
    error.code = 'INVALID_FEEDBACK';
    throw error;
  }
  await checkText(openid, normalizedContent);
  const result = await db.collection(FEEDBACK).add({
    data: {
      userId,
      content: normalizedContent,
      contact: cleanText(contact, 100),
      status: 'pending',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return { feedbackId: result._id };
}

async function dishFavoriteState(openid, dishId) {
  const { userId } = await requireUser(openid);
  const normalizedDishId = cleanText(dishId, 80);
  const id = hash(`dish-favorite:${userId}:${normalizedDishId}`);
  const collected = await db.collection(DISH_FAVORITES).doc(id).get().then(() => true).catch(() => false);
  return { collected };
}

async function toggleDishFavorite(openid, dishId) {
  const { userId } = await requireUser(openid);
  const normalizedDishId = cleanText(dishId, 80);
  if (!normalizedDishId) {
    const error = new Error('菜品信息无效');
    error.code = 'INVALID_DISH';
    throw error;
  }
  const id = hash(`dish-favorite:${userId}:${normalizedDishId}`);
  const exists = await db.collection(DISH_FAVORITES).doc(id).get().then(() => true).catch(() => false);
  if (exists) {
    await db.collection(DISH_FAVORITES).doc(id).remove();
    return { collected: false };
  }
  await db.collection(DISH_FAVORITES).doc(id).set({
    data: { userId, dishId: normalizedDishId, createdAt: db.serverDate() },
  });
  return { collected: true };
}

async function pollState(openid, postId) {
  const { userId } = await requireUser(openid);
  const post = await getPost(postId);
  if (post.category !== 'poll') return { options: [], counts: [], selectedIndex: -1 };
  const voteId = hash(`poll:${userId}:${postId}`);
  const vote = await db.collection(POLL_VOTES).doc(voteId).get().then((result) => result.data).catch(() => null);
  return {
    options: Array.isArray(post.pollOptions) ? post.pollOptions : ['想尝鲜', '先观望'],
    counts: Array.isArray(post.pollCounts) ? post.pollCounts : [0, 0],
    selectedIndex: vote ? Number(vote.optionIndex) : -1,
  };
}

async function votePoll(openid, postId, optionIndex) {
  const { userId } = await requireUser(openid);
  const selected = Number(optionIndex);
  const voteId = hash(`poll:${userId}:${postId}`);
  return db.runTransaction(async (transaction) => {
    const postRef = transaction.collection(POSTS).doc(postId);
    const post = (await postRef.get()).data;
    if (!post || post.category !== 'poll') {
      const error = new Error('投票不存在或已结束');
      error.code = 'POLL_NOT_FOUND';
      throw error;
    }
    const options = Array.isArray(post.pollOptions) ? post.pollOptions : ['想尝鲜', '先观望'];
    if (!Number.isInteger(selected) || selected < 0 || selected >= options.length) {
      const error = new Error('请选择有效选项');
      error.code = 'INVALID_POLL_OPTION';
      throw error;
    }
    let previous = null;
    try {
      previous = (await transaction.collection(POLL_VOTES).doc(voteId).get()).data;
    } catch (error) {
      previous = null;
    }
    const counts = Array.from({ length: options.length }, (_, index) => Math.max(0, Number((post.pollCounts || [])[index]) || 0));
    if (previous && Number(previous.optionIndex) === selected) {
      return { options, counts, selectedIndex: selected };
    }
    if (previous && counts[Number(previous.optionIndex)] > 0) counts[Number(previous.optionIndex)] -= 1;
    counts[selected] += 1;
    await transaction.collection(POLL_VOTES).doc(voteId).set({
      data: { userId, postId, optionIndex: selected, updatedAt: db.serverDate(), createdAt: previous ? previous.createdAt : db.serverDate() },
    });
    await postRef.update({ data: { pollCounts: counts, updatedAt: db.serverDate() } });
    return { options, counts, selectedIndex: selected };
  });
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  try {
    if (event.action === 'publish') return { success: true, ...(await publish(OPENID, event.post || {})) };
    if (event.action === 'toggleFavorite') return { success: true, ...(await toggleFavorite(OPENID, cleanText(event.postId, 64))) };
    if (event.action === 'states') return { success: true, states: await getStates(OPENID, event.postIds) };
    if (event.action === 'hidePost') return { success: true, ...(await hide(OPENID, cleanText(event.postId, 64))) };
    if (event.action === 'report') return { success: true, ...(await report(OPENID, cleanText(event.postId, 64), cleanText(event.reason, 20), event.details)) };
    if (event.action === 'reportComment') return { success: true, ...(await reportComment(OPENID, cleanText(event.commentId, 64), cleanText(event.reason, 20), event.details)) };
    if (event.action === 'listFavorites') return { success: true, ...(await listFavorites(OPENID, event.page, event.pageSize)) };
    if (event.action === 'feedback') return { success: true, ...(await submitFeedback(OPENID, event.content, event.contact)) };
    if (event.action === 'dishFavoriteState') return { success: true, ...(await dishFavoriteState(OPENID, event.dishId)) };
    if (event.action === 'toggleDishFavorite') return { success: true, ...(await toggleDishFavorite(OPENID, event.dishId)) };
    if (event.action === 'pollState') return { success: true, ...(await pollState(OPENID, cleanText(event.postId, 64))) };
    if (event.action === 'votePoll') return { success: true, ...(await votePoll(OPENID, cleanText(event.postId, 64), event.optionIndex)) };
    return { success: false, code: 'UNSUPPORTED_ACTION', message: '不支持的社区操作' };
  } catch (error) {
    console.error('communityPosts failed', error);
    return { success: false, code: error.code || 'COMMUNITY_FAILED', message: error.message || '社区服务暂时不可用' };
  }
};

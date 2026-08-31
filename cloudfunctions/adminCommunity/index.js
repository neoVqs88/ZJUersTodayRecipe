const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { command } = db;
const POSTS_COLLECTION = 'posts';
const POST_LIKES_COLLECTION = 'postLikes';
const POST_FAVORITES_COLLECTION = 'postFavorites';
const HIDDEN_POSTS_COLLECTION = 'hiddenPosts';
const POLL_VOTES_COLLECTION = 'postPollVotes';
const COMMENTS_COLLECTION = 'comments';
const MESSAGES_COLLECTION = 'messages';
const HISTORY_COLLECTION = 'browsingHistory';
const USERS_COLLECTION = 'users';
const CONFIG_COLLECTION = 'systemConfig';
const SECURITY_COLLECTION = 'adminSecurity';
const LOGS_COLLECTION = 'moderationLogs';
const REPORTS_COLLECTION = 'reports';
const CONFIG_DOCUMENT = 'communityAdmin';
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getUserId(openid) {
  return sha256(openid).slice(0, 32);
}

function getLikeId(postId, userId) {
  return sha256(`post-like:${postId}:${userId}`).slice(0, 32);
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanId(value, maxLength = 80) {
  const id = String(value || '').trim();
  return id && id.length <= maxLength && /^[a-zA-Z0-9_:-]+$/.test(id) ? id : '';
}

function isMissingCollection(error) {
  const message = error.errMsg || error.message || '';
  return /collection.*not exist|集合.*不存在|-502005/i.test(message);
}

function toTimestamp(value) {
  if (!value) return 0;
  const date = value.$date ? new Date(value.$date) : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodePayload(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - normalized.length % 4) % 4);
  return JSON.parse(Buffer.from(normalized + padding, 'base64').toString('utf8'));
}

function signToken(userId, secret, sessionHours) {
  const payload = encodePayload({
    userId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + sessionHours * 60 * 60 * 1000,
    nonce: crypto.randomBytes(12).toString('hex'),
  });
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { token: `v1.${payload}.${signature}`, expiresAt: decodePayload(payload).expiresAt };
}

function verifyToken(token, userId, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const signature = crypto.createHmac('sha256', secret).update(parts[1]).digest('hex');
  if (!constantTimeEqual(signature, parts[2])) return false;
  try {
    const payload = decodePayload(parts[1]);
    return payload.userId === userId && Number(payload.expiresAt) > Date.now();
  } catch (error) {
    return false;
  }
}

async function readDocument(collectionName, documentId) {
  try {
    const result = await db.collection(collectionName).doc(documentId).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
}

async function removeWhereIfPresent(collectionName, condition) {
  try {
    await db.collection(collectionName).where(condition).remove();
  } catch (error) {
    if (!isMissingCollection(error)) throw error;
  }
}

async function readConfig() {
  const config = await readDocument(CONFIG_COLLECTION, CONFIG_DOCUMENT);
  if (!config || config.enabled === false) {
    const error = new Error('管理入口尚未配置，请先完成云端密钥设置');
    error.code = 'ADMIN_NOT_CONFIGURED';
    throw error;
  }
  const accessKeyHash = cleanText(config.accessKeyHash, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(accessKeyHash)) {
    const error = new Error('管理密钥配置无效');
    error.code = 'ADMIN_NOT_CONFIGURED';
    throw error;
  }
  const sessionHours = Math.min(Math.max(Number(config.sessionHours) || 4, 1), 24);
  const adminUserIds = Array.isArray(config.adminUserIds)
    ? config.adminUserIds.map((item) => cleanId(item, 32)).filter(Boolean)
    : [];
  return { accessKeyHash, sessionHours, adminUserIds };
}

async function getActiveUser(userId) {
  const user = await readDocument(USERS_COLLECTION, userId);
  if (!user || user.status !== 'active') {
    const error = new Error('请先完成微信登录');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  return user;
}

async function checkRateLimit(userId) {
  const record = await readDocument(SECURITY_COLLECTION, userId);
  const now = Date.now();
  if (record && toTimestamp(record.lockedUntil) > now) {
    const error = new Error('密钥错误次数过多，请 15 分钟后再试');
    error.code = 'ADMIN_LOGIN_LOCKED';
    throw error;
  }
  return record;
}

async function recordLoginResult(userId, openid, previous, success) {
  const now = Date.now();
  if (success) {
    await db.collection(SECURITY_COLLECTION).doc(userId).set({
      data: { _openid: openid, failedCount: 0, lastSuccessAt: db.serverDate(), updatedAt: db.serverDate() },
    });
    return;
  }
  const firstFailedAt = toTimestamp(previous && previous.firstFailedAt);
  const inWindow = firstFailedAt && now - firstFailedAt < ATTEMPT_WINDOW_MS;
  const failedCount = inWindow ? Number(previous.failedCount || 0) + 1 : 1;
  await db.collection(SECURITY_COLLECTION).doc(userId).set({
    data: {
      _openid: openid,
      failedCount,
      firstFailedAt: new Date(inWindow ? firstFailedAt : now),
      lastFailedAt: db.serverDate(),
      lockedUntil: failedCount >= MAX_FAILED_ATTEMPTS ? new Date(now + LOCK_DURATION_MS) : null,
      updatedAt: db.serverDate(),
    },
  });
}

async function login(event, context, userId) {
  await getActiveUser(userId);
  const config = await readConfig();
  if (config.adminUserIds.length && !config.adminUserIds.includes(userId)) {
    return { success: false, code: 'ADMIN_NOT_ALLOWED', message: '当前账号不在管理员白名单中' };
  }
  const previous = await checkRateLimit(userId);
  const key = cleanText(event.key, 128);
  const valid = Boolean(key) && constantTimeEqual(sha256(key), config.accessKeyHash);
  await recordLoginResult(userId, context.OPENID, previous, valid);
  if (!valid) return { success: false, code: 'INVALID_ADMIN_KEY', message: '管理密钥不正确' };
  const session = signToken(userId, config.accessKeyHash, config.sessionHours);
  return { success: true, ...session };
}

function toAdminPost(post) {
  const images = Array.isArray(post.images) ? post.images.filter(Boolean).slice(0, 4) : [];
  let location = '';
  if (typeof post.location === 'string') location = cleanText(post.location, 80);
  else if (post.location && typeof post.location.name === 'string') location = cleanText(post.location.name, 80);
  else location = cleanText(post.locationName, 80);
  return {
    id: post._id,
    authorName: post.authorName || '未知用户',
    avatar: post.avatar || '/static/miniprogram-icon-zju-bowl-144.png',
    category: post.category || 'food',
    content: cleanText(post.content, 500),
    image: post.image || images[0] || '',
    images,
    location,
    tags: Array.isArray(post.tags) ? post.tags.slice(0, 8) : [],
    status: post.post_status || post.status || 'published',
    createdAt: post.createdAt || null,
  };
}

async function listPosts(event) {
  const page = Math.max(Number(event.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 20, 1), 50);
  const query = db.collection(POSTS_COLLECTION).orderBy('createdAt', 'desc');
  const [result, countResult] = await Promise.all([
    query.skip((page - 1) * pageSize).limit(pageSize).get(),
    db.collection(POSTS_COLLECTION).count(),
  ]);
  return {
    success: true,
    posts: result.data.map(toAdminPost),
    total: countResult.total,
    hasMore: page * pageSize < countResult.total,
  };
}

async function listReports(event) {
  const page = Math.max(Number(event.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 20, 1), 50);
  const status = cleanText(event.status, 20) || 'pending';
  const condition = status === 'all' ? {} : { status };
  const [result, countResult] = await Promise.all([
    db.collection(REPORTS_COLLECTION).where(condition).orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize).limit(pageSize).get(),
    db.collection(REPORTS_COLLECTION).where(condition).count(),
  ]);
  const postIds = Array.from(new Set(result.data.map((item) => item.postId).filter(Boolean)));
  const postResult = postIds.length
    ? await db.collection(POSTS_COLLECTION).where({ _id: command.in(postIds) }).get()
    : { data: [] };
  const posts = Object.fromEntries(postResult.data.map((post) => [post._id, toAdminPost(post)]));
  const commentIds = Array.from(new Set(result.data.map((item) => item.commentId).filter(Boolean)));
  const commentResult = commentIds.length
    ? await db.collection(COMMENTS_COLLECTION).where({ _id: command.in(commentIds) }).get()
    : { data: [] };
  const comments = Object.fromEntries(commentResult.data.map((comment) => [comment._id, comment]));
  return {
    success: true,
    reports: result.data.map((report) => ({
      id: report._id,
      postId: report.postId,
      reason: cleanText(report.reason, 40),
      details: cleanText(report.details, 200),
      status: report.status || 'pending',
      targetType: report.targetType || (report.commentId ? 'comment' : 'post'),
      createdAt: report.createdAt || null,
      post: posts[report.postId] || null,
      targetContent: report.commentId
        ? cleanText(comments[report.commentId] && comments[report.commentId].content, 300)
        : cleanText(posts[report.postId] && posts[report.postId].content, 300),
    })),
    total: countResult.total,
    hasMore: page * pageSize < countResult.total,
  };
}

async function resolveReport(event, moderatorId, moderator) {
  const reportId = cleanId(event.reportId);
  const resolution = event.resolution === 'delete' ? 'delete' : 'dismiss';
  const report = await readDocument(REPORTS_COLLECTION, reportId);
  if (!report) return { success: true, resolved: true };
  if (resolution === 'delete' && report.targetType === 'comment' && report.commentId) {
    await db.collection(COMMENTS_COLLECTION).doc(report.commentId).update({
      data: { status: 'deleted', content: '', deletedAt: db.serverDate(), updatedAt: db.serverDate() },
    });
  } else if (resolution === 'delete' && report.postId) {
    await deletePost({ postId: report.postId, reason: `举报处理：${cleanText(report.reason, 40)}` }, moderatorId, moderator);
  }
  await db.collection(REPORTS_COLLECTION).doc(reportId).update({
    data: {
      status: resolution === 'delete' ? 'actioned' : 'dismissed',
      resolution,
      moderatorId,
      moderatorName: moderator.name || moderator.nickName || '管理员',
      resolvedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return { success: true, resolved: true, resolution };
}

async function migrateLegacyLikes(event) {
  const batchSize = 10;
  const page = Math.max(Number(event.page) || 1, 1);
  const result = await db.collection(POSTS_COLLECTION)
    .orderBy('_id', 'asc')
    .skip((page - 1) * batchSize)
    .limit(batchSize)
    .get();

  let migratedLikes = 0;
  let migratedPosts = 0;
  for (let index = 0; index < result.data.length; index += 1) {
    const post = result.data[index];
    if (Array.isArray(post.likers)) {
      const openids = Array.from(new Set(post.likers
        .map((openid) => cleanText(openid, 128))
        .filter(Boolean)));
      const userIds = Array.from(new Set(openids.map(getUserId)));
      // 旧字段只在迁移期间读取；新集合只保存哈希后的内部用户标识。
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(userIds.map((userId) => db.collection(POST_LIKES_COLLECTION).doc(getLikeId(post._id, userId)).set({
        data: {
          postId: post._id,
          userId,
          status: 'active',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
          deletedAt: null,
        },
      })));
      // eslint-disable-next-line no-await-in-loop
      await db.collection(POSTS_COLLECTION).doc(post._id).update({
        data: {
          likes: userIds.length,
          likers: command.remove(),
          updatedAt: db.serverDate(),
        },
      });
      migratedLikes += userIds.length;
      migratedPosts += 1;
    }
  }

  return {
    success: true,
    scannedPosts: result.data.length,
    migratedPosts,
    migratedLikes,
    hasMore: result.data.length === batchSize,
    nextPage: page + 1,
  };
}

async function deletePost(event, moderatorId, moderator) {
  const postId = cleanId(event.postId);
  if (!postId) return { success: false, code: 'INVALID_POST', message: '帖子信息无效' };
  const post = await readDocument(POSTS_COLLECTION, postId);
  if (!post) return { success: true, deleted: true };
  const reason = cleanText(event.reason, 120) || '管理员删除';
  const logResult = await db.collection(LOGS_COLLECTION).add({
    data: {
      action: 'delete_post',
      status: 'pending',
      moderatorId,
      moderatorName: moderator.name || moderator.nickName || '管理员',
      postId,
      reason,
      postSnapshot: toAdminPost(post),
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  try {
    await Promise.all([
      removeWhereIfPresent(COMMENTS_COLLECTION, { postId }),
      removeWhereIfPresent(POST_LIKES_COLLECTION, { postId }),
      removeWhereIfPresent(POST_FAVORITES_COLLECTION, { postId }),
      removeWhereIfPresent(HIDDEN_POSTS_COLLECTION, { postId }),
      removeWhereIfPresent(POLL_VOTES_COLLECTION, { postId }),
      removeWhereIfPresent(MESSAGES_COLLECTION, { postId }),
      removeWhereIfPresent(HISTORY_COLLECTION, { targetId: postId }),
    ]);
    await db.collection(POSTS_COLLECTION).doc(postId).remove();
    const images = Array.from(new Set([
      ...(Array.isArray(post.images) ? post.images : []),
      post.image,
    ].filter((fileID) => /^cloud:\/\//.test(fileID))));
    if (images.length) {
      try {
        await cloud.deleteFile({ fileList: images });
      } catch (error) {
        console.warn('帖子已删除，但云存储图片清理失败', error);
      }
    }
    const authorId = post.authorId || post.userId || '';
    if (authorId) {
      try {
        const countResult = await db.collection(POSTS_COLLECTION).where({ userId: authorId }).count();
        await db.collection(USERS_COLLECTION).doc(authorId).update({
          data: { postCount: countResult.total, updatedAt: db.serverDate() },
        });
      } catch (error) {
        console.warn('同步用户帖子数量失败', error);
      }
    }
    await db.collection(LOGS_COLLECTION).doc(logResult._id).update({
      data: { status: 'completed', completedAt: db.serverDate(), updatedAt: db.serverDate() },
    });
    return { success: true, deleted: true, postId };
  } catch (error) {
    await db.collection(LOGS_COLLECTION).doc(logResult._id).update({
      data: { status: 'failed', errorMessage: cleanText(error.errMsg || error.message, 200), updatedAt: db.serverDate() },
    });
    throw error;
  }
}

exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext();
    if (!context.OPENID) return { success: false, code: 'LOGIN_REQUIRED', message: '无法获取当前微信身份' };
    const userId = getUserId(context.OPENID);
    if (event.action === 'login') return await login(event, context, userId);

    const config = await readConfig();
    const moderator = await getActiveUser(userId);
    if (config.adminUserIds.length && !config.adminUserIds.includes(userId)) {
      return { success: false, code: 'ADMIN_NOT_ALLOWED', message: '当前账号不在管理员白名单中' };
    }
    if (!verifyToken(event.token, userId, config.accessKeyHash)) {
      return { success: false, code: 'ADMIN_SESSION_INVALID', message: '管理会话已失效，请重新输入密钥' };
    }
    if (event.action === 'listPosts') return await listPosts(event);
    if (event.action === 'listReports') return await listReports(event);
    if (event.action === 'resolveReport') return await resolveReport(event, userId, moderator);
    if (event.action === 'migrateLegacyLikes') return await migrateLegacyLikes(event);
    if (event.action === 'deletePost') return await deletePost(event, userId, moderator);
    return { success: false, code: 'UNSUPPORTED_ACTION', message: '不支持的管理操作' };
  } catch (error) {
    return {
      success: false,
      code: error.code || 'ADMIN_SERVICE_ERROR',
      message: error.errMsg || error.message || '社区管理服务暂时不可用',
    };
  }
};

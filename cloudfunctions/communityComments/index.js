const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COMMENTS_COLLECTION = 'comments';
const USERS_COLLECTION = 'users';
const POSTS_COLLECTION = 'posts';
const MESSAGES_COLLECTION = 'messages';
const MAX_CONTENT_LENGTH = 300;

function getUserId(openid) {
  return crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32);
}

function cleanContent(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s{3,}/g, '  ').slice(0, MAX_CONTENT_LENGTH);
}

function cleanId(value, maxLength = 64) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_:-]+$/.test(id) && id.length <= maxLength ? id : '';
}

function toTimestamp(value) {
  const date = value && value.$date ? new Date(value.$date) : new Date(value || 0);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function enforceCommentRateLimit(userId) {
  await db.runTransaction(async (transaction) => {
    const userRef = transaction.collection(USERS_COLLECTION).doc(userId);
    const user = (await userRef.get()).data;
    const now = Date.now();
    const startedAt = toTimestamp(user.commentWindowStartedAt);
    const inWindow = startedAt && now - startedAt < 10 * 60 * 1000;
    const count = inWindow ? Number(user.commentWindowCount || 0) : 0;
    if (count >= 20) {
      const error = new Error('评论较频繁，请稍后再试');
      error.code = 'RATE_LIMITED';
      throw error;
    }
    await userRef.update({
      data: {
        commentWindowStartedAt: new Date(inWindow ? startedAt : now),
        commentWindowCount: count + 1,
        updatedAt: db.serverDate(),
      },
    });
  });
}

function toPublicComment(comment, currentUserId) {
  return {
    id: comment._id,
    postId: comment.postId,
    userId: comment.userId,
    authorName: comment.authorName || 'zjuer_同学',
    authorImage: comment.authorImage || '/static/miniprogram-icon-zju-bowl-144.png',
    content: comment.content,
    parentId: comment.parentId || '',
    replyToName: comment.replyToName || '',
    createdAt: comment.createdAt,
    isMine: comment.userId === currentUserId,
  };
}

async function readUser(userId) {
  try {
    const result = await db.collection(USERS_COLLECTION).doc(userId).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
}

async function getPublishedCount(postId) {
  const result = await db.collection(COMMENTS_COLLECTION).where({
    postId,
    status: 'published',
  }).count();
  return result.total;
}

async function listComments(event, currentUserId) {
  const postId = cleanId(event.postId);
  if (!postId) return { success: false, message: '帖子 ID 无效' };

  const page = Math.max(Number(event.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 30, 1), 50);
  const query = db.collection(COMMENTS_COLLECTION).where({
    postId,
    status: 'published',
  });
  const [listResult, countResult] = await Promise.all([
    query.orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get(),
    query.count(),
  ]);

  return {
    success: true,
    comments: listResult.data.map((comment) => toPublicComment(comment, currentUserId)),
    total: countResult.total,
    hasMore: page * pageSize < countResult.total,
  };
}

async function createComment(event, context, currentUserId) {
  const postId = cleanId(event.postId);
  const content = cleanContent(event.content);
  if (!postId) return { success: false, message: '帖子 ID 无效' };
  if (!content) return { success: false, message: '评论内容不能为空' };

  const user = await readUser(currentUserId);
  if (!user || user.status !== 'active') {
    return { success: false, code: 'LOGIN_REQUIRED', message: '请先登录后再发表评论' };
  }
  await enforceCommentRateLimit(currentUserId);

  try {
    const post = (await db.collection(POSTS_COLLECTION).doc(postId).get()).data;
    const status = post && (post.post_status || post.status || 'published');
    if (!post || !['published', 'active'].includes(status)) throw new Error('帖子不可评论');
  } catch (error) {
    return { success: false, code: 'POST_NOT_FOUND', message: '帖子不存在或暂不可评论' };
  }

  const securityResult = await cloud.openapi.security.msgSecCheck({
    openid: context.OPENID,
    scene: 2,
    version: 2,
    content,
  });
  if (securityResult && securityResult.result && securityResult.result.suggest === 'risky') {
    return { success: false, code: 'CONTENT_RISKY', message: '评论可能包含不适宜信息，请修改后重试' };
  }

  let parentId = cleanId(event.parentId);
  let replyToName = '';
  let replyToUserId = '';
  if (parentId) {
    try {
      const parentResult = await db.collection(COMMENTS_COLLECTION).doc(parentId).get();
      const parent = parentResult.data;
      if (!parent || parent.postId !== postId || parent.status !== 'published') parentId = '';
      else {
        replyToName = parent.authorName || '';
        replyToUserId = parent.userId || '';
      }
    } catch (error) {
      parentId = '';
    }
  }

  const addResult = await db.collection(COMMENTS_COLLECTION).add({
    data: {
      _openid: context.OPENID,
      postId,
      userId: currentUserId,
      authorName: user.name || 'zjuer_同学',
      authorImage: user.image || '/static/miniprogram-icon-zju-bowl-144.png',
      content,
      parentId,
      replyToName,
      replyToUserId,
      status: 'published',
      likeCount: 0,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  const createdResult = await db.collection(COMMENTS_COLLECTION).doc(addResult._id).get();
  const total = await getPublishedCount(postId);

  try {
    let targetOpenid = '';
    let targetUserId = '';
    if (parentId) {
      const parent = (await db.collection(COMMENTS_COLLECTION).doc(parentId).get()).data;
      targetOpenid = parent._openid || '';
      targetUserId = parent.userId || '';
    } else {
      const post = (await db.collection(POSTS_COLLECTION).doc(postId).get()).data;
      targetOpenid = post._openid || '';
      targetUserId = post.authorId || post.userId || '';
    }
    if (targetOpenid && targetUserId !== currentUserId) {
      await db.collection(MESSAGES_COLLECTION).add({
        data: {
          _openid: targetOpenid,
          category: 'like_comment',
          senderName: user.name || '一位同学',
          senderAvatar: user.image || '/static/miniprogram-icon-zju-bowl-144.png',
          actorUserId: currentUserId,
          postId,
          action: parentId ? '回复了你的评论' : '评论了你的动态',
          content: content.slice(0, 80),
          targetDesc: content.slice(0, 80),
          read: false,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
    }
  } catch (error) {
    console.warn('评论成功，但消息通知写入失败', error);
  }

  return {
    success: true,
    comment: toPublicComment(createdResult.data, currentUserId),
    total,
  };
}

async function removeComment(event, currentUserId) {
  const commentId = cleanId(event.commentId);
  if (!commentId) return { success: false, message: '评论 ID 无效' };

  let comment;
  try {
    const result = await db.collection(COMMENTS_COLLECTION).doc(commentId).get();
    comment = result.data;
  } catch (error) {
    return { success: false, message: '评论不存在或已被删除' };
  }
  if (comment.userId !== currentUserId) {
    return { success: false, message: '只能删除自己发布的评论' };
  }

  await db.collection(COMMENTS_COLLECTION).doc(commentId).update({
    data: {
      status: 'deleted',
      content: '',
      updatedAt: db.serverDate(),
      deletedAt: db.serverDate(),
    },
  });
  const total = await getPublishedCount(comment.postId);
  return { success: true, total };
}

async function getCounts(event) {
  const postIds = Array.from(new Set((event.postIds || []).map((id) => cleanId(id)).filter(Boolean))).slice(0, 20);
  const entries = await Promise.all(postIds.map(async (postId) => [postId, await getPublishedCount(postId)]));
  const counts = entries.reduce((result, [postId, total]) => {
    result[postId] = total;
    return result;
  }, {});
  return { success: true, counts };
}

exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext();
    const currentUserId = context.OPENID ? getUserId(context.OPENID) : '';

    if (event.action === 'list') return await listComments(event, currentUserId);
    if (event.action === 'create') return await createComment(event, context, currentUserId);
    if (event.action === 'remove') return await removeComment(event, currentUserId);
    if (event.action === 'counts') return await getCounts(event);
    return { success: false, message: '不支持的评论操作' };
  } catch (error) {
    const message = error.errMsg || error.message || '评论服务暂时不可用';
    const collectionMissing = /collection.*not exist|集合.*不存在|-502005/i.test(message);
    return {
      success: false,
      code: error.code || (collectionMissing ? 'COMMENTS_NOT_READY' : 'COMMENTS_FAILED'),
      message: collectionMissing ? '请先在云开发数据库中创建 comments 集合' : message,
    };
  }
};

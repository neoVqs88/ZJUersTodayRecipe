const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COMMENTS_COLLECTION = 'comments';
const USERS_COLLECTION = 'users';
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
      message: collectionMissing ? '请先在云开发数据库中创建 comments 集合' : message,
    };
  }
};

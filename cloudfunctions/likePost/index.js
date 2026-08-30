const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const POSTS_COLLECTION = 'posts';
const LIKES_COLLECTION = 'postLikes';
const USERS_COLLECTION = 'users';
const MESSAGES_COLLECTION = 'messages';
const MAX_STATE_POSTS = 20;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getUserId(openid) {
  return sha256(openid).slice(0, 32);
}

function getLikeId(postId, userId) {
  return sha256(`post-like:${postId}:${userId}`).slice(0, 32);
}

function cleanId(value, maxLength = 80) {
  const id = String(value || '').trim();
  return id && id.length <= maxLength && /^[a-zA-Z0-9_:-]+$/.test(id) ? id : '';
}

function isPublished(post) {
  const status = post && (post.post_status || post.status || 'published');
  return status === 'published' || status === 'active';
}

async function readUser(userId) {
  try {
    const result = await db.collection(USERS_COLLECTION).doc(userId).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
}

async function requireActiveUser(userId) {
  const user = await readUser(userId);
  if (!user || user.status !== 'active') {
    const error = new Error('请先登录后再点赞');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  return user;
}

async function readLike(transaction, likeId) {
  try {
    const result = await transaction.collection(LIKES_COLLECTION).doc(likeId).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
}

async function toggleLike(event, userId, user) {
  const postId = cleanId(event.postId);
  if (!postId) {
    const error = new Error('帖子信息无效');
    error.code = 'INVALID_POST';
    throw error;
  }
  const likeId = getLikeId(postId, userId);
  const result = await db.runTransaction(async (transaction) => {
    const postRef = transaction.collection(POSTS_COLLECTION).doc(postId);
    let post;
    try {
      post = (await postRef.get()).data;
    } catch (error) {
      const notFound = new Error('帖子不存在或已被删除');
      notFound.code = 'POST_NOT_FOUND';
      throw notFound;
    }
    if (!post || !isPublished(post)) {
      const unavailable = new Error('帖子不存在或当前不可点赞');
      unavailable.code = 'POST_UNAVAILABLE';
      throw unavailable;
    }

    const likeRef = transaction.collection(LIKES_COLLECTION).doc(likeId);
    const existing = await readLike(transaction, likeId);
    const wasActive = Boolean(existing && existing.status === 'active');
    const liked = !wasActive;
    const currentLikes = Math.max(Number(post.likes) || 0, 0);
    const likes = liked ? currentLikes + 1 : Math.max(currentLikes - 1, 0);

    await likeRef.set({
      data: {
        postId,
        userId,
        status: liked ? 'active' : 'deleted',
        createdAt: existing ? existing.createdAt || db.serverDate() : db.serverDate(),
        updatedAt: db.serverDate(),
        deletedAt: liked ? null : db.serverDate(),
      },
    });
    await postRef.update({ data: { likes, updatedAt: db.serverDate() } });
    return { liked, likes, post };
  });

  const authorId = result.post.authorId || result.post.userId || '';
  if (result.liked && authorId !== userId && result.post._openid) {
    try {
      await db.collection(MESSAGES_COLLECTION).add({
        data: {
          _openid: result.post._openid,
          category: 'like_comment',
          senderName: user.name || '一位同学',
          senderAvatar: user.image || '/static/miniprogram-icon-zju-bowl-144.png',
          actorUserId: userId,
          postId,
          action: '赞了你的动态',
          content: '',
          targetDesc: String(result.post.content || result.post.dish || '校园美食分享').slice(0, 80),
          read: false,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
    } catch (error) {
      console.warn('点赞成功，但消息通知写入失败', error);
    }
  }

  return { success: true, liked: result.liked, likes: result.likes };
}

async function getLikeStates(event, userId) {
  const postIds = Array.from(new Set((event.postIds || []).map((id) => cleanId(id)).filter(Boolean))).slice(0, MAX_STATE_POSTS);
  const entries = await Promise.all(postIds.map(async (postId) => {
    try {
      const like = (await db.collection(LIKES_COLLECTION).doc(getLikeId(postId, userId)).get()).data;
      return [postId, Boolean(like && like.status === 'active')];
    } catch (error) {
      return [postId, false];
    }
  }));
  const states = entries.reduce((result, [postId, liked]) => {
    result[postId] = liked;
    return result;
  }, {});
  return { success: true, states };
}

exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext();
    if (!context.OPENID) return { success: false, code: 'LOGIN_REQUIRED', message: '无法获取当前微信身份' };
    const userId = getUserId(context.OPENID);
    const user = await requireActiveUser(userId);
    if (event.action === 'states') return await getLikeStates(event, userId);
    if (!event.action || event.action === 'toggle') return await toggleLike(event, userId, user);
    return { success: false, code: 'UNSUPPORTED_ACTION', message: '不支持的点赞操作' };
  } catch (error) {
    const message = error.errMsg || error.message || '点赞服务暂时不可用';
    const collectionMissing = /collection.*postLikes.*not exist|postLikes.*不存在|-502005/i.test(message);
    return {
      success: false,
      code: error.code || 'LIKE_SERVICE_ERROR',
      message: collectionMissing ? '请先在云数据库中创建 postLikes 集合' : message,
    };
  }
};

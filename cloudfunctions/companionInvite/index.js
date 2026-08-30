const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const POSTS_COLLECTION = 'posts';
const USERS_COLLECTION = 'users';
const MESSAGES_COLLECTION = 'messages';

function getUserId(openid) {
  return crypto.createHash('sha256').update(String(openid)).digest('hex').slice(0, 32);
}

function cleanId(value, maxLength = 64) {
  const id = String(value || '').trim();
  return id && id.length <= maxLength && /^[a-zA-Z0-9_:-]+$/.test(id) ? id : '';
}

function cleanCount(value, fallback) {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) ? Math.min(Math.max(count, 1), 20) : fallback;
}

async function readUser(userId) {
  try {
    const result = await db.collection(USERS_COLLECTION).doc(userId).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
}

async function joinCompanionPost(postId, currentUserId, currentUser, openid) {
  const transactionResult = await db.runTransaction(async (transaction) => {
    const postRef = transaction.collection(POSTS_COLLECTION).doc(postId);
    const result = await postRef.get();
    const post = result.data;
    if (!post || post.category !== 'companion' || !['published', 'active', undefined].includes(post.post_status || post.status)) {
      const error = new Error('该约饭帖子不存在或已结束');
      error.code = 'POST_UNAVAILABLE';
      throw error;
    }

    const authorId = post.authorId || post.userId || '';
    if (post._openid === openid || authorId === currentUserId) {
      const error = new Error('发起人无需重复报名自己的约饭');
      error.code = 'IS_AUTHOR';
      throw error;
    }

    const minParticipants = cleanCount(post.minParticipants, 2);
    const maxParticipants = Math.max(minParticipants, cleanCount(post.maxParticipants, 4));
    const participantIds = Array.isArray(post.participantIds) ? post.participantIds.filter(Boolean) : [];
    const normalizedIds = Array.from(new Set(authorId ? [authorId, ...participantIds] : participantIds));
    if (normalizedIds.includes(currentUserId)) {
      return {
        joined: true,
        alreadyJoined: true,
        participantCount: Math.max(normalizedIds.length, cleanCount(post.participantCount, 1)),
        minParticipants,
        maxParticipants,
        post,
      };
    }

    const participantCount = Math.max(normalizedIds.length, cleanCount(post.participantCount, 1));
    if (participantCount >= maxParticipants) {
      const error = new Error('这场约饭已经报满啦');
      error.code = 'COMPANION_FULL';
      throw error;
    }

    const nextParticipantIds = [...normalizedIds, currentUserId];
    const nextCount = participantCount + 1;
    await postRef.update({
      data: {
        participantIds: nextParticipantIds,
        participantCount: nextCount,
        updatedAt: db.serverDate(),
      },
    });
    return {
      joined: true,
      alreadyJoined: false,
      participantCount: nextCount,
      minParticipants,
      maxParticipants,
      post,
    };
  });

  if (!transactionResult.alreadyJoined && transactionResult.post._openid) {
    try {
      const { post } = transactionResult;
      await db.collection(MESSAGES_COLLECTION).add({
        data: {
          _openid: post._openid,
          category: 'invite',
          senderName: currentUser.name || '一位同学',
          senderAvatar: currentUser.image || '/static/miniprogram-icon-zju-bowl-144.png',
          action: '报名参加了你的约饭',
          content: String(post.content || '').slice(0, 80),
          targetDesc: post.location || `预计 ${transactionResult.minParticipants}-${transactionResult.maxParticipants} 人`,
          postId,
          actorUserId: currentUserId,
          read: false,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
    } catch (error) {
      console.warn('约饭报名成功，但消息通知写入失败', error);
    }
  }

  return {
    success: true,
    joined: true,
    alreadyJoined: transactionResult.alreadyJoined,
    participantCount: transactionResult.participantCount,
    minParticipants: transactionResult.minParticipants,
    maxParticipants: transactionResult.maxParticipants,
    full: transactionResult.participantCount >= transactionResult.maxParticipants,
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return { success: false, code: 'LOGIN_REQUIRED', message: '请先登录后再参加约饭' };
    const currentUserId = getUserId(OPENID);
    const currentUser = await readUser(currentUserId);
    if (!currentUser || currentUser.status !== 'active') {
      return { success: false, code: 'LOGIN_REQUIRED', message: '请先登录后再参加约饭' };
    }
    const postId = cleanId(event.postId);
    if (!postId) return { success: false, code: 'INVALID_POST', message: '帖子信息无效' };
    if (event.action === 'join') return await joinCompanionPost(postId, currentUserId, currentUser, OPENID);
    return { success: false, code: 'UNSUPPORTED_ACTION', message: '不支持的约饭操作' };
  } catch (error) {
    return {
      success: false,
      code: error.code || 'COMPANION_SERVICE_ERROR',
      message: error.errMsg || error.message || '约饭报名失败，请稍后重试',
    };
  }
};

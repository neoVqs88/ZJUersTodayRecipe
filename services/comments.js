async function callComments(action, data = {}) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }

  const response = await wx.cloud.callFunction({
    name: 'communityComments',
    data: { action, ...data },
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || '评论服务暂时不可用');
    error.code = result.code || '';
    throw error;
  }
  return result;
}

export function fetchComments(postId, page = 1, pageSize = 30) {
  return callComments('list', {
    postId: String(postId),
    page,
    pageSize,
  });
}

export function createComment(postId, content, parentId = '') {
  return callComments('create', {
    postId: String(postId),
    content,
    parentId,
  });
}

export function removeComment(commentId) {
  return callComments('remove', { commentId });
}

export function fetchCommentCounts(postIds) {
  return callComments('counts', {
    postIds: postIds.map((postId) => String(postId)),
  });
}

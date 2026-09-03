function createError(result, fallback) {
  const error = new Error(result.message || fallback);
  error.code = result.code || '';
  return error;
}

async function callCommunityPosts(action, data = {}) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }
  const response = await wx.cloud.callFunction({
    name: 'communityPosts',
    data: { action, ...data },
  });
  const result = response.result || {};
  if (!result.success) throw createError(result, '社区服务暂时不可用');
  return result;
}

export function publishPost(post) {
  return callCommunityPosts('publish', { post });
}

export function fetchPublicPosts(page = 0, pageSize = 20) {
  return callCommunityPosts('listPublic', { page, pageSize });
}

export function fetchPublicPost(postId) {
  return callCommunityPosts('getPublic', { postId });
}

export function fetchCommunityStates(postIds) {
  return callCommunityPosts('states', { postIds });
}

export function togglePostFavorite(postId) {
  return callCommunityPosts('toggleFavorite', { postId });
}

export function hidePost(postId) {
  return callCommunityPosts('hidePost', { postId });
}

export function reportPost(postId, reason, details = '') {
  return callCommunityPosts('report', { postId, reason, details });
}

export function reportComment(commentId, reason, details = '') {
  return callCommunityPosts('reportComment', { commentId, reason, details });
}

export function fetchFavoritePosts(page = 1, pageSize = 20) {
  return callCommunityPosts('listFavorites', { page, pageSize });
}

export function submitFeedback(content, contact = '') {
  return callCommunityPosts('feedback', { content, contact });
}

export function fetchDishFavoriteState(dishId) {
  return callCommunityPosts('dishFavoriteState', { dishId });
}

export function toggleDishFavorite(dishId) {
  return callCommunityPosts('toggleDishFavorite', { dishId });
}

export function fetchPollState(postId) {
  return callCommunityPosts('pollState', { postId });
}

export function voteInPoll(postId, optionIndex) {
  return callCommunityPosts('votePoll', { postId, optionIndex });
}

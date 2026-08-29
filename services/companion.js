import { handleAuthError } from '~/services/auth';

export async function joinCompanionPost(postId) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前基础库不支持云开发，请升级微信或开发者工具');
  }
  const response = await wx.cloud.callFunction({
    name: 'companionInvite',
    data: { action: 'join', postId: String(postId || '') },
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || '约饭报名失败');
    error.code = result.code || '';
    handleAuthError(error);
    throw error;
  }
  return result;
}

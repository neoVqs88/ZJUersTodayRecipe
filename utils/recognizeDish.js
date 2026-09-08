import { getCurrentUser } from '~/services/auth';

function createRecognitionError(message, code, cause) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

export default async function recognizeDish() {
  const choose = await wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sizeType: ['compressed'],
  });
  const tempFile = choose.tempFiles && choose.tempFiles[0];
  if (!tempFile || !tempFile.tempFilePath) {
    throw createRecognitionError('没有获取到图片，请重新选择', 'INVALID_IMAGE');
  }

  wx.showLoading({ title: '识别中…', mask: true });
  let fileID = '';
  try {
    const currentUser = getCurrentUser() || {};
    if (!currentUser.id) throw createRecognitionError('登录状态无效，请重新登录', 'LOGIN_REQUIRED');

    try {
      const up = await wx.cloud.uploadFile({
        cloudPath: `dish-recognize/${currentUser.id}/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`,
        filePath: tempFile.tempFilePath,
      });
      fileID = up.fileID;
      if (!fileID) throw createRecognitionError('图片上传失败，请检查网络后重试', 'UPLOAD_FAILED');
    } catch (error) {
      throw createRecognitionError('图片上传失败，请检查网络后重试', 'UPLOAD_FAILED', error);
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'recognizeDish',
        data: { fileID },
      });
      const result = res.result || {};
      if (!result.success) {
        await wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {});
        return result;
      }
      if (!Array.isArray(result.dishes) || !result.dishes.length) {
        await wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {});
        return { success: false, code: 'EMPTY_RESULT', message: '没有识别到菜品，请换一张清晰图片重试' };
      }
      return { ...result, fileID };
    } catch (error) {
      await wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {});
      if (error.code === 'EMPTY_RESULT') return { success: false, code: error.code, message: error.message };
      const rawMessage = error.errMsg || error.message || '';
      const message = /timeout/i.test(rawMessage)
        ? '识别请求超时，请稍后重试'
        : `识别请求失败（${error.errCode || error.code || 'UNKNOWN'}）：${rawMessage.slice(0, 80) || '请检查网络或稍后重试'}`;
      console.error('recognizeDish call failed', error);
      throw createRecognitionError(message, 'RECOGNITION_FAILED', error);
    }
  } finally {
    wx.hideLoading();
  }
}

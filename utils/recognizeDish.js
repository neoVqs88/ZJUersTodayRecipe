export default async function recognizeDish() {
  const choose = await wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sizeType: ['compressed'],
  });
  const { tempFilePath } = choose.tempFiles[0];

  wx.showLoading({ title: '识别中…', mask: true });
  try {
    const up = await wx.cloud.uploadFile({
      cloudPath: `dish-recognize/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`,
      filePath: tempFilePath,
    });

    try {
      const res = await wx.cloud.callFunction({
        name: 'recognizeDish',
        data: { fileID: up.fileID },
      });
      const result = res.result || {};
      if (!result.success) {
        await wx.cloud.deleteFile({ fileList: [up.fileID] }).catch(() => {});
        return result;
      }
      return { ...result, fileID: up.fileID };
    } catch (error) {
      await wx.cloud.deleteFile({ fileList: [up.fileID] }).catch(() => {});
      throw error;
    }
  } finally {
    wx.hideLoading();
  }
}

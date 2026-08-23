// 菜品识别助手：选图 → 上传云存储 → 调云函数 → 返回候选菜名
// 在任何页面里 import 后调用即可，用法见文件底部注释
export default async function recognizeDish() {
  // 1. 让用户拍照或从相册选一张（直接用压缩图，更快更省流量）
  const choose = await wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sizeType: ['compressed'],
  });
  const tempFilePath = choose.tempFiles[0].tempFilePath;

  wx.showLoading({ title: '识别中…', mask: true });
  try {
    // 2. 图片上传到云存储，换取 fileID
    const up = await wx.cloud.uploadFile({
      cloudPath: `dish-recognize/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`,
      filePath: tempFilePath,
    });

    // 3. 调云函数识别，返回 { success, dishes: [{ name, probability, calorie }, ...] }
    const res = await wx.cloud.callFunction({
      name: 'recognizeDish',
      data: { fileID: up.fileID },
    });
    return res.result;
  } finally {
    wx.hideLoading();
  }
}

/*
在任意页面中这样使用：

import recognizeDish from '../../utils/recognizeDish';

Page({
  async onTapRecognize() {
    const r = await recognizeDish();
    if (r.success && r.dishes.length) {
      console.log('最可能的菜名：', r.dishes[0].name, '置信度：', r.dishes[0].probability);
      // 候选列表 r.dishes 按置信度从高到低排列，可以让用户从里面挑一个
    } else {
      console.log('识别失败：', r.message);
    }
  },
});
*/

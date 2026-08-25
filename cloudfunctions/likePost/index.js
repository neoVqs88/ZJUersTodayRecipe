// 云函数：点赞/取消点赞一条动态
// 为什么必须走云函数：点赞要修改"别人的"动态记录（计数 + 点赞者列表），
// 还要往"别人"的收件箱写消息——跨用户写入只有管理员权限的云函数能做
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext(); // 点赞者的身份
  const { postId } = event;
  if (!postId) return { success: false, message: '缺少 postId' };

  const postRes = await db.collection('posts').doc(postId).get();
  const post = postRes.data;
  const hasLiked = (post.likers || []).includes(OPENID);

  if (hasLiked) {
    // 取消点赞：计数 -1，把自己移出点赞者列表
    await db.collection('posts').doc(postId).update({
      data: { likes: _.inc(-1), likers: _.pull(OPENID) },
    });
    return { success: true, liked: false, likes: post.likes - 1 };
  }

  // 点赞：计数 +1，把自己加入点赞者列表
  await db.collection('posts').doc(postId).update({
    data: { likes: _.inc(1), likers: _.push(OPENID) },
  });

  // 给作者写一条"点赞与评论"消息（自己赞自己就不发了）
  if (post._openid !== OPENID) {
    await db.collection('messages').add({
      data: {
        _openid: post._openid, // 注意：写进的是"作者"的收件箱
        category: 'like_comment',
        senderName: `同学${OPENID.slice(-4)}`, // 还没有昵称系统，先用 openid 尾号代替
        action: '赞了你的动态',
        content: '',
        targetDesc: post.dish,
        read: false,
        createdAt: new Date(),
      },
    });
  }

  return { success: true, liked: true, likes: post.likes + 1 };
};

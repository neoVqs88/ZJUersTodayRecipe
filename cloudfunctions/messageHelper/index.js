// 云函数：数据助手（开发调试用）
// action=seed：给"当前调用者"重置示例数据（消息 + 动态）
// 真实场景的消息写入（如"别人给你点赞"）由 likePost 等业务云函数完成
const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const now = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// 示例消息事件（B 站式的通知流：多个发送者、多个分类）
const SAMPLE_MESSAGES = [
  { category: 'like_comment', senderName: '小鹿爱吃饭', action: '赞了你的照片', content: '', targetDesc: '桂花糖藕', read: false, createdAt: new Date(now - 2 * HOUR) },
  { category: 'like_comment', senderName: '干饭小王子', action: '评论了你', content: '求定位！看着也太香了', targetDesc: '红烧牛肉面', read: false, createdAt: new Date(now - 5 * HOUR) },
  { category: 'invite', senderName: '小周同学', action: '邀请你一起吃午餐', content: '明天中午有空吗？一起去尝尝', targetDesc: '风味窗口 · 黄焖鸡米饭', read: false, createdAt: new Date(now - DAY) },
  { category: 'system', senderName: '系统通知', action: '本周打卡进度更新', content: '你已完成本周打卡，继续加油！', targetDesc: '', read: true, createdAt: new Date(now - 6 * HOUR) },
  { category: 'activity', senderName: '活动通知', action: '「寻找饭搭子」春日活动开始啦！', content: '参与抽奖赢取美食优惠券', targetDesc: '', read: true, createdAt: new Date(now - 3 * DAY) },
];

// 示例动态（author 就是调用者自己，这样队友给你点赞时你能收到真消息）
const SAMPLE_POSTS = [
  { category: 'food', authorName: '我', level: 1, avatar: '/static/avatar1.png', content: '今天发现玉泉一食堂的卤味窗口，鸡腿很入味，配上青菜和米饭刚刚好！', dish: '招牌卤味饭', visualDesc: '咸香入味 · 荤素搭配', emoji: '🍗', tone: 'orange', location: '玉泉一食堂', tags: ['食堂新发现', '卤味'], likes: 0, likers: [], commentsCount: 0, createdAt: new Date(now - 2 * HOUR) },
  { category: 'explore', authorName: '我', level: 1, avatar: '/static/avatar1.png', content: '怡膳堂二楼玫瑰简餐打卡！出餐很快，今天的套餐清爽又不会吃不饱。', dish: '玫瑰简餐', visualDesc: '快捷简餐 · 清爽均衡', emoji: '🍱', tone: 'green', location: '怡膳堂二楼', tags: ['探店打卡', '玫瑰简餐'], likes: 0, likers: [], commentsCount: 0, createdAt: new Date(now - 5 * HOUR) },
  { category: 'companion', authorName: '我', level: 1, avatar: '/static/avatar1.png', content: '今晚六点想去靓园吃饭，有没有同学一起拼桌？口味都可以，轻松聊天就好～', dish: '晚餐拼桌', visualDesc: '今天 18:00 · 还差 2 人', emoji: '👥', tone: 'blue', location: '靓园', tags: ['约饭拼桌', '晚餐'], likes: 0, likers: [], commentsCount: 0, createdAt: new Date(now - DAY) },
];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext(); // 调用者的身份标识，云函数自动能拿到

  if (event.action === 'seed') {
    const userId = crypto.createHash('sha256').update(String(OPENID)).digest('hex').slice(0, 32);
    let user = {};
    try {
      user = (await db.collection('users').doc(userId).get()).data || {};
    } catch (error) {
      // 尚未创建用户资料时继续使用示例昵称和头像。
    }
    // 清掉自己的旧数据，防止每点一次就多一堆
    await db.collection('messages').where({ _openid: OPENID }).remove();
    await db.collection('posts').where({ _openid: OPENID }).remove();
    // 逐条插入，_openid 显式指定为调用者（这样他在前端才能查到）
    const messageTasks = SAMPLE_MESSAGES.map((item) => db.collection('messages').add({
      data: { ...item, _openid: OPENID },
    }));
    const postTasks = SAMPLE_POSTS.map((item) => db.collection('posts').add({
      data: {
        ...item,
        _openid: OPENID,
        userId,
        authorId: userId,
        authorName: user.name || item.authorName,
        avatar: user.image || item.avatar,
      },
    }));
    await Promise.all([...messageTasks, ...postTasks]);
    return { success: true, count: SAMPLE_MESSAGES.length + SAMPLE_POSTS.length };
  }

  return { success: false, message: '未知的 action' };
};

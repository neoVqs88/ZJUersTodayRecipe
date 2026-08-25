// 云函数：消息助手
// 本期用途：给"当前调用者"生成一批示例消息（开发调试用）
// 数据模型：一条记录 = 一个具体的消息事件（谁、做了什么、内容、时间、已读否、所属分类）
// 将来真实场景的写入（如"别人给你点赞"触发通知）同样由云函数以管理员权限写库，
// 因为只有云函数才能把消息写进"别人"的收件箱（指定 _openid）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const now = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// 示例消息事件（模拟 B 站式的通知流：多个发送者、多个分类）
const SAMPLES = [
  // 互动 · 点赞与评论
  { category: 'like_comment', senderName: '小鹿爱吃饭', action: '赞了你的照片', content: '', targetDesc: '桂花糖藕', read: false, createdAt: new Date(now - 2 * HOUR) },
  { category: 'like_comment', senderName: '干饭小王子', action: '评论了你', content: '求定位！看着也太香了', targetDesc: '红烧牛肉面', read: false, createdAt: new Date(now - 5 * HOUR) },
  { category: 'like_comment', senderName: '小鹿爱吃饭', action: '评论了你', content: '下次一起去吃这家！', targetDesc: '桂花糖藕', read: false, createdAt: new Date(now - DAY) },
  // 互动 · 饭搭子邀约
  { category: 'invite', senderName: '小周同学', action: '邀请你一起吃午餐', content: '明天中午有空吗？一起去尝尝', targetDesc: '风味窗口 · 黄焖鸡米饭', read: false, createdAt: new Date(now - DAY - 3 * HOUR) },
  // 系统类
  { category: 'system', senderName: '系统通知', action: '本周打卡进度更新', content: '你已完成 3/21 天打卡，继续加油！', targetDesc: '', read: true, createdAt: new Date(now - 6 * HOUR) },
  { category: 'checkin', senderName: '打卡提醒', action: '午餐打卡时间到啦 ☀️', content: '记得记录今天的美食，保持好习惯～', targetDesc: '', read: true, createdAt: new Date(now - DAY - 6 * HOUR) },
  { category: 'activity', senderName: '活动通知', action: '「寻找饭搭子」春日活动开始啦！', content: '参与抽奖赢取美食优惠券', targetDesc: '', read: true, createdAt: new Date(now - 3 * DAY) },
];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext(); // 调用者的身份标识，云函数自动能拿到

  if (event.action === 'seed') {
    // 先清掉自己的旧消息，防止每点一次就多一堆
    await db.collection('messages').where({ _openid: OPENID }).remove();
    // 逐条插入，_openid 显式指定为调用者（这样他在前端才能查到）
    const tasks = SAMPLES.map((item) => db.collection('messages').add({
      data: { ...item, _openid: OPENID },
    }));
    await Promise.all(tasks);
    return { success: true, count: SAMPLES.length };
  }

  return { success: false, message: '未知的 action' };
};

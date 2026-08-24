// 云函数：消息助手
// 本期用途：给"当前调用者"生成一批示例消息（开发调试用）
// 将来真实场景的写入（如"别人给你点赞"触发通知）同样由云函数以管理员权限写库，
// 因为只有云函数才能把消息写进"别人"的收件箱（指定 _openid）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const now = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// 示例消息（文案沿用页面原有的假数据，方便对比效果）
const SAMPLES = [
  { type: 'interaction', title: '点赞与评论', summary: '小鹿爱吃饭 赞了你的照片', detail: '桂花糖藕：这家看起来好好吃！', icon: 'thumb-up', theme: 'green', createdAt: new Date(now - 2 * HOUR) },
  { type: 'interaction', title: '饭搭子邀约', summary: '小周同学 邀请你一起吃午餐', detail: '五道口 · 黄焖鸡米饭', tag: '新邀约', tagTheme: 'orange', icon: 'usergroup', theme: 'orange', createdAt: new Date(now - DAY) },
  { type: 'system', title: '系统通知', summary: '本周打卡进度更新', detail: '你已完成 3/21 天打卡，继续加油！', icon: 'notification', theme: 'blue', createdAt: new Date(now - 3 * HOUR) },
  { type: 'system', title: '打卡提醒', summary: '午餐打卡时间到啦 ☀️', detail: '记得记录今天的美食，保持好习惯～', icon: 'calendar', theme: 'green', createdAt: new Date(now - DAY - HOUR) },
  { type: 'system', title: '活动通知', summary: '「寻找饭搭子」春日活动开始啦！', detail: '参与抽奖赢取美食优惠券', tag: '官方', tagTheme: 'blue', icon: 'sound', theme: 'purple', createdAt: new Date(now - 3 * DAY) },
];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext(); // 调用者的身份标识，云函数自动能拿到

  if (event.action === 'seed') {
    // 先清掉自己的旧消息，防止每点一次就多一堆
    await db.collection('messages').where({ _openid: OPENID }).remove();
    // 逐条插入，read 默认 false（未读）
    const tasks = SAMPLES.map((item) => db.collection('messages').add({
      data: { ...item, _openid: OPENID, read: false },
    }));
    await Promise.all(tasks);
    return { success: true, count: SAMPLES.length };
  }

  return { success: false, message: '未知的 action' };
};

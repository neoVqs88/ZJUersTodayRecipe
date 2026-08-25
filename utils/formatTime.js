// 公共工具：把云端时间格式化成友好文案
// 今天显示时分，昨天显示"昨天 时分"，更早显示"几月几日"
export default function formatTime(dateInput) {
  const date = new Date(dateInput);
  const nowDate = new Date();
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === nowDate.toDateString()) return hm;
  const yesterday = new Date(nowDate.getTime() - 24 * 3600 * 1000);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

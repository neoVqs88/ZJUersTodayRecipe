import { getLocalUrl } from '~/utils/util.js';

export default {
  path: '/api/genPersonalInfo',
  data: {
    code: 200,
    message: 'success',
    data: {
      image: '/static/avatar1.png',
      name: 'zjuer_小蓝',
      star: '浙江大学生',
      campus: '紫金港校区',
      city: '杭州',
      gender: 0,
      birth: '1994-09-27',
      address: ['440000', '440300'],
      brief: '吃好每一餐，记录校园好食光 ✨',
      introduction: '吃好每一餐，记录校园好食光 ✨',
      checkInCount: 21,
      postCount: 8,
      favoriteCount: 16,
      weeklyCheckIns: [true, true, true, true, false, false, false],
      streakDays: 3,
      photos: [
        {
          url: getLocalUrl('/static/img_td.png', 'uploaded1.png'),
          name: 'uploaded1.png',
          type: 'image',
        },
        {
          url: getLocalUrl('/static/img_td.png', 'uploaded2.png'),
          name: 'uploaded2.png',
          type: 'image',
        },
      ],
    },
  },
};

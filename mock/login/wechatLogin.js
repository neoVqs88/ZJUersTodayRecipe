export default {
  path: '/auth/wechat/login',
  data: {
    token: '@guid()',
    isNewUser: false,
    user: {
      id: '@guid()',
      name: 'zjuer_小蓝',
      image: '/static/avatar1.png',
      campus: '紫金港校区',
      city: '杭州',
      star: '浙江大学生',
      checkInCount: 21,
      postCount: 8,
      favoriteCount: 16,
      weeklyCheckIns: [true, true, true, true, false, false, false],
      streakDays: 3,
    },
  },
};

import { fetchCommentCounts } from '~/services/comments';

const initialPosts = [
  {
    id: 1,
    category: 'food',
    author: '浙大干饭选手',
    level: 4,
    avatar: '/static/avatar1.png',
    time: '1 小时前',
    content: '今天发现玉泉一食堂的卤味窗口，鸡腿很入味，配上青菜和米饭刚刚好！',
    dish: '招牌卤味饭',
    visualDesc: '咸香入味 · 荤素搭配',
    emoji: '🍗',
    tone: 'orange',
    location: '玉泉一食堂',
    tags: ['食堂新发现', '卤味'],
    likes: 66,
    comments: 0,
    collections: 26,
    liked: false,
    collected: false,
  },
  {
    id: 2,
    category: 'explore',
    author: '小蓝今天吃什么',
    level: 3,
    avatar: '/static/miniprogram-icon-zju-bowl-144.png',
    time: '2 小时前',
    content: '怡膳堂二楼玫瑰简餐打卡！出餐很快，今天的套餐清爽又不会吃不饱。',
    dish: '玫瑰简餐',
    visualDesc: '快捷简餐 · 清爽均衡',
    emoji: '🍱',
    tone: 'green',
    location: '怡膳堂二楼',
    tags: ['探店打卡', '玫瑰简餐'],
    likes: 48,
    comments: 0,
    collections: 19,
    liked: false,
    collected: true,
  },
  {
    id: 3,
    category: 'companion',
    author: '周五不想一个人吃',
    level: 2,
    avatar: '/static/avatar1.png',
    time: '3 小时前',
    content: '今晚六点想去靓园吃饭，有没有同学一起拼桌？口味都可以，轻松聊天就好～',
    dish: '晚餐拼桌',
    visualDesc: '今天 18:00 · 还差 2 人',
    emoji: '👥',
    tone: 'blue',
    location: '靓园',
    tags: ['约饭拼桌', '晚餐'],
    likes: 21,
    comments: 0,
    collections: 5,
    liked: true,
    collected: false,
  },
];

Page({
  data: {
    categories: [
      { label: '全部动态', value: 'all', icon: '▱' },
      { label: '美食分享', value: 'food', icon: '🍲' },
      { label: '约饭拼桌', value: 'companion', icon: '🥂' },
      { label: '探店打卡', value: 'explore', icon: '▤' },
    ],
    activeCategory: 'all',
    posts: initialPosts,
    displayPosts: initialPosts,
  },

  onLoad(options) {
    if (!options.oper) return;
    wx.showToast({
      title: options.oper === 'release' ? '发布成功' : '保存成功',
      icon: 'success',
    });
  },

  onShow() {
    this.syncCommentCounts();
  },

  async syncCommentCounts() {
    try {
      const postIds = this.data.posts.map((post) => post.id);
      const { counts } = await fetchCommentCounts(postIds);
      const posts = this.data.posts.map((post) => ({
        ...post,
        comments: counts[String(post.id)] || 0,
      }));
      this.setData({
        posts,
        displayPosts: this.filterPosts(posts, this.data.activeCategory),
      });
    } catch (error) {
      // 云函数尚未部署或网络不可用时保留当前评论数量。
    }
  },

  selectCategory(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      activeCategory: value,
      displayPosts: this.filterPosts(this.data.posts, value),
    });
  },

  filterPosts(posts, category) {
    return category === 'all' ? posts : posts.filter((post) => post.category === category);
  },

  updatePost(postId, updater) {
    const posts = this.data.posts.map((post) => (post.id === postId ? updater(post) : post));
    this.setData({
      posts,
      displayPosts: this.filterPosts(posts, this.data.activeCategory),
    });
  },

  toggleLike(event) {
    const postId = Number(event.currentTarget.dataset.id);
    this.updatePost(postId, (post) => ({
      ...post,
      liked: !post.liked,
      likes: post.likes + (post.liked ? -1 : 1),
    }));
  },

  toggleCollect(event) {
    const postId = Number(event.currentTarget.dataset.id);
    this.updatePost(postId, (post) => ({
      ...post,
      collected: !post.collected,
      collections: post.collections + (post.collected ? -1 : 1),
    }));
  },

  openComments(event) {
    const postId = Number(event.currentTarget.dataset.id);
    const post = this.data.posts.find((item) => item.id === postId);
    if (!post) return;

    wx.navigateTo({
      url: '/pages/comments/index?postId=' + postId,
      success: ({ eventChannel }) => {
        eventChannel.emit('post', post);
        eventChannel.on('commentCountChange', ({ postId: changedPostId, total }) => {
          const changedId = Number(changedPostId);
          this.updatePost(changedId, (item) => ({ ...item, comments: total }));
        });
      },
    });
  },

  openAuthorProfile(event) {
    const postId = Number(event.currentTarget.dataset.id);
    const post = this.data.posts.find((item) => item.id === postId);
    if (!post) return;
    const userId = post.authorId || '';
    const query = userId ? '?userId=' + encodeURIComponent(userId) : '?preview=1';
    wx.navigateTo({
      url: '/pages/profile/index' + query,
      success: ({ eventChannel }) => {
        eventChannel.emit('profilePreview', {
          id: userId,
          name: post.author,
          image: post.avatar,
          introduction: post.authorIntroduction || '在校园里认真吃饭，也认真分享每一次美食发现。',
          campus: post.campus || '玉泉校区',
          star: '浙江大学生',
          postCount: 1,
        });
      },
    });
  },

  showPostMenu() {
    wx.showActionSheet({
      itemList: ['不感兴趣', '举报内容'],
      success: ({ tapIndex }) => {
        wx.showToast({
          title: tapIndex === 0 ? '将减少此类推荐' : '已进入举报流程',
          icon: 'none',
        });
      },
    });
  },

  publishInvitation() {
    wx.navigateTo({ url: '/pages/release/index?type=invitation' });
  },

  viewActivities() {
    this.setData({
      activeCategory: 'companion',
      displayPosts: this.filterPosts(this.data.posts, 'companion'),
    });
  },

  goRelease() {
    wx.navigateTo({ url: '/pages/release/index' });
  },
});

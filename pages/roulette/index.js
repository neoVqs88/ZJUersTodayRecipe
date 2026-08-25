const diningWindows = [
  {
    id: 'maxwell-cafe',
    label: '麦斯威咖啡',
    campus: '玉泉校区',
    canteen: '麦斯威咖啡吧',
    window: '咖啡与轻食窗口',
    dish: '拿铁咖啡配三明治',
    reason: '适合想简单吃一点、顺便找个地方休息或学习的时候。',
    color: '#ffe08a',
  },
  {
    id: 'yishantang-first',
    label: '怡膳一楼',
    campus: '玉泉校区',
    canteen: '怡膳堂',
    window: '一楼自选窗口',
    dish: '一荤两素套餐',
    reason: '菜品选择丰富、搭配自由，是日常用餐的稳妥选择。',
    color: '#a9d8ff',
  },
  {
    id: 'xiaolehui',
    label: '二楼小乐惠',
    campus: '玉泉校区',
    canteen: '怡膳堂二楼',
    window: '小乐惠',
    dish: '特色盖浇饭',
    reason: '口味丰富、分量充足，适合今天想吃得满足一些。',
    color: '#ffc4d9',
  },
  {
    id: 'rose-meal',
    label: '二楼玫瑰简餐',
    campus: '玉泉校区',
    canteen: '怡膳堂二楼',
    window: '玫瑰简餐',
    dish: '今日简餐套餐',
    reason: '出餐快捷、荤素均衡，赶时间时也能好好吃饭。',
    color: '#d4c2ff',
  },
  {
    id: 'second-canteen',
    label: '玉泉二食堂',
    campus: '玉泉校区',
    canteen: '玉泉二食堂',
    window: '大众餐窗口',
    dish: '家常套餐',
    reason: '家常口味、价格友好，适合不知道吃什么的普通一天。',
    color: '#ffeba1',
  },
  {
    id: 'first-canteen',
    label: '玉泉一食堂',
    campus: '玉泉校区',
    canteen: '玉泉一食堂',
    window: '自选餐窗口',
    dish: '今日自选菜',
    reason: '窗口多、选择面广，可以按今天的食欲自由搭配。',
    color: '#aee7dc',
  },
  {
    id: 'rice-noodle',
    label: '过桥米线',
    campus: '玉泉校区',
    canteen: '过桥米线',
    window: '米线窗口',
    dish: '招牌过桥米线',
    reason: '汤热味鲜、配菜丰富，想吃汤粉面时就选它。',
    color: '#c7e9ac',
  },
  {
    id: 'first-braised',
    label: '一食堂卤味',
    campus: '玉泉校区',
    canteen: '玉泉一食堂',
    window: '卤味窗口',
    dish: '招牌卤味饭',
    reason: '卤香浓郁、十分下饭，适合今天想吃重口一点。',
    color: '#ffc6a3',
  },
  {
    id: 'fourth-canteen',
    label: '玉泉四食堂',
    campus: '玉泉校区',
    canteen: '玉泉四食堂',
    window: '特色餐窗口',
    dish: '今日特色套餐',
    reason: '换个食堂探索新口味，也许会发现新的常吃窗口。',
    color: '#f6b9ec',
  },
  {
    id: 'liangyuan',
    label: '靓园',
    campus: '玉泉校区',
    canteen: '靓园',
    window: '风味餐窗口',
    dish: '风味小炒套餐',
    reason: '现点现做、香气十足，适合想改善一下伙食的时候。',
    color: '#9fc8ff',
  },
  {
    id: 'fifth-canteen',
    label: '玉泉五食堂',
    campus: '玉泉校区',
    canteen: '玉泉五食堂',
    window: '大众餐窗口',
    dish: '营养套餐',
    reason: '荤素均衡、方便快捷，为今天补充满满能量。',
    color: '#f7d37f',
  },
];

const sectorAngle = 360 / diningWindows.length;
const wheelItems = diningWindows.map((item, index) => {
  const angle = index * sectorAngle + sectorAngle / 2;
  return {
    ...item,
    angle,
    inverseAngle: -angle,
  };
});
const wheelBackground = `conic-gradient(${  diningWindows
  .map((item, index) => {
    const start = (index * sectorAngle).toFixed(4);
    const end = ((index + 1) * sectorAngle).toFixed(4);
    return `${item.color  } ${  start  }deg ${  end  }deg`;
  })
  .join(', ')  })`;

Page({
  data: {
    wheelItems,
    wheelBackground,
    wheelRotation: 0,
    isSpinning: false,
    result: null,
    history: [],
  },

  startSpin() {
    if (this.data.isSpinning) return;

    const selectedIndex = Math.floor(Math.random() * diningWindows.length);
    const selected = diningWindows[selectedIndex];
    const currentAngle = ((this.data.wheelRotation % 360) + 360) % 360;
    const selectedCenter = selectedIndex * sectorAngle + sectorAngle / 2;
    const destination = (360 - selectedCenter) % 360;
    const adjustment = (destination - currentAngle + 360) % 360;
    const rounds = 5 + Math.floor(Math.random() * 3);
    const wheelRotation = this.data.wheelRotation + rounds * 360 + adjustment;

    wx.vibrateShort({ type: 'light' });
    this.setData({
      isSpinning: true,
      result: null,
      wheelRotation,
    });

    clearTimeout(this.spinTimer);
    this.spinTimer = setTimeout(() => {
      const history = [selected, ...this.data.history.filter((item) => item.id !== selected.id)].slice(0, 3);
      this.setData({
        isSpinning: false,
        result: selected,
        history,
      });
      wx.vibrateShort({ type: 'medium' });
    }, 4200);
  },

  onUnload() {
    clearTimeout(this.spinTimer);
  },

  onShareAppMessage() {
    return {
      title: this.data.result
        ? `转盘推荐我去${  this.data.result.canteen  }，你也来试试！`
        : '今天吃什么？让幸运转盘帮你决定',
      path: '/pages/roulette/index',
    };
  },
});

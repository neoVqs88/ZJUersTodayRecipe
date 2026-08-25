Component({
  properties: {
    count: { type: Number, value: 0 },
    goal: { type: Number, value: 7 },
    subtitle: { type: String, value: '坚持打卡，养成好习惯' },
    dark: { type: Boolean, value: false },
  },

  methods: {
    handleTap() {
      this.triggerEvent('tap');
    },
  },
});

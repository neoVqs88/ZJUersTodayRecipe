import { askDietAssistant } from '~/services/dietAssistant';

const SUGGESTIONS = ['饭团，我最近一周的饮食情况怎么样？', '饭团，帮我安排一顿玉泉校区的均衡午饭。', '饭团，玉泉食堂 15 元内怎么吃？'];

Page({
  data: {
    input: '',
    sending: false,
    messages: [{ role: 'assistant', content: '你好，我是饭团，浙大玉泉校区的饮食 AI 助手。可以问我食堂、档口、营养搭配、热量和食品安全问题。' }],
    suggestions: SUGGESTIONS,
  },

  onInput(event) {
    this.setData({ input: event.detail.value });
  },

  goBack() {
    wx.navigateBack();
  },

  askSuggestion(event) {
    this.sendMessage(event.currentTarget.dataset.question);
  },

  async sendMessage(value = this.data.input) {
    const message = typeof value === 'string' ? value.trim() : '';
    if (!message || this.data.sending) return;
    // 不回传旧的 AI 答复，避免把思考过程带入下一轮，也能减少 Token。
    const history = this.data.messages.filter((item) => item.role === 'user').slice(-3);
    this.setData({
      input: '',
      sending: true,
      messages: [...this.data.messages, { role: 'user', content: message }],
    });
    try {
      const result = await askDietAssistant(message, history);
      this.setData({ messages: [...this.data.messages, { role: 'assistant', content: result.answer }] });
    } catch (error) {
      console.error('饮食助手请求失败', error.code, error.message);
      wx.showToast({ title: error.message || '助手暂时不可用', icon: 'none' });
    } finally {
      this.setData({ sending: false });
    }
  },

  onConfirm(event) {
    this.sendMessage(event.detail.value);
  },
});

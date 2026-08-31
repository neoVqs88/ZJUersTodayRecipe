import { askDietAssistant } from '~/services/dietAssistant';

const SUGGESTIONS = ['这顿饭怎样搭配更均衡？', '蛋白质、碳水和脂肪分别有什么作用？', '食堂打饭如何控制热量？'];

Page({
  data: {
    input: '',
    sending: false,
    messages: [{ role: 'assistant', content: '你好，我是饮食健康助手。可以问我营养搭配、热量和食品安全问题。' }],
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
    const history = this.data.messages.slice(-6);
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

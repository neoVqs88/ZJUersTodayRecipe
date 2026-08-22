// pages/register/register.js
const db = wx.cloud.database()
Page({

  /**
   * 页面的初始数据
   */
  data: {
    username:"",
    password:"",
  },

  // 用户名输入触发事件
  inputUsername(e) {
    this.setData({
      username:e.detail.value
    })
  },
  // 密码输入触发事件
  inputPassword(e) {
    this.setData({
      password:e.detail.value
    })
  },
  // 注册函数
  register(){
    if (this.data.username && this.data.password) {
      // 注册
      const users = db.collection('users')
      users.add({
        data: {
          username: this.data.username,
          password: this.data.password
        },
        success: function(res){
          wx.showToast({
            title: '注册成功',
            icon:'success'
          })
        },
        fail: function(res){
          console.log(res)
          wx.showToast({
            title: '用户名重复',
            icon:'error'
          })
        }
      })
    } else {
      wx.showToast({
        title: '信息不能为空',
        icon: 'error'
      })
    } 
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.setData({
      username:options.username
    })
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})
// index.js
const db = wx.cloud.database()
Page({
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
  // 跳转注册页面
  toRegister(){
    wx.navigateTo({
      url: '../register/register?username=' + this.data.username,
    })
  },
  // 登陆
  login(){
    // const users = db.collection('users')
    // // 依据用户名查询
    // users.where({
    //   username: this.data.username
    // }).get().then(res=>{
    //   if (res.data.length === 0) {
    //     wx.showToast({
    //       title: '用户不存在',
    //       icon: 'error'
    //     })
    //   }
    //   else {
    //     // 对比密码是否正确
    //     let validPwd = res.data[0].password
    //     if (this.data.password === validPwd) {
    //       wx.redirectTo({
    //         url: '../message/message?message=' + "Hello, world!",
    //       })
    //     } else {
    //       wx.showToast({
    //         title: '密码错误',
    //         icon: 'error'
    //       })
    //     }
    //   }
    // })

    if (this.data.username && this.data.password) {
      // 校验用户名、密码是否正确
      const users = db.collection('users')
      users.where({
        username: this.data.username,
        password: this.data.password
      }).get().then(res=>{
        if (res.data.length === 0) {
          // users集合中无匹配记录
          wx.showToast({
            title: '登陆失败',
            icon:'error'
          })
        } else {
          // 登陆成功，跳转页面
          wx.redirectTo({
            url: '../message/message?message=' + "Hello, world!",
          })
        }
      })
    } else {
      wx.showToast({
        title: '信息不能为空',
        icon: 'error'
      })
    }
  }
})

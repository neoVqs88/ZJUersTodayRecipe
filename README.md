# zjuer 今天吃什么

面向浙江大学玉泉校区的微信小程序，提供菜品推荐、食堂与菜品检索、三餐打卡、食历、社区互动、消息通知和饮食洞察。

## 本地预览

1. 使用微信开发者工具导入项目根目录。
2. 执行 `npm install`，然后在开发者工具中选择“工具 → 构建 npm”。
3. 在 `config.js` 中填写当前团队共用的云环境 ID。
4. 编译并使用真实微信账号登录测试。

## 项目校验

```bash
npm test
```

该命令会检查页面与分包路由、JSON、WXML 事件处理器、静态资源引用、云函数结构和 JavaScript 语法。

## 云函数

本次功能涉及的云函数包括：

- `ensureUser`：微信登录、用户资料和账号注销
- `communityPosts`：发帖审核、收藏、举报、屏蔽和菜品投票
- `communityComments`：评论审核与消息通知
- `adminCommunity`：帖子及举报管理
- `messageHelper`：消息已读处理
- `mealCheckins`：三餐打卡查询、编辑和删除
- `weeklyInsights`：每周饮食统计

修改云函数后，需要在微信开发者工具中逐个执行“上传并部署：云端安装依赖”。其中 `communityPosts` 与 `communityComments` 使用微信内容安全接口，请保留各自 `config.json` 中的 OpenAPI 权限。

## 云数据库

核心集合包括 `users`、`posts`、`comments`、`messages`、`mealRecords`、`checkins`，互动功能还需要：

- `postFavorites`
- `dishFavorites`
- `hiddenPosts`
- `reports`
- `feedback`
- `postPollVotes`

`dishes` 与 `canteens` 可用于维护真实食堂目录；未配置时客户端会使用仓库内的玉泉校区基础目录作为降级数据。

除公开目录外，写操作应尽量由云函数完成。不要把管理密钥、OpenID 或服务端密钥写入客户端代码。

## 目录概览

- `pages/`：小程序页面
- `components/`：公共组件与六项底部导航
- `services/`：客户端业务服务
- `behaviors/`：主题和字体偏好行为
- `data/`：离线基础目录
- `cloudfunctions/`：云函数
- `static/`：设计资源
- `scripts/`：项目校验脚本

## 提交约定

功能开发使用独立分支，完成微信开发者工具真机验证后再由组员合并到 `main`。提交前至少运行一次 `npm test`。

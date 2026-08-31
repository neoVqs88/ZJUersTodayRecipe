# 云端部署检查清单

本文件用于把本次客户端改造真正接入团队共用云环境。仅拉取代码不会自动创建集合、索引或重新部署云函数。

## 1. 新建集合与客户端权限

| 集合 | 客户端权限建议 | 说明 |
| --- | --- | --- |
| `postFavorites` | 所有用户不可读写 | 帖子收藏关系，由 `communityPosts` 访问 |
| `dishFavorites` | 所有用户不可读写 | 菜品收藏关系 |
| `hiddenPosts` | 所有用户不可读写 | 用户屏蔽帖子记录 |
| `reports` | 所有用户不可读写 | 帖子和评论举报 |
| `feedback` | 所有用户不可读写 | 用户反馈 |
| `postPollVotes` | 所有用户不可读写 | 新菜公投投票记录 |
| `dishes` | 所有用户可读、客户端不可写 | 可选的真实菜品目录 |
| `canteens` | 所有用户可读、客户端不可写 | 可选的真实食堂目录 |

既有 `users`、`mealRecords`、`follows`、`browsingHistory`、`postLikes`、`systemConfig`、`adminSecurity` 和 `moderationLogs` 继续保持客户端不可直接读写。`posts` 与 `comments` 设置为所有用户可读、客户端不可写；`messages` 使用自定义安全规则，仅允许记录 `_openid` 对应用户读取、禁止客户端写入，已读状态由 `messageHelper` 修改。

## 2. 建议组合索引

- `posts`：`status` 升序 + `createdAt` 降序；`category` 升序 + `status` 升序 + `createdAt` 降序
- `comments`：`postId` 升序 + `status` 升序 + `createdAt` 降序
- `messages`：`_openid` 升序 + `createdAt` 降序；`_openid` 升序 + `read` 升序；`_openid` 升序 + `category` 升序 + `read` 升序；`_openid` 升序 + `category` 升序 + `createdAt` 降序
- `mealRecords`：`userId` 升序 + `status` 升序 + `dateKey` 升序 + `mealTime` 降序
- `postFavorites`：`userId` 升序 + `createdAt` 降序
- `reports`：`status` 升序 + `createdAt` 降序
- `dishes`：`sortOrder` 升序
- `canteens`：`sortOrder` 升序

CloudBase 报缺少索引时，以错误提示中给出的字段顺序为准创建即可。

## 3. 重新部署云函数

在微信开发者工具中依次右键并选择“上传并部署：云端安装依赖”：

1. `communityPosts`（新增）
2. `communityComments`
3. `adminCommunity`
4. `messageHelper`
5. `mealCheckins`
6. `weeklyInsights`
7. `ensureUser`

`communityPosts` 和 `communityComments` 的 `config.json` 已声明内容安全 OpenAPI 权限。发布前需要确认小程序主体具备相应接口权限。

## 4. 管理员配置

`systemConfig/communityAdmin` 可额外加入：

```json
{
  "adminUserIds": ["管理员对应的32位内部userId"]
}
```

配置白名单后，即使密钥泄露，非白名单用户也不能进入管理页面。密钥只保留哈希值，不能把明文写入源码。

## 5. 真机验收

至少使用两个微信账号验证：登录、发帖与图片审核、评论通知、收藏与屏蔽、举报与后台处理、食历跨月翻页、打卡编辑/删除、消息已读、深色模式和字体大小。内容安全接口、定位授权和云存储图片必须在真机环境复测。

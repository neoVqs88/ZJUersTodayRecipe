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
| `posts` | 所有用户不可读写 | 社区列表、详情和写操作统一由 `communityPosts` 处理 |
| `comments` | 所有用户不可读写 | 评论列表和写操作统一由 `communityComments` 处理 |
| `messages` | 所有用户不可读写 | 私信与通知只通过 `messageHelper` 按当前 OPENID 返回 |
| `dishes` | 所有用户可读、客户端不可写 | 可选的真实菜品目录 |
| `canteens` | 所有用户可读、客户端不可写 | 可选的真实食堂目录 |

既有 `users`、`mealRecords`、`follows`、`browsingHistory`、`postLikes`、`systemConfig`、`adminSecurity` 和 `moderationLogs` 继续保持客户端不可直接读写。帖子、评论和消息也不需要开放客户端读取权限；云函数会验证身份并仅返回页面需要的公开字段。

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

`communityPosts`、`communityComments`、`recognizeDish`、`mealCheckins` 和 `ensureUser` 的 `config.json` 已声明所需的内容安全 OpenAPI 权限。发布前需要确认小程序主体具备相应接口权限。

还需要部署本次新增或更新的外部能力：

8. `recognizeDish`
9. `nutritionLookup`
10. `dietAssistant`

`recognizeDish` 需要配置 `BAIDU_API_KEY`、`BAIDU_SECRET_KEY`；`nutritionLookup` 与 `dietAssistant` 需要配置 `TOKENHUB_API_KEY`，可选配置 `TOKENHUB_BASE_URL`、`TOKENHUB_MODEL`、`TOKENHUB_VISION_MODEL`。这些值只能放在云函数环境变量中，不能提交到 Git。

## 4. 管理员配置

`systemConfig/communityAdmin` 必须加入管理员白名单：

```json
{
  "adminUserIds": ["管理员对应的32位内部userId"]
}
```

未配置 `adminUserIds` 时管理入口会拒绝启动。即使密钥泄露，非白名单用户也不能进入管理页面。密钥只保留哈希值，不能把明文写入源码。

同时在 `adminCommunity` 云函数环境变量中增加：

```text
ADMIN_SESSION_SECRET=至少32位、与管理入口密钥不同的随机字符串
```

该值只用于签发管理会话，不能与 `accessKeyHash` 或用户输入的管理密钥复用。

## 5. 数据与调用保护

- 发帖：每个用户每 10 分钟最多 5 次。
- 评论：每个用户每 10 分钟最多 20 次。
- 举报：每个用户每小时最多 10 次。
- 反馈：每个用户每小时最多 5 次。
- 菜品识别与营养查询：每个用户每 10 分钟最多 10 次。
- 饮食助手：每个用户每小时最多 30 次。

这些计数保存在 `users` 的内部安全字段中，不应通过客户端数据库权限公开。`users` 必须保持客户端不可直接读写。

## 6. 正式发布前必须补全

- 在 `config/legal.js` 填写真实运营主体和可实际联系的渠道。
- 核对隐私政策中的云服务地域、备份周期和数据保存期限。
- 在微信公众平台同步配置并提交用户隐私保护指引。
- 当用户协议或隐私政策版本号变化时，旧登录态会失效，用户需要重新勾选确认后登录。
- 当前 `sitemap.json` 已禁止页面被微信索引，避免管理页、个人资料页等敏感页面进入搜索。

## 7. 真机验收

至少使用两个微信账号验证：登录、协议版本升级、发帖与图片审核、评论通知、收藏与屏蔽、举报与后台处理、食历跨月翻页、打卡编辑/删除、消息已读、调用频率限制、深色模式和字体大小。内容安全接口、定位授权和云存储图片必须在真机环境复测。

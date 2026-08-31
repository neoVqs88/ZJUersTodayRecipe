# 社区管理功能云端配置

管理密钥只在云端校验，不应写入小程序源码或提交到 GitHub。管理员必须先完成普通微信登录，再从“我的 → 管理入口”输入密钥。

## 1. 创建云数据库集合

在当前小程序共用的云环境中创建以下集合，并将客户端权限均设为“所有用户不可读写”：

- `systemConfig`：保存管理功能配置。
- `adminSecurity`：保存失败次数和临时锁定状态。
- `moderationLogs`：保存删除操作、操作者、原因和帖子快照。

云函数仍具有服务端读写能力，因此这些权限不会影响管理功能。

## 2. 设置管理密钥

先选择一个至少 12 位、包含大小写字母、数字和符号的密钥。不要使用学号、项目名或简单数字。

可在 PowerShell 中计算 SHA-256，输入内容不会写进项目：

```powershell
$adminKey = Read-Host '输入管理密钥'
$sha = [System.Security.Cryptography.SHA256]::Create()
([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($adminKey)))).Replace('-', '').ToLower()
```

在 `systemConfig` 集合中创建记录，记录 ID（`_id`）必须为 `communityAdmin`：

```json
{
  "enabled": true,
  "accessKeyHash": "上一步得到的64位小写哈希",
  "sessionHours": 4
}
```

不要创建 `accessKey` 明文字段。更换 `accessKeyHash` 后，已有管理会话会立即失效。

## 3. 部署云函数

在微信开发者工具中找到 `cloudfunctions/adminCommunity`，右键选择“上传并部署：云端安装依赖”。部署成功后重新编译小程序。

## 4. 删除行为与审计

- 帖子、对应评论以及相关消息和浏览足迹由云函数清理，普通客户端不能越权删除别人的帖子。
- 云存储中的帖子图片会同步尝试清理。
- 删除前会把帖子摘要、当前微信用户标识、显示名称、时间和原因写入 `moderationLogs`。
- 同一密钥可以由多名组内管理员使用，日志仍能区分实际操作账号。
- 连续输错 5 次后，该微信用户会被锁定 15 分钟。

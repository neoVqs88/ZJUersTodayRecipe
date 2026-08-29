# 浙江大学统一身份认证接入方案

## 当前建议

小程序继续使用微信云开发身份作为账号主键，浙江大学统一身份认证作为“校园身份绑定/认证”接入，而不是让小程序收集学号和密码。这样既保留微信小程序稳定的用户身份，也不会因为增加校内认证而创建第二个账号。

在学校正式批准接入前，不在登录页展示可点击的统一身份认证入口，也不使用模拟接口。

## 推荐流程

1. 用户先完成微信登录，云端得到当前 `OPENID` 并定位唯一 `user_id`。
2. 用户点击“认证浙江大学身份”，云函数生成一次性 `state`、有效期和绑定请求记录。
3. 小程序通过已备案业务域名的 `web-view` 打开后端认证入口。
4. 后端按学校批准的 CAS、OAuth2 或其他协议跳转到浙大统一身份认证平台。
5. 学校回调后，后端验证票据/授权码、`state`、回调地址和签发方，不接受客户端直接提交的学号作为认证结果。
6. 后端只保存业务必需的属性，例如不可逆的校园身份标识哈希、人员类型和认证时间；不保存统一身份认证密码或原始票据。
7. 使用 `identityBindings` 集合绑定当前 `user_id`。绑定文档 ID 建议取 `sha256(issuer + ':' + subject)`，从存储层阻止同一校园身份绑定多个微信账号。
8. 小程序轮询一次性绑定请求的状态，成功后刷新用户资料并展示“浙大身份已认证”。

## 建议数据字段

`users`：

- `zjuVerified: boolean`
- `zjuIdentityType: student | faculty | alumni | other`
- `zjuVerifiedAt: Date`
- `zjuBindingId: string`（仅保存绑定文档 ID，不保存学号明文）

`identityBindings`（客户端不可直接读写）：

- `_id: sha256(issuer + ':' + subject)`
- `issuer: string`
- `subjectHash: string`
- `userId: string`
- `status: active | revoked`
- `createdAt / updatedAt / revokedAt`

`identityAuthRequests`（客户端不可直接读写，短期数据）：

- `_id / stateHash / userId`
- `status: pending | verified | failed | expired`
- `expiresAt / createdAt / completedAt`

## 安全边界

- 不在小程序、云函数日志或数据库中收集、转发、打印统一身份认证密码。
- 所有回调必须使用 HTTPS，并校验随机 `state`、一次性使用和短有效期。
- 校园身份字段只由服务端写入；客户端上传的“学号”“认证成功”等字段一律不可信。
- 账号注销时同时撤销 `identityBindings`，清理未完成的认证请求。
- 在上线前补齐用户协议、隐私政策和个人信息处理说明，明确校园身份数据的用途、保存期限与注销方式。

## 正式开发前需要的外部支持

- 由项目负责人/指导教师通过浙江大学应用接入流程提交申请及所需签字盖章材料。
- 学校提供批准使用的协议、测试环境、应用标识/密钥、允许的回调地址及可释放属性清单。
- 一个备案且可配置 HTTPS 的后端域名，并加入微信小程序业务域名/请求域名白名单。
- 确认认证范围（在校生、教职工、校友等）及同一身份解绑、换绑和申诉规则。

学校正式参数到位后，再实现 `startZjuAuth`、认证回调服务、`getZjuBindStatus`、解绑云函数以及登录页入口。

## 官方入口

- [浙江大学服务网：统一身份认证应用接入、在线调试与在线文档](https://service.zju.edu.cn/_s2/anonymous_yyzx/main.psp)
- [浙江大学信息技术中心：应用接入办理流程](https://itc.zju.edu.cn/2026/0401/c77811a3146856/page.htm)

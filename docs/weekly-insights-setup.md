# 本周美食与营养分析

创建 `weeklyInsights` 云函数并选择“云端安装依赖”。该函数复用 `mealRecords` 集合，客户端不直接读取统计数据。

如需补充蛋白质、碳水、脂肪和每份重量数据，还需创建 `nutritionLookup` 云函数并选择“上传并部署：云端安装依赖”，同时在该云函数环境变量中配置 TokenHub API Key。推荐变量名为 `TOKENHUB_API_KEY`，也兼容 `HUNYUAN_API_KEY`。可选配置 `TOKENHUB_BASE_URL`，广州地域默认使用 `https://tokenhub.tencentmaas.com/v1`；可选配置 `TOKENHUB_VISION_MODEL`，默认使用 `hy-vision-2.0-instruct`。密钥只能配置在云函数环境变量中，不能写入小程序代码。

健康分析页中的“饮食健康助手”使用独立的 `dietAssistant` 云函数。请创建该云函数并选择“上传并部署：云端安装依赖”，配置同一个 TokenHub API Key。推荐变量名为 `TOKENHUB_API_KEY`，也兼容 `HUNYUAN_API_KEY`。可选配置 `TOKENHUB_MODEL`，未配置时使用 `hy3`；可选配置 `TOKENHUB_BASE_URL`，广州地域默认使用 `https://tokenhub.tencentmaas.com/v1`。云函数会拒绝非饮食、营养、食品安全和校园餐饮主题的问题，并提示内容不能替代专业医疗建议。

由于模型请求可能超过云函数默认的 3 秒执行时间，请在 `dietAssistant` 和 `nutritionLookup` 的云函数配置中将执行超时时间调整为 30 秒，再重新发布函数。路径通常为“云函数 → 函数配置 → 高级配置 → 超时时间”。

统计口径：

- 本周范围按中国标准时间周一至周日计算。
- “本命美食”按当前用户本周打卡的菜品次数最多者计算。
- “平台用户热门美食”按全平台本周打卡记录次数最多者计算，不展示用户个人信息。
- 营养分析至少需要本周记录 3 餐，且至少 3 餐有菜品热量数据。低于门槛时只显示进度，不推断趋势。
- 平均热量是有热量数据餐次的每 100 克参考热量平均值，不代表用户实际摄入量。
- 混元返回的是基于照片的每份估算值，不代表浙大食堂实际配方或用户实际摄入量；重量和总热量均必须标注为 AI 估算。

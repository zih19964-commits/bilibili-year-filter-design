# Implementation Status

## 交付范围

本次按 Stage 0 到 Stage 4 的边界完成了可运行实现：

- `starter/tampermonkey/bilibili-year-filter.user.js`：无额外权限的 Userscript MVP；
- `starter/extension/`：Manifest V3 content runtime、popup、页面内设置面板；
- `starter/extension/src/core/`：规则、日期解析、storage、缓存、请求队列、元数据解析和 renderer；
- 页面批处理：同一批卡片统一走 DOM/缓存/API 解析，并在同一帧集中渲染；
- 特殊标记过滤：娱乐类、番剧/漫画、课堂三组开关；参考 B 站 `floor-single-card` 的结构化 badge，不匹配标题关键词；
- `starter/extension/src/adapters/`：按 B 站页面 surface 选择 adapter，并集中管理 BVID/卡片/日期选择器；
- `test/`：核心规则、跨年日期、缓存、队列去重、API fail-open 的自动化检查。

## 约束核对

- `UNKNOWN => SHOW`：保持；
- `FilterEngine.evaluate`：无 DOM、网络和 storage 依赖；
- DOM 选择器：集中在 adapter；
- API URL 和响应校验：集中在 `metadata-resolver.js`；
- 同 BVID 并发请求：由 RequestQueue in-flight map 去重；
- 正缓存：长期保存；负缓存：按错误类型过期；
- 权限：扩展只申请 `storage` 和 B 站/API host；不申请 cookies、history、tabs；
- 不引入后端、账号体系、React/Vue 或云同步。

## 已执行验证

```text
npm run check  -> syntax ok: 13 files
npm test       -> 6 passed, 0 failed
manifest check -> 11 referenced files exist
```

Chrome 真实 B 站首页验收（运行时注入已完成的 Userscript / Extension content files）：

- 首页运行时成功启动，实际发现并处理 20+ 张视频卡片；
- 浮动按钮可打开设置面板；
- 带可靠 `2020-01-02` DOM 日期的临时卡片，在排除 2020 后得到 `byf-hidden` / `decision=hide`；
- 无可靠日期的临时卡片得到 `decision=show`，没有被误隐藏；
- 修改规则不增加元数据解析语义，立即重新渲染已处理卡片；
- 同一批 4 张夹具卡片只触发 1 次 DOM 变更回调，统一得到 `hide / hide / show / show`；
- 隐藏的是参与网格布局的外层卡片，剩余卡片自动补位，不再保留空白网格项；
- 20 个不同 BVID 的模拟批处理：约 `6.85s -> 1.83s`，约 `3.75x`；真实速度仍受网络和 B 站限流影响；
- 三组特殊标记验收：勾选娱乐类 + 课堂后，`综艺=hide`、`番剧=show`、`课堂=hide`；标题含“课堂”但没有结构化标记的普通视频保持 `show`；
- 已保存截图：`output/playwright/bilibili-year-filter-acceptance.png`。

## 当前边界

真实 B 站 DOM、相对日期文案和详情接口都是外部不稳定依赖。本次验收覆盖了首页真实结构与确定性夹具；搜索、UP 主空间、热门/相关推荐仍应在后续 fixture 收集后分别做 contract acceptance，不能把首页证据扩大解释成所有 surface 已通过。

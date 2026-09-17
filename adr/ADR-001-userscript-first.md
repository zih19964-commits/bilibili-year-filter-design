# ADR-001 — Userscript First

## Status

Accepted

## Context

需求本质上是修改 B站网页的视频卡片展示。

完整 Chrome Extension 会引入：

- manifest；
- 权限；
- popup；
- extension storage；
- 打包与安装；
- 商店发布。

这些都不能降低最核心风险：

> B站页面是否能稳定提取视频身份和发布时间？

## Decision

先用 Tampermonkey 完成技术验证与 MVP。

核心模块写成普通 JS，
禁止依赖 Tampermonkey 专有 API。

## Consequence

后续迁移到 Extension 时只替换：

```text
bootstrap
storage adapter
UI shell
```

FilterEngine / Resolver 语义不变。

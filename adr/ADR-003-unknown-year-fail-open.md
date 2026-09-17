# ADR-003 — Unknown Year Must Fail Open

## Status

Accepted

## Context

年份解析会因为：

- DOM变化；
- 网络错误；
- API变化；
- 限流；
- 非标准卡片；

而失败。

若 UNKNOWN 默认隐藏，
插件会把“技术失败”伪装成“用户过滤意图”。

## Decision

```text
UNKNOWN => SHOW
```

此规则为 MVP 硬约束。

## Consequence

极端情况下会漏掉本应隐藏的视频，
但不会错误删除用户本来应该看到的内容。

这是更安全的错误方向。

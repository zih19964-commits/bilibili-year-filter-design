# ADR-002 — Tiered Metadata Resolution

## Status

Accepted

## Context

如果每张卡片都直接请求视频详情 API：

- 网络请求数量高；
- 页面加载慢；
- 更容易遇到限流；
- 重复卡片产生无意义请求。

## Decision

采用：

```text
DOM reliable date
    ↓ miss
local metadata cache
    ↓ miss
queued API request
    ↓ fail
UNKNOWN
```

## Consequence

需要额外实现：

- 日期解析；
- cache；
- request queue；
- negative cache。

但换来更低耦合和更低请求成本。

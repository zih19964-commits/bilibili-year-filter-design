# 03 — Data Model & Rule Semantics

## 1. 设置数据

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "excludedYears": [2019, 2020],
  "minYear": null,
  "recentYears": null,
  "action": "hide",
  "unknownPolicy": "show",
  "showYearBadge": false,
  "blockedMarkerGroups": []
}
```

特殊内容标记提供四个用户选项：

```text
entertainment = 综艺、电影、电视剧、纪录片、国创、直播
anime         = 番剧、漫画
classroom     = 课堂
ad            = 广告
```

它们由 B 站卡片的结构化标记识别，不根据标题关键词猜测。广告卡片通过结构化的 `广告` 标记识别，`cm.bilibili.com` 链接只用于补充发现没有视频 BVID 的广告卡片；仅存在广告链接但没有广告标记的普通推荐卡片不视为广告。

## 2. 规则优先级

按以下顺序求值：

```text
1. enabled == false
      => SHOW

2. year == UNKNOWN
      => SHOW

3. year in excludedYears
      => configured action

4. minYear != null && year < minYear
      => configured action

5. recentYears != null &&
   year < currentYear - recentYears + 1
      => configured action

6. otherwise
      => SHOW
```

`excludedYears` 优先于范围规则的原因：

> 精确排除规则表达的是最明确的用户意图。

## 3. 冲突语义

例如：

```text
minYear = 2022
excludedYears = [2024]
```

结果：

```text
2021 -> HIDE
2022 -> SHOW
2023 -> SHOW
2024 -> HIDE
2025 -> SHOW
```

## 4. Metadata Cache

推荐 key：

```text
byf:meta:v1:<BVID>
```

value：

```json
{
  "year": 2021,
  "timestampMs": 1630000000000,
  "resolvedAtMs": 1780000000000,
  "source": "api"
}
```

### 正缓存

视频发布时间属于不可变事实。

策略：

```text
TTL = 无限
```

但缓存 schema 必须版本化。

### 负缓存

网络错误不能永久记住。

```json
{
  "status": "negative",
  "reason": "api_unavailable",
  "retryAfterMs": 1780000600000
}
```

建议：

```text
普通网络失败：5 min
疑似限流：30 min
无 BVID：不缓存
非法响应：10 min
```

## 5. Cache 上限

不要无限增长。

推荐默认：

```text
maxEntries = 20,000
```

淘汰依据：

```text
lastAccessAtMs
```

采用近似 LRU 即可。

20,000 条仅保存年份和几个时间字段，
远小于保存完整视频元数据。

## 6. Request Deduplication

同一时刻多个卡片引用同一 BVID：

```text
BV1abc -> Promise A
BV1abc -> 复用 Promise A
BV1abc -> 复用 Promise A
```

内部：

```ts
Map<BVID, Promise<ResolveResult>>
```

请求结束后从 in-flight map 删除。

## 7. Request Queue

默认建议：

```text
concurrency = 2
minDelayMs = 350
maxRetries = 2
```

重试：

```text
第1次失败 -> 1s + jitter
第2次失败 -> 3s + jitter
再次失败 -> negative cache
```

若明确发现限流状态：

```text
立即降低并发 / 暂停队列
```

不要持续轰炸接口。

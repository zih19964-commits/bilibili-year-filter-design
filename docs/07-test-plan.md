# 07 — Test Plan

## 1. 测试分层

```text
                 少
            E2E / 页面夹具
           ─────────────
           Adapter Contract
          ────────────────
         Resolver Integration
        ───────────────────
       Pure Unit Tests
                 多
```

## 2. Filter Engine — P0

必须覆盖：

### 精确年份

```text
excludedYears=[2020]
2020 => HIDE
2021 => SHOW
```

### 年份下限

```text
minYear=2022
2021 => HIDE
2022 => SHOW
```

### 最近 N 年

当前年固定传入 `2026`：

```text
recentYears=3
2024 => SHOW
2023 => HIDE
```

### UNKNOWN

```text
year=null
=> SHOW
```

### Disabled

任何年份：

```text
enabled=false
=> SHOW
```

## 3. Date Parser — P0

边界：

```text
2025-12-31
2026-01-01
昨天（跨年）
23小时前（跨年）
非法日期
只有月日
```

只有月日不能未经证据推断年份。

## 4. Resolver — P0

### Cache hit

断言：

```text
不得调用 API
```

### Cache miss

```text
调用 API
成功后写 cache
```

### 同 BVID 并发

```text
10 次 resolve(BV1)
=> 实际网络请求 = 1
```

### API 错误

```text
=> UNKNOWN
=> 不隐藏
```

## 5. Request Queue — P0

覆盖：

- 最大并发；
- delay；
- retry；
- negative cache；
- circuit breaker；
- in-flight dedup。

## 6. Adapter Contract — P0

每一个 adapter 保存最小 HTML fixture。

例如：

```text
fixtures/
├── home-card.html
├── search-card.html
├── space-card.html
└── popular-card.html
```

测试：

```text
discover -> 卡片数量正确
extract bvid -> 正确
card root -> 正确
```

B站改版时更新 fixture，
核心逻辑测试无需改变。

## 7. Mutation — P1

模拟：

```text
初始 20 卡
滚动新增 20 卡
其中 5 个重复 BVID
```

断言：

- 新卡被处理；
- 老卡不重复处理；
- 重复 BVID 不重复请求。

## 8. Settings 热更新 — P1

流程：

```text
卡片 year=2020 当前 SHOW
↓
用户新增 excludedYears=2020
↓
同一卡片变 HIDE
↓
移除规则
↓
恢复 SHOW
```

过程中：

```text
网络请求数不增加
```

## 9. 回归场景

B站外部变化的典型故障：

1. class 改名；
2. 卡片增加 wrapper；
3. `/video/BV...` 链接层级变化；
4. 日期格式变化；
5. API 字段缺失；
6. API 限流；
7. 页面路由方式改变。

每次修复都应该先补 fixture / contract test。

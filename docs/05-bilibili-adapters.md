# 05 — Bilibili Adapters

## 1. 为什么必须有 Adapter

B 站网页属于外部系统。

以下都不受本项目控制：

- DOM class；
- 卡片层级；
- SPA 路由；
- 页面懒加载方式；
- API 返回结构。

因此不能让：

```text
document.querySelector(...)
```

散落在业务代码中。

## 2. Adapter 目录

```text
adapters/
├── home.js
├── search.js
├── space.js
├── popular.js
├── related.js
└── generic.js
```

## 3. 每个 Adapter 只做三件事

```text
1. 当前 URL 是否属于自己
2. 从 root 中发现候选卡片
3. 从卡片中提取：
   - card element
   - BVID
   - 可选 DOM 日期文本
```

## 4. BVID 提取

优先从明确视频链接：

```text
/video/BV...
```

中提取。

推荐正则：

```regex
BV[0-9A-Za-z]{10}
```

不要：

```regex
BV[0-9A-Za-z]+
```

后者可能把后续字符一起吞掉。

## 5. DOM 日期可信性

日期文本只有满足明确格式才作为事实。

可以接受：

```text
2024-06-11
2024/06/11
2024年06月11日
```

对于：

```text
昨天
3小时前
06-11
```

需要额外语义。

原则：

### 相对时间

```text
昨天 / 3小时前
```

可以根据当前时间推导年份，
但跨年边界必须有测试。

### 只有月日

```text
06-11
```

不能直接假设当前年。

因为搜索结果中的老视频也可能用无年份格式。

拿不准：

```text
继续走 cache / API
```

## 6. SPA 导航

B站很多页面不会做传统整页刷新。

不能只依赖：

```js
window.onload
```

需要：

```text
DOM Observer
+
URL change detection
```

URL 变化后：

```text
1. 重新选择 adapter
2. 保留 metadata cache
3. 清理当前页面 card registry
4. 扫描新 root
```

## 7. MutationObserver 策略

错误方式：

```text
任何 mutation
    ↓
querySelectorAll(整个 document)
```

页面越长越慢。

推荐：

```text
mutation.addedNodes
    ↓
只扫描新增子树
    ↓
adapter.discover(node)
```

同时做一个低频 reconciliation：

```text
每 5~10 秒
只检查“未处理的可见候选卡”
```

用于兜底，不用于主流程。

## 8. Card Registry

使用：

```text
WeakMap<HTMLElement, CardState>
```

避免 DOM 被移除后仍被强引用。

CardState：

```ts
interface CardState {
  bvid: string | null;
  year: number | null;
  status: "discovered" | "resolving" | "resolved" | "unknown";
  lastDecision?: string;
}
```

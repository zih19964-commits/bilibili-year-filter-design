# 01 — Architecture

## 1. C4 Container 级架构

```mermaid
flowchart TB
    U[用户]

    subgraph Browser[浏览器]
        UI[Settings UI]
        CS[Content Runtime]
        PA[Page Adapter]
        MR[Metadata Resolver]
        FE[Filter Engine]
        CR[Card Renderer]
        MC[(Metadata Cache)]
        SS[(Settings Store)]
        RQ[Request Queue]
    end

    B[Bilibili Web Page]
    API[Bilibili Metadata Endpoint]

    U --> UI
    UI --> SS
    B --> PA
    PA --> CS
    CS --> MR
    MR --> MC
    MR --> RQ
    RQ --> API
    CS --> FE
    SS --> FE
    FE --> CR
    CR --> B
```

## 2. Component 级职责

```mermaid
flowchart LR
    O[DOM Observer]
    A[Surface Adapter]
    I[Video Identity Extractor]
    R[Year Resolver]
    D[DOM Date Provider]
    C[Cache Provider]
    P[API Provider]
    Q[Request Queue]
    E[Filter Engine]
    V[Renderer]
    S[Settings]

    O --> A
    A --> I
    A --> D
    I --> R
    D --> R
    C --> R
    P --> R
    Q --> P
    R --> E
    S --> E
    E --> V
```

## 3. 为什么这样拆

### Page Adapter

唯一知道“B站某个页面的视频卡片长什么样”。

禁止它：

- 决定过滤规则；
- 管理缓存；
- 自己请求 API。

### Metadata Resolver

负责回答：

```text
这个 BVID 的可靠发布时间年份是什么？
```

不负责：

- 卡片隐藏；
- UI；
- 页面 DOM。

### Filter Engine

纯函数：

```text
(year, settings) -> decision
```

因此可以完全脱离 B 站做单元测试。

### Renderer

只执行：

```text
SHOW / HIDE / DIM / COLLAPSE
```

不参与业务判断。

## 4. 元数据解析顺序

```mermaid
flowchart TD
    A[发现卡片] --> B{DOM 中有可靠发布日期?}
    B -->|是| C[解析日期]
    B -->|否| D{Cache 有 BVID?}
    C --> E{日期可确定年份?}
    E -->|是| F[返回 Year]
    E -->|否| D
    D -->|是| F
    D -->|否| G[进入 Request Queue]
    G --> H[查询元数据]
    H --> I{成功且 pubdate 合法?}
    I -->|是| J[写 Cache]
    J --> F
    I -->|否| K[写短期 Negative Cache]
    K --> L[UNKNOWN]
```

优先级的本质：

```text
低成本事实 > 已缓存事实 > 网络事实 > UNKNOWN
```

## 5. 卡片处理时序

```mermaid
sequenceDiagram
    participant Page as B站页面
    participant Observer as DOM Observer
    participant Adapter as Page Adapter
    participant Resolver as Metadata Resolver
    participant Cache as Cache
    participant Queue as Request Queue
    participant API as Metadata API
    participant Filter as Filter Engine
    participant Renderer as Renderer

    Page->>Observer: 新增 DOM 节点
    Observer->>Adapter: discover(node)
    Adapter-->>Observer: VideoCardRef
    Observer->>Resolver: resolve(card)

    Resolver->>Cache: get(bvid)
    alt cache hit
        Cache-->>Resolver: pubYear
    else cache miss
        Resolver->>Queue: enqueue(bvid)
        Queue->>API: metadata request
        API-->>Queue: pubdate
        Queue-->>Resolver: pubYear
        Resolver->>Cache: put(bvid, pubYear)
    end

    Resolver->>Filter: evaluate(pubYear, settings)
    Filter-->>Renderer: decision
    Renderer->>Page: apply(card)
```

## 6. 边界

```text
核心域：
  YearResolver
  FilterEngine
  RuleModel

平台层：
  Storage
  RequestQueue
  Logger

B站适配层：
  URL识别
  卡片识别
  BVID提取
  DOM日期提取
  Metadata API

表现层：
  设置面板
  卡片渲染
```

其中最重要的隔离线：

```text
B站会变化的东西
──────────────
Page Adapter / API Provider

自己控制的稳定逻辑
──────────────
Filter Engine / Rule Model / Cache Contract
```

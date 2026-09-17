# 02 — Component Contracts

## 1. VideoCardRef

```ts
interface VideoCardRef {
  element: HTMLElement;
  bvid: string | null;
  surface: SurfaceType;
  domDateText?: string | null;
}
```

约束：

- `element` 必须指向整张可隐藏的视频卡片；
- `bvid` 只能来自可靠链接/属性；
- 不允许通过视频标题猜 BVID。

## 2. MetadataRecord

```ts
type MetadataSource = "dom" | "cache" | "api";

interface MetadataRecord {
  bvid: string;
  pubTimestampMs: number;
  pubYear: number;
  source: MetadataSource;
  resolvedAtMs: number;
  schemaVersion: 1;
}
```

不保存无关的视频标题、UP主、播放量。

原因：

> 本插件只需要“发布时间事实”，不应该顺便收集额外行为数据。

## 3. ResolveResult

```ts
type ResolveResult =
  | {
      status: "known";
      bvid: string;
      year: number;
      timestampMs?: number;
      source: "dom" | "cache" | "api";
    }
  | {
      status: "unknown";
      bvid?: string;
      reason:
        | "no_identity"
        | "date_unparseable"
        | "api_unavailable"
        | "rate_limited"
        | "invalid_response";
    };
```

## 4. FilterSettings

```ts
interface FilterSettings {
  enabled: boolean;

  excludedYears: number[];

  minYear: number | null;

  recentYears: number | null;

  action: "hide" | "dim" | "collapse";

  unknownPolicy: "show";

  showYearBadge: boolean;
}
```

MVP 固定：

```text
unknownPolicy = "show"
```

不允许 UI 改成 hide。

## 5. FilterDecision

```ts
interface FilterDecision {
  action: "show" | "hide" | "dim" | "collapse";
  reason:
    | "disabled"
    | "unknown_year"
    | "excluded_year"
    | "before_min_year"
    | "outside_recent_window"
    | "allowed";
}
```

## 6. FilterEngine

必须是无副作用纯函数：

```ts
evaluate(
  year: number | null,
  settings: FilterSettings,
  currentYear: number
): FilterDecision
```

禁止：

- 访问 DOM；
- 访问网络；
- 访问 storage；
- 自己调用 `new Date()` 获取当前年。

当前年份作为参数传入，方便确定性测试。

## 7. PageAdapter

```ts
interface PageAdapter {
  id: string;

  matches(url: URL): boolean;

  discover(root: ParentNode): HTMLElement[];

  toVideoCard(element: HTMLElement): VideoCardRef | null;
}
```

每一个页面类型可以有独立 adapter：

```text
HomeAdapter
SearchAdapter
SpaceAdapter
PopularAdapter
RelatedAdapter
GenericFallbackAdapter
```

## 8. MetadataProvider

```ts
interface MetadataProvider {
  resolve(card: VideoCardRef): Promise<ResolveResult>;
}
```

内部可以组合：

```text
DomDateProvider
MetadataCache
BilibiliApiProvider
```

## 9. Renderer

渲染必须幂等。

即同一张卡：

```text
hide -> hide
```

不能不断追加 class 或 wrapper。

约定统一使用：

```text
data-byf-processed
data-byf-year
data-byf-decision
```

CSS class：

```text
byf-hidden
byf-dimmed
byf-collapsed
byf-year-badge
```

# 10 — Source Notes

本文档只记录当前设计所依赖的外部事实，不把外部实现当成稳定契约。

## Bilibili metadata

当前社区项目仍广泛使用：

```text
GET https://api.bilibili.com/x/web-interface/view?bvid=<BVID>
```

常见返回字段包括：

```text
data.bvid
data.aid
data.title
data.pubdate
```

本项目只依赖：

```text
data.pubdate
```

并必须做结构验证。

参考：

- https://github.com/inorilzy/bilibili-api/blob/main/api.md
- https://github.com/Rimagination/bili-note/blob/main/references/bilibili-api-notes.md

## Chrome Extension

最终扩展使用 Manifest V3。

Chrome 官方文档说明：

- `chrome.storage` 适用于扩展持久化数据；
- content script / service worker 均可访问扩展 Storage API；
- `storage.local` 更适合较大量本地数据；
- `scripting` API 仅在需要动态注入时才需要申请。

参考：

- https://developer.chrome.com/docs/extensions
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/scripting

## 设计限制

Bilibili DOM 和网页接口均视为：

```text
External Unstable Dependency
```

任何当前可用 selector / response shape 都不得进入核心域契约。

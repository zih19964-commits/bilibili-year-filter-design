# 08 — Implementation Plan

## Stage 0 — 技术探针

目标：

> 证明“能稳定识别卡片+BVID+年份”。

只做：

- 页面发现；
- BVID 提取；
- Metadata API；
- console 打印年份。

完成标准：

```text
首页 / 搜索 / UP空间
各随机验证 30 个卡片
年份与视频详情页发布日期一致
```

不做 UI。

---

## Stage 1 — Userscript MVP

增加：

```text
FilterEngine
Settings
Cache
RequestQueue
MutationObserver
基础浮动设置面板
```

完成标准：

- 指定年份可隐藏；
- 无限滚动可处理；
- 规则热更新；
- API 错误不误隐藏；
- 同 BVID 不重复请求。

---

## Stage 2 — Adapter 固化

拆分：

```text
HomeAdapter
SearchAdapter
SpaceAdapter
PopularAdapter
RelatedAdapter
```

增加 fixture contract test。

完成标准：

> DOM 代码不再散落在核心模块。

---

## Stage 3 — 稳定性

加入：

- negative cache；
- retry + jitter；
- circuit breaker；
- card registry；
- 性能监控；
- debug 日志。

完成标准：

连续浏览 10 分钟：

```text
无明显卡顿
无持续请求风暴
无 observer 自触发死循环
```

---

## Stage 4 — Extension MV3

将 userscript 中稳定模块复用到：

```text
Chrome / Edge extension
```

替换：

```text
localStorage
  ↓
chrome.storage.local
```

加入：

- popup；
- 页面悬浮快捷开关；
- manifest host permissions。

完成标准：

- Chrome unpacked extension 可安装；
- Edge 可加载；
- 设置重启浏览器后保留。

---

## Stage 5 — 产品化

可选：

- 导入/导出设置；
- 每个 B站 surface 单独开关；
- 临时“本页面停用”；
- 规则预设；
- 缓存统计/清空；
- GitHub release；
- Chrome Web Store。

## 不建议提前做

- React/Vue 大 UI；
- 后端服务；
- 用户账号系统；
- 云同步；
- 数据分析平台。

这个项目的核心困难是：

```text
页面适配可靠性
+
元数据解析成本
```

不是前端 UI 技术栈。

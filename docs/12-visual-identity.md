# README 与视觉资源

## 定位

主标题保持 Bilibili Year Filter，中文说明为“B站年份屏蔽”，不更改仓库名或扩展名称。
叙事是“厌倦 AI 流水线内容 → 自己选择年份 → 找回认真创作”。年份不是 AI 鉴定器，不把未知年份或内容新旧等同于质量。

## 资源

| 路径 | 用途 |
| --- | --- |
| `assets/brand/logo.svg` | 原创回拨时钟 + 双倒带箭头；README 品牌图标 |
| `assets/brand/hero.svg` | 主视觉；轨道逆转、时间光点回拨、新年份卡片淡出 |
| `assets/brand/how-it-works.svg` | 与实际设置字段一致的规则示意；虚线流动 |
| `assets/badges/` | 本地自包含徽章：脚本、扩展、浏览器、本地存储、MIT |
| `starter/extension/icons/icon{16,32,48,128}.png` | 同源 PNG 图标，接入 manifest 的 icons / action.default_icon |

底色深蓝绿 `#101e27`，主色薄荷青 `#8affdf`，点缀琥珀 `#ffcf85`、珊瑚 `#ff927f`。徽章不伪造下载量、测试通过率或浏览器商店上架状态。资源是本项目原创矢量绘制，不复制 Bilibili 官方标志，不打包字体。

## GitHub 展示

README 只使用普通 Markdown 和基础 HTML 排版。动画位于通过 `<img>` 引用的 SVG 中，不向 README 注入脚本、内联样式或交互控件。SVG 不含 JavaScript、foreignObject、外链字体、外链图片或运行时依赖。

README 使用 `picture` 在减少动态效果模式下选择 `*-static.svg`，SVG 内也保留 `prefers-reduced-motion` 规则；不播放动画时，静态画面仍能说明规则。不同图片代理或阅读器可能禁用动画。概念图明确标注“非实测截图”，不代表新版插件设置面板或已实现的 AI 识别功能。

参考：[GitHub Markup 的清洗规则](https://github.com/github/markup)、[Chrome 扩展图标格式](https://developer.chrome.com/docs/extensions/reference/manifest/icons)。扩展图标使用 PNG，不把 SVG 填入原生扩展图标字段。

## 维护边界

本次只更改 README、使用说明入口、展示资源和 manifest 图标字段；不更改过滤规则、页面适配器、存储、网络、权限、版本号或发布状态。

README 的精确屏蔽示例使用 `2024, 2025, 2026`，不是内置预设，不会随新年自动延长。默认不启用特殊内容过滤。主文案允许表达使用者对 AI 流水线内容的厌倦，但禁止改成“精准识别 AI”“彻底过滤 AI”“旧视频必然优质”或“自动找回全部旧视频”。

页面支持范围以 [实现状态](11-implementation-status.md) 的证据为基础，安装和设置步骤同时核对源码；跨标签页同步与卡片复用场景不得描述为已解决。独立的 [使用说明](../使用说明.md) 只链接到 README，避免重复维护。

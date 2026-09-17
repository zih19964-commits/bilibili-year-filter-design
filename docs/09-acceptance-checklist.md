# 09 — Acceptance Checklist

## 功能

- [ ] 可以开启/关闭过滤
- [ ] 可以排除单一年份
- [ ] 可以同时排除多个年份
- [ ] 可以隐藏某年份以前
- [ ] 可以只显示最近 N 年
- [ ] 可以切换 hide / dim / collapse
- [ ] 修改规则即时生效
- [ ] 可以按娱乐类、番剧/漫画、课堂、广告四组特殊标记过滤

## 页面

- [ ] 首页
- [ ] 搜索页
- [ ] UP 主空间
- [ ] 热门页
- [ ] 视频相关推荐

## 正确性

- [ ] 过滤使用实际发布时间
- [ ] 不根据标题猜年份
- [ ] UNKNOWN 永远不误隐藏
- [ ] 标题中的关键词不会被误当作特殊标记
- [ ] 同 BVID 重复卡片年份一致
- [ ] 跨年相对日期解析正确

## 性能

- [ ] MutationObserver 不做高频全页扫描
- [ ] 同 BVID 并发请求去重
- [ ] 正缓存有效
- [ ] 负缓存有效
- [ ] 最大并发受控
- [ ] 连续失败会熔断

## 可维护性

- [ ] DOM selector 只存在 Adapter
- [ ] API endpoint 只存在 API Provider
- [ ] FilterEngine 无 DOM / 网络依赖
- [ ] Renderer 幂等
- [ ] Storage schema 有版本
- [ ] Adapter 有 fixtures

## 安全/隐私

- [ ] 不请求 cookies 权限
- [ ] 不请求 history 权限
- [ ] 不存观看行为
- [ ] 不存搜索关键词
- [ ] debug log 不包含身份信息

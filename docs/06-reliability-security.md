# 06 — Reliability & Security

## 1. Failure Policy

核心原则：

```text
插件失败 ≠ B站页面失败
```

任何异常都不能：

- 阻止页面滚动；
- 阻止视频点击；
- 删除原始 DOM 内容；
- 循环请求；
- 无限产生 observer 回调。

## 2. Fail-open

以下情况全部：

```text
SHOW
```

- 无法提取 BVID；
- 日期无法解析；
- API 失败；
- 接口返回结构变化；
- 缓存损坏；
- 请求超时；
- 限流。

原因：

> 用户要求的是隐藏“确定属于某年份”的视频，
> 不是隐藏“我们不知道年份”的视频。

## 3. DOM 修改策略

禁止永久删除：

```js
element.remove()
```

优先：

```text
class 切换
```

因为用户可能即时改变过滤规则。

## 4. 最小权限

扩展建议仅需要：

```text
storage
```

和匹配 B站页面的 host 权限。

若采用声明式 content script，
通常不需要运行时 `scripting` 权限。

避免申请：

```text
tabs
history
cookies
webRequest
```

除非未来真实需求出现。

## 5. 数据最小化

只保存：

```text
BVID -> pubYear / pubTimestamp
用户过滤设置
```

不保存：

- 用户点击；
- 观看行为；
- 搜索关键词；
- UP 主偏好；
- Cookie；
- UID。

## 6. API 不稳定

Bilibili 网页接口不是本项目拥有的稳定公共契约。

因此 API Provider 必须：

```text
validate(response)
```

例如：

```ts
if (
  payload?.code !== 0 ||
  typeof payload?.data?.pubdate !== "number"
) {
  return UNKNOWN;
}
```

不能直接：

```ts
payload.data.pubdate
```

## 7. 熔断

连续大量 API 错误时：

```text
CLOSED
  ↓ N次连续失败
OPEN
  ↓ cooldown
HALF_OPEN
  ↓ 少量探测成功
CLOSED
```

建议第一版简化：

```text
10 次连续失败 -> 暂停网络解析 5 分钟
```

此时：

```text
已有缓存继续过滤
新未知视频保持显示
```

## 8. 日志

默认关闭详细日志。

debug 模式：

```text
[BYF] discovered BV...
[BYF] cache hit 2022
[BYF] api queued
[BYF] resolved 2019
[BYF] decision hide: excluded_year
```

日志禁止输出 Cookie / headers / 用户身份信息。

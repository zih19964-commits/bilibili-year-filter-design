# Implementation Task Prompt

你正在实现 `Bilibili Year Filter`。

先完整阅读：

```text
README.md
docs/00-product-spec.md
docs/01-architecture.md
docs/02-component-contracts.md
docs/07-test-plan.md
docs/08-implementation-plan.md
adr/*
```

## 硬约束

1. 不改变 `UNKNOWN => SHOW`。
2. DOM selector 只能存在 Page Adapter。
3. Bilibili API URL / response parsing 只能存在 API Provider。
4. FilterEngine 必须保持纯函数。
5. 不允许每次 Mutation 对整个 document 做全量扫描。
6. 同一 BVID 的并发 metadata 请求必须去重。
7. 正缓存长期保存，负缓存必须过期。
8. 不读取或保存 Cookie。
9. 不引入后端服务。
10. 不为了 UI 提前引入 React/Vue。

## 开发顺序

严格按：

```text
Stage 0 技术探针
Stage 1 Userscript MVP
Stage 2 Adapter 固化
Stage 3 稳定性
Stage 4 Extension MV3
```

推进。

每个 Stage 完成后：

- 运行该 Stage 相关测试；
- 输出实际通过的验收项；
- 记录与设计的偏差；
- 不允许静默修改核心语义。

## Stage 0 第一任务

只证明：

```text
Card -> BVID -> Publication Year
```

在：

```text
首页
搜索页
UP主空间
```

能够成立。

不要先做漂亮 UI。

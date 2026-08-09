---
kind: rks-task-contract
revision: 1
state: ready
---

# TaskContract: Refactor source layers before package split

## Context

### Source Request

用户确认将 MiniAgent 分为 core、engine、extensions、cli 四层，并要求开始完成拆包前重构；core 是不包含具体扩展、厂商适配和产品策略的裸内核，engine 和 extensions 基于 core 扩展，cli 在其上完成二次扩展和最终组装，同时要求通过 ESLint 等工具严格检查依赖方向。

### Current Situation

仓库当前仍是一个 npm 包，源码按 core、engine、tool、context、store、assembly、cli 等目录组织。运行时文件图没有循环，但目录作为未来包边界时存在 core 与 tool、assembly 与 tool、core 与 store 的双向依赖，且存在一个纯类型文件循环。现有 ESLint 仅检查通用 TypeScript 规则，不能阻止反向依赖、跨层深导入或循环重新出现。

## Goal

在保持单 npm 包的前提下，将源码重构为可独立拆分的 core、engine、extensions、cli 四层，消除反向和循环依赖，并通过持续执行的静态规则锁定层间依赖边界，使后续拆包无需再次设计或解耦架构。

## Scope

### In

- 将 Agent 原生扩展协议及其 Schema 归入 core，包括 Tool、ToolProvider、ToolApprover、capability、持久化抽象等由内核运行机制消费的契约。
- 将具体工具、上下文增强、文件持久化、MCP、Skill、Subagent 等可选实现归入 extensions。
- 保持 engine 为只依赖 core 的模型适配层。
- 将默认实现选择、blueprint 组装、session 产品能力和最终 composition root 归入 cli。
- 建立各层公开入口并整理内部导入，使跨层访问遵循稳定边界。
- 增加严格的自动依赖检查，覆盖层间方向、未知归属、跨层内部访问和循环依赖，并纳入现有 lint/发布前检查链路。
- 更新与源码层级、公开入口和开发检查直接相关的测试、文档及包导出配置。
- 保持现有受支持的公开 API 和 CLI 可观察行为兼容；为旧 tool 入口提供兼容迁移路径。

### Out

- 不在本任务中创建 npm workspace 或拆成多个实际 npm package。
- 不发布版本、不推送远端、不创建 PR。
- 不增加与四层边界无关的新 Agent、引擎、工具或 CLI 功能。
- 不主动修复与本次重构无关的既有问题。

## Constraints

- 依赖方向必须为：core 仅依赖自身；engine 仅依赖 core 和自身；extensions 仅依赖 core 和自身；cli 可以依赖前三层和自身。engine 与 extensions 不得互相依赖。
- core 可以实现 MiniAgent 运行机制和必要的内存态基础设施，但不得依赖具体引擎、具体扩展、CLI、厂商 SDK、文件系统适配或产品默认策略。
- CLI 是唯一负责选择并组装具体 engine 与 extensions 的 composition root。
- 自动依赖检查必须对普通导入和类型导入生效，且不得依赖长期维护的违规基线或大范围 inline disable。
- 遵守仓库现有 TypeScript、ESM、Zod、测试和提交前检查规则。

## Success Conditions

| ID | Observable condition | Required evidence |
|---|---|---|
| SC-1 | 生产源码能够明确归属 core、engine、extensions、cli 四层，旧的顶层 tool、context、store、assembly 不再承担独立架构层职责。 | 源码树、各层入口及变更审查。 |
| SC-2 | Tool、ToolProvider、ToolApprover、capability 和持久化抽象由 core 定义，core 不再导入具体 extension、engine 或 cli 实现。 | 静态依赖报告与针对 core 的边界规则通过。 |
| SC-3 | engine 与 extensions 均只向 core 依赖且互不依赖，具体默认实现只由 cli 组装。 | 静态依赖报告无禁止边，composition root 代码审查。 |
| SC-4 | 源码依赖图不存在运行时或纯类型循环，跨层调用不通过内部深路径或根聚合入口绕过公开边界。 | 循环和入口边界检查通过，并有回归测试证明违规示例会失败。 |
| SC-5 | 依赖边界检查作为 npm run lint 的强制部分执行，并因此进入现有 prepublishOnly 检查链路。 | package scripts 和一次成功的完整 lint 执行。 |
| SC-6 | 现有受支持的库入口与 CLI 行为保持兼容，同时提供明确的 extensions 公共入口或迁移出口。 | 公共导入 smoke test、CLI smoke test及相关既有测试通过。 |
| SC-7 | 重构后的仓库通过 lint、build 和完整常规测试，且没有遗留本任务引入的未提交或生成文件。 | 新鲜执行的 npm run lint、npm run build、npm test 结果及工作树检查。 |

## Authorization

| Capability | Evidence | Authorized scope |
|---|---|---|
| task | 用户在确认四层方案及严格依赖检查后明确指示：“ok，来我们开始完成这次重构任务吧” | 创建并执行本 TaskContract 所定义的单包四层重构、必要测试和验证，以及一个验证通过的本地结果提交。 |

## Requires Confirmation

- 实际拆分或发布 npm 包、推送远端、创建 PR，以及任何超出本 TaskContract 的兼容性破坏需要另行确认。

## Assumptions

- “core 没有任何实现的裸房”按已对齐含义解释为：core 保留 Agent 内核运行机制及必要的纯内存基础设施，但不包含具体扩展、外部适配器和产品策略。
- `extensions` 作为源码层和未来包名优先于 `plugin`，因为其同时容纳 Tool、持久化、上下文增强及集成适配等不同形态的扩展。

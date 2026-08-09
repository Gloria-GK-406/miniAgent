---
kind: rks-task-contract
revision: 1
state: ready
---

# TaskContract: Publish split MiniAgent 0.8 packages

## Context

### Source Request

用户在确认 extensions 的普通 dependency 会自动安装 core 后指示：“可以，那就这样试试看。发布一下0.8的包。在github我已经配置了npm的token，是有足够的权限的。”此前已对齐继续由 CI 生成发布产物，只发布 core、engine、extensions 三个包，不发布 CLI 或旧聚合包。

### Current Situation

仓库源码已经重构为 core、engine、extensions、cli 四层，但仍只有一个根 `package.json`，现有 GitHub Actions 只发布 `@piaoxianguo/miniagent`。编译后的 engine 和 extensions 仍通过仓库内部相对路径引用 core，尚不能作为独立 npm 包使用。npm Registry 当前不存在拟用的三个新包名。

## Goal

从当前单仓库和统一源码构建出可独立安装的 `@piaoxianguo/miniagent-core`、`@piaoxianguo/miniagent-engine`、`@piaoxianguo/miniagent-extensions` 0.8.0 包，通过 GitHub CI 按依赖顺序发布，并从 npm Registry 验证三个正式包能够共同安装和使用。

## Scope

### In

- 增加由 CI/脚本生成三个独立 npm 发布目录及 manifest 的机制，不再次搬迁源码。
- 将发布产物中的 engine/extensions 到 core 的仓库相对引用转换为正式 npm 包依赖。
- 为三个包声明最小且完整的 exports、运行时依赖、元数据和统一 0.8.0 版本。
- 阻止根聚合包被误发布，并停止 CI 发布旧的 `@piaoxianguo/miniagent`。
- 更新 CI，使其在完整验证后只发布三个新包，core 先于 engine/extensions，并安全跳过 npm 上已存在的同版本。
- 增加 tarball/临时消费者验证，并更新直接相关的安装与 import 文档。
- 创建一个验证通过的本地结果提交，将结果集成到 master，推送触发 CI，监控发布完成，并从 npm Registry 做真实安装验证。

### Out

- 不发布 CLI 包或新的 `@piaoxianguo/miniagent` 聚合版本。
- 不在本任务中建立 npm workspaces、拆分仓库或再次移动四层源码。
- 不发布 0.8.0 以外的版本，不废弃或删除 npm 上既有的 0.7.1 聚合包。
- 不增加与分包发布无关的 Agent、engine、extension 或 CLI 功能。

## Constraints

- 包依赖方向必须保持 core 无内部依赖，engine/extensions 将 core 声明为普通 `dependencies`，engine 与 extensions 互不依赖。
- 发布产物不得包含 CLI，也不得保留指向未随包发布的仓库内部 core 路径。
- npm 发布不可逆；必须在推送触发发布前完成独立审查、完整质量门禁、三个 tarball 的安装与公共入口 smoke 验证。
- 发布必须使用已配置的 GitHub npm 凭据和现有仓库 CI，不在本地读取、打印或转移 token。
- 任何包已存在同版本时 CI 必须跳过该包，使部分发布后的重试保持安全。

## Success Conditions

| ID | Observable condition | Required evidence |
|---|---|---|
| SC-1 | 构建流程生成名称、版本、exports 和文件范围正确的三个独立发布目录。 | 生成目录的 manifest 检查及三个 `npm pack --dry-run` 结果。 |
| SC-2 | engine/extensions 的正式产物依赖 core 包且没有仓库内部 core 路径、CLI 文件或 engine/extensions 横向依赖。 | 产物扫描、依赖清单和包内容检查。 |
| SC-3 | CI 仅发布三个新包，按 core 优先顺序执行，并逐包检查/跳过已发布版本。 | GitHub workflow 审查和自动化测试。 |
| SC-4 | 三个未发布 tarball 能在空白消费者项目中共同安装，根入口与所有声明子入口可被 Node/TypeScript 使用。 | 临时消费者安装、运行时 import smoke 和类型检查通过。 |
| SC-5 | 根仓库版本源为 0.8.0，根聚合包不可发布，直接相关文档使用新包名。 | 根 manifest、lockfile和文档审查。 |
| SC-6 | 发布变更通过仓库要求的 lint、build 和完整测试，并通过独立完整变更审查。 | 新鲜命令输出和批准的 review artifact。 |
| SC-7 | GitHub CI 成功完成，npm Registry 上三个包的 0.8.0 均可查询，并能从 Registry 在空白项目真实安装和导入。 | GitHub Actions run 结果、`npm view` 和 Registry 消费 smoke。 |

## Authorization

| Capability | Evidence | Authorized scope |
|---|---|---|
| task | 用户明确指示：“可以，那就这样试试看。发布一下0.8的包。在github我已经配置了npm的token，是有足够的权限的。” | 实现并验证三个 0.8.0 分包发布机制；创建本地结果提交；将验收结果集成到 master 并推送到现有 GitHub origin 触发 CI；监控 CI；通过已配置 token 发布且仅发布 core、engine、extensions 0.8.0；从 npm Registry 验证发布结果。 |

## Assumptions

- “0.8”解释为语义版本 `0.8.0`，三个包保持锁步版本。
- 使用此前建议且用户接受的包名：`@piaoxianguo/miniagent-core`、`@piaoxianguo/miniagent-engine`、`@piaoxianguo/miniagent-extensions`。
- 旧聚合包 `@piaoxianguo/miniagent` 保持在 0.7.1；本次不发布兼容聚合包，仓库中的 CLI 继续开发和验证但不再作为 npm bin 发布。
- 用户确认 GitHub 中的 npm token 权限足够，CI 可以沿用 `secrets.NPM_TOKEN`。

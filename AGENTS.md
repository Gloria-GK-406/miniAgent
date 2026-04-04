# MiniAgent

小型 Agent 框架，TypeScript + ESM + Zod。

## 项目结构

```
src/
  index.ts                              # 入口
  core/
    agent.ts                            # MiniAgent 类，主循环（注册、上下文构建、工具执行）
    types.ts                            # 所有 Zod schema、类型推导、枚举定义
    llm.ts                              # LLMEngine 抽象层、DefaultLLMEngineRegister、createLLMRequest
    message-source.ts                   # MessageSource 消息序列管理（含丢弃水位线）
  engine/
    anthropic/                          # Anthropic Claude 引擎
      engine.ts                         # createAnthropicEngine
      convert.ts                        # 消息/工具/响应转换 + buildCreateParams
      convert.test.ts
      index.ts
    openai/                             # OpenAI 引擎（无自定义 baseUrl）
      engine.ts                         # createOpenAIEngine，复用 openai-compatible
      index.ts
    openai-compatible/                  # OpenAI 兼容协议通用引擎
      engine.ts                         # createOpenAICompatibleEngine
      convert.ts                        # 消息/工具/响应转换 + buildCreateParams
      convert.test.ts
      index.ts
    glm/                                # 智谱 GLM 引擎（固定 baseUrl）
      engine.ts                         # createGLMEngine
      index.ts
    glm-codeplan/                       # 智谱 GLM CodePlan 引擎
      engine.ts                         # createGLMCodePlanEngine
      index.ts
```

## 技术栈

- Runtime: Node.js
- Language: TypeScript (strict, ESM)
- Package Manager: npm
- Schema: Zod（beta，兼容 v3 API）
- Test: Vitest
- Lint: ESLint (typescript-eslint)
- 外部 SDK: @anthropic-ai/sdk, openai, zod-to-json-schema

## 构建与开发命令

```bash
npm run build          # tsc 编译
npm run dev            # tsx 直接运行 src/index.ts
npm run start          # node dist/index.js
npm run typecheck      # tsc --noEmit 类型检查
npm run lint           # eslint src
npm run lint:fix       # eslint src --fix
npm test               # vitest run（运行所有测试）
npm run test:watch     # vitest watch 模式
```

### 运行单个测试文件

```bash
npx vitest run src/engine/anthropic/convert.test.ts
```

### 运行匹配名称的测试

```bash
npx vitest run -t "convertMessages"
```

## TypeScript 配置要点

- `"module": "nodenext"` + `"verbatimModuleSyntax": true`：必须使用 `import type` 导入纯类型
- `"strict": true` 加多项严格检查：
  - `noUncheckedIndexedAccess`：数组/对象索引返回 `T | undefined`
  - `exactOptionalPropertyTypes`：可选属性不允许显式 `undefined`
  - `noImplicitReturns`、`noImplicitOverride`、`noUnusedLocals`、`noUnusedParameters`
  - `noFallthroughCasesInSwitch`、`noPropertyAccessFromIndexSignature`
- `"isolatedModules": true`：每个文件独立可编译
- 导入路径**必须**带 `.js` 扩展名（如 `from "./types.js"`）

## ESLint 规则

- 继承：`@eslint/js` recommended + `typescript-eslint` recommended
- `@typescript-eslint/no-unused-vars`：允许 `_` 前缀的未使用变量/参数
- `@typescript-eslint/consistent-type-imports`：强制 `import { type X }` 内联类型导入风格

## 代码风格

### Imports

```typescript
// 类型导入：使用 inline type-imports 风格（ESLint 强制）
import type { Message, ModelConfig, Tool } from "../../core/types.js";
import type { AssistMessage, ToolCallMessage } from "../../core/types.js";
import { MessageType } from "../../core/types.js";

// 外部包
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import Anthropic from "@anthropic-ai/sdk";

// 导入路径必须带 .js 后缀
import { createLLMRequest } from "./llm.js";
```

### 类型定义

- **数据结构全部使用 Zod schema 定义**，然后用 `z.infer` 推导 TypeScript 类型（枚举除外）
- 枚举使用 `enum` 关键字：`enum MessageType { ... }`、`enum ActionType { ... }`
- Schema 命名：`XxxSchema`（如 `ToolSchema`、`MessageSchema`、`LLMEngineSchema`）
- 类型命名：`Xxx`（如 `Tool`、`Message`、`LLMEngine`），通过 `z.infer<typeof XxxSchema>` 获得
- 对象 schema 链式调用：`BaseMessageSchema.extend({ ... })`
- 联合类型：`z.union([Schema1, Schema2, ...])`

### 命名约定

- 类：PascalCase（`MiniAgent`、`MessageSource`、`DefaultLLMEngineRegister`）
- 函数/方法：camelCase（`createLLMRequest`、`buildCreateParams`、`convertResponse`）
- 工厂函数：`create` 前缀（`createAnthropicEngine`、`createOpenAIEngine`）
- 私有字段：无前缀，直接 camelCase（`messages`、`discardBeforeMessageId`）
- 常量：UPPER_SNAKE_CASE（`GLM_BASE_URL`）或 PascalCase（区分场景）
- 测试辅助函数：camelCase（`sysMsg`、`userMsg`、`toolCallMsg`）
- 文件名：kebab-case（`message-source.ts`、`glm-codeplan/`）

### 文件组织

- 每个 engine 目录结构统一：`engine.ts`（工厂）、`convert.ts`（转换逻辑）、`index.ts`（re-export）
- 测试文件与源文件同目录：`convert.test.ts`
- 模块导出集中在 `index.ts` barrel 文件

### 错误处理

- 使用 `throw new Error(...)` 抛出明确错误信息
- agent 主循环中通过 `ErrorHandler` 注册机制处理错误，不使用空 catch
- 异步操作使用 `async/await`

### 编码模式

- 优先不可变操作：`[...array]` 复制而非原地修改
- 使用 `Map` 管理注册表（tools、engines、clients）
- 条件属性使用展开运算符：`...(config.temperature !== undefined && { temperature: config.temperature })`
- 工厂模式创建引擎实例，通过 `LLMEngineSchema.parse()` 验证返回值
- 数组索引访问后用 `!` 非空断言或先做长度检查后用 `[0]!`

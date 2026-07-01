# Model Presets and Generation Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace caller-maintained model lists with engine-provided model presets, provider-level credentials, explicit model selection, and separate generation configuration.

**Architecture:** Add a new model/provider/generation type layer in `core/config.ts`, then route both legacy config and the new provider config into one internal resolved model shape. Refactor engine adapters so they expose model catalogs and accept a per-request provider/model/generation request, while keeping the old constructor registration path during migration.

**Tech Stack:** TypeScript strict ESM, Zod schemas, Vitest, OpenAI SDK, Anthropic SDK, existing MiniAgent event and tool loop.

---

## Source Spec

Read this first:

- `docs/superpowers/specs/2026-07-01-model-presets-generation-config-design.md`

## File Structure

- Modify `src/core/config.ts`: new schemas and exported types for thinking levels, model presets, provider configs, resolved models, model selectors, generation config, and new/legacy agent config compatibility.
- Modify `src/core/llm.ts`: new request type support, instance-based engine registration, legacy constructor compatibility, and engine lookup.
- Modify `src/core/agent.ts`: provider/model aggregation, current model state, generation config state, new public APIs, and run-loop request construction.
- Modify `src/core/types.ts`: broaden `LLMRequestSchema` so the new request object and legacy argument tuple both typecheck; keep message and stream schemas stable.
- Create `src/engine/*/models.ts`: model preset catalogs per built-in engine.
- Modify `src/engine/*/engine.ts`: support instance construction and request-based generation.
- Modify `src/engine/*/convert.ts`: consume `generation` and `resolvedModel` instead of legacy `ModelConfig` where needed.
- Modify `src/cli/config.ts`, `src/cli/cli-app.ts`, `src/cli/index.tsx`, and CLI model-selection components: new config shape, legacy migration, `/models`, `/model`.
- Update docs: `README.md`, `README_CN.md`, `document/cli/repl.md`, `document/cli/repl_CN.md`.
- Add or update tests beside the changed modules.

## Task 1: Core Config Types and Compatibility Normalization

**Files:**
- Modify: `src/core/config.ts`
- Test: `src/core/config.test.ts`
- Existing affected tests: `src/utils/config/service.test.ts`, `src/core/agent.test.ts`

- [ ] **Step 1: Write failing tests for new schemas and defaults**

Create `src/core/config.test.ts` with these tests:

```ts
import { describe, expect, it } from "vitest";
import {
  GenerationConfigSchema,
  normalizeGenerationConfig,
  ModelProviderConfigSchema,
  ResolvedModelSchema,
  ThinkingLevel,
} from "./config.js";

describe("model provider config", () => {
  it("accepts provider credentials with model additions", () => {
    const parsed = ModelProviderConfigSchema.parse({
      name: "local-qwen",
      engine: "openai-compatible",
      apiKey: "key",
      baseUrl: "http://localhost:8000/v1",
      models: {
        add: [
          {
            model: "qwen3-coder",
            contextSize: 128000,
            maxOutputTokens: 32768,
            thinkingLevels: ["none", "medium"],
          },
        ],
      },
    });

    expect(parsed.name).toBe("local-qwen");
    expect(parsed.models?.add?.[0]?.thinkingLevels).toEqual([
      ThinkingLevel.None,
      ThinkingLevel.Medium,
    ]);
  });

  it("normalizes missing generation config to MiniAgent defaults", () => {
    expect(normalizeGenerationConfig(undefined)).toEqual({
      temperature: 0.7,
      thinking: ThinkingLevel.Medium,
    });
  });

  it("keeps resolved models free of generation defaults", () => {
    const result = ResolvedModelSchema.safeParse({
      id: "glm-main/glm-5.2",
      provider: "glm-main",
      engine: "glm",
      model: "glm-5.2",
      contextSize: 128000,
      maxOutputTokens: 8192,
      thinkingLevels: ["none", "low", "medium", "high", "max"],
      temperature: 0.2,
    });

    expect(result.success).toBe(false);
  });

  it("accepts partial generation config updates", () => {
    const parsed = GenerationConfigSchema.partial().parse({
      thinking: "none",
    });

    expect(parsed.thinking).toBe(ThinkingLevel.None);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npx vitest run src/core/config.test.ts
```

Expected: FAIL because `GenerationConfigSchema`, `normalizeGenerationConfig`, `ModelProviderConfigSchema`, `ResolvedModelSchema`, and `ThinkingLevel` do not exist.

- [ ] **Step 3: Implement core schemas and helpers**

In `src/core/config.ts`, add these exports while preserving existing `ModelConfigSchema` for legacy callers:

```ts
export enum ThinkingLevel {
    None = "none",
    Low = "low",
    Medium = "medium",
    High = "high",
    Max = "max",
}

export const ThinkingLevelSchema = z.nativeEnum(ThinkingLevel);

export const ModelPresetSchema = z.object({
    model: z.string(),
    displayName: z.string().optional(),
    contextSize: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    thinkingLevels: z.array(ThinkingLevelSchema).min(1).default([ThinkingLevel.None]),
});

export type ModelPreset = z.infer<typeof ModelPresetSchema>;

export const ProviderModelOverridesSchema = z.object({
    add: z.array(ModelPresetSchema).optional(),
    override: z.record(ModelPresetSchema.partial().omit({ model: true })).optional(),
});

export type ProviderModelOverrides = z.infer<typeof ProviderModelOverridesSchema>;

export const ModelProviderConfigSchema = z.object({
    name: z.string(),
    engine: z.string(),
    apiKey: z.string(),
    baseUrl: z.string().optional(),
    models: ProviderModelOverridesSchema.optional(),
});

export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

export const ResolvedModelSchema = z.object({
    id: z.string(),
    provider: z.string(),
    engine: z.string(),
    model: z.string(),
    displayName: z.string().optional(),
    contextSize: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    thinkingLevels: z.array(ThinkingLevelSchema).min(1),
}).strict();

export type ResolvedModel = z.infer<typeof ResolvedModelSchema>;

export const ModelSelectorSchema = z.union([
    z.object({ id: z.string() }),
    z.object({ provider: z.string(), model: z.string() }),
]);

export type ModelSelector = z.infer<typeof ModelSelectorSchema>;

export const GenerationConfigSchema = z.object({
    temperature: z.number().min(0).max(2).default(0.7),
    topP: z.number().min(0).max(1).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    thinking: ThinkingLevelSchema.default(ThinkingLevel.Medium),
});

export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;
export type GenerationConfigInput = Partial<GenerationConfig>;

export function normalizeGenerationConfig(
    input?: GenerationConfigInput,
): GenerationConfig {
    return GenerationConfigSchema.parse(input ?? {});
}
```

Then extend `AgentConfigSchema` to accept both legacy and new fields without removing current required legacy fields yet. The first pass can make new fields optional:

```ts
export const AgentConfigSchema = z.object({
    model: ModelConfigSchema.optional(),
    models: z.map(z.string(), ModelGroupSchema).default(new Map()),
    providers: z.array(ModelProviderConfigSchema).optional(),
    defaultModel: ModelSelectorSchema.optional(),
    generation: GenerationConfigSchema.partial().optional(),
    plugins: z.map(z.string(), JsonValueSchema),
    paths: PathConfigSchema,
});
```

If TypeScript rejects `default(new Map())`, use `.optional()` and normalize in `MiniAgent` in Task 3.

- [ ] **Step 4: Run config tests**

Run:

```bash
npx vitest run src/core/config.test.ts src/utils/config/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Before commit, run:

```bash
npm run lint
npm run build
npm test
```

Then commit only Task 1 files:

```bash
git add src/core/config.ts src/core/config.test.ts src/utils/config/service.test.ts
git commit -m "feat: add model provider config schemas"
```

## Task 2: Engine Manager Instance Registration and Request Shape

**Files:**
- Modify: `src/core/llm.ts`
- Test: `src/core/llm.test.ts`

- [ ] **Step 1: Write failing tests for engine manager behavior**

Create `src/core/llm.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { Tool } from "../tool/types.js";
import { LLMEngineManager, createLLMStreamHandle } from "./llm.js";
import { MessageType, type LLMResponse, type Message } from "./types.js";
import { ThinkingLevel, type LLMGenerateRequest, type ModelPreset } from "./config.js";

function resolvedResponse(text: string) {
  const response: LLMResponse = {
    message: {
      id: "assist-1",
      type: MessageType.Assist,
      content: text,
    },
    tokenCount: { input: 0, output: 0, total: 0 },
  };
  const controller = createLLMStreamHandle<LLMResponse>();
  controller.resolve(response);
  return controller.handle;
}

describe("LLMEngineManager", () => {
  it("registers engine instances by their name", async () => {
    const seen: LLMGenerateRequest[] = [];
    const manager = new LLMEngineManager();
    manager.register({
      name: "test-engine",
      getModels(): ModelPreset[] {
        return [{ model: "m", thinkingLevels: [ThinkingLevel.None] }];
      },
      streamGenerate(request: LLMGenerateRequest) {
        seen.push(request);
        return resolvedResponse(request.model.model);
      },
    });

    const request: LLMGenerateRequest = {
      messages: [{ id: "u", type: MessageType.User, content: "hi" }] as Message[],
      tools: [] as Tool[],
      provider: { name: "p", engine: "test-engine", apiKey: "k" },
      model: {
        id: "p/m",
        provider: "p",
        engine: "test-engine",
        model: "m",
        thinkingLevels: [ThinkingLevel.None],
      },
      generation: { temperature: 0.7, thinking: ThinkingLevel.Medium },
    };

    const response = await manager.streamInvoke(request);
    expect(response.message).toMatchObject({ content: "m" });
    expect(seen).toHaveLength(1);
  });

  it("exposes models from a registered engine", () => {
    const manager = new LLMEngineManager();
    manager.register({
      name: "catalog",
      getModels: () => [{ model: "a", thinkingLevels: [ThinkingLevel.None] }],
      streamGenerate: () => resolvedResponse("ok"),
    });

    expect(manager.getEngineModels("catalog")).toEqual([
      { model: "a", thinkingLevels: [ThinkingLevel.None] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npx vitest run src/core/llm.test.ts
```

Expected: FAIL because `LLMGenerateRequest`, instance registration, and `getEngineModels` do not exist.

- [ ] **Step 3: Add request type and manager overloads**

In `src/core/config.ts`, add:

```ts
export const LLMGenerateRequestSchema = z.object({
    messages: z.array(z.custom<Message>()),
    tools: z.array(z.custom<Tool>()),
    provider: ModelProviderConfigSchema,
    model: ResolvedModelSchema,
    generation: GenerationConfigSchema,
});

export type LLMGenerateRequest = {
    messages: Message[];
    tools: Tool[];
    provider: ModelProviderConfig;
    model: ResolvedModel;
    generation: GenerationConfig;
};
```

Use `import type { Message } from "./types.js";` and `import type { Tool } from "../tool/types.js";`.

In `src/core/llm.ts`, change the engine interface to:

```ts
export interface LLMEngine {
  readonly name: string;
  getModels(): ModelPreset[];
  streamGenerate(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
}
```

Keep the legacy constructor type:

```ts
export type LegacyLLMEngine = {
  streamGenerate(messages: Message[], tools: Tool[]): LLMStreamHandle<LLMResponse>;
};

export type LLMEngineCtor = new (config: ModelConfig) => LegacyLLMEngine;
```

Add overloads:

```ts
register(engine: LLMEngine): void;
register(provider: string, ctor: LLMEngineCtor): void;
register(providerOrEngine: string | LLMEngine, ctor?: LLMEngineCtor): void {
  if (typeof providerOrEngine === "string") {
    if (!ctor) throw new Error(`No LLM engine constructor provided for provider: ${providerOrEngine}`);
    this.legacyCtors.set(providerOrEngine, ctor);
    return;
  }
  this.engines.set(providerOrEngine.name, providerOrEngine);
}
```

Support both invocation styles:

```ts
streamInvoke(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
streamInvoke(messages: Message[], config: ModelConfig, tools: Tool[]): LLMStreamHandle<LLMResponse>;
streamInvoke(
  requestOrMessages: LLMGenerateRequest | Message[],
  config?: ModelConfig,
  tools?: Tool[],
): LLMStreamHandle<LLMResponse> {
  if (Array.isArray(requestOrMessages)) {
    if (!config || !tools) throw new Error("Legacy streamInvoke requires config and tools");
    const engine = this.getLegacy(config);
    return engine.streamGenerate(requestOrMessages, tools);
  }
  const engine = this.engines.get(requestOrMessages.model.engine);
  if (!engine) {
    throw new Error(`No LLM engine registered for engine: ${requestOrMessages.model.engine}`);
  }
  return engine.streamGenerate(requestOrMessages);
}
```

Add:

```ts
getEngineModels(engineName: string): ModelPreset[] {
  const engine = this.engines.get(engineName);
  if (!engine) return [];
  return engine.getModels().map((model) => ({ ...model, thinkingLevels: [...model.thinkingLevels] }));
}
```

- [ ] **Step 4: Run manager tests**

Run:

```bash
npx vitest run src/core/llm.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run legacy tests**

Run:

```bash
npx vitest run src/core/agent.test.ts src/engine/openai-compatible/convert.test.ts src/engine/anthropic/convert.test.ts src/engine/glm/convert.test.ts
```

Expected: PASS. Fix type-only imports if TypeScript complains.

- [ ] **Step 6: Commit Task 2**

Before commit:

```bash
npm run lint
npm run build
npm test
```

Then:

```bash
git add src/core/llm.ts src/core/llm.test.ts src/core/config.ts
git commit -m "feat: support engine instance registration"
```

## Task 3: Engine Model Catalogs and Generation Mapping

**Files:**
- Create: `src/engine/anthropic/models.ts`
- Create: `src/engine/openai/models.ts`
- Create: `src/engine/openai-compatible/models.ts`
- Create: `src/engine/glm/models.ts`
- Create: `src/engine/glm-codeplan/models.ts`
- Create: `src/engine/nvidia/models.ts`
- Modify: `src/engine/*/engine.ts`
- Modify: `src/engine/openai-compatible/convert.ts`
- Modify: `src/engine/anthropic/convert.ts`
- Modify: `src/engine/glm/convert.ts`
- Test: `src/engine/*/models.test.ts`

- [ ] **Step 1: Write failing catalog tests**

For each engine directory, add a `models.test.ts`. Example for GLM:

```ts
import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { GLM_MODEL_PRESETS } from "./models.js";

describe("GLM model presets", () => {
  it("includes source-backed GLM chat models", () => {
    expect(GLM_MODEL_PRESETS.some((model) => model.model === "glm-5.2")).toBe(true);
    expect(GLM_MODEL_PRESETS.every((model) => model.thinkingLevels.length > 0)).toBe(true);
    expect(GLM_MODEL_PRESETS[0]?.thinkingLevels).toContain(ThinkingLevel.None);
  });
});
```

For `openai-compatible`, test an empty default catalog:

```ts
import { describe, expect, it } from "vitest";
import { OPENAI_COMPATIBLE_MODEL_PRESETS } from "./models.js";

describe("OpenAI-compatible model presets", () => {
  it("does not guess models for arbitrary compatible endpoints", () => {
    expect(OPENAI_COMPATIBLE_MODEL_PRESETS).toEqual([]);
  });
});
```

- [ ] **Step 2: Run catalog tests to verify RED**

Run:

```bash
npx vitest run src/engine/anthropic/models.test.ts src/engine/openai/models.test.ts src/engine/openai-compatible/models.test.ts src/engine/glm/models.test.ts src/engine/glm-codeplan/models.test.ts src/engine/nvidia/models.test.ts
```

Expected: FAIL because `models.ts` files do not exist.

- [ ] **Step 3: Add model preset files**

Use conservative source-backed entries. Keep arrays small and editable. Example style:

```ts
import { ThinkingLevel } from "../../core/config.js";
import type { ModelPreset } from "../../core/config.js";

export const GLM_MODEL_PRESETS: ModelPreset[] = [
  {
    model: "glm-5.2",
    displayName: "GLM 5.2",
    contextSize: 128000,
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
      ThinkingLevel.Max,
    ],
  },
  {
    model: "glm-4.5-air",
    displayName: "GLM 4.5 Air",
    contextSize: 128000,
    thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
  },
];
```

For `nvidia`, use:

```ts
import type { ModelPreset } from "../../core/config.js";

export const NVIDIA_MODEL_PRESETS: ModelPreset[] = [];
```

For `openai-compatible`, use an empty array.

- [ ] **Step 4: Update engine classes to expose names and catalogs**

For each engine class:

```ts
name = "glm" as const;

getModels(): ModelPreset[] {
  return GLM_MODEL_PRESETS.map((model) => ({
    ...model,
    thinkingLevels: [...model.thinkingLevels],
  }));
}
```

Allow constructors to receive optional legacy config:

```ts
constructor(config?: ModelConfig) {
  this.config = config;
  if (config) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || GLM_BASE_URL,
    });
  }
}
```

For request-based generation, build the client from `request.provider` and params from `request.model` plus `request.generation`.

- [ ] **Step 5: Map generation config in convert files**

Add helpers such as:

```ts
function mapThinkingToBoolean(level: ThinkingLevel): boolean {
  return level !== ThinkingLevel.None;
}
```

For GLM:

```ts
...(generation.thinking !== undefined && {
  thinking: {
    type: generation.thinking === ThinkingLevel.None ? "disabled" as const : "enabled" as const,
  },
}),
...(generation.maxOutputTokens !== undefined && {
  max_completion_tokens: generation.maxOutputTokens,
}),
...(generation.temperature !== undefined && {
  temperature: generation.temperature,
}),
...(generation.topP !== undefined && { top_p: generation.topP }),
```

Keep legacy `buildCreateParams(messages, config, tools)` exported and add a new request-oriented helper:

```ts
export function buildCreateParamsFromRequest(request: LLMGenerateRequest) {
  return buildCreateParams(
    request.messages,
    {
      provider: request.model.engine,
      model: request.model.model,
      apiKey: request.provider.apiKey,
      ...(request.provider.baseUrl !== undefined && { baseUrl: request.provider.baseUrl }),
      ...(request.generation.maxOutputTokens !== undefined && { maxOutputTokens: request.generation.maxOutputTokens }),
      temperature: request.generation.temperature,
      ...(request.generation.topP !== undefined && { topP: request.generation.topP }),
      thinking: request.generation.thinking !== ThinkingLevel.None,
    },
    request.tools,
  );
}
```

This first migration must preserve boolean legacy conversion and must map normalized levels to the closest available provider parameter in the current SDK surface. Engines without a typed level parameter use their existing boolean switch, so `none` disables thinking and every other level enables it.

- [ ] **Step 6: Run engine tests**

Run:

```bash
npx vitest run src/engine
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Before commit:

```bash
npm run lint
npm run build
npm test
```

Then:

```bash
git add src/engine src/core/config.ts
git commit -m "feat: add engine model presets"
```

## Task 4: MiniAgent Model Aggregation and Runtime APIs

**Files:**
- Modify: `src/core/agent.ts`
- Modify: `src/core/create-agent.ts`
- Test: `src/core/agent.test.ts`
- Test: `src/core/create-agent.test.ts`

- [ ] **Step 1: Write failing agent API tests**

Add tests to `src/core/agent.test.ts`:

```ts
import { ThinkingLevel } from "./config.js";
import type { LLMEngineManager } from "./llm.js";

function createNewConfig(basepersistdir: string): AgentConfig {
  return {
    providers: [
      {
        name: "test-main",
        engine: "test-engine",
        apiKey: "test-key",
        models: {
          add: [
            {
              model: "custom-model",
              contextSize: 32000,
              maxOutputTokens: 4096,
              thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
            },
          ],
        },
      },
    ],
    defaultModel: { id: "test-main/custom-model" },
    generation: { temperature: 0.2, thinking: ThinkingLevel.None },
    models: new Map(),
    plugins: new Map(),
    paths: { sessiondir: basepersistdir },
  };
}

it("aggregates provider-added models and exposes the current model", async () => {
  const llm = createLLM([
    wrapResponse({
      id: "assist-1",
      type: MessageType.Assist,
      content: "done",
    }),
  ]) as LLMRequest;
  const agent = new MiniAgent(llm, createNewConfig(testDir));

  expect(agent.getModels()).toEqual([
    {
      id: "test-main/custom-model",
      provider: "test-main",
      engine: "test-engine",
      model: "custom-model",
      contextSize: 32000,
      maxOutputTokens: 4096,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
    },
  ]);
  expect(agent.getCurrentModel().id).toBe("test-main/custom-model");
});

it("sets model without changing generation config", async () => {
  const agent = new MiniAgent(createLLM([]), {
    providers: [
      {
        name: "p",
        engine: "test",
        apiKey: "k",
        models: {
          add: [
            { model: "a", thinkingLevels: [ThinkingLevel.None] },
            { model: "b", thinkingLevels: [ThinkingLevel.None] },
          ],
        },
      },
    ],
    defaultModel: { id: "p/a" },
    generation: { temperature: 0.3, thinking: ThinkingLevel.High },
    models: new Map(),
    plugins: new Map(),
    paths: { sessiondir: testDir },
  });

  agent.setModel({ id: "p/b" });
  expect(agent.getCurrentModel().id).toBe("p/b");
  expect(agent.getGenerationConfig()).toEqual({
    temperature: 0.3,
    thinking: ThinkingLevel.High,
  });
});

it("merges generation config updates", async () => {
  const agent = new MiniAgent(createLLM([]), createNewConfig(testDir));
  agent.setGenerationConfig({ thinking: ThinkingLevel.Max });
  expect(agent.getGenerationConfig()).toEqual({
    temperature: 0.2,
    thinking: ThinkingLevel.Max,
  });
});
```

- [ ] **Step 2: Run agent tests to verify RED**

Run:

```bash
npx vitest run src/core/agent.test.ts
```

Expected: FAIL because new APIs do not exist.

- [ ] **Step 3: Implement aggregation in MiniAgent**

Add fields:

```ts
private providerConfigs: ModelProviderConfig[] = [];
private resolvedModels: ResolvedModel[] = [];
private currentModel: ResolvedModel;
private generationConfig: GenerationConfig;
```

Normalize constructor config:

```ts
this.providerConfigs = config.providers ?? legacyProvidersFromConfig(config);
this.resolvedModels = resolveModels(this.llm, this.providerConfigs);
this.currentModel = selectInitialModel(config, this.resolvedModels);
this.generationConfig = normalizeGenerationConfig(config.generation);
```

For legacy config, produce one provider/model pair from `config.model`:

```ts
function legacyProvidersFromConfig(config: AgentConfig): ModelProviderConfig[] {
  if (!config.model) return [];
  return [{
    name: config.model.provider,
    engine: config.model.provider,
    apiKey: config.model.apiKey,
    ...(config.model.baseUrl !== undefined && { baseUrl: config.model.baseUrl }),
    models: {
      add: [{
        model: config.model.model,
        ...(config.model.contextSize !== undefined && { contextSize: config.model.contextSize }),
        ...(config.model.maxOutputTokens !== undefined && { maxOutputTokens: config.model.maxOutputTokens }),
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
      }],
    },
  }];
}
```

When `llm` does not expose `getEngineModels`, aggregate only provider additions. This keeps existing mock `LLMRequest` tests working.

Add public APIs:

```ts
getModels(): ResolvedModel[] {
  return this.resolvedModels.map((model) => ({ ...model, thinkingLevels: [...model.thinkingLevels] }));
}

getCurrentModel(): ResolvedModel {
  return { ...this.currentModel, thinkingLevels: [...this.currentModel.thinkingLevels] };
}

setModel(selector: ModelSelector): void {
  const matches = "id" in selector
    ? this.resolvedModels.filter((model) => model.id === selector.id)
    : this.resolvedModels.filter((model) => model.provider === selector.provider && model.model === selector.model);
  if (matches.length === 0) {
    throw new Error(`Model not found. Available models: ${this.resolvedModels.map((model) => model.id).join(", ")}`);
  }
  if (matches.length > 1) {
    throw new Error(`Model selector is ambiguous. Use one of: ${matches.map((model) => model.id).join(", ")}`);
  }
  this.currentModel = matches[0]!;
}

getGenerationConfig(): GenerationConfig {
  return { ...this.generationConfig };
}

setGenerationConfig(update: GenerationConfigInput): void {
  this.generationConfig = normalizeGenerationConfig({
    ...this.generationConfig,
    ...update,
  });
}
```

Keep `getModelList()`, `getModelDisplayList()`, and `setModelByPath()` as deprecated wrappers over the new APIs.

- [ ] **Step 4: Update run loop request**

In `MiniAgent.run()`, when `llm.streamInvoke` supports the request shape, call:

```ts
const provider = this.providerConfigs.find((entry) => entry.name === this.currentModel.provider);
if (!provider) {
  throw new Error(`Provider not found for current model: ${this.currentModel.provider}`);
}
const stream = this.llm.streamInvoke({
  messages: context,
  tools,
  provider,
  model: this.currentModel,
  generation: this.generationConfig,
});
```

If TypeScript requires `LLMRequest` update, change `LLMRequest` in `src/core/types.ts` to accept both overload forms through `z.custom<LLMRequest>()` or a broadened function schema.

- [ ] **Step 5: Run agent and core tests**

Run:

```bash
npx vitest run src/core/agent.test.ts src/core/create-agent.test.ts src/core/llm.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Before commit:

```bash
npm run lint
npm run build
npm test
```

Then:

```bash
git add src/core/agent.ts src/core/agent.test.ts src/core/create-agent.ts src/core/create-agent.test.ts src/core/types.ts
git commit -m "feat: resolve provider model catalogs in agent"
```

## Task 5: CLI Config and Model Commands

**Files:**
- Modify: `src/cli/config.ts`
- Modify: `src/cli/cli-app.ts`
- Modify: `src/cli/index.tsx`
- Modify: `src/cli/components/App.tsx`
- Modify: `src/cli/components/ModelSelectView.tsx`
- Test: `src/cli/config.test.ts`
- Test: existing CLI tests

- [ ] **Step 1: Write failing CLI config tests**

Create or extend `src/cli/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../core/config.js";
import { CLIConfigSchema, toAgentProviders } from "./config.js";

describe("CLI model provider config", () => {
  it("accepts provider-level model additions", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          name: "local",
          engine: "openai-compatible",
          apiKey: "key",
          baseUrl: "http://localhost:8000/v1",
          models: {
            add: [
              {
                model: "qwen3-coder",
                thinkingLevels: ["none", "medium"],
              },
            ],
          },
        },
      ],
      defaultModel: "local/qwen3-coder",
      systemPrompt: "You are helpful.",
    });

    expect(config.providers[0]?.engine).toBe("openai-compatible");
    expect(toAgentProviders(config)[0]?.models?.add?.[0]?.thinkingLevels).toEqual([
      ThinkingLevel.None,
      ThinkingLevel.Medium,
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npx vitest run src/cli/config.test.ts
```

Expected: FAIL because `engine` and provider-level `models` are not accepted and `toAgentProviders` does not exist.

- [ ] **Step 3: Update CLI config schema**

Change provider schema to:

```ts
export const CLIProviderSchema = z.object({
  name: z.string(),
  engine: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  models: ProviderModelOverridesSchema.optional(),
});
```

Keep legacy support:

```ts
export const LegacyCLIProviderSchema = z.object({
  name: z.string(),
  provider: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
});

export const LegacyCLIModelSchema = CLIModelSchema;
```

Make `models` optional:

```ts
models: z.array(CLIModelSchema).default([]),
```

Add:

```ts
export function toAgentProviders(config: CLIConfig): ModelProviderConfig[] {
  const providers = config.providers.map((provider) => ({
    name: provider.name,
    engine: "engine" in provider ? provider.engine : provider.provider,
    apiKey: provider.apiKey,
    ...(provider.baseUrl !== undefined && { baseUrl: provider.baseUrl }),
    ...("models" in provider && provider.models !== undefined && { models: provider.models }),
  }));

  for (const model of config.models) {
    const provider = providers.find((entry) => entry.name === model.provider);
    if (!provider) continue;
    provider.models = {
      ...(provider.models ?? {}),
      add: [
        ...(provider.models?.add ?? []),
        {
          model: model.model,
          ...(model.contextSize !== undefined && { contextSize: model.contextSize }),
          ...(model.maxOutputTokens !== undefined && { maxOutputTokens: model.maxOutputTokens }),
          thinkingLevels: model.thinking === false
            ? [ThinkingLevel.None]
            : [ThinkingLevel.None, ThinkingLevel.Medium],
        },
      ],
    };
  }

  return providers;
}
```

- [ ] **Step 4: Update CLI app assembly**

In `src/cli/cli-app.ts`, register engines as instances:

```ts
manager.register(new AnthropicEngine());
manager.register(new OpenAIEngine());
manager.register(new OpenAICompatibleEngine());
manager.register(new GLMEngine());
manager.register(new GLMCodePlanEngine());
manager.register(new NVIDIAEngine());
```

Build agent config with:

```ts
providers: toAgentProviders(config),
defaultModel: parseDefaultModel(config.defaultModel),
generation: config.generation,
```

Keep legacy `activeModel` fields only for display during this migration. All model switching must use `ResolvedModel.id`.

Update `/models` and `/model` to use:

```ts
const models = currentAgent.getModels();
currentAgent.setModel({ id: arg });
const current = currentAgent.getCurrentModel();
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
npx vitest run src/cli
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Before commit:

```bash
npm run lint
npm run build
npm test
```

Then:

```bash
git add src/cli src/core/config.ts
git commit -m "feat: use provider model presets in cli"
```

## Task 6: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `document/cli/repl.md`
- Modify: `document/cli/repl_CN.md`
- Modify: `src/index.ts`
- Modify: `src/engine/index.ts`

- [ ] **Step 1: Update public exports**

In `src/index.ts`, export new types and schemas:

```ts
export {
    ThinkingLevel,
    ThinkingLevelSchema,
    ModelPresetSchema,
    ModelProviderConfigSchema,
    ProviderModelOverridesSchema,
    ResolvedModelSchema,
    ModelSelectorSchema,
    GenerationConfigSchema,
    normalizeGenerationConfig,
} from "./core/config.js";
export type {
    ModelPreset,
    ModelProviderConfig,
    ProviderModelOverrides,
    ResolvedModel,
    ModelSelector,
    GenerationConfig,
    GenerationConfigInput,
    LLMGenerateRequest,
} from "./core/config.js";
```

In `src/engine/index.ts`, no new runtime exports are required beyond existing engine classes unless a subagent added catalog exports intentionally. If catalog exports were added, export them from each engine `index.ts` and the top-level engine barrel.

- [ ] **Step 2: Update README examples**

Replace the old construction example with:

```ts
const engines = new LLMEngineManager();
engines.register(new AnthropicEngine());

const agent = new MiniAgent(engines, {
  providers: [
    {
      name: "anthropic-main",
      engine: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY!,
    },
  ],
  defaultModel: { id: "anthropic-main/claude-sonnet-4-5" },
  generation: {
    temperature: 0.7,
    thinking: ThinkingLevel.Medium,
  },
  models: new Map(),
  plugins: new Map(),
  paths: { sessiondir: "./sessions" },
});
```

Document:

```ts
agent.getModels();
agent.setModel({ id: "anthropic-main/claude-sonnet-4-5" });
agent.setGenerationConfig({ temperature: 0.2, thinking: ThinkingLevel.None });
```

- [ ] **Step 3: Update CLI docs**

Show `.cliagent/config.json` with:

```json
{
  "providers": [
    {
      "name": "anthropic-main",
      "engine": "anthropic",
      "apiKey": "sk-ant-..."
    },
    {
      "name": "local-qwen",
      "engine": "openai-compatible",
      "apiKey": "local",
      "baseUrl": "http://localhost:8000/v1",
      "models": {
        "add": [
          {
            "model": "qwen3-coder",
            "contextSize": 128000,
            "maxOutputTokens": 32768,
            "thinkingLevels": ["none", "medium"]
          }
        ]
      }
    }
  ],
  "defaultModel": "anthropic-main/claude-sonnet-4-5",
  "generation": {
    "temperature": 0.7,
    "thinking": "medium"
  },
  "systemPrompt": "You are a helpful assistant."
}
```

- [ ] **Step 4: Run final verification**

Run:

```bash
npm run lint
npm run build
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit Task 6**

```bash
git add README.md README_CN.md document/cli/repl.md document/cli/repl_CN.md src/index.ts src/engine
git commit -m "docs: document model preset configuration"
```

## Final Branch Verification

After all task commits:

```bash
npm run lint
npm run build
npm test
git status --short
```

Expected:

- lint passes
- build passes
- tests pass
- only pre-existing unrelated `package.json` and `package-lock.json` modifications remain unstaged if they were present before this work

## Architecture Gate

After implementation is complete and tests pass, run the SDD architecture touchpoint B:

- Dispatch architecture review against `docs/superpowers/specs/2026-07-01-model-presets-generation-config-design.md`.
- Because no `docs/architecture` tree exists, reconcile should recommend bootstrapping architecture docs from landed code if the project continues through that gate.
- Do not write architecture docs before the code is landed and verified.

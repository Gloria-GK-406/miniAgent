# Retire ModelConfig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. If subagents are unavailable, use `superpowers:executing-plans`. Keep this file updated with checkbox progress.

**Goal:** Remove the legacy `ModelConfig` / `ModelGroup` model configuration path and make provider presets, resolved models, and generation config the only model architecture.

**Architecture:** `LLMEngine` owns model catalogs, `MiniAgent` aggregates provider configs into resolved models, and every generation call uses one `LLMGenerateRequest` object. Generation parameters live only in `GenerationConfig`; resolved models contain identity and capability metadata only.

**Tech Stack:** TypeScript strict ESM, Zod, Vitest, npm, existing SDK engines, Ink CLI.

**Spec:** `docs/superpowers/specs/2026-07-02-retire-model-config-design.md`

**Branch:** `codex/model-presets-generation-config`

**Important repository rule:** Before every commit, run `npm run lint`, `npm run build`, and `npm test` in that order. Do not commit if any command fails. Do not stage the pre-existing dirty `package.json` or `package-lock.json` unless the task intentionally changes them.

---

## Task 1: Replace Core Config Schemas With Provider-Only Config

**Files:**
- `src/core/config.ts`
- `src/core/config.test.ts`
- `src/utils/config/aggregator.ts`
- `src/utils/config/resolver.ts`
- `src/utils/config/service.ts`
- `src/utils/config/service.test.ts`
- `src/index.ts`

### Tests First

- [ ] Add or update tests in `src/core/config.test.ts` proving old model config is rejected:

```typescript
import { describe, expect, it } from "vitest";
import {
  AgentConfigSchema,
  PersistConfigSchema,
  ThinkingLevel,
} from "./config.js";

describe("provider-only config schemas", () => {
  it("rejects legacy agent model fields", () => {
    const result = AgentConfigSchema.safeParse({
      model: { provider: "openai", model: "gpt-4o" },
      models: new Map(),
      providers: [],
      plugins: new Map(),
      paths: [],
    });

    expect(result.success).toBe(false);
  });

  it("parses provider-mode agent config", () => {
    const result = AgentConfigSchema.safeParse({
      providers: [
        {
          provider: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      defaultModel: { id: "fast" },
      generation: {
        temperature: 0.7,
        thinking: ThinkingLevel.Medium,
      },
      plugins: new Map(),
      paths: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects legacy persisted models", () => {
    const result = PersistConfigSchema.safeParse({
      models: {
        openai: {
          type: "openai",
          apiKey: "test-key",
          model: "gpt-4o",
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("parses provider-mode persisted config", () => {
    const result = PersistConfigSchema.safeParse({
      providers: [
        {
          provider: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      defaultModel: "fast",
      generation: {
        temperature: 0.2,
        thinking: "high",
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.defaultModel).toEqual({ id: "fast" });
  });
});
```

- [ ] Add or update config resolver tests in `src/utils/config/service.test.ts`:

```typescript
it("merges provider-mode configs and lets runtime activeModel override defaultModel", async () => {
  await writeConfig("base.json", {
    providers: [
      {
        provider: "openai",
        key: "base-key",
        models: [{ id: "fast", name: "gpt-4o-mini" }],
      },
    ],
    defaultModel: "fast",
    generation: { temperature: 0.2, thinking: "low" },
  });

  const result = await service.load({
    configFiles: [join(tempDir, "base.json")],
    runtime: {
      activeModel: "fast",
    },
  });

  expect(result.agentConfig.providers).toHaveLength(1);
  expect(result.agentConfig.defaultModel).toEqual({ id: "fast" });
  expect(result.agentConfig.generation).toMatchObject({
    temperature: 0.2,
    thinking: "low",
  });
});

it("replaces duplicate providers by name during aggregation", async () => {
  await writeConfig("base.json", {
    providers: [{ provider: "openai", key: "old-key" }],
  });
  await writeConfig("override.json", {
    providers: [{ provider: "openai", key: "new-key" }],
  });

  const result = await service.load({
    configFiles: [join(tempDir, "base.json"), join(tempDir, "override.json")],
  });

  expect(result.agentConfig.providers).toEqual([
    expect.objectContaining({ provider: "openai", key: "new-key" }),
  ]);
});
```

- [ ] Run focused tests and confirm they fail for the expected reason:

```bash
npx vitest run src/core/config.test.ts src/utils/config/service.test.ts
```

### Implementation

- [ ] Delete `ModelConfigSchema`, `ModelConfig`, `ModelGroupSchema`, and `ModelGroup` from `src/core/config.ts`.
- [ ] Keep only these model-related schemas and types:
  - `ThinkingLevel`
  - `ModelPresetSchema` / `ModelPreset`
  - `ProviderModelOverridesSchema` / `ProviderModelOverrides`
  - `ModelProviderConfigSchema` / `ModelProviderConfig`
  - `ResolvedModelSchema` / `ResolvedModel`
  - `ModelSelectorSchema` / `ModelSelector`
  - `GenerationConfigSchema` / `GenerationConfig`
  - `LLMGenerateRequestSchema` / `LLMGenerateRequest`
- [ ] Add a reusable selector input schema so persisted config can accept strings while runtime config remains normalized:

```typescript
const PersistModelSelectorSchema = z.union([
  z.string().min(1).transform((id) => ({ id })),
  ModelSelectorSchema,
]);
```

- [ ] Make `PersistConfigFileSchema` strict and provider-only:

```typescript
export const PersistConfigFileSchema = z
  .object({
    providers: z.array(ModelProviderConfigSchema).default([]),
    defaultModel: PersistModelSelectorSchema.optional(),
    generation: GenerationConfigSchema.optional(),
    plugins: PluginRegistrySchema.default(() => new Map()),
  })
  .strict();
```

- [ ] Make runtime config strict and provider-only:

```typescript
export const AgentConfigSchema = z
  .object({
    providers: z.array(ModelProviderConfigSchema).default([]),
    defaultModel: ModelSelectorSchema.optional(),
    generation: GenerationConfigSchema.optional(),
    plugins: PluginRegistrySchema.default(() => new Map()),
    paths: z.array(z.string()).default([]),
  })
  .strict();
```

- [ ] Update `RuntimeConfigSchema` / config service runtime input so `activeModel` can be a string and becomes `{ id }` before reaching `AgentConfig`.
- [ ] Rewrite `PersistentConfigAggregator` to merge only:
  - `providers`: later provider with the same `provider` name replaces earlier provider.
  - `defaultModel`: later value replaces earlier value.
  - `generation`: later object shallow-merges over earlier object.
  - `plugins`: later map entries replace earlier entries.
- [ ] Rewrite `AgentConfigResolver` to output only `{ providers, defaultModel, generation, plugins, paths }`.
- [ ] Remove all `models` and `model` references from `src/utils/config/*`.
- [ ] Update `src/index.ts` exports so old schemas/types are no longer exported.

### Verification

- [ ] Run:

```bash
npx vitest run src/core/config.test.ts src/utils/config/service.test.ts
npm run lint
npm run build
npm test
```

- [ ] Commit:

```bash
git add src/core/config.ts src/core/config.test.ts src/utils/config/aggregator.ts src/utils/config/resolver.ts src/utils/config/service.ts src/utils/config/service.test.ts src/index.ts
git commit -m "refactor: remove legacy model config schemas"
```

---

## Task 2: Collapse LLM Interfaces To Request Mode

**Files:**
- `src/core/types.ts`
- `src/core/llm.ts`
- `src/core/llm.test.ts`
- `src/index.ts`

### Tests First

- [ ] Add tests proving the manager accepts engine instances only and streams request objects only:

```typescript
it("registers engine instances by engine.name", () => {
  const manager = new DefaultLLMEngineRegister();
  manager.register(fakeEngine("openai", [{ id: "fast", name: "gpt-4o-mini" }]));

  expect(manager.getEngineModels("openai")).toEqual([
    { id: "fast", provider: "openai", name: "gpt-4o-mini" },
  ]);
});

it("streams a single LLMGenerateRequest to the selected engine", async () => {
  const calls: LLMGenerateRequest[] = [];
  const manager = new DefaultLLMEngineRegister();
  manager.register({
    name: "openai",
    getModels: () => [{ id: "fast", name: "gpt-4o-mini" }],
    streamGenerate: async function* (request) {
      calls.push(request);
      yield { type: "message_start" };
    },
  });

  const request = {
    model: {
      id: "fast",
      provider: "openai",
      name: "gpt-4o-mini",
      capabilities: { thinking: [] },
      metadata: {},
    },
    messages: [],
    tools: [],
    generation: { temperature: 0.7, thinking: "medium" },
  } satisfies LLMGenerateRequest;

  await Array.fromAsync(manager.streamInvoke(request));

  expect(calls).toEqual([request]);
});

it("rejects legacy constructor registration at runtime", () => {
  const manager = new DefaultLLMEngineRegister();

  expect(() => manager.register("openai" as never)).toThrow(
    /engine instance/i,
  );
});
```

- [ ] Run focused test and confirm it fails:

```bash
npx vitest run src/core/llm.test.ts
```

### Implementation

- [ ] In `src/core/types.ts`, remove `ModelAwareLLMRequest` and `ModelAwareLLMRequestSchema`.
- [ ] Define `LLMRequest` as request-only:

```typescript
export interface LLMRequest {
  getEngineModels(engineName: string): ResolvedModel[];
  streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk>;
}
```

- [ ] In `src/core/llm.ts`, remove:
  - `LegacyLLMEngine`
  - `ModelCatalogLLMEngine`
  - `LLMEngineCtor`
  - constructor registration overloads
  - `legacyCtors`
  - `legacyCache`
  - legacy `streamInvoke(messages, config, tools)` overload
- [ ] Define `LLMEngine` as:

```typescript
export interface LLMEngine {
  readonly name: string;
  getModels(): ModelPreset[];
  streamGenerate(request: LLMGenerateRequest): AsyncGenerator<MessageChunk>;
}
```

- [ ] Make `DefaultLLMEngineRegister.register(engine)` validate:
  - `engine` is an object.
  - `engine.name` is a non-empty string.
  - `engine.getModels` is a function.
  - `engine.streamGenerate` is a function.
- [ ] Keep `getEngineModels(engineName)` returning resolved models with provider injected from `engine.name`.
- [ ] Keep returned model arrays cloned so consumers cannot mutate engine catalogs.
- [ ] Update exports in `src/index.ts`.

### Verification

- [ ] Run:

```bash
npx vitest run src/core/llm.test.ts
npm run lint
npm run build
npm test
```

- [ ] Commit:

```bash
git add src/core/types.ts src/core/llm.ts src/core/llm.test.ts src/index.ts
git commit -m "refactor: require request-mode llm engines"
```

---

## Task 3: Move Model Resolution Into Provider Presets And Simplify MiniAgent

**Files:**
- `src/core/agent.ts`
- `src/core/agent.test.ts`
- `src/core/model-resolution.ts` (new file)
- `src/index.ts`

### Tests First

- [ ] Add tests in `src/core/agent.test.ts` for the new public API:

```typescript
it("aggregates resolved models from registered engines and provider overrides", () => {
  const llm = new DefaultLLMEngineRegister();
  llm.register(fakeEngine("openai", [
    {
      id: "gpt-4o-mini",
      name: "gpt-4o-mini",
      contextSize: 128000,
      maxOutput: 16384,
      capabilities: { thinking: [] },
    },
  ]));

  const agent = new MiniAgent({
    llm,
    config: {
      providers: [
        {
          provider: "openai",
          key: "test-key",
          models: [
            {
              id: "fast",
              name: "gpt-4o-mini",
              contextSize: 64000,
            },
          ],
        },
      ],
      plugins: new Map(),
      paths: [],
    },
  });

  expect(agent.getModels()).toEqual([
    expect.objectContaining({
      id: "fast",
      provider: "openai",
      name: "gpt-4o-mini",
      contextSize: 64000,
      maxOutput: 16384,
    }),
  ]);
});

it("setResolvedModel only changes selected model", () => {
  const agent = createAgentWithModels();

  agent.setResolvedModel({ id: "fast" });

  expect(agent.getCurrentResolvedModel()?.id).toBe("fast");
  expect(agent.getGenerationConfig()).toEqual({
    temperature: 0.7,
    thinking: "medium",
  });
});

it("setGenerationConfig only changes generation config", () => {
  const agent = createAgentWithModels();

  agent.setGenerationConfig({ temperature: 0.1, thinking: "high" });

  expect(agent.getGenerationConfig()).toEqual({
    temperature: 0.1,
    thinking: "high",
  });
});

it("does not expose legacy model APIs", () => {
  const agent = createAgentWithModels() as unknown as Record<string, unknown>;

  expect(agent.setModel).toBeUndefined();
  expect(agent.getCurrentModel).toBeUndefined();
  expect(agent.getModelList).toBeUndefined();
  expect(agent.setModelByPath).toBeUndefined();
});
```

- [ ] Add a run-loop test proving `MiniAgent` always sends `LLMGenerateRequest`:

```typescript
it("sends request-mode generate calls during run", async () => {
  const calls: LLMGenerateRequest[] = [];
  const agent = createAgentWithStreamingEngine({
    streamGenerate: async function* (request) {
      calls.push(request);
      yield { type: "message_start" };
      yield { type: "message_stop" };
    },
  });

  agent.addUserMessage("hello");
  await agent.run({ maxTurns: 1 });

  expect(calls[0]).toMatchObject({
    model: expect.objectContaining({ id: "fast", provider: "openai" }),
    generation: { temperature: 0.7, thinking: "medium" },
  });
});
```

- [ ] Run focused tests and confirm failures:

```bash
npx vitest run src/core/agent.test.ts
```

### Implementation

- [ ] Create `src/core/model-resolution.ts` with pure helper functions:

```typescript
export function resolveModelsFromProviders(
  providers: ModelProviderConfig[],
  llm: Pick<LLMRequest, "getEngineModels">,
): ResolvedModel[] {
  // For each provider:
  // 1. Get engine presets with llm.getEngineModels(provider.provider).
  // 2. If provider.models is absent or empty, expose all engine presets.
  // 3. If provider.models is present, overlay each override onto its matching preset by name or id.
  // 4. Resolved model must contain provider, id, name, capabilities, metadata,
  //    contextSize, and maxOutput when available.
}

export function selectResolvedModel(
  models: ResolvedModel[],
  selector: ModelSelector | undefined,
): ResolvedModel | undefined {
  // Match by selector.id first.
  // If selector.provider is present, require provider equality.
  // If selector.name is present, allow name fallback.
  // If selector is undefined, return models[0].
}
```

- [ ] Include tests for these helpers either in `src/core/agent.test.ts` or a new `src/core/model-resolution.test.ts`.
- [ ] In `src/core/agent.ts`, remove all legacy helpers and fields:
  - `cloneModelConfig`
  - `cloneModelConfigs`
  - `legacyProvidersFromConfig`
  - `flattenLegacyModelConfigs`
  - `generationInputFromModelConfig`
  - `hasGenerationFields`
  - `legacyGenerationFields`
  - `currentLegacyModelConfig`
  - `legacyModelConfigs`
  - `generationWasExplicitlyConfigured`
- [ ] Replace model state with:

```typescript
private resolvedModels: ResolvedModel[];
private currentModel: ResolvedModel | undefined;
private generationConfig: GenerationConfig;
```

- [ ] Initialize default generation config to:

```typescript
const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.7,
  thinking: ThinkingLevel.Medium,
} satisfies GenerationConfig;
```

- [ ] Keep public APIs:
  - `getModels(): ResolvedModel[]`
  - `getResolvedModels(): ResolvedModel[]`
  - `getCurrentResolvedModel(): ResolvedModel | undefined`
  - `setResolvedModel(selector: ModelSelector): void`
  - `getGenerationConfig(): GenerationConfig`
  - `setGenerationConfig(config: GenerationConfig): void`
- [ ] Remove public APIs:
  - `setModel`
  - `getCurrentModel`
  - `getModelList`
  - `setModelByPath`
- [ ] In `run`, always build:

```typescript
const request = {
  model: currentModel,
  messages: context,
  tools,
  generation: this.generationConfig,
} satisfies LLMGenerateRequest;
```

- [ ] If no current model can be selected, throw an explicit error before generation:

```typescript
throw new Error("No model is available. Configure providers or register engine models first.");
```

- [ ] Make config notifier snapshots provider-only. When `setResolvedModel` succeeds, update `defaultModel` to `{ id, provider, name }` for the current resolved model.
- [ ] Update `src/index.ts` to export model-resolution helpers if useful for CLI/config tests.

### Verification

- [ ] Run:

```bash
npx vitest run src/core/agent.test.ts src/core/model-resolution.test.ts
npm run lint
npm run build
npm test
```

- [ ] Commit:

```bash
git add src/core/agent.ts src/core/agent.test.ts src/core/model-resolution.ts src/core/model-resolution.test.ts src/index.ts
git commit -m "refactor: resolve models from providers in agent"
```

---

## Task 4: Convert ContextCompressor To Request Mode

**Files:**
- `src/context/compressor.ts`
- `src/context/compressor.test.ts`

### Tests First

- [ ] Add compressor tests:

```typescript
it("builds a request-mode summarization call", async () => {
  const requests: LLMGenerateRequest[] = [];
  const compressor = new ContextCompressor({
    llm: {
      getEngineModels: () => [
        {
          id: "fast",
          provider: "openai",
          name: "gpt-4o-mini",
          capabilities: { thinking: [] },
          metadata: {},
        },
      ],
      streamInvoke: async function* (request) {
        requests.push(request);
        yield { type: "message_delta", content: "summary" };
        yield { type: "message_stop" };
      },
    },
    config: {
      providers: [{ provider: "openai", key: "test-key" }],
      defaultModel: { id: "fast" },
      generation: { temperature: 0.2, thinking: "low" },
      plugins: new Map(),
      paths: [],
    },
  });

  await compressor.compress(messages);

  expect(requests[0]).toMatchObject({
    model: expect.objectContaining({ id: "fast", provider: "openai" }),
    generation: { temperature: 0.2, thinking: "low" },
  });
});

it("skips compression when no configured model can resolve", async () => {
  let called = false;
  const compressor = new ContextCompressor({
    llm: {
      getEngineModels: () => [],
      streamInvoke: async function* () {
        called = true;
      },
    },
    config: {
      providers: [{ provider: "openai", key: "test-key" }],
      defaultModel: { id: "missing" },
      plugins: new Map(),
      paths: [],
    },
  });

  const result = await compressor.compress(messages);

  expect(called).toBe(false);
  expect(result).toEqual(messages);
});
```

- [ ] Run focused test and confirm failure:

```bash
npx vitest run src/context/compressor.test.ts
```

### Implementation

- [ ] Remove `ModelConfig` import and `modelConfig` field.
- [ ] Store provider-mode `AgentConfig`.
- [ ] Use `resolveModelsFromProviders` and `selectResolvedModel` to choose the summarization model.
- [ ] Apply default generation config `{ temperature: 0.7, thinking: "medium" }` when config does not specify generation.
- [ ] If selected model is missing, return original messages unchanged.
- [ ] Call `llm.streamInvoke(request)` with `LLMGenerateRequest`.

### Verification

- [ ] Run:

```bash
npx vitest run src/context/compressor.test.ts
npm run lint
npm run build
npm test
```

- [ ] Commit:

```bash
git add src/context/compressor.ts src/context/compressor.test.ts
git commit -m "refactor: use request mode in context compressor"
```

---

## Task 5: Remove Legacy Engine Paths

**Files:**
- `src/engine/anthropic/engine.ts`
- `src/engine/anthropic/convert.ts`
- `src/engine/anthropic/convert.test.ts`
- `src/engine/openai-compatible/engine.ts`
- `src/engine/openai-compatible/convert.ts`
- `src/engine/openai-compatible/convert.test.ts`
- `src/engine/openai/engine.ts`
- `src/engine/glm/engine.ts`
- `src/engine/glm-codeplan/engine.ts`
- engine `index.ts` files if exports change

### Tests First

- [ ] Update conversion tests so they only call request-mode builders:

```typescript
const request = {
  model: {
    id: "fast",
    provider: "openai",
    name: "gpt-4o-mini",
    capabilities: { thinking: ["none", "medium"] },
    metadata: {},
  },
  messages: [userMsg("hello")],
  tools: [],
  generation: { temperature: 0.4, thinking: "medium" },
} satisfies LLMGenerateRequest;

expect(buildCreateParamsFromRequest(request)).toMatchObject({
  model: "gpt-4o-mini",
  temperature: 0.4,
});
```

- [ ] Add tests for thinking downgrade behavior in request mode:
  - boolean-only engines map `none` to disabled and all other levels to enabled.
  - engines with levels map unsupported levels to the nearest supported lower level.
  - engines that do not support thinking silently omit thinking params.

- [ ] Run focused engine tests and confirm failures:

```bash
npx vitest run src/engine/anthropic/convert.test.ts src/engine/openai-compatible/convert.test.ts
```

### Implementation

- [ ] Remove engine factory config arguments that existed only for legacy model binding.
- [ ] Remove old `streamGenerate(messages, tools)` implementation paths.
- [ ] Keep `getModels()` on every engine.
- [ ] Make every engine implement:

```typescript
streamGenerate(request: LLMGenerateRequest): AsyncGenerator<MessageChunk>
```

- [ ] Delete legacy `buildCreateParams(messages, config, tools)` helpers or make them private request-only helpers. Public exports should expose only request-mode builders if tests need them.
- [ ] Ensure `createOpenAIEngine`, `createGLMEngine`, and `createGLMCodePlanEngine` still set provider-specific API key / base URL behavior via provider config at request time or engine construction only where it is not model config.
- [ ] Ensure `generation.thinking` downgrade remains internal to each engine. Unsupported thinking must not throw.
- [ ] Run a source sweep:

```bash
rg "ModelConfig|ModelGroup|LegacyLLMEngine|LLMEngineCtor|ModelAwareLLMRequest" src/engine
```

The command must print no matches.

### Verification

- [ ] Run:

```bash
npx vitest run src/engine/anthropic/convert.test.ts src/engine/openai-compatible/convert.test.ts
npm run lint
npm run build
npm test
```

- [ ] Commit:

```bash
git add src/engine/anthropic src/engine/openai-compatible src/engine/openai src/engine/glm src/engine/glm-codeplan
git commit -m "refactor: remove legacy engine generation paths"
```

---

## Task 6: Convert CLI To Provider-Only Model Selection

**Files:**
- `src/cli/config.ts`
- `src/cli/cli-app.ts`
- `src/cli/index.tsx`
- CLI tests under `src/cli/**/*.test.ts`

### Tests First

- [ ] Update CLI config tests:

```typescript
it("rejects top-level legacy models", () => {
  const result = CLIConfigSchema.safeParse({
    models: {
      default: {
        type: "openai",
        apiKey: "test-key",
        model: "gpt-4o",
      },
    },
  });

  expect(result.success).toBe(false);
});

it("rejects legacy provider aliases", () => {
  const result = CLIConfigSchema.safeParse({
    providers: [{ provider: "openai", key: "test-key" }],
  });

  expect(result.success).toBe(false);
});

it("parses provider-mode CLI config", () => {
  const result = CLIConfigSchema.safeParse({
    providers: [
      {
        engine: "openai",
        key: "test-key",
        models: [{ id: "fast", name: "gpt-4o-mini" }],
      },
    ],
    defaultModel: "fast",
    generation: { temperature: 0.6, thinking: "medium" },
  });

  expect(result.success).toBe(true);
});
```

- [ ] Update CLI app tests so model switching calls `setResolvedModel({ id })` and generation changes call `setGenerationConfig(...)`.
- [ ] Run focused CLI tests and confirm failures:

```bash
npx vitest run src/cli
```

### Implementation

- [ ] Remove `CLIModelSchema`, `CLIModel`, `models`, `toModelConfig`, `findModel`, `findLegacyModel`, `applyLegacyGenerationForModel`, and model-level generation merging from `src/cli/config.ts`.
- [ ] Keep one provider input shape:

```typescript
const CLIProviderSchema = z
  .object({
    engine: z.string().min(1),
    key: z.string().optional(),
    baseURL: z.string().optional(),
    models: z.array(ProviderModelOverridesSchema).optional(),
  })
  .strict();
```

- [ ] Convert `engine` to `ModelProviderConfig.provider` in `toAgentProviders`.
- [ ] Keep generation only at top-level `generation`.
- [ ] In `src/cli/cli-app.ts`, remove:
  - `CLIModel` imports
  - `ModelConfig` / `ModelGroup` imports
  - `activeModel: CLIModel | undefined`
  - `buildModelsMap`
  - `resolveModelConfig`
  - `tryResolveModelConfig`
  - `toSwitchGenerationConfig`
  - legacy subagent `model` config
- [ ] Make CLI model state use `ResolvedModel | undefined`.
- [ ] Make model list and switch commands use:

```typescript
agent.getModels();
agent.setResolvedModel({ id: selected.id, provider: selected.provider });
```

- [ ] Make generation commands call `agent.setGenerationConfig`.
- [ ] Make subagent creation pass provider-mode config only:

```typescript
config: {
  providers,
  defaultModel: parentAgent.getCurrentResolvedModel()
    ? {
        id: parentAgent.getCurrentResolvedModel()!.id,
        provider: parentAgent.getCurrentResolvedModel()!.provider,
      }
    : undefined,
  generation: parentAgent.getGenerationConfig(),
  plugins,
  paths,
}
```

- [ ] Update `src/cli/index.tsx` to remove legacy fallback calls to `setModelByPath`.

### Verification

- [ ] Run:

```bash
npx vitest run src/cli
npm run lint
npm run build
npm test
```

- [ ] Commit:

```bash
git add src/cli
git commit -m "refactor: switch cli to provider model config"
```

---

## Task 7: Update Public Docs And Remove Old References

**Files:**
- `README.md`
- `README_CN.md`
- `document/cli/repl.md`
- `document/cli/repl_CN.md`
- `src/index.ts`
- any tests that assert public exports

### Tests First

- [ ] Add or update export tests if present. Public exports must not include:
  - `ModelConfigSchema`
  - `ModelConfig`
  - `ModelGroupSchema`
  - `ModelGroup`
  - `ModelAwareLLMRequestSchema`
  - `ModelAwareLLMRequest`

- [ ] Run:

```bash
npx vitest run src/index.test.ts
```

If no index export test exists, skip this focused command and rely on build plus final source sweep.

### Implementation

- [ ] Rewrite examples to provider-only config:

```typescript
const agent = new MiniAgent({
  llm,
  config: {
    providers: [
      {
        provider: "openai",
        key: process.env.OPENAI_API_KEY,
        models: [{ id: "fast", name: "gpt-4o-mini" }],
      },
    ],
    defaultModel: { id: "fast" },
    generation: {
      temperature: 0.7,
      thinking: "medium",
    },
    plugins: new Map(),
    paths: [],
  },
});
```

- [ ] Remove migration wording that suggests `model`, `models`, or model-level generation still works.
- [ ] Document the final public model APIs:
  - `getModels`
  - `getResolvedModels`
  - `getCurrentResolvedModel`
  - `setResolvedModel`
  - `getGenerationConfig`
  - `setGenerationConfig`

### Verification

- [ ] Run:

```bash
npm run lint
npm run build
npm test
```

- [ ] Commit:

```bash
git add README.md README_CN.md document/cli/repl.md document/cli/repl_CN.md src/index.ts
git commit -m "docs: document provider-only model config"
```

---

## Task 8: Final No-Legacy Sweep And Architecture Touchpoint

**Files:**
- source, tests, and docs touched by previous tasks
- architecture docs only if created by the selected architecture-document skill

### Required Sweep

- [ ] Run the final legacy source sweep:

```bash
rg "ModelConfig|ModelConfigSchema|ModelGroup|LegacyLLMEngine|LLMEngineCtor|ModelAwareLLMRequest|setModelByPath|getCurrentModel|getModelList|CLIModelSchema" src test document README.md README_CN.md
```

The command must return no production or user-facing documentation matches. Historical matches inside `docs/superpowers/specs` and `docs/superpowers/plans` are allowed only because they describe the retired architecture and this implementation plan.

- [ ] Run final verification:

```bash
npm run lint
npm run build
npm test
```

### Architecture Touchpoint B

- [ ] Because this repo currently has no `docs/architecture` tree, perform the architecture bootstrap/reconcile step after implementation lands and tests pass:
  - Use `arch-doc-build` for the affected units if creating architecture docs from scratch.
  - At minimum cover:
    - `src/core/config.ts`
    - `src/core/llm.ts`
    - `src/core/agent.ts`
    - `src/core/model-resolution.ts`
    - `src/context/compressor.ts`
    - `src/cli/config.ts`
    - engine request-mode contracts
  - Do not block implementation on missing architecture docs before this point.

- [ ] If architecture docs are added or updated, run:

```bash
npm run lint
npm run build
npm test
```

- [ ] Commit final sweep/docs if there are changes:

```bash
git add docs src README.md README_CN.md document
git commit -m "docs: record provider model architecture"
```

### Completion Criteria

- [ ] All old model config schemas, types, fields, helpers, and public APIs are removed.
- [ ] `MiniAgent` has one request-mode generation path.
- [ ] Engines expose catalogs and accept `LLMGenerateRequest`.
- [ ] CLI config and persisted config are provider-only.
- [ ] Unsupported thinking modes downgrade inside engines without throwing.
- [ ] Final `npm run lint`, `npm run build`, and `npm test` all pass.
- [ ] The only allowed references to retired names are historical notes in committed SDD spec/plan documents.


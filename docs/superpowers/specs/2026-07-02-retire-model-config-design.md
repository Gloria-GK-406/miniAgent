# Retire ModelConfig Design

## Goal

MiniAgent should fully retire the legacy `ModelConfig` / `ModelGroup` model
configuration path and use only the provider/model/generation architecture.
There is no compatibility requirement for this pre-stable branch.

After this change, model-related semantics are split into exactly three layers:

- `ModelProviderConfig`: provider profile and credentials.
- `ModelPreset` / `ResolvedModel`: model facts and capabilities.
- `GenerationConfig`: runtime generation preferences.

No schema, API, engine, CLI config, or test should keep accepting the old
single-object shape that mixed provider credentials, model identity, model
facts, and generation parameters.

## Current State

The previous model-preset work introduced the new architecture but kept the old
path as a migration bridge. The bridge now creates duplicate semantics:

- `ModelConfigSchema` still contains provider credentials, model identity,
  context/output limits, and generation options in one object.
- `AgentConfigSchema` still accepts `model` and `models`.
- `ModelGroupSchema` and `PersistConfigSchema.models` still describe model
  groups.
- `LLMRequest` still has `streamInvoke(messages, config, tools)`.
- `LLMEngineManager` still supports constructor registration and a legacy cache.
- Built-in engines still accept optional constructor-bound `ModelConfig` and
  implement both legacy and request-mode engine interfaces.
- `MiniAgent` keeps legacy fields and APIs such as `getCurrentModel()`,
  `setModel(ModelConfig)`, `getModelList()`, and `setModelByPath()`.
- CLI accepts top-level `models`, legacy provider `provider`, and per-model
  generation fields.
- `ContextCompressor` summarizes via the legacy request path.
- `utils/config` resolves old persisted model groups into `AgentConfig`.

This is acceptable during migration, but it is now actively confusing the
domain model. The next step should remove the bridge rather than rename it.

## Target Public Model

### Core Config Schemas

Keep:

```ts
ThinkingLevelSchema
ModelPresetSchema
ProviderModelOverridesSchema
ModelProviderConfigSchema
ResolvedModelSchema
ModelSelectorSchema
GenerationConfigSchema
LLMGenerateRequestSchema
PathConfigSchema
RuntimeConfigSchema
AgentConfigSchema
```

Remove:

```ts
ModelConfigSchema
ModelGroupSchema
PersistConfigFileSchema as old model-group shape
PersistConfigSchema as old model-group shape
```

`AgentConfigSchema` becomes strict and contains only:

```ts
{
  providers: ModelProviderConfig[];
  defaultModel?: ModelSelector;
  generation?: Partial<GenerationConfig>;
  plugins: Map<string, JsonValue>;
  paths: PathConfig;
}
```

`AgentConfig` no longer accepts `model` or `models`. Passing those fields should
fail validation in focused tests.

`ModelProviderConfigSchema` should also be strict enough that callers cannot
smuggle old per-model generation fields into provider config.

### Persisted Config

The repo's `utils/config` package should move to provider-mode instead of
keeping old groups:

```ts
PersistConfigFileSchema = {
  providers?: ModelProviderConfig[];
  defaultModel?: string | ModelSelector;
  generation?: Partial<GenerationConfig>;
  plugins?: Record<string, JsonValue>;
}
```

Runtime config may still provide `activeModel` as a string resolved id for
convenience. The resolver converts strings to `{ id }` selectors before
returning `AgentConfig`.

When aggregating multiple persisted files:

- later `providers` with the same `name` replace earlier providers;
- `defaultModel` and `generation` from later files override earlier files;
- `plugins` keep the existing shallow merge behavior.

This preserves a useful config-file utility without retaining the old model
group concept.

## LLM Boundary

`LLMRequest` should become request-mode only:

```ts
interface LLMRequest {
  getEngineModels(engineName: string): ModelPreset[];
  streamInvoke(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
}
```

`ModelAwareLLMRequest` becomes unnecessary and should be removed.

`LLMEngine` should be the request-mode engine interface:

```ts
interface LLMEngine {
  readonly name: string;
  getModels(): ModelPreset[];
  streamGenerate(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
}
```

Remove:

- `LegacyLLMEngine`
- `LLMEngineCtor`
- `ModelCatalogLLMEngine`
- constructor registration overloads
- legacy engine cache
- `streamInvoke(messages, config, tools)`

`LLMEngineManager.register()` accepts only an `LLMEngine` instance. Engine names
continue to come from `engine.name`.

## MiniAgent Boundary

`MiniAgent` should keep only the new runtime model APIs:

```ts
getModels(): ResolvedModel[];
getResolvedModels(): ResolvedModel[];
getCurrentResolvedModel(): ResolvedModel;
setResolvedModel(selector: ModelSelector): void;
getGenerationConfig(): GenerationConfig;
setGenerationConfig(update: GenerationConfigInput): void;
```

Remove:

- `getCurrentModel()`
- `setModel(ModelConfig)`
- `getModelList()`
- `setModelByPath()`
- all legacy model config fields and helper functions

The run loop always builds:

```ts
{
  messages,
  tools,
  provider,
  model: currentResolvedModel,
  generation: currentGenerationConfig,
}
```

and calls `llm.streamInvoke(request)`.

`ConfigNotifier` should receive the current provider-mode `AgentConfig`. When
`setResolvedModel()` changes the current model, the notified config should carry
the current selector in `defaultModel`, so config-aware components can follow
runtime model changes without `ModelConfig`.

## Context Compression

`ContextCompressor` must stop depending on `config.model` and the old
`streamInvoke(messages, config, tools)` signature.

It should store the latest provider-mode `AgentConfig` from `setConfig()`, then
build a summarization `LLMGenerateRequest` using:

- `config.providers`;
- `config.defaultModel` as the current selector;
- `config.generation`, normalized with MiniAgent defaults;
- `llm.getEngineModels(provider.engine)` to resolve the selected model.

If the selected model cannot be resolved, compression should skip rather than
throw. This matches the current "compression failure should not break the agent"
behavior.

To avoid duplicating resolution logic, expose a small core helper such as:

```ts
resolveModelsFromProviders(llm: LLMRequest, providers: ModelProviderConfig[]): ResolvedModel[];
selectResolvedModel(models: ResolvedModel[], selector: ModelSelector): ResolvedModel;
```

or keep equivalent internal helpers in a focused module used by both
`MiniAgent` and `ContextCompressor`.

## Engine Boundary

All built-in engines become request-mode only:

- constructor takes no `ModelConfig`;
- class implements only `LLMEngine`;
- `streamGenerate(request)` is the only generation entry point;
- client construction uses `request.provider`;
- provider API params are built from `request.model` and
  `request.generation`.

Convert helpers should stop exporting legacy
`buildCreateParams(messages, config, tools)` functions. Existing convert tests
should be rewritten around `LLMGenerateRequest`.

NVIDIA conversion currently has legacy-only tests. Replace those with
request-mode conversion coverage so every built-in engine is tested through
`LLMGenerateRequest`.

## CLI Boundary

CLI config should support only provider-mode:

```json
{
  "providers": [
    {
      "name": "anthropic-main",
      "engine": "anthropic",
      "apiKey": "sk-ant-..."
    }
  ],
  "defaultModel": "anthropic-main/claude-sonnet-4-5",
  "generation": {
    "temperature": 0.7,
    "thinking": "medium"
  }
}
```

Remove:

- `CLIModelSchema`;
- top-level `models`;
- legacy provider `provider`;
- `toModelConfig`;
- `findLegacyModel`;
- `applyLegacyGenerationForModel`;
- legacy per-model generation behavior;
- `buildModelsMap`;
- `resolveModelConfig`.

`defaultModel` may remain a string resolved id in the CLI file for ergonomics.
CLI parsing converts it to `{ id }` before constructing `AgentConfig`.

`/model` should only switch by resolved model id. The interactive selector
already displays resolved ids, so this is consistent with the visible CLI
surface.

Subagent definitions may keep a `model` string field, but it should mean a
resolved model id only.

## Public Exports And Docs

Remove exports for:

- `ModelConfigSchema`
- `ModelConfig`
- `ModelGroupSchema`
- `ModelGroup`
- old model-group semantics from `PersistConfigFileSchema` and
  `PersistConfigSchema`
- `LegacyLLMEngine`
- `LLMEngineCtor`
- `ModelCatalogLLMEngine`
- `ModelAwareLLMRequestSchema`
- `ModelAwareLLMRequest`

Provider-mode persisted config remains public under `PersistConfigFileSchema`
and `PersistConfigSchema`, but those names must now expose only the new
provider-mode semantics. Documentation must present them as provider-mode only.

README and CLI docs should remove migration wording that says legacy top-level
`models` still load.

## Error Handling

- `AgentConfigSchema` rejects `model` and `models`.
- `CLIConfigSchema` rejects top-level `models` and legacy provider `provider`.
- Registering an engine with a duplicate name throws because provider/model
  catalogs should be deterministic.
- Missing provider, missing default model, and unknown selector errors should
  continue to include available model ids.
- Unsupported thinking levels continue to downgrade inside engines rather than
  failing in MiniAgent.
- Compression resolution failures should skip compression and preserve current
  fallback-summary behavior for stream/API failures.

## Testing Requirements

Add or update focused tests for:

- `AgentConfigSchema` rejects legacy `model` and `models`.
- `CLIConfigSchema` rejects top-level `models` and provider `provider`.
- `LLMEngineManager` no longer accepts constructor registration and only invokes
  request-mode engines.
- Built-in engines construct without config and generate only from
  `LLMGenerateRequest`.
- `MiniAgent.run()` always sends request-mode `LLMGenerateRequest`.
- Removed APIs no longer appear in TypeScript-facing tests or exports.
- `ContextCompressor` builds a request-mode summarization request.
- `utils/config` resolves provider-mode persisted config.
- `rg "ModelConfig|ModelConfigSchema|ModelGroup|LegacyLLMEngine|LLMEngineCtor|ModelAwareLLMRequest|setModelByPath|getCurrentModel|getModelList|CLIModelSchema"` returns no production-code hits after the removal, except historical docs/specs if intentionally left.

Existing tests that only assert legacy behavior should be deleted or rewritten
to assert provider-mode behavior.

## Non-Goals

- No migration helper for old config files.
- No deprecated aliases.
- No runtime warning path for old APIs.
- No attempt to keep constructor-bound engine plugins working.

This is a hard pre-stable cleanup.

## Architecture Impact

No `docs/architecture` tree exists in this repository, so Touchpoint A has no
recorded invariants to load or declare against. This spec intentionally changes
the LLM/model configuration boundary. At Touchpoint B, after code lands and
tests/review pass, architecture review/reconcile should recommend bootstrapping
architecture documentation from the landed provider-mode code if this branch
continues through that gate.

No architecture document is created or edited before implementation, because
documents must trail landed code.

## Acceptance Criteria

- `ModelConfigSchema`, `ModelConfig`, and `ModelGroupSchema` are gone from
  source exports and production code.
- `LLMRequest` and `LLMEngine` are request-mode only.
- `MiniAgent` has no legacy model APIs.
- CLI config is provider-mode only.
- `ContextCompressor` summarizes through `LLMGenerateRequest`.
- `utils/config` no longer contains model groups.
- Documentation describes only provider/model/generation config.
- `npm run lint`, `npm run build`, and `npm test` pass.

# Model Presets and Generation Config Design

## Goal

MiniAgent should no longer require callers to pre-build a complete model list.
Engines should expose source-backed model presets, MiniAgent should aggregate
those presets with user provider credentials and optional model additions, and
runtime model selection should be separate from generation configuration.

## Current State

Today `MiniAgent` receives an `AgentConfig` with one active `model` plus a
`models` map. The CLI reads `.cliagent/config.json` as separate `providers` and
`models`, then converts them into `ModelConfig` objects. `LLMEngineManager`
registers engine constructors under string provider names and constructs an
engine per `ModelConfig`.

This creates two problems:

- Users must maintain model names, context sizes, and token limits in their own
  config even for built-in engines.
- Runtime options such as `temperature` and `thinking` are mixed into model
  identity/configuration, which makes switching models less predictable.

## Design Summary

Introduce model preset catalogs on engines, provider-level credentials in
MiniAgent config, a `ResolvedModel` list produced by MiniAgent, and a separate
`GenerationConfig` for runtime generation preferences.

The key split is:

- `ResolvedModel` describes model facts and capabilities.
- `GenerationConfig` describes the current generation preferences.
- Engines map MiniAgent's normalized generation config to provider-specific API
  parameters and silently degrade unsupported thinking settings.

## Public API Shape

### Engine Registration

`LLMEngineManager` should move toward registering engine adapter instances by
their own names:

```ts
interface LLMEngine {
  readonly name: string;
  getModels(): ModelPreset[];
  streamGenerate(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
}

const engines = new LLMEngineManager();
engines.register(new AnthropicEngine());
engines.register(new OpenAIEngine());
engines.register(new GLMEngine());
```

The old constructor-based registration can remain as a compatibility overload
during migration:

```ts
engines.register("anthropic", AnthropicEngine); // deprecated
```

### MiniAgent Config

New config shape:

```ts
const agent = new MiniAgent(engines, {
  providers: [
    {
      name: "glm-main",
      engine: "glm",
      apiKey: process.env.GLM_API_KEY!,
      models: {
        add: [
          {
            model: "private-finetune",
            displayName: "Private Fine Tune",
            contextSize: 128000,
            maxOutputTokens: 8192,
            thinkingLevels: ["none", "medium"],
          },
        ],
        override: {
          "glm-5.2": {
            displayName: "GLM 5.2 Main",
          },
        },
      },
    },
    {
      name: "local-qwen",
      engine: "openai-compatible",
      apiKey: "local",
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
    },
  ],
  defaultModel: { id: "glm-main/glm-5.2" },
  generation: {
    temperature: 0.7,
    thinking: "medium",
  },
  plugins: new Map(),
  paths: { sessiondir: "./sessions" },
});
```

`provider.name` is the user-facing credential/profile name. `provider.engine` is
the engine adapter name. This keeps multiple `openai-compatible` endpoints
usable in one agent.

### Model Types

```ts
type ThinkingLevel = "none" | "low" | "medium" | "high" | "max";

interface ModelPreset {
  model: string;
  displayName?: string;
  contextSize?: number;
  maxOutputTokens?: number;
  thinkingLevels: ThinkingLevel[];
}

interface ResolvedModel {
  id: string;
  provider: string;
  engine: string;
  model: string;
  displayName?: string;
  contextSize?: number;
  maxOutputTokens?: number;
  thinkingLevels: ThinkingLevel[];
}
```

`ResolvedModel` must not contain generation defaults such as `temperature`,
`topP`, or default `thinking`. It only describes identity, limits, and supported
capabilities. `contextSize` and `maxOutputTokens` are model facts.

### Generation Config

```ts
interface GenerationConfig {
  temperature: number;
  topP?: number;
  maxOutputTokens?: number;
  thinking: ThinkingLevel;
}
```

MiniAgent defaults:

```ts
{
  temperature: 0.7,
  thinking: "medium",
}
```

`maxOutputTokens` in `GenerationConfig` is an optional requested cap. The
matching `ResolvedModel.maxOutputTokens` is the model's maximum supported
output. Engines may clamp or omit request caps according to provider rules.

### Runtime Methods

```ts
agent.getModels(): ResolvedModel[];

agent.getCurrentModel(): ResolvedModel;

agent.setModel({ id: "glm-main/glm-5.2" });
agent.setModel({ provider: "glm-main", model: "glm-5.2" });

agent.getGenerationConfig(): GenerationConfig;

agent.setGenerationConfig({
  temperature: 0.2,
  thinking: "none",
});
```

`setModel()` only changes the active model. It accepts explicit selectors, not
arbitrary `Partial<ResolvedModel>` objects, so model selection remains
unambiguous.

`setGenerationConfig()` only changes generation preferences. It does not change
the active model.

## Thinking Compatibility

MiniAgent exposes one normalized set of thinking levels:

```ts
"none" | "low" | "medium" | "high" | "max"
```

Engine mapping rules:

- Engines with provider-native levels map each MiniAgent level to the closest
  provider value.
- Engines with only boolean thinking expose `["none", "medium"]`; `"none"`
  maps to `false`, and every non-`none` value maps to `true`.
- Engines or models without thinking support expose `["none"]`; non-`none`
  settings silently degrade to no thinking inside the engine.

MiniAgent itself should not reject a generation config just because the current
model does not advertise that exact level. The engine is the authority for
provider-specific downgrade behavior.

Known provider hints as of 2026-07-01:

- OpenAI's current reasoning documentation lists model-dependent values that can
  include `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`; MiniAgent maps
  `max` to `xhigh` where supported.
- Anthropic's model overview states newer models expose adaptive thinking and
  points to an `effort` parameter for Opus 4.8 and Sonnet 5; MiniAgent should map
  levels to Anthropic effort where the SDK/API supports it.
- GLM Coding Plan documentation maps Claude Code `low`, `medium`, and `high` to
  GLM `high`, and `max`-like modes to GLM `max`; non-CodePlan GLM can continue
  to use boolean `thinking` when no finer API is available.
- NVIDIA and generic OpenAI-compatible engines should treat provider/model
  thinking support as best-effort and degrade silently unless a model-specific
  preset states otherwise.

## Model Catalog Policy

Model presets are source-backed and intentionally conservative. They should
include only chat/text models supported by the corresponding MiniAgent engine.
Image, video, embedding, reranking, speech, and realtime-only models are out of
scope for the initial catalog.

Official sources checked on 2026-07-01:

- Anthropic model overview:
  https://docs.anthropic.com/en/docs/about-claude/models/overview
- Anthropic Models API reference:
  https://docs.anthropic.com/en/api/models-list
- OpenAI model overview:
  https://platform.openai.com/docs/models
- OpenAI reasoning guide:
  https://platform.openai.com/docs/guides/reasoning
- Zhipu/GLM model overview:
  https://docs.bigmodel.cn/cn/guide/start/model-overview
- Zhipu/GLM Coding Plan model switching guide:
  https://docs.bigmodel.cn/cn/coding-plan/latest-model
- NVIDIA NIM API catalog and API reference:
  https://build.nvidia.com/models
  https://docs.api.nvidia.com/nim/reference/llm-apis
  https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html

Initial built-in catalog expectations:

- `anthropic`: source-backed Claude chat models that are generally usable from
  the first-party API. Include context window, max output, and thinking levels
  only where the official docs are explicit.
- `openai`: source-backed OpenAI chat/reasoning models visible in the official
  model docs. Include context window, max output, and thinking levels where
  listed.
- `glm`: source-backed GLM text models from the official model overview, such as
  GLM-5.2, GLM-5.1, GLM-5, GLM-5-Turbo, GLM-4.7, GLM-4.7-FlashX, GLM-4.6,
  GLM-4.5-Air, GLM-4.5-AirX, GLM-4-Long, and compatible flash variants.
- `glm-codeplan`: start with GLM-5.2 and GLM-4.7 family models explicitly
  mentioned by the Coding Plan docs, including the 1M-context variant naming
  where applicable.
- `nvidia`: do not attempt to freeze the entire dynamic API catalog. Provide a
  small source-backed seed only if it can be verified, and rely on provider
  `models.add` for the common case.
- `openai-compatible`: no universal built-in model catalog. Users add models at
  the provider level.

The catalog must be easy to update without changing stream conversion logic.
Prefer small `models.ts` files per engine over embedding catalog data in
`engine.ts`.

## Data Flow

1. `LLMEngineManager` registers engine adapters.
2. `MiniAgent` receives provider configs.
3. MiniAgent asks each provider's engine for `ModelPreset[]`.
4. MiniAgent applies provider `models.override` and `models.add`.
5. MiniAgent produces stable `ResolvedModel.id` values using
   `${provider.name}/${model}`.
6. `setModel()` selects one `ResolvedModel`.
7. `setGenerationConfig()` mutates the current generation preferences.
8. Each turn sends an `LLMGenerateRequest` containing:
   - messages
   - tools
   - resolved provider credentials
   - selected resolved model
   - generation config
9. The engine converts the request into provider SDK parameters and consumes the
   provider stream into MiniAgent stream chunks and final `LLMResponse`.

## Compatibility and Migration

The implementation should avoid an immediate breaking cliff:

- Keep current `AgentConfig.model`/`AgentConfig.models` support temporarily.
- Keep constructor-based engine registration temporarily.
- Add new schemas/types alongside old ones, then route both into a common
  internal resolved-provider/resolved-model shape.
- Mark old APIs as deprecated in docs.
- Update CLI docs and config template to prefer provider-level model catalog
  usage.

CLI migration:

- `.cliagent/config.json` should move from top-level `models` to provider
  `models.add`/`models.override`.
- `/models` should call `agent.getModels()`.
- `/model <id>` should select by resolved model id.
- Existing config files should still load during the transition.

## Error Handling

- Unknown engine in provider config: throw a clear configuration error.
- No providers configured: throw a clear configuration error.
- Provider resolves to zero models: throw only if it is selected as the default;
  otherwise it can remain unavailable until the user adds models.
- `defaultModel` not found: throw with available model ids.
- `setModel()` selector matches zero models: throw with available model ids.
- `setModel()` selector matches multiple models: throw and require `id`.
- Unsupported thinking level for a model: do not throw; engine downgrades.

## Testing Requirements

Add focused tests for:

- Engine model preset exposure per built-in engine.
- Provider aggregation into stable `ResolvedModel` ids.
- Provider model addition and override behavior.
- `setModel()` selector success, no-match, and ambiguous-match behavior.
- `setGenerationConfig()` merging and default behavior.
- Thinking downgrade/mapping for boolean, level-capable, and unsupported engines.
- CLI config migration/resolution from old and new shapes.
- Existing conversion tests continue passing after request/config shape changes.

## Documentation Updates

Update:

- `README.md`
- `README_CN.md`
- `document/cli/repl.md`
- `document/cli/repl_CN.md`
- public API examples for constructing `MiniAgent`

Docs should explain:

- provider name vs engine name
- engine-provided model presets
- user-added models for OpenAI-compatible endpoints
- `setModel()` vs `setGenerationConfig()`
- thinking downgrade behavior

## Architecture Impact

No `docs/architecture` or equivalent architecture-intent documents currently
exist in this repository. Per the SDD architecture touchpoint, no architecture
document is created or edited before implementation. After code lands and tests
pass, the architecture review/reconcile step should bootstrap or update
architecture documentation from landed code if the workflow continues through
that gate.

This spec changes the LLM configuration boundary but does not intentionally
cross a recorded invariant because no recorded invariant exists yet.

## Acceptance Criteria

- A caller can create `MiniAgent` with provider credentials and no top-level
  model list for built-in engines that have catalogs.
- `agent.getModels()` returns resolved model ids with provider, engine, model,
  context size, max output, and supported thinking levels.
- `agent.setModel()` changes only the current model.
- `agent.setGenerationConfig()` changes only generation preferences.
- Default generation config is `temperature: 0.7` and `thinking: "medium"`.
- Engines silently downgrade unsupported thinking settings.
- OpenAI-compatible providers can add custom models through provider config.
- Legacy config and registration paths continue working during migration.

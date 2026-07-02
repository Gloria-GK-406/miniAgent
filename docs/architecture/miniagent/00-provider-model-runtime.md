# MiniAgent Provider Model Runtime - architecture overview

> **Viewpoint level**: This document looks at the model-configuration and LLM execution path that sits below the public package exports and above concrete engine SDK adapters.
>
> **Unit code**: `magent`
>
> **Signal strength**: Strength markers are pending human input. `⏳` marks structural facts whose rationale and strength have not been elicited yet.
>
> **Scope**: This document covers provider/model/generation configuration, model resolution, request-mode LLM invocation, context compression, engine adapters, and CLI config conversion. It does not cover tool internals, store persistence, or UI rendering details. To really see how it runs, reading the code beats reading this document; behavioral details defer to `src/`.

---

## 1. Structure overview

This unit splits provider-model execution into six subparts with non-overlapping responsibilities:

```
public exports
    |
    v
core config schemas --> LLM registry --> MiniAgent runtime --> engine adapters
          |                  ^                  |
          v                  |                  v
   CLI config adapter        |           context compressor
          |                  |
          +---- provider/model selectors -------+
```

| Subpart | File | One-line responsibility | Boundary |
|---|---|---|---|
| Core config schema | `src/core/config.ts` | Defines provider, model, selector, generation, and request schemas. | ⏳[INV-magent-config-provider-only] Runtime agent config contains provider/generation fields, not direct engine-bound model config fields. |
| Model resolution | `src/core/model-resolution.ts` | Resolves provider catalogs and selectors into immutable resolved model entries. | ⏳[INV-magent-resolution-pure] Does not call SDK clients or mutate engine/provider input objects. |
| LLM registry | `src/core/llm.ts` | Registers engine instances and dispatches request-mode generation to the selected provider engine. | ⏳[INV-magent-llm-instance-only] Registers engine instances by engine name. <br> ⏳[INV-magent-llm-request-only] Invokes engines with one request object. |
| MiniAgent runtime | `src/core/agent.ts` | Owns active resolved model, generation config, request construction, streaming response collection, and tool loop orchestration. | ⏳[INV-magent-agent-resolved-state] Stores selected model as a resolved model. <br> ⏳[INV-magent-agent-generation-state] Stores generation preferences separately from model identity. |
| Engine adapters | `src/engine/*/engine.ts` | Convert one request object into provider SDK streaming calls and yield message chunks. | ⏳[INV-magent-engine-catalog] Expose model catalogs through `getModels()`. <br> ⏳[INV-magent-engine-stream] Yield `MessageChunk` values directly. |
| CLI adapter | `src/cli/config.ts`, `src/cli/cli-app.ts` | Parses CLI provider config and maps CLI model selection to resolved model selectors. | ⏳[INV-magent-cli-provider-shape] CLI config uses `engine`, `key`, and model preset arrays. <br> ⏳[INV-magent-cli-selector] CLI model switching calls resolved-model selectors. |

> **Rationale** ⏳ pending

---

## 2. Assembly entry / public surface

The package root exports the core agent, LLM register, provider/model schemas, model resolution helpers, engines, context compressor, and tool plugins through a single barrel file.

```
src/index.ts
  |-- core agent / LLM register / config schemas
  |-- model resolution helpers
  |-- context compressor
  |-- engine factories
  `-- tool and plugin APIs
```

-> code: `src/index.ts:1`

> **Rationale** ⏳ pending

---

## 3. Core config schema

**What**: `src/core/config.ts` is the runtime and persisted shape boundary for providers, resolved models, generation preferences, and LLM requests.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `ModelProviderConfigSchema` | Parses provider credentials and configured model presets. | ⏳[INV-magent-config-provider-key] Provider credential field is `key`. |
| `ModelSelectorSchema` | Accepts resolved id selectors and provider-qualified selectors. | ⏳[INV-magent-config-selector] Selectors carry identity, not generation parameters. |
| `GenerationConfigSchema` | Parses temperature, top-p, max output, and thinking level. | ⏳[INV-magent-config-generation] Generation settings live outside resolved model identity. |
| `LLMGenerateRequestSchema` | Defines the request payload passed from agent to LLM registry/engine. | ⏳[INV-magent-config-request] Request contains provider, model, messages, tools, and generation. |
| `AgentConfigSchema` | Parses provider-mode runtime agent config. | ⏳[INV-magent-config-agent-provider-mode] Agent config exposes providers, defaultModel, generation, plugins, and paths. |

-> code: `src/core/config.ts:62`

> **Rationale** ⏳ pending

---

## 4. Model resolution

**What**: `src/core/model-resolution.ts` turns provider configs and engine catalogs into resolved model entries, then selects a current model from selectors.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `resolveModelsFromProviders()` | Gets engine catalog entries and applies provider model presets. | ⏳[INV-magent-resolution-engine-read] Reads catalogs through `getEngineModels()`. <br> ⏳[INV-magent-resolution-overlay] Overlays configured presets by id/name rules. |
| `selectResolvedModel()` | Selects one resolved model from id or provider-qualified selector input. | ⏳[INV-magent-resolution-ambiguous] Ambiguous selectors throw instead of selecting by array order. |
| clone helpers | Clone JSON records, arrays, and resolved model fields. | ⏳[INV-magent-resolution-clone] Returned resolved models do not share nested mutable data with inputs. |

-> code: `src/core/model-resolution.ts:84`

> **Rationale** ⏳ pending

---

## 5. LLM registry

**What**: `src/core/llm.ts` defines the engine interface and the default registry that maps resolved model provider names to engine instances.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `LLMEngine` | Requires `name`, `getModels()`, and `streamGenerate(request)`. | ⏳[INV-magent-llm-engine-contract] Engine implementations expose catalogs and request-mode streaming. |
| `LLMEngineManager.register()` | Validates and stores an engine instance under `engine.name`. | ⏳[INV-magent-llm-no-ctor-registry] Registry accepts engine instances. |
| `getEngineModels()` | Resolves engine presets with provider injected from engine name. | ⏳[INV-magent-llm-catalog-clone] Returned model entries are cloned. |
| `streamInvoke()` | Finds the engine by `request.model.provider` and returns its stream. | ⏳[INV-magent-llm-dispatch-provider] Dispatch uses resolved model provider. |

-> code: `src/core/llm.ts:15`

> **Rationale** ⏳ pending

---

## 6. MiniAgent runtime

**What**: `src/core/agent.ts` stores resolved model state and generation state, then builds request-mode LLM calls inside the run loop.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| constructor | Parses agent config, resolves provider catalogs, and chooses the initial model. | ⏳[INV-magent-agent-initial-selection] Initial model selection uses configured selectors and resolved models. |
| `setResolvedModel()` | Updates current resolved model and notifies provider-mode config snapshots. | ⏳[INV-magent-agent-set-model] Model switching changes model identity, not generation preferences. |
| `setGenerationConfig()` | Merges generation updates over current generation config. | ⏳[INV-magent-agent-set-generation] Generation updates do not change current model. |
| `buildGenerateRequest()` | Clones provider, model, messages, tools, and generation into one request. | ⏳[INV-magent-agent-request-clone] Request construction does not leak mutable config/model state. |
| `collectStreamResponse()` | Rebuilds assistant/tool-call response data from yielded chunks. | ⏳[INV-magent-agent-chunk-response] Agent, not engine, assembles final response objects from chunks. |
| `run()` | Builds context, tools, request, invokes LLM, and executes tool calls. | ⏳[INV-magent-agent-run-request-mode] Run loop calls `streamInvoke(request)`. |

-> code: `src/core/agent.ts:232`

> **Rationale** ⏳ pending

---

## 7. Context compressor

**What**: `ContextCompressor` is a context provider that uses provider-mode config to summarize older messages through the same request-mode LLM interface.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `setConfig()` | Stores provider-mode agent config for compression. | ⏳[INV-magent-compressor-provider-config] Compression config does not store direct model configs. |
| `maybeCompress()` | Selects old messages when message count exceeds the configured threshold. | ⏳[INV-magent-compressor-threshold] Compression only processes messages older than the retained recent window. |
| `compress()` | Builds a summarization request and consumes text chunks. | ⏳[INV-magent-compressor-request-mode] Summarization uses one `LLMGenerateRequest`. |
| fallback summary | Records truncated text when streaming fails or returns no text. | ⏳[INV-magent-compressor-fallback] Failed compression still records a bounded text summary. |

-> code: `src/context/compressor.ts:85`

> **Rationale** ⏳ pending

---

## 8. Engine adapters

**What**: Each engine adapter exposes a model catalog and converts request-mode generation into provider SDK streaming chunks.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `AnthropicEngine` | Streams Anthropic SDK events as message chunks. | ⏳[INV-magent-engine-anthropic-request] Uses request provider key and request model name. |
| `OpenAICompatibleEngine` | Streams OpenAI-compatible chat chunks. | ⏳[INV-magent-engine-openai-compatible-request] Uses request provider key/baseUrl and request model name. |
| `OpenAIEngine` | Uses the OpenAI-compatible conversion path with the OpenAI provider name. | ⏳[INV-magent-engine-openai-request] Uses request-scoped provider credentials. |
| `GLMEngine` / `GLMCodePlanEngine` | Stream GLM-compatible chunks with provider-specific base URL defaults. | ⏳[INV-magent-engine-glm-default-base] Default base URLs are adapter-local. |
| `NVIDIAEngine` | Streams NVIDIA-compatible chunks with NVIDIA defaults. | ⏳[INV-magent-engine-nvidia-request] Uses request-scoped provider credentials. |
| stream helpers | Yield text, reasoning, and tool-call argument chunks. | ⏳[INV-magent-engine-tool-start] Tool calls with empty arguments still yield a tool-call chunk. |

-> code: `src/engine/anthropic/engine.ts:16`

> **Rationale** ⏳ pending

---

## 9. CLI provider adapter

**What**: CLI config and CLI app code translate user config and commands into provider-mode `MiniAgent` calls.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `CLIProviderSchema` | Parses CLI providers with `engine`, `key`, `baseURL`, and model preset array. | ⏳[INV-magent-cli-engine-shape] CLI provider input uses CLI field names, then converts to core provider config. |
| `toAgentProviders()` | Converts CLI providers to core provider config. | ⏳[INV-magent-cli-to-core] Conversion maps `engine` to `provider`. |
| `selectResolvedModelForCLI()` | Resolves CLI `/model` input to a provider-qualified resolved model. | ⏳[INV-magent-cli-ambiguous] Ambiguous bare model ids report provider-qualified options. |
| subagent config creation | Passes provider-mode config into child agents. | ⏳[INV-magent-cli-subagent-config] Subagent config contains providers, defaultModel, generation, plugins, and paths. |

-> code: `src/cli/config.ts:21`

> **Rationale** ⏳ pending

---

## Final. Collaborating components / drill-down

Beyond the main axis, the following components are called or injected by the provider-model runtime:

| Component | Seam / role | One-line responsibility | Dedicated document |
|---|---|---|---|
| Tool execution | `MiniAgent` tool map and tool plugins | Execute tool calls emitted from streamed LLM output. | to-be-written |
| Message source / store | `MiniAgent` context and message source seams | Persist and retrieve conversation messages. | to-be-written |
| Context providers | `ContextProvider` / compressor seam | Add or summarize context before LLM generation. | to-be-written |
| CLI UI components | Ink components under `src/cli/components` | Render commands, model list, status, and messages. | - |
| Provider SDK packages | Engine adapter constructors | Perform provider network calls. | - |

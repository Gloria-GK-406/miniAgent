# Blueprint Manager Design

## Goal

MiniAgent should replace the current `uses: string[]` blueprint prototype with
a semantic blueprint assembly layer.

The core idea is:

```text
MiniAgent stays plugin-shaped and low-level.
Blueprints describe agent-shaped components at a higher level.
BlueprintManager maps the semantic blueprint into MiniAgent runtime pieces.
```

This branch is still pre-stable, so the old blueprint API does not need a
compatibility path. `AgentAssembler`, `AgentBlueprintRegistry`, and
`AgentBlueprint.uses` should be retired rather than bridged.

## Current State

The current assembly layer is intentionally small but too low-level:

- `AgentBlueprint` contains only `uses: string[]`.
- `AgentBlueprintRegistry` maps arbitrary ids to `AgentUse` factories.
- `AgentAssembler` resolves ids, applies optional capability consumers, and
  passes a flat `use` array to `createMiniAgent`.
- CLI owns the real semantic knowledge through a hard-coded
  `SHARED_BLUEPRINT` and `createBlueprintRegistry()`.
- `mcp`, `skill`, and `subagent` are configured through
  `AgentConfig.plugins`.
- `ConfigNotifier` lets `MiniAgent.register()` push the whole `AgentConfig`
  into config-aware plugins, which then extract their own config from the
  generic plugin bag.

This works, but the blueprint is not actually describing an agent. It is
describing a list of registration items. The semantic distinction between
engines, persistence, context compression, tools, MCP, skills, subagents, and
approval exists only in caller code.

## Target Concept

Blueprints are JSON-like declaration data. They contain no class instances,
closures, or factories.

`BlueprintManager` is the runtime manager. It:

- registers implementation factories for semantic agent component domains;
- lists available implementations;
- validates blueprint references and component config;
- creates engines, persistence, and MiniAgent registration items;
- constructs the final `MiniAgent`.

The manager does not own host-environment context such as CLI state, working
directory policy, parent-agent getters, network clients, or secret providers.
If an implementation needs those dependencies, the caller binds them into the
factory before registering it.

## Blueprint Shape

Every component declaration uses the same small shape:

```ts
interface BlueprintUse {
    use: string;
    config?: JsonValue;
}
```

The agent blueprint has fixed preset domains plus a separate custom domain:

```ts
interface AgentBlueprint {
    engines?: BlueprintUse[];
    tools?: BlueprintUse[];
    compression?: BlueprintUse;
    persistence?: BlueprintUse;
    mcp?: BlueprintUse;
    skill?: BlueprintUse;
    subagent?: BlueprintUse;
    approval?: BlueprintUse;
    context?: BlueprintUse[];
    custom?: Record<string, BlueprintUse | BlueprintUse[]>;
}
```

Domain semantics:

- `engines` is multi-select. It registers LLM engine adapters only.
- `tools` is multi-select.
- `context` is multi-select.
- `compression`, `persistence`, `mcp`, `skill`, `subagent`, and `approval`
  are single strategy selections.
- `custom` is keyed by caller-defined semantic component types.

Example:

```json
{
  "engines": [
    { "use": "openai" },
    { "use": "anthropic" }
  ],
  "tools": [
    { "use": "read" },
    { "use": "bash" }
  ],
  "compression": {
    "use": "summary",
    "config": { "maxMessages": 60, "keepRecent": 15 }
  },
  "persistence": {
    "use": "file",
    "config": { "rootDir": ".miniagent/session/default", "fileName": "messages.jsonl" }
  },
  "mcp": {
    "use": "config",
    "config": {
      "servers": {}
    }
  },
  "skill": {
    "use": "local-directory",
    "config": {
      "directories": [".miniagent/skill"]
    }
  },
  "subagent": {
    "use": "local-directory-sync",
    "config": {
      "path": ".miniagent/subagent"
    }
  }
}
```

## Registry Model

Preset domains are fixed and protected:

```text
engine
persistence
compression
tool
mcp
skill
subagent
approval
context
```

Custom types are stored separately. A custom type key must not collide with a
preset key. A custom implementation key is scoped to its custom type.

The public registration API should be semantic and explicit:

```ts
registerEngineImpl(name, impl)
registerPersistenceImpl(name, impl)
registerCompressionImpl(name, impl)
registerToolImpl(name, impl)
registerMcpImpl(name, impl)
registerSkillImpl(name, impl)
registerSubagentImpl(name, impl)
registerApprovalImpl(name, impl)
registerContextImpl(name, impl)

registerCustomType(type, options)
registerCustomImpl(type, name, impl)
```

Use the `Impl` suffix consistently because these methods register
implementations of a semantic domain, not the domain itself.

Listing APIs should expose available implementations without exposing internal
maps. The exact surface can be focused, for example:

```ts
listImpls(domain)
listPresetImpls()
listCustomImpls(type)
```

## Implementation Factories

Every registered implementation supplies:

- a Zod config schema;
- an async-capable `create` function.

Factory dependencies should be pre-bound by the caller:

```ts
manager.registerApprovalImpl("hitl", {
    configSchema: z.object({}),
    create: () => createHitlApprover(getCurrentHitlState),
});
```

`BlueprintManager` passes only the parsed component config into the factory. It
does not pass a generic runtime context.

There are three factory categories:

```ts
type EngineBlueprintFactory<C> =
    (config: C) => LLMEngine | Promise<LLMEngine>;

type PersistenceBlueprintFactory<C> =
    (config: C) => MiniAgentOptions | Promise<MiniAgentOptions>;

type AgentUseBlueprintFactory<C> =
    (config: C) => AgentUse | AgentUse[] | Promise<AgentUse | AgentUse[]>;
```

`engines` use engine factories. `persistence` uses the persistence factory.
All other preset and custom domains use `AgentUseBlueprintFactory`.

Factories should complete their own async initialization before returning. For
example, an MCP implementation may connect servers before returning the
configured provider, and a local skill implementation may scan directories
before returning the configured provider.

## Assembly Flow

`BlueprintManager.assemble()` should accept:

```ts
interface AssembleBlueprintOptions {
    blueprint: AgentBlueprint;
    config: AgentConfig;
    extraUses?: AgentUse[];
}
```

The flow:

1. Parse the blueprint with `AgentBlueprintSchema`.
2. Resolve and instantiate every selected engine implementation.
3. Register engines into a new `LLMEngineManager`.
4. Resolve and instantiate persistence, or use MiniAgent defaults when absent.
5. Resolve each selected `AgentUse` domain in blueprint order.
6. Append `extraUses`, if provided.
7. Create the agent with:

```ts
createMiniAgent({
    llm: manager,
    config,
    ...persistenceOptions,
    use: preparedUses,
});
```

`AgentConfig` remains the runtime LLM configuration for `MiniAgent`, not the
place where semantic component config lives.

## AgentConfig Cleanup

`AgentConfig.plugins` should be removed.

The target `AgentConfig` contains only core runtime configuration:

```ts
{
    providers: ModelProviderConfig[];
    defaultModel?: ModelSelector;
    generation?: GenerationConfigInput;
    paths: PathConfig;
}
```

Component configuration belongs in the blueprint under that component's
`config`.

`ConfigNotifier` should be retired. `MiniAgent.register()` should no longer
detect `ConfigNotifier` or call `setConfig()`. Components that need config must
receive it before registration through their blueprint implementation factory.

If dynamic reconfiguration becomes a real requirement later, it should be
designed as an explicit runtime API rather than as a generic config bag pushed
into every registered item.

## Capabilities

The old assembler-level `capabilities` option should go away with the old
assembler API.

Filtering belongs in the config of the component that owns the filtered
surface:

```json
{
  "mcp": {
    "use": "config",
    "config": {
      "servers": {},
      "capabilities": {
        "server": { "allow": ["filesystem"] },
        "tool": { "deny": ["mcp__filesystem__write_file"] }
      }
    }
  },
  "skill": {
    "use": "local-directory",
    "config": {
      "directories": ["skill/"],
      "capabilities": { "allow": ["review"] }
    }
  }
}
```

The existing `AgentCapabilityRuleSchema` and `isCapabilityEnabled()` helper can
remain useful, but components should receive parsed capability config directly
instead of reading it from a global assembler option.

## Built-In Implementations

This spec does not add new plugin capabilities. It migrates the existing ones
to the new blueprint assembly model.

First built-in implementation names:

```text
engines:
  anthropic
  openai
  openai-compatible
  glm
  glm-codeplan
  nvidia

persistence:
  file

compression:
  summary

tools:
  read
  write
  edit
  glob
  grep
  bash
  todo

mcp:
  config

skill:
  local-directory

subagent:
  local-directory-sync

approval:
  static-auto-approve
  allow-all

context:
  system-prompt
  agent-context
```

`mcp/config` uses the existing MCP server config shape and existing MCP tool
conversion behavior.

`skill/local-directory` uses the existing local directory scan behavior and
`load_skill` tool behavior.

`subagent/local-directory-sync` uses the existing markdown subagent scan and
`run_subagent` synchronous wait behavior. It should not introduce
fire-and-forget or interactive-wait modes in this spec.

`persistence/file` should require both root directory and message file name
unless a future higher-level environment API defines a shared root convention.

## Existing Plugin Migration

`McpPlugin`, `SkillPlugin`, and `SubagentPlugin` should stop implementing
`setConfig(agentConfig)`.

Their config should be supplied at creation time, either through constructors
or explicit initialization functions called by the blueprint implementation
factory before registration.

Preferred direction:

```ts
new McpPlugin(config)
new SkillPlugin(config)
new SubagentPlugin(config, factory)
```

The exact constructor shape can vary if tests show a cleaner split, but the
configuration must no longer flow through `AgentConfig.plugins` or
`ConfigNotifier`.

## Default Blueprint

Provide a default blueprint helper that preserves the current CLI shared-agent
capabilities:

```ts
createDefaultBlueprint(): AgentBlueprint
```

The helper should include the current built-in engines, tools, summary
compression, file persistence when enough config is supplied, MCP, skill,
subagent, approval, and context entries as appropriate.

If a field requires caller-specific config, the helper may accept options or
the CLI may own a thin wrapper that fills those config values. The default
blueprint should still be expressed in the new semantic shape.

## CLI Boundary

CLI is a consumer of the blueprint system, not the design center of the system.

The CLI should:

- construct and register built-in implementation factories;
- bind CLI-specific state into factories before registration when needed;
- express its shared agent setup as an `AgentBlueprint`;
- pass model runtime config separately as `AgentConfig`;
- stop populating `AgentConfig.plugins`.

Subagents created by the CLI should also use the new blueprint manager. Any
parent-agent inheritance logic should be captured in the registered subagent
implementation factory, not in `BlueprintManager` itself.

## Error Handling

- Unknown preset implementation references throw with domain and name.
- Unknown custom type references throw with the custom type key.
- Unknown custom implementation references throw with type and name.
- Registering a duplicate implementation in the same domain throws.
- Registering a custom type with a preset key throws.
- Registering a custom implementation before registering its type throws.
- Invalid component config reports the component domain, implementation name,
  and Zod error summary.
- Multiple persistence selections are impossible in the schema.
- Missing engines create an empty `LLMEngineManager`. If `AgentConfig.providers`
  references engines that are not registered by the blueprint, model resolution
  or agent run behavior should fail through the existing "no model/engine"
  errors. There is no hidden external `LLMRequest` input to
  `BlueprintManager.assemble()`.

## Testing Requirements

Add or update focused tests for:

- `AgentBlueprintSchema` accepts the new semantic shape.
- `AgentBlueprintSchema` rejects old `uses`.
- `BlueprintManager` registers and lists preset implementations.
- `BlueprintManager` rejects duplicate preset implementations.
- `BlueprintManager` rejects custom type collisions with preset keys.
- `BlueprintManager` assembles engines into `LLMEngineManager`.
- `BlueprintManager` injects file persistence into `createMiniAgent`.
- `BlueprintManager` assembles tools/context/compression/approval as
  `AgentUse` entries.
- Unknown implementation references fail clearly.
- Invalid implementation config fails clearly.
- `AgentConfigSchema` no longer accepts or normalizes `plugins`.
- `MiniAgent.register()` no longer contains `ConfigNotifier` behavior.
- MCP, skill, and subagent tests configure plugins before registration.
- CLI app tests build agents through the new blueprint manager.
- Public exports remove `AgentAssembler`, `AgentBlueprintRegistry`,
  `AgentCapabilityConsumerSchema` if it becomes unused, and `ConfigNotifier`.

The repo-level verification for this branch remains:

```bash
npm run lint
npm run build
npm test
```

## Non-Goals

- No compatibility for `AgentBlueprint.uses`.
- No compatibility for `AgentConfig.plugins`.
- No deprecated aliases for `AgentAssembler` or `AgentBlueprintRegistry`.
- No remote MCP catalog implementation.
- No online skill registry implementation.
- No fire-and-forget subagent mode.
- No interactive subagent mode.
- No dependency graph or DI container.
- No generic runtime context passed through `BlueprintManager`.
- No dynamic config update API.

## Architecture Impact

Loaded architecture aid:

- `docs/architecture/miniagent/00-provider-model-runtime.md`

This spec crosses one existing recorded boundary:

```text
doc:       docs/architecture/miniagent/00-provider-model-runtime.md
invariant: INV-magent-config-agent-provider-mode
current:   Agent config exposes providers, defaultModel, generation, plugins, and paths.
intended:  Agent config exposes providers, defaultModel, generation, and paths only.
why:       Plugin configuration is moving to the semantic blueprint layer so MiniAgent no longer distributes a generic plugin config bag.
```

This spec also creates new architecture surface around blueprint assembly, but
there is no dedicated architecture document for the assembly layer yet. At
Touchpoint B, after code lands and tests/review pass, architecture
review/reconcile should recommend either updating the provider-model runtime
document for the `AgentConfig` boundary and/or bootstrapping a new architecture
document for blueprint assembly.

No architecture document is created or edited before implementation, because
architecture documents trail landed code.

## Acceptance Criteria

- `AgentBlueprint` is the new semantic JSON-like shape.
- `AgentBlueprint.uses` is gone.
- `BlueprintManager` is the public assembly entry point.
- `AgentAssembler` and `AgentBlueprintRegistry` are gone from source exports.
- All preset registrations use `registerXxxImpl` naming.
- Custom type registration is separate from preset implementation registration.
- Engines are registered through blueprint `engines`.
- Persistence is created through blueprint `persistence`.
- All non-engine, non-persistence components assemble as `AgentUse` values.
- Component config is parsed by each registered implementation schema.
- `ConfigNotifier` is removed.
- `AgentConfig.plugins` is removed.
- Existing MCP, skill, and subagent behavior works through blueprint config.
- CLI equivalent shared-agent assembly works through the new blueprint system.
- `npm run lint`, `npm run build`, and `npm test` pass.

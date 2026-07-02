# Blueprint Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old `uses: string[]` assembly prototype with a semantic `BlueprintManager` assembly layer and move component config out of `AgentConfig.plugins`.

**Architecture:** `BlueprintManager` owns semantic blueprint parsing, implementation registration, config validation, and final `MiniAgent` assembly. Engines and persistence are constructor-time resources; every other component is created as `AgentUse` values. Component dependencies are bound into factories before registration, so the manager does not carry host runtime context.

**Tech Stack:** TypeScript strict ESM, Zod schemas, Vitest, existing `MiniAgent`, `LLMEngineManager`, `FileStore`, `FileMessageSource`, MCP/Skill/Subagent tool providers.

---

## File Structure

- Create `src/assembly/manager.ts`: `BlueprintManager`, implementation registry helpers, assemble flow, listing APIs.
- Create `src/assembly/builtins.ts`: built-in implementation registration helpers and default blueprint helpers.
- Modify `src/assembly/blueprint.ts`: replace `{ uses: string[] }` with semantic JSON-like schemas.
- Modify `src/assembly/capability.ts`: keep capability rule helpers, remove assembler-specific consumer schema if unused.
- Replace `src/assembly/assembler.test.ts` with `src/assembly/manager.test.ts`: core blueprint manager tests.
- Delete `src/assembly/assembler.ts`: old assembler and registry are retired.
- Modify `src/core/config.ts`: remove `plugins` from `AgentConfig` and persisted config schemas.
- Modify `src/core/types.ts`: remove `ConfigNotifierSchema` and `ConfigNotifier`.
- Modify `src/core/module.ts`: remove `ConfigNotifier` from `AgentRegistrable`.
- Modify `src/core/agent.ts`: remove config notifier state and registration behavior.
- Modify tests that build `AgentConfig`: remove `plugins: new Map()` from config literals.
- Modify `src/tool/mcp/types.ts` and `src/tool/mcp/plugin.ts`: config is supplied before registration and can include capabilities.
- Modify `src/tool/skill/types.ts` and `src/tool/skill/plugin.ts`: constructor/initialization config replaces `setConfig`.
- Modify `src/tool/subagent.ts`: constructor/initialization config replaces `setConfig`; markdown capabilities still apply to child blueprint construction in CLI.
- Modify plugin tests under `src/tool/mcp`, `src/tool/skill`, and `src/tool/subagent`.
- Modify `src/cli/cli-app.ts` and `src/cli/config.ts`: construct blueprint manager and blueprint instead of `AgentBlueprintRegistry`, `AgentAssembler`, and `AgentConfig.plugins`.
- Modify CLI tests under `src/cli`.
- Modify `src/index.ts` and `src/tool/index.ts`: export new manager/built-ins and remove retired public APIs.
- Modify README and CLI docs to describe semantic blueprints and remove old `uses` examples.

---

### Task 1: Core Blueprint Schema And Manager

**Files:**
- Modify: `src/assembly/blueprint.ts`
- Create: `src/assembly/manager.ts`
- Delete in this task: `src/assembly/assembler.ts`
- Create: `src/assembly/manager.test.ts`
- Remove in this task: `src/assembly/assembler.test.ts`

- [ ] **Step 1: Write failing blueprint schema and manager tests**

Create `src/assembly/manager.test.ts` with focused tests for the new shape, registration, duplicate rejection, custom type collisions, config validation, and simple assembly.

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { AgentBlueprintSchema } from "./blueprint.js";
import { BlueprintManager } from "./manager.js";
import { defineAgentModule } from "../core/module.js";
import { LLMStreamChunkType, MessageType, type LLMRequest, type Message, type MessageChunk } from "../core/types.js";
import { ThinkingLevel, type AgentConfig, type LLMGenerateRequest, type ModelPreset, type ResolvedModel } from "../core/config.js";
import type { LLMEngine } from "../core/llm.js";

function createConfig(sessiondir: string): AgentConfig {
    return {
        providers: [{
            provider: "test",
            key: "test-key",
            models: [{ id: "test-model", name: "test-model" }],
        }],
        paths: { sessiondir },
    };
}

function modelPreset(): ModelPreset {
    return {
        id: "test-model",
        name: "test-model",
        thinkingLevels: [ThinkingLevel.None],
    };
}

function textChunk(text: string): MessageChunk {
    return { type: LLMStreamChunkType.TextDelta, text };
}

class TestEngine implements LLMEngine {
    readonly name = "test";

    getModels(): ModelPreset[] {
        return [modelPreset()];
    }

    async *streamGenerate(_request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
        yield textChunk("done");
    }
}

describe("AgentBlueprintSchema", () => {
    it("accepts semantic blueprint shape", () => {
        const parsed = AgentBlueprintSchema.parse({
            engines: [{ use: "test" }],
            tools: [{ use: "echo", config: { prefix: ">" } }],
            compression: { use: "summary", config: { maxMessages: 60 } },
            persistence: { use: "file", config: { rootDir: "/tmp/session", fileName: "messages.jsonl" } },
            mcp: { use: "config", config: { servers: {} } },
            skill: { use: "local-directory", config: { directories: ["skill"] } },
            subagent: { use: "local-directory-sync", config: { path: "subagent" } },
            approval: { use: "allow-all" },
            context: [{ use: "system-prompt", config: { prompt: "hello" } }],
            custom: {
                memory: { use: "none" },
            },
        });

        expect(parsed.engines?.map((entry) => entry.use)).toEqual(["test"]);
    });

    it("rejects old uses blueprint shape", () => {
        expect(() => AgentBlueprintSchema.parse({ uses: ["tool.read"] })).toThrow();
    });
});

describe("BlueprintManager", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "miniagent-blueprint-manager-test-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("registers and lists preset implementations", () => {
        const manager = new BlueprintManager();
        manager.registerEngineImpl("test", {
            configSchema: z.object({}).strict(),
            create: () => new TestEngine(),
        });

        expect(manager.listImpls("engine")).toEqual(["test"]);
    });

    it("rejects duplicate preset implementations", () => {
        const manager = new BlueprintManager();
        const impl = {
            configSchema: z.object({}).strict(),
            create: () => new TestEngine(),
        };

        manager.registerEngineImpl("test", impl);

        expect(() => manager.registerEngineImpl("test", impl)).toThrow(
            'Blueprint implementation is already registered: engine/test',
        );
    });

    it("rejects custom type collisions with preset domains", () => {
        const manager = new BlueprintManager();

        expect(() => manager.registerCustomType("engine")).toThrow(
            'Custom blueprint type conflicts with preset domain: engine',
        );
    });

    it("rejects custom implementations before their type is registered", () => {
        const manager = new BlueprintManager();

        expect(() => manager.registerCustomImpl("memory", "none", {
            configSchema: z.object({}).strict(),
            create: () => [],
        })).toThrow('Unknown custom blueprint type: memory');
    });

    it("assembles engines and agent uses from a semantic blueprint", async () => {
        const manager = new BlueprintManager();

        manager.registerEngineImpl("test", {
            configSchema: z.object({}).strict(),
            create: () => new TestEngine(),
        });
        manager.registerToolImpl("echo", {
            configSchema: z.object({
                name: z.string().default("echo"),
            }).strict(),
            create: (config) => ({
                name: config.name,
                description: "Echoes text",
                parameters: z.object({ text: z.string() }),
                execute: async (args: Record<string, unknown>): Promise<string> => String(args["text"]),
            }),
        });
        manager.registerContextImpl("system", {
            configSchema: z.object({ content: z.string() }).strict(),
            create: (config) => defineAgentModule({
                priority: 0,
                collect: async (): Promise<Message[]> => [{
                    id: "system-1",
                    type: MessageType.System,
                    content: config.content,
                }],
            }),
        });

        const agent = await manager.assemble({
            blueprint: {
                engines: [{ use: "test" }],
                tools: [{ use: "echo" }],
                context: [{ use: "system", config: { content: "system" } }],
            },
            config: createConfig(testDir),
        });

        expect(agent.getModels().map((model: ResolvedModel) => model.id)).toEqual(["test-model"]);
        expect((await agent.getToolList()).map((tool) => tool.name)).toEqual(["echo"]);
        expect((await agent.previewContext()).map((message) => message.id)).toEqual(["system-1"]);
    });

    it("reports invalid implementation config with domain and name", async () => {
        const manager = new BlueprintManager();
        manager.registerEngineImpl("test", {
            configSchema: z.object({
                required: z.string(),
            }).strict(),
            create: () => new TestEngine(),
        });

        await expect(manager.assemble({
            blueprint: { engines: [{ use: "test", config: {} }] },
            config: createConfig(testDir),
        })).rejects.toThrow("Invalid blueprint config for engine/test");
    });

    it("reports unknown implementation references with domain and name", async () => {
        const manager = new BlueprintManager();

        await expect(manager.assemble({
            blueprint: { tools: [{ use: "missing" }] },
            config: createConfig(testDir),
        })).rejects.toThrow("Unknown blueprint implementation: tool/missing");
    });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run src/assembly/manager.test.ts
```

Expected: fail because `BlueprintManager` does not exist and `AgentBlueprintSchema` still accepts only `uses`.

- [ ] **Step 3: Replace the blueprint schema**

Replace `src/assembly/blueprint.ts` with:

```ts
import { z } from "zod";
import { JsonValueSchema } from "../core/config.js";

export const BlueprintUseSchema = z
    .object({
        use: z.string().min(1),
        config: JsonValueSchema.optional(),
    })
    .strict();

export type BlueprintUse = z.infer<typeof BlueprintUseSchema>;

export const AgentBlueprintSchema = z
    .object({
        engines: z.array(BlueprintUseSchema).optional(),
        tools: z.array(BlueprintUseSchema).optional(),
        compression: BlueprintUseSchema.optional(),
        persistence: BlueprintUseSchema.optional(),
        mcp: BlueprintUseSchema.optional(),
        skill: BlueprintUseSchema.optional(),
        subagent: BlueprintUseSchema.optional(),
        approval: BlueprintUseSchema.optional(),
        context: z.array(BlueprintUseSchema).optional(),
        custom: z.record(z.union([BlueprintUseSchema, z.array(BlueprintUseSchema)])).optional(),
    })
    .strict();

export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;
```

- [ ] **Step 4: Implement `BlueprintManager`**

Create `src/assembly/manager.ts`:

```ts
import { z } from "zod";
import { createMiniAgent } from "../core/create-agent.js";
import type { AgentUse } from "../core/create-agent.js";
import type { MiniAgent, MiniAgentOptions } from "../core/agent.js";
import type { AgentConfig, JsonValue } from "../core/config.js";
import { LLMEngineManager } from "../core/llm.js";
import type { LLMEngine } from "../core/llm.js";
import { AgentBlueprintSchema, type AgentBlueprint, type BlueprintUse } from "./blueprint.js";

export const PresetBlueprintDomainSchema = z.enum([
    "engine",
    "persistence",
    "compression",
    "tool",
    "mcp",
    "skill",
    "subagent",
    "approval",
    "context",
]);

export type PresetBlueprintDomain = z.infer<typeof PresetBlueprintDomainSchema>;

export type EngineBlueprintFactory<C> = (config: C) => LLMEngine | Promise<LLMEngine>;
export type PersistenceBlueprintFactory<C> = (config: C) => MiniAgentOptions | Promise<MiniAgentOptions>;
export type AgentUseBlueprintFactory<C> = (config: C) => AgentUse | AgentUse[] | Promise<AgentUse | AgentUse[]>;

export interface BlueprintImpl<C, R> {
    configSchema: z.ZodType<C>;
    create: (config: C) => R | Promise<R>;
}

export interface AssembleBlueprintOptions {
    blueprint: AgentBlueprint;
    config: AgentConfig;
    extraUses?: AgentUse[];
}

const PRESET_DOMAINS = new Set<PresetBlueprintDomain>(PresetBlueprintDomainSchema.options);

type AnyImpl = BlueprintImpl<unknown, unknown>;
type PresetRegistry = Map<PresetBlueprintDomain, Map<string, AnyImpl>>;

function createPresetRegistry(): PresetRegistry {
    const registry = new Map<PresetBlueprintDomain, Map<string, AnyImpl>>();
    for (const domain of PresetBlueprintDomainSchema.options) {
        registry.set(domain, new Map());
    }
    return registry;
}

function normalizeUses(value: BlueprintUse | BlueprintUse[] | undefined): BlueprintUse[] {
    if (value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function toArray(value: AgentUse | AgentUse[]): AgentUse[] {
    return Array.isArray(value) ? value : [value];
}

export class BlueprintManager {
    private presetImpls = createPresetRegistry();
    private customImpls = new Map<string, Map<string, AnyImpl>>();

    registerEngineImpl<C>(name: string, impl: BlueprintImpl<C, LLMEngine>): void {
        this.registerPresetImpl("engine", name, impl);
    }

    registerPersistenceImpl<C>(name: string, impl: BlueprintImpl<C, MiniAgentOptions>): void {
        this.registerPresetImpl("persistence", name, impl);
    }

    registerCompressionImpl<C>(name: string, impl: BlueprintImpl<C, AgentUse | AgentUse[]>): void {
        this.registerPresetImpl("compression", name, impl);
    }

    registerToolImpl<C>(name: string, impl: BlueprintImpl<C, AgentUse | AgentUse[]>): void {
        this.registerPresetImpl("tool", name, impl);
    }

    registerMcpImpl<C>(name: string, impl: BlueprintImpl<C, AgentUse | AgentUse[]>): void {
        this.registerPresetImpl("mcp", name, impl);
    }

    registerSkillImpl<C>(name: string, impl: BlueprintImpl<C, AgentUse | AgentUse[]>): void {
        this.registerPresetImpl("skill", name, impl);
    }

    registerSubagentImpl<C>(name: string, impl: BlueprintImpl<C, AgentUse | AgentUse[]>): void {
        this.registerPresetImpl("subagent", name, impl);
    }

    registerApprovalImpl<C>(name: string, impl: BlueprintImpl<C, AgentUse | AgentUse[]>): void {
        this.registerPresetImpl("approval", name, impl);
    }

    registerContextImpl<C>(name: string, impl: BlueprintImpl<C, AgentUse | AgentUse[]>): void {
        this.registerPresetImpl("context", name, impl);
    }

    registerCustomType(type: string): void {
        if (PRESET_DOMAINS.has(type as PresetBlueprintDomain)) {
            throw new Error(`Custom blueprint type conflicts with preset domain: ${type}`);
        }
        if (this.customImpls.has(type)) {
            throw new Error(`Custom blueprint type is already registered: ${type}`);
        }
        this.customImpls.set(type, new Map());
    }

    registerCustomImpl<C>(type: string, name: string, impl: BlueprintImpl<C, AgentUse | AgentUse[]>): void {
        const registry = this.customImpls.get(type);
        if (!registry) {
            throw new Error(`Unknown custom blueprint type: ${type}`);
        }
        if (registry.has(name)) {
            throw new Error(`Blueprint implementation is already registered: custom/${type}/${name}`);
        }
        registry.set(name, impl as AnyImpl);
    }

    listImpls(domain: PresetBlueprintDomain): string[] {
        return [...this.requirePresetRegistry(domain).keys()];
    }

    listCustomImpls(type: string): string[] {
        const registry = this.customImpls.get(type);
        if (!registry) {
            throw new Error(`Unknown custom blueprint type: ${type}`);
        }
        return [...registry.keys()];
    }

    async assemble(options: AssembleBlueprintOptions): Promise<MiniAgent> {
        const blueprint = AgentBlueprintSchema.parse(options.blueprint);
        const llm = new LLMEngineManager();
        const preparedUses: AgentUse[] = [];

        for (const entry of blueprint.engines ?? []) {
            llm.register(await this.createPreset("engine", entry) as LLMEngine);
        }

        const persistence = blueprint.persistence === undefined
            ? {}
            : await this.createPreset("persistence", blueprint.persistence) as MiniAgentOptions;

        preparedUses.push(...await this.createAgentUses("compression", normalizeUses(blueprint.compression)));
        preparedUses.push(...await this.createAgentUses("tool", blueprint.tools ?? []));
        preparedUses.push(...await this.createAgentUses("mcp", normalizeUses(blueprint.mcp)));
        preparedUses.push(...await this.createAgentUses("skill", normalizeUses(blueprint.skill)));
        preparedUses.push(...await this.createAgentUses("subagent", normalizeUses(blueprint.subagent)));
        preparedUses.push(...await this.createAgentUses("approval", normalizeUses(blueprint.approval)));
        preparedUses.push(...await this.createAgentUses("context", blueprint.context ?? []));

        if (blueprint.custom !== undefined) {
            for (const [type, entries] of Object.entries(blueprint.custom)) {
                preparedUses.push(...await this.createCustomAgentUses(type, normalizeUses(entries)));
            }
        }

        if (options.extraUses !== undefined) {
            preparedUses.push(...options.extraUses);
        }

        return createMiniAgent({
            llm,
            config: options.config,
            ...persistence,
            use: preparedUses,
        });
    }

    private registerPresetImpl<C, R>(
        domain: PresetBlueprintDomain,
        name: string,
        impl: BlueprintImpl<C, R>,
    ): void {
        const registry = this.requirePresetRegistry(domain);
        if (registry.has(name)) {
            throw new Error(`Blueprint implementation is already registered: ${domain}/${name}`);
        }
        registry.set(name, impl as AnyImpl);
    }

    private requirePresetRegistry(domain: PresetBlueprintDomain): Map<string, AnyImpl> {
        const registry = this.presetImpls.get(domain);
        if (!registry) {
            throw new Error(`Unknown blueprint domain: ${domain}`);
        }
        return registry;
    }

    private getPresetImpl(domain: PresetBlueprintDomain, name: string): AnyImpl {
        const impl = this.requirePresetRegistry(domain).get(name);
        if (!impl) {
            throw new Error(`Unknown blueprint implementation: ${domain}/${name}`);
        }
        return impl;
    }

    private parseConfig(domainLabel: string, implName: string, impl: AnyImpl, config: JsonValue | undefined): unknown {
        const result = impl.configSchema.safeParse(config ?? {});
        if (!result.success) {
            throw new Error(`Invalid blueprint config for ${domainLabel}/${implName}: ${result.error.message}`);
        }
        return result.data;
    }

    private async createPreset(domain: PresetBlueprintDomain, entry: BlueprintUse): Promise<unknown> {
        const impl = this.getPresetImpl(domain, entry.use);
        const config = this.parseConfig(domain, entry.use, impl, entry.config);
        return impl.create(config);
    }

    private async createAgentUses(domain: PresetBlueprintDomain, entries: BlueprintUse[]): Promise<AgentUse[]> {
        const uses: AgentUse[] = [];
        for (const entry of entries) {
            uses.push(...toArray(await this.createPreset(domain, entry) as AgentUse | AgentUse[]));
        }
        return uses;
    }

    private async createCustomAgentUses(type: string, entries: BlueprintUse[]): Promise<AgentUse[]> {
        const registry = this.customImpls.get(type);
        if (!registry) {
            throw new Error(`Unknown custom blueprint type: ${type}`);
        }

        const uses: AgentUse[] = [];
        for (const entry of entries) {
            const impl = registry.get(entry.use);
            if (!impl) {
                throw new Error(`Unknown custom blueprint implementation: ${type}/${entry.use}`);
            }
            const config = this.parseConfig(`custom/${type}`, entry.use, impl, entry.config);
            uses.push(...toArray(await impl.create(config) as AgentUse | AgentUse[]));
        }
        return uses;
    }
}
```

- [ ] **Step 5: Remove the old assembler files**

Delete:

```text
src/assembly/assembler.ts
src/assembly/assembler.test.ts
```

Use `apply_patch` delete hunks or remove them with your editor, then verify:

```bash
rg -n "AgentAssembler|AgentBlueprintRegistry|uses:" src
```

Expected after this task: no hits in `src/assembly`; imports in CLI and public exports are migrated in Tasks 4 and 5.

- [ ] **Step 6: Run the focused manager test**

Run:

```bash
npx vitest run src/assembly/manager.test.ts
```

Expected: pass after the implementation in this task.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/assembly/blueprint.ts src/assembly/manager.ts src/assembly/manager.test.ts src/assembly/assembler.ts src/assembly/assembler.test.ts
git commit -m "feat: add semantic blueprint manager"
```

---

### Task 2: Remove AgentConfig Plugins And ConfigNotifier

**Files:**
- Modify: `src/core/config.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/module.ts`
- Modify: `src/core/agent.ts`
- Modify: `src/core/model-config-utils.ts`
- Modify: `src/core/model-config-utils.test.ts`
- Modify: `src/context/compressor.ts`
- Modify: `src/context/compressor.test.ts`
- Modify: all tests that create `AgentConfig`
- Modify: `src/index.ts`

- [ ] **Step 1: Add focused config cleanup tests**

In `src/core/config.test.ts`, add:

```ts
import { describe, expect, it } from "vitest";
import { AgentConfigSchema, PersistConfigFileSchema } from "./config.js";

describe("provider-mode config without plugin bag", () => {
    it("rejects AgentConfig plugins", () => {
        const result = AgentConfigSchema.safeParse({
            providers: [],
            plugins: {
                mcp: { servers: {} },
            },
            paths: { sessiondir: "/tmp/session" },
        });

        expect(result.success).toBe(false);
    });

    it("rejects persisted plugin config", () => {
        const result = PersistConfigFileSchema.safeParse({
            providers: [],
            plugins: {
                skill: { directories: ["skill"] },
            },
        });

        expect(result.success).toBe(false);
    });
});
```

If the file already has imports from these modules, merge the imports instead
of duplicating them.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run src/core/config.test.ts
```

Expected: fail because `plugins` is still accepted.

- [ ] **Step 3: Remove plugin registry fields from config schemas**

In `src/core/config.ts`, remove `PluginRegistrySchema`. Change:

```ts
export const PersistConfigFileSchema = z
    .object({
        providers: z.array(ModelProviderConfigSchema).default([]),
        defaultModel: PersistModelSelectorSchema.optional(),
        generation: GenerationConfigSchema.partial().optional(),
        plugins: PluginRegistrySchema.default(() => new Map()),
    })
    .strict();
```

to:

```ts
export const PersistConfigFileSchema = z
    .object({
        providers: z.array(ModelProviderConfigSchema).default([]),
        defaultModel: PersistModelSelectorSchema.optional(),
        generation: GenerationConfigSchema.partial().optional(),
    })
    .strict();
```

Change:

```ts
export const AgentConfigSchema = z
    .object({
        providers: z.array(ModelProviderConfigSchema).default([]),
        defaultModel: ModelSelectorSchema.optional(),
        generation: GenerationConfigSchema.optional(),
        plugins: PluginRegistrySchema.default(() => new Map()),
        paths: PathConfigSchema,
    })
    .strict();
```

to:

```ts
export const AgentConfigSchema = z
    .object({
        providers: z.array(ModelProviderConfigSchema).default([]),
        defaultModel: ModelSelectorSchema.optional(),
        generation: GenerationConfigSchema.optional(),
        paths: PathConfigSchema,
    })
    .strict();
```

- [ ] **Step 4: Remove ConfigNotifier types**

In `src/core/types.ts`, remove `ConfigNotifierSchema` and the `ConfigNotifier`
type. Then remove `ConfigNotifier` from imports and `AgentRegistrable` in
`src/core/module.ts`.

The `AgentRegistrable` union should no longer include `ConfigNotifier`:

```ts
export type AgentRegistrable =
    | Tool
    | ToolProvider
    | ContextProvider
    | ContextProcessor
    | MessageNotifier
    | ErrorHandler
    | AfterTurnProcessor
    | PersistRequire
    | TurnContextConsumer
    | TurnContextAppender
    | ToolApprover
    | LLMRequire;
```

- [ ] **Step 5: Remove ConfigNotifier behavior from MiniAgent**

In `src/core/agent.ts`:

Remove `ConfigNotifier` imports and `ConfigNotifierSchema` import.

Remove the field:

```ts
private configNotifiers: ConfigNotifier[] = [];
```

Replace:

```ts
private notifyConfigChanged(): void {
    this.syncEffectiveConfig();
    for (const notifier of this.configNotifiers) {
        void notifier.setConfig(this.getConfig());
    }
}
```

with no method. Update callers:

```ts
this.notifyConfigChanged();
```

to:

```ts
this.syncEffectiveConfig();
```

Remove this registration block:

```ts
if (ConfigNotifierSchema.safeParse(candidate).success) {
    matched = true;
    if (!this.configNotifiers.includes(candidate as ConfigNotifier)) {
        const notifier = candidate as ConfigNotifier;
        void notifier.setConfig(this.getConfig());
        this.configNotifiers.push(notifier);
    }
}
```

- [ ] **Step 6: Move ContextCompressor off ConfigNotifier**

In `src/context/compressor.ts`, remove `ConfigNotifier` imports and change the
class declaration:

```ts
export class ContextCompressor implements ContextProvider, LLMRequire {
```

Change the constructor so agent config is supplied before registration:

```ts
export interface CompressionConfig {
    maxMessages: number;
    keepRecent: number;
}

export interface ContextCompressorOptions extends Partial<CompressionConfig> {
    agentConfig?: AgentConfig;
}

export class ContextCompressor implements ContextProvider, LLMRequire {
    priority = -1000;
    private llm: LLMRequest | null = null;
    private agentConfig: NormalizedAgentConfig | null = null;
    private generationConfig: GenerationConfig = { ...DEFAULT_GENERATION_CONFIG };
    private config: CompressionConfig;

    constructor(config: ContextCompressorOptions = {}) {
        this.config = {
            maxMessages: config.maxMessages ?? 50,
            keepRecent: config.keepRecent ?? 10,
        };
        if (config.agentConfig !== undefined) {
            this.agentConfig = AgentConfigSchema.parse(config.agentConfig);
            this.generationConfig = normalizeGenerationConfig(
                this.agentConfig.generation ?? DEFAULT_GENERATION_CONFIG,
            );
        }
    }
}
```

Delete the old method:

```ts
async setConfig(config: AgentConfig): Promise<void> {
    this.agentConfig = AgentConfigSchema.parse(config);
    this.generationConfig = normalizeGenerationConfig(
        this.agentConfig.generation ?? DEFAULT_GENERATION_CONFIG,
    );
}
```

In `src/context/compressor.test.ts`, replace:

```ts
const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });
await compressor.setConfig(createConfig());
```

with:

```ts
const compressor = new ContextCompressor({
    maxMessages: 3,
    keepRecent: 1,
    agentConfig: createConfig(),
});
```

Remove `plugins: new Map()` from `createConfig()` helpers in the compressor
tests.

- [ ] **Step 7: Remove plugins from model config clone helpers**

In `src/core/model-config-utils.ts`, remove plugin cloning from
`cloneAgentConfig()`. The returned object should include only:

```ts
return AgentConfigSchema.parse({
    providers: config.providers.map(cloneProviderConfig),
    ...(config.defaultModel !== undefined && { defaultModel: cloneModelSelector(config.defaultModel) }),
    ...(config.generation !== undefined && { generation: cloneGenerationConfig(config.generation) }),
    paths: { ...config.paths },
});
```

In `src/core/model-config-utils.test.ts`, remove the test that mutates cloned
`plugins`. Replace it with:

```ts
it("clones agent config without plugin registry state", () => {
    const config = AgentConfigSchema.parse({
        providers: [{
            provider: "openai",
            key: "key",
            models: [{ id: "fast", name: "gpt-4o-mini" }],
        }],
        paths: { sessiondir: "/tmp/session" },
    });

    const cloned = cloneAgentConfig(config);

    expect(cloned).toEqual(config);
    expect(cloned).not.toHaveProperty("plugins");
});
```

- [ ] **Step 8: Remove `plugins` from config literals**

Run:

```bash
rg -n "plugins:|\\.plugins|get\\(\"mcp\"\\)|get\\(\"skill\"\\)|get\\(\"subagent\"\\)" src
```

For config literals in tests and production code, remove `plugins: new Map()`
and `plugins` object fields. Production code that reads `agentConfig.plugins`
must be removed in Task 3 if it belongs to MCP/Skill/Subagent.

Example replacement:

```ts
return {
    providers: [{
        provider: "test",
        key: "test-key",
        models: [{ id: "test-model", name: "test-model" }],
    }],
    paths: { sessiondir: basepersistdir },
};
```

- [ ] **Step 9: Update public exports**

In `src/index.ts`, remove exports for:

```ts
ConfigNotifier
```

and remove `ConfigNotifier` from any type export block.

- [ ] **Step 10: Run focused core tests**

Run:

```bash
npx vitest run src/core/config.test.ts src/core/agent.test.ts src/core/create-agent.test.ts src/core/model-config-utils.test.ts src/context/compressor.test.ts
```

Expected: pass after config literals are updated.

- [ ] **Step 11: Commit Task 2**

Run:

```bash
git add src/core src/context src/index.ts
git commit -m "refactor: remove plugin config notifier path"
```

---

### Task 3: Configure MCP, Skill, And Subagent Before Registration

**Files:**
- Modify: `src/tool/mcp/types.ts`
- Modify: `src/tool/mcp/plugin.ts`
- Modify: `src/tool/mcp/plugin.test.ts`
- Modify: `src/tool/skill/types.ts`
- Modify: `src/tool/skill/plugin.ts`
- Modify: `src/tool/skill/plugin.test.ts`
- Modify: `src/tool/subagent.ts`
- Modify: `src/tool/subagent.test.ts`
- Modify: `src/assembly/capability.ts`

- [ ] **Step 1: Update MCP config schema tests first**

In `src/tool/mcp/plugin.test.ts`, change setup so tests construct and
initialize plugins with config directly:

```ts
async function createPlugin(config: McpPluginConfig): Promise<McpPlugin> {
    const plugin = new McpPlugin(config);
    await plugin.initialize();
    return plugin;
}
```

Replace calls shaped like:

```ts
const plugin = new McpPlugin();
await plugin.setConfig(makeConfig(servers));
```

with:

```ts
const plugin = await createPlugin({ servers });
```

For capability tests, pass capabilities through config:

```ts
const plugin = await createPlugin({
    servers,
    capabilities: {
        tool: { allow: ["mcp__fs__read_file"] },
    },
});
```

- [ ] **Step 2: Update MCP config schema and plugin**

In `src/tool/mcp/types.ts`, move `McpCapabilitySelectorSchema` before
`McpPluginConfigSchema`, then define:

```ts
export const McpCapabilitySelectorSchema = z.object({
    server: AgentCapabilityRuleSchema.optional(),
    tool: AgentCapabilityRuleSchema.optional(),
});

export type McpCapabilitySelector = z.infer<typeof McpCapabilitySelectorSchema>;

export const McpPluginConfigSchema = z.object({
    servers: z.record(McpServerConfigSchema),
    capabilities: McpCapabilitySelectorSchema.optional(),
});
```

In `src/tool/mcp/plugin.ts`, remove `setConfig()` and
`consumeAgentCapabilities()`. The class should follow this shape:

```ts
export class McpPlugin {
    private clients = new Map<string, McpClient>();
    private cachedTools: Tool[] = [];
    private config: McpPluginConfig;
    private capabilities: McpCapabilitySelector;

    constructor(config: McpPluginConfig) {
        this.config = McpPluginConfigSchema.parse(config);
        this.capabilities = this.config.capabilities ?? {};
    }

    async initialize(): Promise<void> {
        await this.connectAll();
    }

    async getTools(): Promise<Tool[]> {
        return this.cachedTools;
    }

    async destroy(): Promise<void> {
        await this.disconnectAll();
    }

    private async connectAll(): Promise<void> {
        const tools: Tool[] = [];
        const serverEntries = Object.entries(this.config.servers);
        // Keep existing Promise.allSettled body and capability filtering.
        this.cachedTools = tools;
    }
}
```

Keep the existing `connectAll()` inner behavior, including `isCapabilityEnabled`
checks and `convertMcpTool()`.

- [ ] **Step 3: Update Skill tests first**

In `src/tool/skill/plugin.test.ts`, replace:

```ts
const plugin = new SkillPlugin();
await plugin.setConfig(makeConfig([testDir]));
```

with:

```ts
const plugin = new SkillPlugin({ directories: [testDir] });
await plugin.initialize();
```

For capability tests:

```ts
const plugin = new SkillPlugin({
    directories: [testDir],
    capabilities: { allow: ["skill-a"] },
});
await plugin.initialize();
```

Tests that previously checked clearing config should be removed or rewritten to
assert direct construction with empty directories:

```ts
const plugin = new SkillPlugin({ directories: [] });
await plugin.initialize();
expect(await plugin.collect()).toEqual([]);
```

- [ ] **Step 4: Update Skill config schema and plugin**

In `src/tool/skill/types.ts`:

```ts
export const SkillCapabilitySelectorSchema = AgentCapabilityRuleSchema;

export type SkillCapabilitySelector = z.infer<typeof SkillCapabilitySelectorSchema>;

export const SkillPluginConfigSchema = z.object({
    directories: z.array(z.string()).default(["skill/"]),
    capabilities: SkillCapabilitySelectorSchema.optional(),
});
```

In `src/tool/skill/plugin.ts`, remove `setConfig()`,
`consumeAgentCapabilities()`, and nullable config state. The class should use:

```ts
export class SkillPlugin {
    priority = 100;

    private skills = new Map<string, SkillEntry>();
    private config: SkillPluginConfig;
    private capabilities: SkillCapabilitySelector;

    constructor(config: SkillPluginConfig) {
        this.config = SkillPluginConfigSchema.parse(config);
        this.capabilities = this.config.capabilities ?? {};
    }

    async initialize(): Promise<void> {
        await this.scanAll();
    }
}
```

Keep existing `collect()`, `getTools()`, `scanAll()`, `scanDir()`, and
`parseManifest()` behavior.

- [ ] **Step 5: Update Subagent tests first**

In `src/tool/subagent.test.ts`, replace:

```ts
const plugin = new SubagentPlugin(factory);
await plugin.setConfig(makeConfig(subagentDir));
```

with:

```ts
const plugin = new SubagentPlugin({ path: subagentDir }, factory);
await plugin.initialize();
```

For visible subagent filtering:

```ts
const plugin = new SubagentPlugin({
    path: subagentDir,
    capabilities: { allow: ["reviewer"] },
}, factory);
await plugin.initialize();
```

- [ ] **Step 6: Update Subagent config schema and plugin**

In `src/tool/subagent.ts`, change:

```ts
export const SubagentPluginConfigSchema = z.object({
    path: z.string().default("subagent/"),
});
```

to:

```ts
export const SubagentPluginConfigSchema = z.object({
    path: z.string().default("subagent/"),
    capabilities: SubagentCapabilitySelectorSchema.optional(),
});
```

Move `SubagentCapabilitySelectorSchema` before `SubagentPluginConfigSchema` if
needed.

Change the constructor and initialization:

```ts
export class SubagentPlugin {
    priority = 100;

    private factory: ConfiguredSubagentFactory;
    private entries = new Map<string, SubagentEntry>();
    private config: SubagentPluginConfig;
    private capabilities: SubagentCapabilitySelector;

    constructor(config: SubagentPluginConfig, factory: ConfiguredSubagentFactory) {
        this.config = SubagentPluginConfigSchema.parse(config);
        this.capabilities = this.config.capabilities ?? {};
        this.factory = factory;
    }

    async initialize(): Promise<void> {
        await this.scanAll();
    }
}
```

Remove `setConfig()` and `consumeAgentCapabilities()`. Keep existing scanning,
context collection, and `run_subagent` behavior.

- [ ] **Step 7: Remove assembler-specific capability consumer**

In `src/assembly/capability.ts`, remove:

```ts
export const AgentCapabilityConsumerSchema = ...
export type AgentCapabilityConsumer = ...
```

Keep:

```ts
AgentCapabilityRuleSchema
AgentCapabilitySelectorSchema
getCapabilityNamespace
isCapabilityEnabled
```

- [ ] **Step 8: Run plugin tests**

Run:

```bash
npx vitest run src/tool/mcp/plugin.test.ts src/tool/skill/plugin.test.ts src/tool/subagent.test.ts
```

Expected: pass after constructor/initialization migration.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add src/tool/mcp src/tool/skill src/tool/subagent.ts src/tool/subagent.test.ts src/assembly/capability.ts
git commit -m "refactor: configure agent components before registration"
```

---

### Task 4: Built-In Blueprint Implementations

**Files:**
- Create: `src/assembly/builtins.ts`
- Create: `src/assembly/builtins.test.ts`
- Modify: `src/assembly/manager.ts` if helper types need export refinement
- Modify: `src/index.ts`

- [ ] **Step 1: Write tests for built-in registration and default blueprint**

Create `src/assembly/builtins.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BlueprintManager } from "./manager.js";
import {
    createDefaultBlueprint,
    registerBuiltinBlueprintImpls,
} from "./builtins.js";
import { ThinkingLevel, type AgentConfig } from "../core/config.js";
import type { ConfiguredSubagentFactory } from "../tool/subagent.js";

function createConfig(sessiondir: string): AgentConfig {
    return {
        providers: [{
            provider: "openai",
            key: "test-key",
            models: [{ id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] }],
        }],
        defaultModel: { id: "fast", provider: "openai" },
        paths: { sessiondir },
    };
}

describe("built-in blueprint implementations", () => {
    it("registers core built-in implementation names", () => {
        const manager = new BlueprintManager();
        const subagentFactory: ConfiguredSubagentFactory = async () => {
            throw new Error("not used");
        };

        registerBuiltinBlueprintImpls(manager, {
            subagentFactory,
            getAgentConfig: () => createConfig("/tmp/session"),
        });

        expect(manager.listImpls("engine")).toContain("openai");
        expect(manager.listImpls("tool")).toEqual(expect.arrayContaining(["read", "write", "bash", "todo"]));
        expect(manager.listImpls("compression")).toContain("summary");
        expect(manager.listImpls("persistence")).toContain("file");
        expect(manager.listImpls("mcp")).toContain("config");
        expect(manager.listImpls("skill")).toContain("local-directory");
        expect(manager.listImpls("subagent")).toContain("local-directory-sync");
    });

    it("assembles a default blueprint with file persistence", async () => {
        const testDir = await mkdtemp(join(tmpdir(), "miniagent-builtins-test-"));
        try {
            const manager = new BlueprintManager();
            registerBuiltinBlueprintImpls(manager, {
                getAgentConfig: () => createConfig(testDir),
                subagentFactory: async () => {
                    throw new Error("not used");
                },
            });

            const blueprint = createDefaultBlueprint({
                engines: ["openai"],
                persistence: { rootDir: testDir, fileName: "messages.jsonl" },
                mcp: { servers: {} },
                skill: { directories: [] },
                subagent: { path: join(testDir, "subagent") },
                systemPrompt: { prompt: "You are helpful." },
                agentContext: { baseDir: testDir },
            });

            const agent = await manager.assemble({
                blueprint,
                config: createConfig(testDir),
            });

            const tools = await agent.getToolList();
            expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["read", "write", "bash"]));
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 2: Run the built-ins test and verify it fails**

Run:

```bash
npx vitest run src/assembly/builtins.test.ts
```

Expected: fail because `builtins.ts` does not exist.

- [ ] **Step 3: Implement built-in registration helpers**

Create `src/assembly/builtins.ts` with this structure:

```ts
import { join } from "node:path";
import { z } from "zod";
import { ContextCompressor } from "../context/compressor.js";
import type { AgentConfig } from "../core/config.js";
import { defineAgentModule } from "../core/module.js";
import { MessageType } from "../core/types.js";
import type { Message } from "../core/types.js";
import { AnthropicEngine, GLMCodePlanEngine, GLMEngine, NVIDIAEngine, OpenAICompatibleEngine, OpenAIEngine } from "../engine/index.js";
import { FileMessageSource } from "../store/message-source.js";
import { FileStore } from "../store/file-store.js";
import {
    AgentContextProvider,
    McpPlugin,
    McpPluginConfigSchema,
    SkillPlugin,
    SkillPluginConfigSchema,
    SubagentPlugin,
    SubagentPluginConfigSchema,
    TodoManager,
    bashTool,
    editTool,
    globTool,
    grepTool,
    readTool,
    writeTool,
} from "../tool/index.js";
import type { McpPluginConfig, SkillPluginConfig } from "../tool/index.js";
import type { ConfiguredSubagentFactory, SubagentPluginConfig } from "../tool/subagent.js";
import type { AgentBlueprint, BlueprintUse } from "./blueprint.js";
import type { BlueprintManager } from "./manager.js";

const EmptyConfigSchema = z.object({}).strict();

const FilePersistenceConfigSchema = z.object({
    rootDir: z.string().min(1),
    fileName: z.string().min(1),
}).strict();

const SummaryCompressionConfigSchema = z.object({
    maxMessages: z.number().int().positive().default(60),
    keepRecent: z.number().int().positive().default(15),
}).strict();

const StaticAutoApproveConfigSchema = z.object({
    autoApproveTools: z.array(z.string()).default(["read", "glob", "grep"]),
}).strict();

const SystemPromptConfigSchema = z.object({
    prompt: z.string(),
    baseDir: z.string().optional(),
}).strict();

const AgentContextConfigSchema = z.object({
    baseDir: z.string().min(1),
}).strict();

export interface RegisterBuiltinBlueprintImplsOptions {
    subagentFactory: ConfiguredSubagentFactory;
    getAgentConfig: () => AgentConfig;
    getHITL?: () => boolean;
}

export interface DefaultBlueprintOptions {
    engines: string[];
    persistence: z.infer<typeof FilePersistenceConfigSchema>;
    mcp?: McpPluginConfig;
    skill?: SkillPluginConfig;
    subagent?: SubagentPluginConfig;
    systemPrompt?: z.infer<typeof SystemPromptConfigSchema>;
    agentContext?: z.infer<typeof AgentContextConfigSchema>;
}

function use(name: string, config?: Record<string, unknown>): BlueprintUse {
    return config === undefined ? { use: name } : { use: name, config };
}

export function registerBuiltinBlueprintImpls(
    manager: BlueprintManager,
    options: RegisterBuiltinBlueprintImplsOptions,
): void {
    manager.registerEngineImpl("anthropic", { configSchema: EmptyConfigSchema, create: () => new AnthropicEngine() });
    manager.registerEngineImpl("openai", { configSchema: EmptyConfigSchema, create: () => new OpenAIEngine() });
    manager.registerEngineImpl("openai-compatible", { configSchema: EmptyConfigSchema, create: () => new OpenAICompatibleEngine() });
    manager.registerEngineImpl("glm", { configSchema: EmptyConfigSchema, create: () => new GLMEngine() });
    manager.registerEngineImpl("glm-codeplan", { configSchema: EmptyConfigSchema, create: () => new GLMCodePlanEngine() });
    manager.registerEngineImpl("nvidia", { configSchema: EmptyConfigSchema, create: () => new NVIDIAEngine() });

    manager.registerPersistenceImpl("file", {
        configSchema: FilePersistenceConfigSchema,
        create: (config) => {
            const store = new FileStore(config.rootDir);
            return {
                store,
                messageSource: new FileMessageSource(store, config.fileName),
            };
        },
    });

    manager.registerCompressionImpl("summary", {
        configSchema: SummaryCompressionConfigSchema,
        create: (config) => new ContextCompressor({
            ...config,
            agentConfig: options.getAgentConfig(),
        }),
    });

    manager.registerToolImpl("read", { configSchema: EmptyConfigSchema, create: () => readTool });
    manager.registerToolImpl("write", { configSchema: EmptyConfigSchema, create: () => writeTool });
    manager.registerToolImpl("edit", { configSchema: EmptyConfigSchema, create: () => editTool });
    manager.registerToolImpl("glob", { configSchema: EmptyConfigSchema, create: () => globTool });
    manager.registerToolImpl("grep", { configSchema: EmptyConfigSchema, create: () => grepTool });
    manager.registerToolImpl("bash", { configSchema: EmptyConfigSchema, create: () => bashTool });
    manager.registerToolImpl("todo", { configSchema: EmptyConfigSchema, create: () => new TodoManager() });

    manager.registerMcpImpl("config", {
        configSchema: McpPluginConfigSchema,
        create: async (config) => {
            const plugin = new McpPlugin(config);
            await plugin.initialize();
            return plugin;
        },
    });

    manager.registerSkillImpl("local-directory", {
        configSchema: SkillPluginConfigSchema,
        create: async (config) => {
            const plugin = new SkillPlugin(config);
            await plugin.initialize();
            return plugin;
        },
    });

    manager.registerSubagentImpl("local-directory-sync", {
        configSchema: SubagentPluginConfigSchema,
        create: async (config) => {
            const plugin = new SubagentPlugin(config, options.subagentFactory);
            await plugin.initialize();
            return plugin;
        },
    });

    manager.registerApprovalImpl("allow-all", {
        configSchema: EmptyConfigSchema,
        create: () => defineAgentModule({
            requestApproval: async (): Promise<boolean> => true,
        }),
    });

    manager.registerApprovalImpl("static-auto-approve", {
        configSchema: StaticAutoApproveConfigSchema,
        create: (config) => {
            const autoApprovedTools = new Set(config.autoApproveTools);
            return defineAgentModule({
                requestApproval: async (toolName: string): Promise<boolean> => {
                    if (autoApprovedTools.has(toolName)) {
                        return true;
                    }
                    return options.getHITL === undefined ? true : options.getHITL();
                },
            });
        },
    });

    manager.registerContextImpl("system-prompt", {
        configSchema: SystemPromptConfigSchema,
        create: (config) => defineAgentModule({
            priority: 0,
            collect: async (): Promise<Message[]> => [{
                id: "system-prompt",
                type: MessageType.System,
                content: config.baseDir === undefined
                    ? config.prompt
                    : [config.prompt, "", `Working directory: ${config.baseDir}`].join("\n"),
            }],
        }),
    });

    manager.registerContextImpl("agent-context", {
        configSchema: AgentContextConfigSchema,
        create: (config) => new AgentContextProvider(config.baseDir),
    });
}

export function createDefaultBlueprint(options: DefaultBlueprintOptions): AgentBlueprint {
    return {
        engines: options.engines.map((engine) => use(engine)),
        tools: ["read", "write", "edit", "glob", "grep", "bash", "todo"].map((tool) => use(tool)),
        compression: use("summary", { maxMessages: 60, keepRecent: 15 }),
        persistence: use("file", options.persistence),
        ...(options.mcp !== undefined && { mcp: use("config", options.mcp) }),
        ...(options.skill !== undefined && { skill: use("local-directory", options.skill) }),
        ...(options.subagent !== undefined && { subagent: use("local-directory-sync", options.subagent) }),
        approval: use("static-auto-approve"),
        context: [
            ...(options.systemPrompt !== undefined ? [use("system-prompt", options.systemPrompt)] : []),
            ...(options.agentContext !== undefined ? [use("agent-context", options.agentContext)] : []),
        ],
    };
}
```

`ContextCompressor` already receives `agentConfig` through constructor options
from Task 2. The summary implementation must pass that config when registering
the built-in compression implementation.

- [ ] **Step 4: Export built-ins**

In `src/index.ts`, export:

```ts
export { BlueprintManager, PresetBlueprintDomainSchema } from "./assembly/manager.js";
export type {
    AssembleBlueprintOptions,
    BlueprintImpl,
    EngineBlueprintFactory,
    PersistenceBlueprintFactory,
    AgentUseBlueprintFactory,
    PresetBlueprintDomain,
} from "./assembly/manager.js";
export {
    createDefaultBlueprint,
    registerBuiltinBlueprintImpls,
} from "./assembly/builtins.js";
export type {
    DefaultBlueprintOptions,
    RegisterBuiltinBlueprintImplsOptions,
} from "./assembly/builtins.js";
```

Remove exports for:

```ts
AgentAssembler
AgentBlueprintRegistry
AgentCapabilityConsumerSchema
AgentCapabilityConsumer
```

- [ ] **Step 5: Run built-in and manager tests**

Run:

```bash
npx vitest run src/assembly/manager.test.ts src/assembly/builtins.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add src/assembly src/index.ts
git commit -m "feat: register built-in blueprint implementations"
```

---

### Task 5: Migrate CLI To BlueprintManager

**Files:**
- Modify: `src/cli/cli-app.ts`
- Modify: `src/cli/config.ts`
- Modify: `src/cli/cli-app.test.ts`
- Modify: `src/cli/config.test.ts`
- Inspect and modify when necessary: `src/cli/integration.test.tsx`, specifically any assertions or helpers that reference removed CLI result fields such as `manager`, `assembler`, or `blueprintRegistry`.

- [ ] **Step 1: Update CLI config conversion tests**

In `src/cli/config.test.ts`, remove expectations involving `plugins`.

Add a test proving CLI still parses mcp/skill/subagent user config as CLI config
but does not convert it into `AgentConfig`:

```ts
it("keeps component config at the CLI layer", () => {
    const config = CLIConfigSchema.parse({
        providers: [{
            engine: "openai",
            key: "test-key",
            models: [{ id: "fast", name: "gpt-4o-mini" }],
        }],
        mcp: { servers: {} },
        skill: { directories: ["skill"] },
        subagent: { path: "subagent" },
    });

    expect(toAgentProviders(config)).toEqual([{
        provider: "openai",
        key: "test-key",
        models: [{ id: "fast", name: "gpt-4o-mini" }],
    }]);
    expect(config.mcp).toEqual({ servers: {} });
    expect(config.skill).toEqual({ directories: ["skill"] });
    expect(config.subagent).toEqual({ path: "subagent" });
});
```

- [ ] **Step 2: Update CLI app tests for no plugin bag**

In `src/cli/cli-app.test.ts`, update assertions:

```ts
expect(app.agent.getConfig()).not.toHaveProperty("plugins");
```

Update `buildSubagentAgentConfig` expectations to remove `plugins`:

```ts
expect(config).toEqual({
    providers,
    defaultModel: { id: "fast", provider: "openai" },
    generation,
    paths: { sessiondir: "/tmp/subagent-session" },
});
```

- [ ] **Step 3: Run CLI tests and verify failure**

Run:

```bash
npx vitest run src/cli/config.test.ts src/cli/cli-app.test.ts
```

Expected: fail because `cli-app.ts` still uses `AgentAssembler`,
`AgentBlueprintRegistry`, and `AgentConfig.plugins`.

- [ ] **Step 4: Rewrite CLI assembly imports**

In `src/cli/cli-app.ts`, replace:

```ts
import { AgentAssembler, AgentBlueprintRegistry } from "../assembly/assembler.js";
import type { AgentBlueprint } from "../assembly/blueprint.js";
```

with:

```ts
import { createDefaultBlueprint, registerBuiltinBlueprintImpls } from "../assembly/builtins.js";
import { BlueprintManager } from "../assembly/manager.js";
import type { AgentBlueprint } from "../assembly/blueprint.js";
import { isCapabilityEnabled } from "../assembly/capability.js";
```

Remove direct engine class imports and `ENGINE_FACTORIES` if built-ins register
engines.

- [ ] **Step 5: Replace `buildSubagentAgentConfig`**

Change `BuildSubagentAgentConfigOptions` to remove `plugins`:

```ts
export interface BuildSubagentAgentConfigOptions {
    providers: ModelProviderConfig[];
    currentModel: ResolvedModel | undefined;
    generation: GenerationConfig;
    paths: PathConfig;
}
```

Change `buildSubagentAgentConfig()`:

```ts
export function buildSubagentAgentConfig(
    options: BuildSubagentAgentConfigOptions,
): NormalizedAgentConfig {
    return AgentConfigSchema.parse({
        providers: options.providers,
        ...(options.currentModel !== undefined && {
            defaultModel: {
                id: options.currentModel.id,
                provider: options.currentModel.provider,
            },
        }),
        generation: options.generation,
        paths: options.paths,
    });
}
```

- [ ] **Step 6: Add CLI blueprint helpers**

In `src/cli/cli-app.ts`, add:

```ts
function uniqueEngines(config: CLIConfig): string[] {
    return [...new Set(config.providers.map((provider) => provider.engine))];
}

function createCLIBaseBlueprint(
    config: CLIConfig,
    persistDir: string,
    baseDir: string,
    userSystemPrompt: string,
): AgentBlueprint {
    return createDefaultBlueprint({
        engines: uniqueEngines(config),
        persistence: {
            rootDir: persistDir,
            fileName: "messages.jsonl",
        },
        ...(config.mcp !== undefined && { mcp: config.mcp }),
        ...(config.skill !== undefined && { skill: config.skill }),
        ...(config.subagent !== undefined && { subagent: config.subagent }),
        systemPrompt: {
            prompt: buildSystemPrompt(baseDir, userSystemPrompt),
        },
        agentContext: { baseDir },
    });
}

function applySubagentCapabilities(
    blueprint: AgentBlueprint,
    capabilities: AgentCapabilitySelector | undefined,
): AgentBlueprint {
    if (capabilities === undefined) {
        return blueprint;
    }

    return {
        ...blueprint,
        tools: blueprint.tools?.filter((tool) => isCapabilityEnabled(tool.use, capabilities.tool)),
        ...(blueprint.mcp !== undefined && capabilities.mcp !== undefined && {
            mcp: {
                ...blueprint.mcp,
                config: {
                    ...(typeof blueprint.mcp.config === "object" && blueprint.mcp.config !== null && !Array.isArray(blueprint.mcp.config)
                        ? blueprint.mcp.config
                        : {}),
                    capabilities: capabilities.mcp,
                },
            },
        }),
        ...(blueprint.skill !== undefined && capabilities.skill !== undefined && {
            skill: {
                ...blueprint.skill,
                config: {
                    ...(typeof blueprint.skill.config === "object" && blueprint.skill.config !== null && !Array.isArray(blueprint.skill.config)
                        ? blueprint.skill.config
                        : {}),
                    capabilities: capabilities.skill,
                },
            },
        }),
        ...(blueprint.subagent !== undefined && capabilities.subagent !== undefined && {
            subagent: {
                ...blueprint.subagent,
                config: {
                    ...(typeof blueprint.subagent.config === "object" && blueprint.subagent.config !== null && !Array.isArray(blueprint.subagent.config)
                        ? blueprint.subagent.config
                        : {}),
                    capabilities: capabilities.subagent,
                },
            },
        }),
    };
}
```

Import `AgentCapabilitySelector` type from `../assembly/capability.js`.

- [ ] **Step 7: Add a CLI manager factory**

Create a helper that registers built-ins after the target `AgentConfig` is
known. This keeps `ContextCompressor` config pre-bound through the factory
closure instead of passing runtime context through `BlueprintManager`.

```ts
function createCLIBlueprintManager(
    agentConfig: AgentConfig,
    subagentFactory: ConfiguredSubagentFactory,
    getHITL: () => boolean,
): BlueprintManager {
    const blueprintManager = new BlueprintManager();
    registerBuiltinBlueprintImpls(blueprintManager, {
        getAgentConfig: () => agentConfig,
        getHITL,
        subagentFactory,
    });
    return blueprintManager;
}
```

Remove `LLMEngineManager manager`, `registerEngines()`, `ENGINE_FACTORIES`,
`AgentAssembler`, and `AgentBlueprintRegistry` from CLI app state. If
`CLIAppResult.manager`, `CLIAppResult.assembler`, or
`CLIAppResult.blueprintRegistry` has no remaining production consumer, remove
those fields from the result type and update tests.

- [ ] **Step 8: Replace `buildAgentInner`**

Change `buildAgentInner` to use `BlueprintManager`:

```ts
async function buildAgentInner(
    sessionId: string,
    baseDir: string,
    config: CLIConfig,
    sessionManager: SessionManager,
    getParentAgent: () => MiniAgent | undefined,
    getHITL: () => boolean,
    userSystemPrompt: string,
): Promise<MiniAgent> {
    const persistDir = new SessionManager(join(baseDir, CLIAGENT_DIR)).getSessionPersistDir(sessionId);
    const defaultModel = parseDefaultModel(config);
    const generation = toAgentGenerationConfig(config);
    const agentConfig: AgentConfig = {
        providers: toAgentProviders(config),
        ...(defaultModel !== undefined && { defaultModel }),
        ...(generation !== undefined && { generation }),
        paths: { sessiondir: persistDir },
    };
    const blueprintManager = createCLIBlueprintManager(
        agentConfig,
        createConfiguredSubagentFactory(
            sessionManager,
            config,
            baseDir,
            getParentAgent,
            getHITL,
        ),
        getHITL,
    );

    return blueprintManager.assemble({
        config: agentConfig,
        blueprint: createCLIBaseBlueprint(config, persistDir, baseDir, userSystemPrompt),
    });
}
```

Remove `createCLIApprover`, `createBlueprintRegistry`, and `clonePluginConfig`.
Their responsibilities move into built-in blueprint implementations and
blueprint config.

- [ ] **Step 9: Replace subagent child assembly**

Change `createConfiguredSubagentFactory` to remove `AgentAssembler` and
`LLMEngineManager` parameters. It should create a child-specific
`BlueprintManager` after the child `AgentConfig` is known.

Use this signature:

```ts
function createConfiguredSubagentFactory(
    sessionManager: SessionManager,
    config: CLIConfig,
    baseDir: string,
    getParentAgent: () => MiniAgent | undefined,
    getHITL: () => boolean,
): ConfiguredSubagentFactory
```

Inside the returned factory:

```ts
const agentConfig = buildSubagentAgentConfig({
    providers: toAgentProviders(config),
    currentModel,
    generation: parentAgent.getGenerationConfig(),
    paths: { sessiondir: join(persistDir, `subagent-${crypto.randomUUID().slice(0, 8)}`) },
});
const childBlueprintManager = createCLIBlueprintManager(
    agentConfig,
    createConfiguredSubagentFactory(
        sessionManager,
        config,
        baseDir,
        getParentAgent,
        getHITL,
    ),
    getHITL,
);
const blueprint = applySubagentCapabilities(
    createCLIBaseBlueprint(config, agentConfig.paths.sessiondir, baseDir, [
        request.entry.prompt,
        "",
        `Subagent id: ${request.entry.id}`,
        `Working directory: ${baseDir}`,
    ].join("\n")),
    request.entry.capabilities,
);

return childBlueprintManager.assemble({
    config: agentConfig,
    blueprint,
    extraUses: request.context === undefined ? undefined : [
        defineAgentModule({
            priority: 0,
            collect: async (): Promise<Message[]> => [{
                id: "subagent-injected-context",
                type: MessageType.System,
                content: request.context,
            }],
        }),
    ],
});
```

If this creates duplicate working-directory text because
`createCLIBaseBlueprint()` also adds it, simplify the prompt passed to
`systemPrompt` so each line appears once.

- [ ] **Step 10: Run CLI tests**

Run:

```bash
npx vitest run src/cli/config.test.ts src/cli/cli-app.test.ts src/cli/integration.test.tsx
```

Expected: pass after imports, result shape, and assertions are updated.

- [ ] **Step 11: Commit Task 5**

Run:

```bash
git add src/cli
git commit -m "refactor: assemble cli agents from blueprints"
```

---

### Task 6: Public API, Docs, And Full Verification

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tool/index.ts`
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `document/cli/repl.md`
- Modify: `document/cli/repl_CN.md`
- Modify any remaining tests found by `rg`

- [ ] **Step 1: Search for retired API references**

Run:

```bash
rg -n "AgentAssembler|AgentBlueprintRegistry|AgentCapabilityConsumer|ConfigNotifier|plugins|get\\(\"mcp\"\\)|get\\(\"skill\"\\)|get\\(\"subagent\"\\)|uses:" src README.md README_CN.md document docs
```

Expected before cleanup: hits in docs/tests/imports. Production source hits
must be removed unless the hit is historical text in older spec docs.

- [ ] **Step 2: Update public exports**

In `src/index.ts` and `src/tool/index.ts`, export the new public surface and
remove retired APIs:

```ts
export { BlueprintManager, PresetBlueprintDomainSchema } from "./assembly/manager.js";
export {
    createDefaultBlueprint,
    registerBuiltinBlueprintImpls,
} from "./assembly/builtins.js";
export { AgentBlueprintSchema, BlueprintUseSchema } from "./assembly/blueprint.js";
export type { AgentBlueprint, BlueprintUse } from "./assembly/blueprint.js";
```

Remove:

```ts
AgentAssembler
AgentBlueprintRegistry
AgentCapabilityConsumerSchema
AgentCapabilityConsumer
ConfigNotifier
```

- [ ] **Step 3: Update README blueprint section**

In `README.md`, replace the old `uses` section with:

```md
## Blueprint and Assembly

MiniAgent's runtime core still accepts low-level plugins, tools, providers,
processors, and setup functions. The blueprint layer adds a semantic assembly
view over that plugin model.

```typescript
const blueprint = {
  engines: [{ use: "openai" }],
  tools: [{ use: "read" }, { use: "write" }, { use: "bash" }],
  compression: { use: "summary", config: { maxMessages: 60, keepRecent: 15 } },
  persistence: {
    use: "file",
    config: { rootDir: ".miniagent/session/default", fileName: "messages.jsonl" },
  },
  mcp: { use: "config", config: { servers: {} } },
  skill: { use: "local-directory", config: { directories: [".miniagent/skill"] } },
};
```

Register implementations, then assemble:

```typescript
const manager = new BlueprintManager();
registerBuiltinBlueprintImpls(manager, { subagentFactory });

const agent = await manager.assemble({
  blueprint,
  config: {
    providers: [{
      provider: "openai",
      key: process.env.OPENAI_API_KEY!,
      models: [{ id: "fast", name: "gpt-4o-mini" }],
    }],
    defaultModel: { id: "fast", provider: "openai" },
    paths: { sessiondir: ".miniagent/session/default" },
  },
});
```
```

Apply equivalent wording to `README_CN.md`. If the Chinese file has existing
encoding issues, edit only the relevant ASCII code blocks and headings to avoid
accidental broad re-encoding.

- [ ] **Step 4: Update CLI docs**

In `document/cli/repl.md`, replace "shared blueprint" wording with the new
semantic domains:

```md
The CLI agent is assembled from a semantic blueprint. The default CLI blueprint
registers configured engines, file persistence, summary compression, built-in
file/search/shell/todo tools, MCP config, local skills, local synchronous
subagents, approval, and working-directory context.
```

Update config examples only if CLI config shape changed. If CLI still exposes
`mcp`, `skill`, and `subagent` as CLI convenience fields, say they are copied
into blueprint component config during assembly.

- [ ] **Step 5: Run source-wide checks**

Run:

```bash
rg -n "AgentAssembler|AgentBlueprintRegistry|ConfigNotifier|AgentCapabilityConsumer|plugins|get\\(\"mcp\"\\)|get\\(\"skill\"\\)|get\\(\"subagent\"\\)|uses:" src
```

Expected: no production source hits.

Run:

```bash
npm run lint
npm run build
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit Task 6**

Run:

```bash
git add src README.md README_CN.md document
git commit -m "docs: document semantic blueprint assembly"
```

---

## Final Verification

After all tasks are complete, run:

```bash
npm run lint
npm run build
npm test
git status --short
```

Expected:

- lint passes;
- build passes;
- all Vitest tests pass;
- working tree is clean.

Then run the architecture touchpoint B flow required by
`docs/superpowers/specs/2026-07-02-blueprint-manager-design.md`:

- review the final diff against `docs/architecture/miniagent/00-provider-model-runtime.md`;
- reconcile the `AgentConfig` invariant move from `plugins` to blueprint config;
- bootstrap or update architecture docs for blueprint assembly if the review
  report adopts that suggestion.

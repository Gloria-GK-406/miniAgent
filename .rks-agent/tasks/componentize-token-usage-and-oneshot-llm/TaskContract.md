---
kind: rks-task-contract
revision: 1
state: ready
---

# TaskContract: Componentize token usage and one-shot LLM calls

## Context

### Source Request

The user asked to replace `AgentRuntimeRequire` with a single-use minimal wrapper around the configured LLM, componentize token accounting behind capability interfaces, combine the reporting, reading, and resetting capabilities in one aggregate interface for `MiniAgent`, and complete the change now that the scope and modification approach are clear.

### Current Situation

`ContextCompressor` currently receives both the raw `LLMRequest` and accessors for the active model runtime and generation configuration. This exposes runtime credentials to a registered component and makes the compressor assemble low-level generation requests. Token accumulation is stored directly in `MiniAgent`; internal LLM calls are not included, and the current streaming path does not propagate provider usage metadata into the response accumulated by `MiniAgent`.

## Goal

Provide a credential-hiding, tool-free, single-use LLM call abstraction for internal components and make token usage reporting, reading, resetting, and aggregation independently replaceable behind interfaces, with accurate shared accounting for both normal Agent turns and internal one-shot calls.

## Scope

### In

- Introduce a minimal single-use LLM wrapper and an injection boundary that creates it from the Agent's current model and generation settings without exposing those settings to consumers.
- Ensure one-shot calls are tool-free and do not create or share Agent sessions, message stores, context plugins, or Agent loops.
- Replace `ContextCompressor`'s raw LLM/runtime dependencies with the one-shot abstraction.
- Introduce separate token usage reporting, reading, and resetting interfaces, plus one aggregate interface containing all three capabilities and a counter implementation of that aggregate interface.
- Make `MiniAgent` hold the aggregate token usage interface while narrower consumers, including the one-shot wrapper, depend only on the reporting interface.
- Carry provider token usage through the streaming boundary and report each completed main-loop or one-shot LLM request once into the shared usage component.
- Update public exports, affected assembly, and automated tests for the new contracts and behavior.

### Out

- Cost or currency calculation, remote telemetry, database persistence, or per-user billing.
- General-purpose child Agents, tool-capable subagents, or changes to tool execution behavior.
- Changes to provider authentication formats, model selection behavior, or generation semantics unrelated to the new wrapper.
- Renaming or removing existing public token-query APIs unless compatibility cannot be preserved.

## Constraints

- Runtime credentials must not be exposed through the component injection contract replacing `AgentRuntimeRequire`.
- Existing model-provider engines and `LLMEngineManager` remain the routing boundary; the one-shot wrapper must not bypass provider engine selection.
- Existing unrelated public behavior and configuration compatibility must be preserved.
- TypeScript strictness, ESM import conventions, Zod-backed public contracts, and repository lint rules must remain satisfied.

## Success Conditions

| ID | Observable condition | Required evidence |
|---|---|---|
| SC-1 | A registered internal component can request a fresh single-use, tool-free LLM caller that uses the Agent's current model and generation settings without receiving runtime credentials or raw configuration. | Focused unit tests exercise injection, current-setting capture, tool exclusion, and second-use rejection. |
| SC-2 | `ContextCompressor` performs summarization exclusively through the one-shot abstraction and retains its successful-summary, no-dependency, and fallback behavior. | Updated compressor tests pass without injecting `LLMRequest` or `AgentRuntimeAccess`. |
| SC-3 | Token usage reporting, reading, and resetting are separate interfaces; one aggregate interface combines them; `MiniAgent` depends on the aggregate interface and the one-shot caller depends only on the reporter interface. | Type-level implementation and focused tests demonstrate aggregation, reset, defensive reads, and structural narrowing without casts. |
| SC-4 | Provider-reported usage from completed main Agent requests and one-shot internal requests is each recorded exactly once in the shared usage component. | Stream/Agent/one-shot tests assert non-zero input, output, and total accumulation across both call paths without double counting. |
| SC-5 | The package public surface exports the intended new contracts and no longer requires consumers to use `AgentRuntimeRequire` for this workflow. | Public export tests and typecheck/build pass. |
| SC-6 | The complete repository remains conformant after the refactor. | Fresh lint, build, and full test suite all pass. |

## Authorization

| Capability | Evidence | Authorized scope |
|---|---|---|
| task | “这样就对了，开个任务契约我们完成一下吧。范围和修改方式什么的都应该明确了。” following the agreed one-shot LLM and interface-based token usage design | Create the task contract and workflow artifacts, implement and verify the bounded refactor described in Scope, and create one verified local result commit under the repository workflow. |

## Requires Confirmation

- Merge, push, pull request creation, release, or cleanup of the task branch/worktree requires separate authorization.

## Assumptions

- Existing token-query API names remain compatible; this task changes their backing implementation rather than requiring a public rename.
- Usage unavailable because a provider omits it or a request is interrupted is not estimated or fabricated.

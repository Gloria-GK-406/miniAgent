---
kind: rks-plan
spec:
  path: ./spec.md
state: ready
---

# Implementation Plan: Isolated one-shot calls and shared token usage

## Implementation Approach

Start with the unavoidable streaming prerequisite: provider usage must become a common stream value and the shared response collector must retain it before either execution path can report accurately. Then add the interface-segregated usage service and a one-shot caller that reuses the collector, integrate both into `MiniAgent`, migrate context compression, and finish with public exports and complete regression verification. Tests precede each observable behavior change. `MiniAgent` stores only the aggregate usage interface; a default implementation is selected through construction/assembly without exposing its concrete type in consumer signatures.

## Owned Boundaries

| ID | Owned path or interface | Change intent | Inputs | Outputs |
|---|---|---|---|---|
| BD-001 | `src/core/types.ts` | Extend common stream and registration contracts for terminal usage and one-shot injection; retire runtime/config injection. | Existing message, response, stream, and registrable contracts. | Zod-backed usage stream chunk and one-shot requirement contracts. |
| BD-002 | `src/core/llm.ts` and `src/core/llm.test.ts` | Provide one shared stream-to-response collector that preserves deltas, tool calls, terminal usage, and abort behavior. | Common stream chunks and response schemas. | Reusable response collection with focused regression coverage. |
| BD-003 | `src/engine/anthropic/stream.ts`, `src/engine/openai-compatible/stream.ts`, `src/engine/nvidia/stream.ts`, and colocated stream tests | Emit provider usage through the common streaming boundary without changing existing deltas. | Provider stream events and usage metadata. | Supported-engine terminal usage chunks and regression evidence. |
| BD-004 | `src/core/token-usage.ts` and `src/core/token-usage.test.ts` | Define report/read/reset capability interfaces, their aggregate interface, and the default counter implementation. | Token count schema and addition helpers. | Replaceable, defensive, resettable token usage service. |
| BD-005 | `src/core/one-shot-llm.ts` and `src/core/one-shot-llm.test.ts` | Implement a credential-opaque, tool-free, single-use caller with streaming observation, abort, response assembly, and report-only accounting. | LLM request boundary, captured runtime/generation, shared collector, usage reporter. | One-shot caller and factory-facing contracts with focused tests. |
| BD-006 | `src/core/agent.ts`, `src/core/agent.test.ts`, `src/core/module.ts`, `src/core/create-agent.ts`, and `src/core/create-agent.test.ts` | Inject fresh callers from current settings, hold the aggregate usage interface, report main-loop usage, and preserve existing Agent API behavior. | One-shot and usage contracts plus existing Agent lifecycle. | Shared accounting and structural registration without runtime credential access. |
| BD-007 | `src/context/compressor.ts`, `src/context/compressor.test.ts`, and `src/assembly/builtins.ts` | Migrate generated compression to the one-shot capability while preserving fallback and threshold behavior. | Fresh one-shot caller injection. | Runtime/config-independent context compression. |
| BD-008 | `src/index.ts`, `src/index.test.ts`, and affected engine/assembly tests | Publish the intended contracts, retire obsolete exports, and prove integrated compatibility. | Completed internal contracts and behavior. | Verified package surface and repository-wide regression evidence. |

## Ordered Tasks

### T-001: Preserve usage through common streaming responses

- Covers: RQ-005, RQ-006
- Boundaries: BD-001, BD-002, BD-003
- Inputs: Existing provider delta generators, common chunk union, and Agent response assembly behavior.
- Outputs: Usage-bearing streams and a reusable collector returning provider token counts without delta regressions.

#### Steps

1. Add failing common-collector and provider stream tests for known usage, absent usage, reasoning/text/tool deltas, and interrupted collection.
2. Add a validated usage stream value and update each supported delta generator to emit authoritative provider usage while preserving existing event order and content.
3. Extract response collection into the common LLM layer, retaining the last authoritative usage value and returning zero only when none is supplied.
4. Keep legacy provider consumption helpers behaviorally consistent where they remain covered.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-001 | `npx vitest run src/core/llm.test.ts src/engine/openai-compatible/stream.test.ts src/engine/anthropic/stream.test.ts src/engine/nvidia/stream.test.ts` | Common and provider stream tests pass with exact non-zero usage and unchanged deltas. |

### T-002: Introduce the interface-based usage service

- Depends on: T-001
- Covers: RQ-004
- Boundaries: BD-004
- Inputs: Existing token-count validation and addition semantics.
- Outputs: Separate reporter, reader, and resetter interfaces; one aggregate service interface; and a defensive default counter.

#### Steps

1. Add failing tests for accumulation, defensive reads, reset, validation, and aggregate-to-reporter structural assignability without casts.
2. Implement the capability contracts and default aggregate implementation with cloned return values.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-002 | `npx vitest run src/core/token-usage.test.ts` | Accumulation, reset, defensive reads, and interface narrowing pass. |

### T-003: Deliver the one-shot caller

- Depends on: T-001, T-002
- Covers: RQ-001, RQ-002, RQ-005
- Boundaries: BD-005
- Inputs: Shared collector, LLM request routing, captured runtime/generation, and report-only usage capability.
- Outputs: A single-use tool-free caller with response, delta subscription, abort behavior, and exact-once completed-call reporting.

#### Steps

1. Add failing tests for captured settings, empty tools, response and chunk delivery, second-attempt rejection, abort, missing usage, and exactly-once reporter calls.
2. Implement the minimal caller using the existing engine-manager request boundary and shared collector without any Agent session facilities.
3. Ensure the runtime credential remains private to the caller construction boundary and is absent from the injected consumer contract.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-003 | `npx vitest run src/core/one-shot-llm.test.ts` | One-shot isolation, single use, streaming, abort, and reporting tests pass. |

### T-004: Integrate shared accounting and migrate compression

- Depends on: T-003
- Covers: RQ-001, RQ-003, RQ-004, RQ-005
- Boundaries: BD-006, BD-007
- Inputs: One-shot factory contract and aggregate usage service.
- Outputs: Agent registration/injection, main-loop accounting, preserved token query behavior, and one-shot-based context compression.

#### Steps

1. Add failing Agent/create-agent tests for aggregate-service injection, fresh caller settings, no credential accessor, main plus one-shot totals, reset, and existing query compatibility.
2. Make `MiniAgent` hold only the aggregate usage interface, select a default through construction/assembly, and pass its reporter view structurally to each fresh one-shot caller.
3. Replace Agent-local arithmetic with exact-once usage reporting after normally completed main-loop responses.
4. Replace context compressor raw LLM/runtime setters with one-shot factory injection and update assembly plus regression tests for all compression outcomes.
5. Remove obsolete runtime/config registration contracts and references.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-004 | `npx vitest run src/core/agent.test.ts src/core/create-agent.test.ts src/context/compressor.test.ts src/assembly/builtins.test.ts` | Injection, shared totals, compatibility, and compressor behavior pass without runtime/config exposure. |

### T-005: Finalize public surface and regression evidence

- Depends on: T-004
- Covers: RQ-007
- Boundaries: BD-008
- Inputs: Completed one-shot, usage, Agent, compressor, and engine changes.
- Outputs: Intended package exports and complete conformant repository result.

#### Steps

1. Export new schemas, types, and default implementations while removing retired runtime-require exports.
2. Update public API tests for importability and absence of retired contracts.
3. Run focused and repository-wide validation, addressing only defects introduced by this task.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-005 | `npm run lint` | ESLint passes with no errors. |
| CK-006 | `npm run build` | Strict TypeScript ESM build passes. |
| CK-007 | `npm test` | Full Vitest suite passes. |

## Requirement Coverage

| Requirement | Tasks | Boundaries | Evidence |
|---|---|---|---|
| RQ-001 | T-003, T-004 | BD-005, BD-006 | CK-003, CK-004 |
| RQ-002 | T-003 | BD-005 | CK-003 |
| RQ-003 | T-004 | BD-007 | CK-004 |
| RQ-004 | T-002, T-004 | BD-004, BD-006 | CK-002, CK-004 |
| RQ-005 | T-001, T-003, T-004 | BD-001, BD-002, BD-003, BD-005, BD-006 | CK-001, CK-003, CK-004 |
| RQ-006 | T-001 | BD-001, BD-002, BD-003 | CK-001 |
| RQ-007 | T-005 | BD-008 | CK-005, CK-006, CK-007 |

## Risks and Rollback

- Risk: Treating usage as an ordinary delta may cause duplicate reporting when a provider emits multiple usage updates. Mitigation: response collection retains the latest authoritative value and only completed call owners report once.
- Risk: Making usage injection mandatory could break direct `MiniAgent` construction. Mitigation: preserve the existing construction forms while choosing a default service behind an interface-only field.
- Risk: Abort semantics can accidentally report a partial count as completed usage. Mitigation: tests distinguish normal terminal completion from interruption before reporting.
- Rollback: If the integrated result cannot satisfy the approved Spec, restore only attempt-owned product/test changes to baseline `711e0fd6380386cb2ec1e6aa3bcb48af593146f3` while preserving task artifacts under the active worktree controller.

## Assumptions

- One default in-memory usage implementation remains available for compatibility, but consumer type signatures refer only to capability interfaces.
- Existing synchronous token-query behavior remains synchronous.

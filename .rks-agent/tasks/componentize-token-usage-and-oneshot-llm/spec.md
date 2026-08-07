---
kind: rks-spec
contract:
  path: ./TaskContract.md
  revision: 1
state: ready
---

# Specification: Isolated one-shot LLM calls with shared token accounting

## Why and Outcome

Internal components need to perform model calls without learning runtime credentials or reproducing Agent request construction. The delivered capability provides a fresh, tool-free, single-use caller using the Agent's effective settings, while every completed normal or internal model call contributes provider-reported usage to one replaceable accounting service.

## Task Perspective

- Core outcome: Internal components can safely perform isolated one-shot model calls and all resulting provider-reported token usage is reflected in the Agent's shared total.
- Necessary support: Usage metadata survives streaming, the caller captures current settings, tools and session state are excluded, token capabilities are interface-separated, and existing public behavior remains compatible.
- Peripheral assurance: Public export coverage, strict type checks, focused regression tests, full-suite verification, and complete-result review prove and protect the outcome.

## Scope and Non-Goals

### In Scope

- A fresh single-use model-calling capability available to registered internal components.
- Credential opacity, current-setting behavior, tool exclusion, and session isolation for that capability.
- Shared token usage reporting, reading, and resetting through replaceable capability contracts.
- Provider usage propagation across supported streaming engines.
- Context compression migration and package export compatibility.

### Non-Goals

- Tool-capable child Agents or general subagent orchestration.
- Monetary cost calculation, billing, remote telemetry, or database persistence.
- Provider authentication, model-selection, or generation-policy changes unrelated to isolated calls.
- Estimating usage absent from provider responses.

## Constraints

- Registered consumers must not receive model credentials through the new calling contract.
- Provider routing must continue through the configured engine manager.
- Existing token-query API names and unrelated public behavior remain compatible.
- Interrupted calls or providers without usage metadata must not produce fabricated usage.

## Definitions

| Term | Meaning |
|---|---|
| One-shot caller | A fresh model caller that permits one request, supplies no tools, and owns no Agent session or context state. |
| Completed call | A model request whose response stream reaches a normal terminal result with provider usage available. |
| Usage service | One replaceable object supporting the distinct capabilities of reporting, reading, and resetting accumulated token usage. |

## External Behavior and Data Rules

- Token usage retains non-negative `input`, `output`, and `total` values, with `total` equal to the accumulated input plus output.
- Reading accumulated usage returns a defensive value that cannot mutate later service results.
- Resetting usage produces a zero total without changing model or Agent state.
- A one-shot caller becomes unusable after its first request attempt and rejects another request clearly.

## Observable Requirements

| ID | Requirement |
|---|---|
| RQ-001 | A registered consumer can obtain a fresh one-shot caller that uses the Agent's effective model and generation settings at the time the caller is obtained without exposing runtime credentials. |
| RQ-002 | A one-shot caller accepts exactly one request, always supplies an empty tool set, produces the model response and stream deltas, and creates no Agent session, stored messages, context-provider participation, or Agent loop. |
| RQ-003 | Context compression uses only the one-shot calling capability for generated summaries while preserving threshold, fallback-summary, compressed-count, and collected-summary behavior. |
| RQ-004 | Token usage reporting, reading, and resetting are independently consumable contracts, and one aggregate contract combines all three so the Agent holds one replaceable usage dependency while narrower consumers receive only the capability they need. |
| RQ-005 | Every completed normal Agent model call and completed internal one-shot call reports its provider usage exactly once to the same usage service; missing or interrupted usage is not fabricated. |
| RQ-006 | Supported provider streams preserve their reported input and output usage through the common response boundary without changing text, reasoning, or tool-call delta behavior. |
| RQ-007 | Existing token-query behavior remains source compatible, the new public calling and usage contracts are exported, and runtime/config injection is no longer required for context compression. |

## Acceptance Scenarios

| ID | Covers | Given | When | Then |
|---|---|---|---|---|
| AC-001 | RQ-001, RQ-002 | An Agent has an active model, generation settings, and registered tools | A registered consumer obtains and invokes a one-shot caller | The request uses the current effective settings, contains no tools, exposes no credential accessor, and returns the generated response and deltas without Agent session side effects. |
| AC-002 | RQ-001 | An Agent's effective model or generation settings change between obtaining two callers | Each caller is invoked | The earlier caller uses its captured settings and the later caller uses the updated settings. |
| AC-003 | RQ-002 | A one-shot caller has already received its first invocation attempt | It is invoked again | The second invocation is rejected and no second provider request occurs. |
| AC-004 | RQ-003 | Compression exceeds its configured threshold | Generated summarization succeeds, returns no text, fails, or lacks an injected caller | Existing generated-summary, local-fallback, compressed-count, and no-op behaviors remain correct for the corresponding case. |
| AC-005 | RQ-004 | One usage implementation supplies reporting, reading, and reset capabilities | The Agent holds the aggregate capability and passes it to a report-only consumer | Both dependencies type-check without casts; reporting accumulates, reads are defensive, and reset returns the total to zero. |
| AC-006 | RQ-005, RQ-006 | Provider streams report known non-zero usage for a normal Agent call and an internal one-shot call | Both calls complete | The shared total contains both calls exactly once with correct input, output, and total values. |
| AC-007 | RQ-005, RQ-006 | A provider omits usage or a stream is interrupted before terminal usage | The call ends | No invented usage is added and no previously accumulated usage is lost. |
| AC-008 | RQ-006 | Each supported streaming provider emits text, reasoning, tool-call data, and terminal usage applicable to that provider | The common stream is consumed | Existing deltas are unchanged and the resulting response contains the provider-reported usage. |
| AC-009 | RQ-007 | A current package consumer uses existing token-query behavior and a new consumer imports the one-shot and usage contracts | The package is type-checked and exercised | Existing usage queries remain available and the intended new contracts are importable without the retired compressor runtime/config dependency. |

## Success Evidence

| ID | Requirements | Scenarios | Evidence class |
|---|---|---|---|
| EV-001 | RQ-001, RQ-002 | AC-001, AC-002, AC-003 | Focused one-shot and registration contract tests with captured provider requests and side-effect assertions. |
| EV-002 | RQ-003 | AC-004 | Context-compression regression tests covering success, fallback, thresholds, and missing dependency behavior. |
| EV-003 | RQ-004 | AC-005 | Usage-service unit tests and strict compile-time assignability coverage. |
| EV-004 | RQ-005 | AC-006, AC-007 | Integrated Agent and one-shot accounting tests with exact expected totals and interruption or missing-usage cases. |
| EV-005 | RQ-006 | AC-006, AC-007, AC-008 | Supported-engine stream tests proving terminal usage and unchanged delta sequences. |
| EV-006 | RQ-007 | AC-009 | Package export tests plus successful strict typecheck and build. |
| EV-007 | RQ-001, RQ-002, RQ-003, RQ-004, RQ-005, RQ-006, RQ-007 | AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009 | Complete-result code review and fresh repository lint, build, and full test-suite evidence. |

## Assumptions

- Provider usage is authoritative when present; this feature does not independently tokenize prompts or completions.
- A caller captures effective settings when obtained rather than tracking subsequent parent changes during its one permitted request.

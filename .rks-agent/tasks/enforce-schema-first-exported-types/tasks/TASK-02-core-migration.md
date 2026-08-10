# TASK-02 — Migrate the core export surface

## Task Unit Contract

- Contract revision: 1
- Goal and deliverables: Convert all project-owned exported core types to Zod-derived aliases while preserving runtime/API behavior and core barrel coverage.
- Referenced spec requirements: RQ-001, RQ-002, RQ-003, RQ-004, RQ-006; AC-001 and AC-002.
- Referenced plan sections: T-002; BD-002; CK-003 and CK-004.
- Owned boundary: `src/core/**`.
- Permitted files or interfaces: Core source, adjacent core tests needed for compatibility, and `src/core/index.ts`.
- Dependencies: TASK-01.
- Required dependency outputs: Passing detector behavior tests and actionable policy scan.
- Acceptance conditions: Core scan is clean, supported names and enum-style runtime access remain compatible, and core tests pass.
- Task-specific authorization: Covered by the root task authorization.
- Required methods: Prefer structural schemas for data; use function/custom schemas only for protocol or opaque behavior; preserve strict optional and generic semantics.
- Required checks: CK-003 and CK-004 plus typecheck when required to diagnose consumers.
- Required evidence: Changed paths, clean core policy scan, core regression output, and executor self-check.

## Execution Result — Round 1

- Result: completed within the `src/core/**` boundary.
- Changed paths:
  - `src/core/agent.ts`
  - `src/core/capability.ts`
  - `src/core/config.ts`
  - `src/core/create-agent.ts`
  - `src/core/events.ts`
  - `src/core/llm.ts`
  - `src/core/message.ts`
  - `src/core/module.ts`
  - `src/core/persistence.ts`
  - `src/core/types.ts`
- Implementation evidence:
  - Replaced exported enums with Zod enum schemas, inferred aliases, and compatible runtime member objects (`ThinkingLevel.None`, `MessageType.User`, `LLMStreamChunkType.TextDelta`, and `ActionType.Delete`).
  - Replaced exported data aliases and option interfaces with structural schemas and `z.infer`/`z.input` aliases.
  - Replaced exported protocols, callbacks, event maps, and generic stream handles/controllers with object/function schemas; generic aliases derive through schema-factory return types.
  - Replaced the recursive handwritten JSON alias with Zod's structural `z.json()` schema.
- Check evidence:
  - `node scripts/check-schema-exports.mjs src/core` — exit 0, `Schema export policy passed.`
  - `npx vitest run src/core` — exit 0, 9 files and 40 tests passed.
  - `npx eslint src/core` — exit 0.
  - `git diff --check` — exit 0.
  - `npm run typecheck` diagnosed no core errors; it remained non-zero on three downstream engine exhaustive-return sites after enum migration: `src/engine/anthropic/convert.ts:208`, `src/engine/glm/convert.ts:171`, and `src/engine/openai-compatible/convert.ts:121`. Those paths belong to TASK-03 and were reported to the controller.
- TDD decision: no new behavior test was added because this task preserves existing behavior and the existing core regression suite already exercises enum-style runtime access, configuration parsing, stream handling, persistence, and agent construction. The new source-policy behavior is owned and tested by dependency TASK-01.

## Executor Self-Check — Round 1

- Acceptance mapping: CK-003 passes with zero core policy violations; CK-004 passes all core tests.
- Boundary check: production edits are confined to `src/core/**`; this Task file is the required durable execution evidence. Existing shared TASK-01 changes in `package.json` and `scripts/**` were not modified.
- Compatibility check: all prior exported type names remain exported, enum-style value access remains available, and core tests demonstrate unchanged runtime behavior.
- Schema quality check: data uses structural Zod schemas; `createFunctionSchema` is limited to callable protocol members and callbacks; schema factories retain generic stream result types.
- Remaining issue: downstream switches that previously relied on enum-member exhaustiveness require TASK-03 remediation; this does not invalidate the clean core surface or core behavior evidence.

## Independent Quick Review — Round 1 (IQR-TASK-02-20260810-01)

- Verdict: `passed`.
- Reviewed contract: Task Unit Contract revision 1; no amendments.
- Owned diff identity: combined `git diff -- src/core` SHA-256 `607c058199a8936c34f64ee46df0605d7750f9a093097ee5603f6be036ef6b9d`, covering `src/core/agent.ts`, `src/core/capability.ts`, `src/core/config.ts`, `src/core/create-agent.ts`, `src/core/events.ts`, `src/core/llm.ts`, `src/core/message.ts`, `src/core/module.ts`, `src/core/persistence.ts`, and `src/core/types.ts`.
- Evidence inspected: T-002, BD-002, CK-003, and CK-004 from `plan.md`; repository `AGENTS.md`; the complete `src/core/**` owned diff; TASK-01's recorded detector output and independent quick review; `node --test scripts/check-schema-exports.test.mjs` (exit 0, 5/5 passed); `node scripts/check-schema-exports.mjs src` (expected exit 1, 226 actionable remaining non-core violations); `node scripts/check-schema-exports.mjs src/core` (exit 0); `npx vitest run src/core` (exit 0, 9 files and 40 tests passed); `npx eslint src/core` (exit 0); `git diff --check -- src/core` (exit 0); and `npm run typecheck` (exit 2 only at the three reported downstream TASK-03 sites: `src/engine/anthropic/convert.ts:208`, `src/engine/glm/convert.ts:171`, and `src/engine/openai-compatible/convert.ts:121`).
- Findings: No obvious blocking defect was demonstrated in the bounded inputs. The owned diff is confined to BD-002, the core policy scan is clean, core regression and lint checks pass, supported exported names remain available through the unchanged core barrel, and schema-backed enum replacements retain member-style runtime access. The non-zero repository typecheck exactly matches the executor's disclosed downstream dependency impact and contains no `src/core/**` diagnostic.
- Required remediation: None.

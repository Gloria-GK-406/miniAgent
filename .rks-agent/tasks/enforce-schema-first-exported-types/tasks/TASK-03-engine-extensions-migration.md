# TASK-03 — Migrate engine and extension export surfaces

## Task Unit Contract

- Contract revision: 1
- Goal and deliverables: Convert all engine and extension exported types and their barrels to Zod-derived aliases without runtime regressions.
- Referenced spec requirements: RQ-001, RQ-002, RQ-003, RQ-004, RQ-006; AC-001 and AC-002.
- Referenced plan sections: T-003; BD-003; CK-005 and CK-006.
- Owned boundary: `src/engine/**` and `src/extensions/**`.
- Permitted files or interfaces: Engine/extension source, adjacent tests needed for compatibility, and their public barrels.
- Dependencies: TASK-02.
- Required dependency outputs: Schema-first core surface and passing core checks.
- Acceptance conditions: Both trees pass the policy detector and their existing regression suites.
- Task-specific authorization: Covered by the root task authorization.
- Required methods: Preserve provider SDK adaptation and plugin behavior; prefer structural schemas for data contracts.
- Required checks: CK-005 and CK-006.
- Required evidence: Changed paths, clean detector result, regression output, and executor self-check.

## Execution Result — Round 1

- Result: completed within the `src/engine/**` and `src/extensions/**` boundary.
- Changed paths:
  - `src/engine/anthropic/convert.ts`
  - `src/engine/anthropic/stream.ts`
  - `src/engine/glm/convert.ts`
  - `src/engine/nvidia/stream.ts`
  - `src/engine/openai-compatible/convert.ts`
  - `src/engine/openai-compatible/stream.ts`
  - `src/extensions/context/compressor.ts`
  - `src/extensions/frontmatter.ts`
  - `src/extensions/index.ts`
  - `src/extensions/mcp/client.ts`
  - `src/extensions/mcp/index.ts`
  - `src/extensions/mcp/types.ts`
  - `src/extensions/skill/index.ts`
  - `src/extensions/skill/types.ts`
  - `src/extensions/subagent.ts`
  - `src/extensions/todo.ts`
- Implementation evidence:
  - Replaced all 16 detector-reported engine/extension exported interfaces and handwritten aliases with direct `z.infer`/`z.input` aliases.
  - Added structural schemas for stream option objects, compression configuration/options, frontmatter results, MCP/skill/subagent entries, subagent invocations, and todo snapshots/statuses.
  - Limited `z.custom` to callable factories/callbacks and opaque external MCP JSON Schema property values.
  - Exported the new schemas from the existing extension, MCP, and skill public barrels while retaining every prior public type name.
  - Remediated the three downstream exhaustive-return errors from TASK-02 in Anthropic, GLM, and OpenAI-compatible reasoning-effort mapping with explicit unsupported-value error paths.
- Check evidence:
  - `node scripts/check-schema-exports.mjs src/engine src/extensions` — exit 0, `Schema export policy passed.`
  - `npx vitest run src/engine src/extensions` — exit 0, 34 files and 269 tests passed.
  - `npx eslint src/engine src/extensions` — exit 0.
  - `npm run typecheck` — exit 0; the three TASK-02 downstream diagnostics are resolved.
  - `git diff --check -- src/engine src/extensions` — exit 0.
- Owned diff identity: combined `git diff -- src/engine src/extensions` SHA-256 `bd1f6ff0f749df747978af7b9795f0a801625d45fe5664a0779e8644a37df311`.
- TDD decision: no new behavior test was added because this Task preserves provider/extension behavior, the schema-export detector's positive and negative behavior is already covered by TASK-01, and existing engine/extension suites provide the faithful regression oracle for this migration.

## Executor Self-Check — Round 1

- Acceptance mapping: CK-005 passes with zero engine/extension policy violations; CK-006 passes all 269 focused regression tests.
- Boundary check: production edits are confined to BD-003 (`src/engine/**` and `src/extensions/**`); this Task file is the required durable execution evidence. Shared TASK-01/TASK-02 changes were not modified.
- Compatibility check: prior exported type names remain available, corresponding schema values are now reachable from supported extension barrels, and provider/extension tests pass without behavior changes.
- Schema quality check: data contracts use structural Zod object/enum schemas; function validation is reserved for callbacks/factories, and the external MCP JSON Schema value uses a bounded opaque object schema.
- Dependency remediation: repository typecheck now passes, proving the three enum-exhaustiveness errors reported by TASK-02 are resolved.
- Remaining issues: none demonstrated within TASK-03's acceptance boundary.

## Independent Quick Review — Round 1 (IQR-TASK-03-20260810-01)

- Verdict: `passed`.
- Reviewed contract: Task Unit Contract revision 1; no amendments.
- Owned diff identity: combined `git diff -- src/engine src/extensions` SHA-256 `bd1f6ff0f749df747978af7b9795f0a801625d45fe5664a0779e8644a37df311`, covering the 16 engine/extension paths listed in Execution Result — Round 1.
- Evidence inspected: T-003, BD-003, CK-005, and CK-006 from `plan.md`; repository `AGENTS.md`; the complete `src/engine/**` and `src/extensions/**` owned diff; TASK-02's schema-first core output, disclosed downstream diagnostics, and passed independent quick review; `node scripts/check-schema-exports.mjs src/engine src/extensions` (exit 0, `Schema export policy passed.`); `npx vitest run src/engine src/extensions` (exit 0, 34 files and 269 tests passed); `npx eslint src/engine src/extensions` (exit 0); `npm run typecheck` (exit 0); `git diff --check -- src/engine src/extensions` (exit 0); and an independently recomputed owned-diff SHA-256 matching the executor's recorded identity.
- Findings: No obvious blocking defect was demonstrated in the bounded inputs. The production diff is confined to BD-003, all detector-reported engine/extension exported declarations are schema-derived, prior public type names remain present, new extension schemas are exposed through the affected supported barrels, and the focused policy, regression, lint, typecheck, and whitespace checks pass. The three TASK-02 downstream exhaustive-return diagnostics are resolved at the exact engine sites previously reported, consistently consuming the migrated core surface.
- Required remediation: None.

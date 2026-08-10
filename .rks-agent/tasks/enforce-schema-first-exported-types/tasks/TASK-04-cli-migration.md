# TASK-04 — Migrate the CLI export surface

## Task Unit Contract

- Contract revision: 1
- Goal and deliverables: Convert all CLI-exported named types to Zod-derived aliases while preserving strict typing and CLI behavior.
- Referenced spec requirements: RQ-001, RQ-002, RQ-003, RQ-004, RQ-006; AC-001 and AC-002.
- Referenced plan sections: T-004; BD-004; CK-007 and CK-008.
- Owned boundary: `src/cli/**`.
- Permitted files or interfaces: CLI source, components, runtime services, runner DTOs, public barrel, and adjacent CLI tests needed for compatibility.
- Dependencies: TASK-03.
- Required dependency outputs: Schema-first lower-layer export surfaces and passing lower-layer checks.
- Acceptance conditions: CLI scan is clean and CLI regressions pass without changing observable commands or UI behavior.
- Task-specific authorization: Covered by the root task authorization.
- Required methods: Preserve optional-property and generic semantics; use structural schemas where practical and custom schemas for opaque UI/protocol values.
- Required checks: CK-007 and CK-008.
- Required evidence: Changed paths, clean detector result, CLI regression output, and executor self-check.

## Execution Result — Round 1

- Result: completed within the `src/cli/**` boundary.
- Changed paths: 77 CLI source files. The migration covers all detector-reported runner modules, `assembly/{builtins,manager}.ts`, affected components and hooks, all affected `runtime/**` service/DTO modules, affected toolkits, and `src/cli/public.ts`. No production path outside `src/cli/**` was changed by this Task.
- Implementation evidence:
  - Migrated all 210 CLI detector violations from exported interfaces or handwritten aliases to same-name `z.infer` aliases backed by exported schemas or generic schema factories.
  - The final CLI schema inventory contains 98 top-level `z.object` schemas, 53 `z.enum` schemas, 5 `z.union` schemas, 7 `z.intersection` schemas, and 8 generic schema factories. Structural object schemas retain the prior strict static shape with `z.ZodType<...>` where optional-property precision requires it.
  - Reserved the remaining 53 top-level `z.custom` schemas for callable/service/toolkit protocols, callback-bearing dependency options, opaque React/Ink/stream handles, or computed type relationships (`Extract`/`Pick`/external identity) where structural runtime validation is not meaningful.
  - Preserved all prior CLI public type names and exported their corresponding new schema values/factories from `src/cli/public.ts` for the existing public assembly surface.
- Remaining top-level `z.custom` classification:
  - Computed or opaque aliases: `AgentListPanelSchema`, `HeadlessDiagnosticsDepsSchema`, `RuntimeBackedCLIEntryActionSchema`, `TUIEntryActionSchema`, `AgentUseFactoryResultSchema`, `SessionPermissionDecisionSchema`, and `CLIApprovalAnswerSchema`.
  - UI, stream, callback, and function-bearing option contracts: `LoadEntryPromptOptionsSchema`, `TUIRenderHandleSchema`, `TUIEntryOptionsSchema`, `HeadlessStreamsSchema`, `PrintStreamsSchema`, `SystemPromptUpdateRequestSchema`, `RegisterBuiltinBlueprintImplsOptionsSchema`, `ActivityViewPropsSchema`, `DiffViewPropsSchema`, `PermissionsViewPropsSchema`, `SystemPromptViewPropsSchema`, `UseAgentReturnSchema`, `InputHistoryControllerSchema`, `UseInputHistoryOptionsSchema`, `CLIAgentFactoryOptionsSchema`, `CreateEditorServiceOptionsSchema`, `InputRouterDepsSchema`, `ModeAwarePermissionServiceOptionsSchema`, `SnapshotServiceOptionsSchema`, `CLIToolkitOptionsSchema`, `DiagnosticsToolkitOptionsSchema`, and `GitToolkitOptionsSchema`.
  - Callable service/protocol contracts: `CLICompressorSchema`, `CLIAgentFactorySchema`, `CommandRegistrySchema`, `DiagnosticsServiceSchema`, `DoctorServiceSchema`, `EditorServiceSchema`, `ExportServiceSchema`, `GitServiceSchema`, `InputHistoryServiceSchema`, `InputRouterSchema`, `PermissionConfigServiceSchema`, `PermissionServiceSchema`, `ProjectInstructionsServiceSchema`, `ProviderConfigServiceSchema`, `ReferenceServiceSchema`, `CLISessionServiceSchema`, `ShellServiceSchema`, `SnapshotServiceSchema`, `SubagentServiceSchema`, `SystemPromptConfigServiceSchema`, `CLIRuntimeSubscriberSchema`, `CLIAppRuntimeSchema`, `CLICommandContextSchema`, and `CLICommandSchema`.
- Check evidence:
  - CK-007: `node scripts/check-schema-exports.mjs src/cli` — exit 0, `Schema export policy passed.`
  - CK-008: `npx vitest run src/cli` — exit 0, 96 files and 789 tests passed.
  - `npx eslint src/cli` — exit 0.
  - `npm run typecheck` — exit 0.
  - `git diff --check -- src/cli` — exit 0.
  - `npm run lint` — exit 0; code lint, dependency boundaries, and the complete-source schema detector passed.
- Owned diff identity: `git diff -- src/cli` SHA-256 `912fd4e713ad6c9abd19a0fc0091e42dce1ecaef34780ac8670a73213dc9bdc1`.
- TDD decision: no new CLI behavior test was added because TASK-01 already tests detector acceptance/rejection and this Task is a type/schema-source migration; the existing 789 focused CLI tests and complete typecheck are the faithful behavior and compatibility oracle.

## Executor Self-Check — Round 1

- Acceptance mapping: CK-007 passes with zero CLI policy violations, and CK-008 passes all 789 focused CLI regressions.
- Boundary check: production edits are confined to BD-004 (`src/cli/**`); this Task file is the required durable execution evidence. Existing TASK-01 through TASK-03 changes were not modified.
- Compatibility check: all previously exported CLI type names remain, strict generic and optional-property shapes compile under the repository settings, observable CLI tests remain green, and corresponding schemas for the supported CLI public barrel are reachable.
- Schema quality check: practical DTOs and literal/discriminated data use structural object/enum/union/intersection schemas. The 53 remaining top-level custom schemas are exhaustively classified above and are limited to opaque, computed, callback-bearing, or callable protocol contracts allowed by the Spec.
- Repository integration check: the standard `npm run lint` boundary succeeds over the accumulated source tree, proving the CLI migration composes with the accepted lower-layer outputs and detector integration.
- Remaining issues: none demonstrated within TASK-04's acceptance boundary.

## Independent Quick Review — Round 1 (IQR-TASK-04-20260810-01)

- Verdict: `changes_required`.
- Reviewed contract: Task Unit Contract revision 1; no amendments.
- Owned diff identity: `git diff -- src/cli` SHA-256 `912fd4e713ad6c9abd19a0fc0091e42dce1ecaef34780ac8670a73213dc9bdc1`, matching the executor's recorded hash; the current owned diff contains 78 CLI paths.
- Evidence inspected: T-004, BD-004, CK-007, and CK-008 from `plan.md`; RQ-001, RQ-002, RQ-003, RQ-004, RQ-006, AC-001, AC-002, and the function/protocol exception from `spec.md`; repository `AGENTS.md`; TASK-03's execution result, self-check, and passed quick review; the complete `src/cli/**` owned diff; the full inventory of 53 top-level `z.custom` schemas; `node scripts/check-schema-exports.mjs src/cli` (exit 0, `Schema export policy passed.`); `npx vitest run src/cli` (exit 0, 96 files and 789 tests passed); and an independently recomputed owned-diff SHA-256 matching the recorded identity.
- Findings: `src/cli/runtime/types.ts:239` defines `CLIApprovalAnswerSchema` as `z.custom<CLIApprovalDecision | boolean>()`. This is a practical data union, not a callable/protocol, React value, opaque external value, or irreducibly computed relationship, and both structural constituents are already available (`CLIApprovalDecisionSchema` immediately above and `z.boolean()`). Because parameterless `z.custom` accepts arbitrary input, the current schema provides no runtime validation and demonstrates schema-washing contrary to the Task's required structural-schema method and the plan's explicit `z.custom` risk control. The other 52 reviewed top-level `z.custom` schemas were locally consistent with the permitted callable/protocol, React/callback-bearing, opaque, or computed categories. Separately, the execution record says 77 changed CLI paths, while `git diff --name-only -- src/cli` reports 78; the hash itself is correct.
- Required remediation: Replace `CLIApprovalAnswerSchema` with a structural union such as `z.union([CLIApprovalDecisionSchema, z.boolean()])`, preserve the inferred `CLIApprovalAnswer` API, rerun CK-007 and CK-008, recompute the owned-diff identity, and correct the changed-path count in the execution evidence.

## Execution Result — Round 2

- Remediation: Replaced the unrestricted `CLIApprovalAnswerSchema` custom schema with `z.union([CLIApprovalDecisionSchema, z.boolean()])`, so the practical data union now validates its complete runtime domain structurally.
- Inventory correction: The owned CLI diff contains 78 changed paths, not the 77 recorded in Round 1.
- Changed path for this round: `src/cli/runtime/types.ts`.
- Required checks and updated diff identity are recorded below after fresh execution.

## Executor Self-Check — Round 2

- The sole demonstrated schema-washing finding is structurally remediated.
- The corrected changed-path count is 78.
- No other implementation path was changed in this remediation round.

## Execution Evidence Addendum — Round 2

- CK-007: `node scripts/check-schema-exports.mjs src/cli` — exit 0, policy passed.
- CK-008: `npx vitest run src/cli` — exit 0, 96 files and 789 tests passed.
- `npm run typecheck` — exit 0.
- `npx eslint src/cli` — exit 0.
- `git diff --check -- src/cli` — exit 0.
- Corrected owned diff: 78 CLI paths; SHA-256 `97854dd9a6707b372cd3a2439de959c740aab3dd317244fb5003f4d9634192a3`.

## Executor Self-Check Addendum — Round 2

- The remediation and fresh checks identify the same Round 2 owned diff.
- CK-007 and CK-008 remain green after structuralizing the approval-answer union.
- The CLI API remains `CLIApprovalDecision | boolean` through schema inference.

## Independent Quick Review — Round 2 (IQR-TASK-04-20260810-02)

- Verdict: `passed`.
- Reviewed contract: Task Unit Contract revision 1; no amendments.
- Owned diff identity: independently recomputed `git diff -- src/cli` SHA-256 `97854dd9a6707b372cd3a2439de959c740aab3dd317244fb5003f4d9634192a3`, matching the Round 2 evidence; `git diff --name-only -- src/cli` contains exactly 78 paths.
- Evidence inspected: the complete TASK-04 record including the Round 1 `changes_required` finding and all Round 2 result, self-check, and evidence addenda; T-004, BD-004, CK-007, and CK-008 from `plan.md`; repository `AGENTS.md`; the current complete `src/cli/**` owned diff; and the remediated approval-answer schema and inferred API in `src/cli/runtime/types.ts`.
- Remediation verification: `CLIApprovalAnswerSchema` is now `z.union([CLIApprovalDecisionSchema, z.boolean()])`, while `CLIApprovalAnswer` remains inferred from that schema. An independent runtime probe accepted `"allow"` and `true` and rejected `"pending"` and `{}`, demonstrating structural validation rather than unrestricted `z.custom` acceptance.
- Fresh check evidence: CK-007 `node scripts/check-schema-exports.mjs src/cli` exited 0 with `Schema export policy passed.`; CK-008 `npx vitest run src/cli` exited 0 with 96 files and 789 tests passed; `npm run typecheck`, `npx eslint src/cli`, and `git diff --check -- src/cli` each exited 0.
- Findings: none. The Round 1 schema-washing finding is resolved, the corrected 78-path count and updated owned-diff hash are accurate, the required CLI checks are fresh and green, and no remaining issue is demonstrated within TASK-04's contract or BD-004 boundary.

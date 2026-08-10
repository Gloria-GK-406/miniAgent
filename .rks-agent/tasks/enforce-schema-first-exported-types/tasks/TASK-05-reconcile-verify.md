# TASK-05 — Reconcile and prove the complete invariant

## Task Unit Contract

- Contract revision: 1
- Goal and deliverables: Reconcile public barrels and package entry points, eliminate every remaining policy violation, and produce complete implementation-stage evidence.
- Referenced spec requirements: RQ-001, RQ-002, RQ-003, RQ-004, RQ-005, RQ-006; AC-001 through AC-005.
- Referenced plan sections: T-005; BD-001 through BD-005; CK-009 through CK-012.
- Owned boundary: Complete task diff, root/package barrels, package-facing compatibility tests, and migration-related fixes.
- Permitted files or interfaces: Any source, test, script, or package configuration path already inside the approved migration scope.
- Dependencies: TASK-04.
- Required dependency outputs: Clean per-layer scans and passing focused regression checks.
- Acceptance conditions: Detector tests and full scan pass; public exports are reconciled; lint, build, and full tests pass.
- Task-specific authorization: Covered by the root task authorization.
- Required methods: Inspect the complete diff and exported inventory; remediate only migration-related failures.
- Required checks: CK-009, CK-010, CK-011, and CK-012.
- Required evidence: Complete changed-path inventory, full check results, remaining risks, and executor self-check.

## Execution Result — Round 1

- Result: completed. The accumulated migration satisfies the complete source-tree policy, preserves every baseline package-entry export name and its type/value category, and passes all required repository gates. No TASK-05 production remediation was necessary.
- Implementation changed-path inventory: 107 paths total, comprising `package.json`; `scripts/check-schema-exports.mjs`; `scripts/check-schema-exports.test.mjs`; 10 `src/core/**` paths; 6 `src/engine/**` paths; 10 `src/extensions/**` paths; and 78 `src/cli/**` paths. The exact inventory is:

```text
package.json
scripts/check-schema-exports.mjs
scripts/check-schema-exports.test.mjs
src/cli/agent-list-runner.ts
src/cli/assembly/builtins.ts
src/cli/assembly/manager.ts
src/cli/command-list-runner.ts
src/cli/completion-runner.ts
src/cli/components/ActivityView.tsx
src/cli/components/App.tsx
src/cli/components/DiffView.tsx
src/cli/components/InputBox.tsx
src/cli/components/MessageList.tsx
src/cli/components/PanelView.tsx
src/cli/components/PermissionsView.tsx
src/cli/components/SystemPromptView.tsx
src/cli/config-paths-runner.ts
src/cli/config.ts
src/cli/context-preview-runner.ts
src/cli/diagnostics-runner.ts
src/cli/entry-args.ts
src/cli/entry-prompt.ts
src/cli/entry-runtime-runner.ts
src/cli/entry-tui-runner.ts
src/cli/git-headless-runner.ts
src/cli/headless-output.ts
src/cli/history-runner.ts
src/cli/hooks/useAgent.ts
src/cli/hooks/useInputHistory.ts
src/cli/hooks/useSuggestion.ts
src/cli/init-runner.ts
src/cli/model-list-runner.ts
src/cli/overview-runner.ts
src/cli/permission-runner.ts
src/cli/permission-show-runner.ts
src/cli/print-runner.ts
src/cli/project-instructions-runner.ts
src/cli/provider-catalog.ts
src/cli/public.ts
src/cli/reference-list-runner.ts
src/cli/runtime/agent-factory.ts
src/cli/runtime/command-registry.ts
src/cli/runtime/diagnostics-service.ts
src/cli/runtime/doctor-service.ts
src/cli/runtime/editor-service.ts
src/cli/runtime/export-service.ts
src/cli/runtime/git-service.ts
src/cli/runtime/input-history-service.ts
src/cli/runtime/input-router.ts
src/cli/runtime/permission-config-service.ts
src/cli/runtime/permission-service.ts
src/cli/runtime/project-instructions-service.ts
src/cli/runtime/provider-config-service.ts
src/cli/runtime/reference-service.ts
src/cli/runtime/reference-turn-context.ts
src/cli/runtime/session-service.ts
src/cli/runtime/shell-service.ts
src/cli/runtime/snapshot-service.ts
src/cli/runtime/subagent-service.ts
src/cli/runtime/system-prompt-config-service.ts
src/cli/runtime/system-prompt.ts
src/cli/runtime/types.ts
src/cli/session-clear-runner.ts
src/cli/session-delete-runner.ts
src/cli/session-export-runner.ts
src/cli/session-fork-runner.ts
src/cli/session-import-runner.ts
src/cli/session-rename-runner.ts
src/cli/session-search-runner.ts
src/cli/show-config-runner.ts
src/cli/snapshot-action-runner.ts
src/cli/snapshot-list-runner.ts
src/cli/status-runner.ts
src/cli/system-prompt-runner.ts
src/cli/system-prompt-show-runner.ts
src/cli/todo-list-runner.ts
src/cli/tool-list-runner.ts
src/cli/tools/cli-toolkit.ts
src/cli/tools/diagnostics-toolkit.ts
src/cli/tools/git-toolkit.ts
src/cli/tools/workspace.ts
src/core/agent.ts
src/core/capability.ts
src/core/config.ts
src/core/create-agent.ts
src/core/events.ts
src/core/llm.ts
src/core/message.ts
src/core/module.ts
src/core/persistence.ts
src/core/types.ts
src/engine/anthropic/convert.ts
src/engine/anthropic/stream.ts
src/engine/glm/convert.ts
src/engine/nvidia/stream.ts
src/engine/openai-compatible/convert.ts
src/engine/openai-compatible/stream.ts
src/extensions/context/compressor.ts
src/extensions/frontmatter.ts
src/extensions/index.ts
src/extensions/mcp/client.ts
src/extensions/mcp/index.ts
src/extensions/mcp/types.ts
src/extensions/skill/index.ts
src/extensions/skill/types.ts
src/extensions/subagent.ts
src/extensions/todo.ts
```

- Diff identity: tracked implementation diff SHA-256 `56c7bcf83507d2d3b073e88e7e1353b2a587151d4ec8a6a96c10c6f7fa93f7d7`; detector SHA-256 `aee633b51115c2d8585145b83299039724dd8440b9277f9568df9791a9c2c35e`; detector-test SHA-256 `16fe8ed30bc3db443e7533df92175d3d6d0ccc59c7aaef0772db94450ef05564`. This Task evidence file is the only additional TASK-05 changed path.
- Public-entry reconciliation: built both the current worktree and an isolated archive of HEAD, then used the TypeScript checker over generated declarations for all 13 source entries represented by `package.json` exports (`index`, `core/index`, `engine/index`, the six engine provider entries, `extensions/index`, `extensions/mcp/index`, `extensions/skill/index`, and `extensions/subagent`). Every entry had zero removed symbols and zero type/value-kind changes. Additions were schema values only: root +40, core +17, extensions +12, MCP +2, skill +1, subagent +4; engine entries had no additions.
- CK-009: `node --test scripts/check-schema-exports.test.mjs && node scripts/check-schema-exports.mjs src` — exit 0; 5/5 detector behavior cases passed and the complete source scan reported `Schema export policy passed.`
- CK-010: `npm run lint` — exit 0; ESLint, dependency architecture, and schema export policy all passed.
- CK-011: `npm run build` — exit 0; TypeScript emitted the complete package successfully.
- CK-012: `npm test` — exit 0; 140 test files and 1101 tests passed.
- Additional package evidence: `npm run package:smoke` — exit 0; compiled package entry, CLI version, and CLI help executed successfully. `git diff --check` also exited 0.
- Remediation: none. No migration-related integration failure or accidentally hidden public name was demonstrated.
- Remaining risks: the policy detector proves exported declaration provenance, not the semantic strength of every `z.custom` validator. TASK-04 independently reviewed the complete CLI `z.custom` inventory and remediated its one demonstrated schema-washing case; callable, opaque, React, and computed contracts remain intentionally represented with custom schemas under the approved Spec. Export reconciliation proves name and type/value-category preservation, while build, package smoke, and full tests provide the available behavioral compatibility evidence; it does not claim arbitrary external source-level assignability beyond that evidence.

## Executor Self-Check — Round 1

- Acceptance mapping: CK-009 proves RQ-001 through RQ-003 and RQ-005 over the full tree; CK-010 proves standard lint enforcement; CK-011, CK-012, package smoke, and the baseline export comparison prove the supported compatibility and regression conditions in RQ-004 and RQ-006.
- Dependency check: TASK-01 through TASK-04 each has a latest passed independent quick review; TASK-04 Round 2 is the authoritative CLI result.
- Boundary check: no production source, test, detector, or package configuration path was edited during TASK-05. Only this required durable execution record was appended; `sdd-execution.yaml` was not edited and no commit was created.
- Inventory check: the 107-path implementation inventory matches `git status --short` before this evidence append and its layer counts sum exactly (`1 + 2 + 10 + 6 + 10 + 78`).
- Evidence freshness: CK-009 through CK-012, package smoke, diff checking, baseline compilation, and entry inventory comparison were run against the same current accumulated implementation before this result was recorded.
- Unresolved blockers: none.

## Independent Quick Review — Round 1 (IQR-TASK-05-20260810-01)

- Verdict: `passed`.
- Reviewed contract: Task Unit Contract revision 1; no amendments.
- Owned diff identity: independently recomputed tracked implementation diff SHA-256 `56c7bcf83507d2d3b073e88e7e1353b2a587151d4ec8a6a96c10c6f7fa93f7d7`, detector SHA-256 `aee633b51115c2d8585145b83299039724dd8440b9277f9568df9791a9c2c35e`, and detector-test SHA-256 `16fe8ed30bc3db443e7533df92175d3d6d0ccc59c7aaef0772db94450ef05564`. `git diff --name-only` contains 105 tracked implementation paths and `git status --short` adds the two untracked detector files, matching the recorded 107-path inventory and layer totals.
- Evidence inspected: TASK-05's complete result and self-check; T-005, BD-001 through BD-005, and CK-009 through CK-012 from `plan.md`; repository `AGENTS.md`; TASK-01 through TASK-04 execution outputs and latest passed independent quick reviews; the complete accumulated implementation diff and changed-path inventory; `git diff --check` (exit 0); CK-009 (exit 0, 5/5 detector cases passed and full `src` scan passed); CK-010 `npm run lint` (exit 0); CK-011 `npm run build` (exit 0); CK-012 `npm test` (exit 0, 140 files and 1101 tests passed); and `npm run package:smoke` (exit 0).
- Public-entry reconciliation: independently built an isolated `HEAD` archive and compared its generated declarations with the current build using the TypeScript checker across the 13 unique declaration entries represented by the package export map. Every entry has zero removed symbols and zero type/value-kind changes; additions match the executor's record exactly: root +40, core +17, extensions +12, MCP +2, skill +1, subagent +4, and no engine-entry additions.
- Findings: No obvious blocking defect was demonstrated in the bounded inputs. The dependency outputs are present and consistently consumed, the complete source policy and repository gates are fresh and green, public names and symbol categories are preserved, and the recorded path/hash evidence is reproducible. The executor's stated limitation around semantic strength of permitted `z.custom` schemas remains a disclosed final-review concern rather than a local TASK-05 acceptance defect.
- Required remediation: None.

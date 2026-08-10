# TASK-01 — Lock the exported-type policy

## Task Unit Contract

- Contract revision: 1
- Goal and deliverables: Deliver a source-aware detector, automated positive/negative behavior tests, and standard lint integration for schema-first exported named types.
- Referenced spec requirements: RQ-001, RQ-002, RQ-003, RQ-005; AC-001, AC-003, AC-004, AC-005.
- Referenced plan sections: T-001; BD-001; CK-001 and CK-002.
- Owned boundary: Schema-export policy scripts, their tests, and package lint-script wiring.
- Permitted files or interfaces: `scripts/check-schema-exports.mjs`, `scripts/check-schema-exports.test.mjs`, `package.json`.
- Dependencies: None.
- Required dependency outputs: None.
- Acceptance conditions: Invalid direct or later-exported interfaces, enums, and handwritten aliases fail with actionable diagnostics; Zod-derived aliases and type-only re-exports pass; standard lint invokes the detector.
- Task-specific authorization: Covered by the root task authorization.
- Required methods: TDD for executable detector behavior; TypeScript AST inspection rather than text matching.
- Required checks: CK-001 and CK-002.
- Required evidence: Exact RED/GREEN commands and decisive output, changed paths, detector backlog evidence, and executor self-check.

## Execution Result — Round 1

- Executor: delegated implementation context, completed and reconciled by the root executor after interruption.
- Changed paths: `scripts/check-schema-exports.mjs`, `scripts/check-schema-exports.test.mjs`, `package.json`.
- RED: `node --test scripts/check-schema-exports.test.mjs` initially failed because the detector did not yet exist; during GREEN, the compliant Zod-import fixture also exposed and drove correction of Zod binding recognition.
- GREEN: `node --test scripts/check-schema-exports.test.mjs` exited 0 with 5/5 passing behavior cases.
- Backlog evidence: `node scripts/check-schema-exports.mjs src` exited 1 with `Schema export policy failed with 248 violation(s).`, proving the detector reaches the current migration surface.
- Deliverable: TypeScript AST traversal rejects directly exported and later-exported interfaces, enums, and handwritten aliases; accepts imported Zod derivation bindings, schema-factory result type arguments, and type-only re-exports; reports file, line, column, and declaration name.
- Lint integration: `npm run lint` now includes `npm run lint:schema`.

## Executor Self-Check — Round 1

- The detector uses TypeScript AST nodes rather than regex classification.
- Namespace-owned exports and later local export lists are covered.
- Lookalike non-Zod namespaces are rejected.
- The expected repository scan failure is exclusively the pre-existing 248-item migration backlog.
- No paths outside the Task Unit boundary were changed.

## Independent Quick Review — Round 1 (IQR-TASK-01-20260810-01)

- Verdict: `passed`.
- Reviewed contract: Task Unit Contract revision 1; no amendments.
- Owned diff identity: `package.json` (SHA-256 `6c9e4510606ba1cffad14ef36bc4115dc4461df1f7adba996afca8da46a49a93`), `scripts/check-schema-exports.mjs` (SHA-256 `aee633b51115c2d8585145b83299039724dd8440b9277f9568df9791a9c2c35e`), and `scripts/check-schema-exports.test.mjs` (SHA-256 `16fe8ed30bc3db443e7533df92175d3d6d0ccc59c7aaef0772db94450ef05564`). `git status --short` showed only these three implementation paths within BD-001.
- Evidence inspected: T-001, BD-001, CK-001, and CK-002 from `plan.md`; repository `AGENTS.md`; the complete owned diff; `node --test scripts/check-schema-exports.test.mjs` (exit 0, 5/5 passed); `node scripts/check-schema-exports.mjs src` (expected exit 1, 248 actionable violations); and `git diff --check -- package.json scripts/check-schema-exports.mjs scripts/check-schema-exports.test.mjs` (exit 0).
- Findings: No obvious blocking defect was demonstrated. The implementation uses TypeScript AST inspection, rejects direct and later-exported interfaces/enums/handwritten aliases with file/line/column/name diagnostics, accepts imported Zod derivations and type-only module re-exports, exposes the current migration backlog, and wires the detector into standard lint. The owned changes remain within the declared Task boundary.
- Required remediation: None.

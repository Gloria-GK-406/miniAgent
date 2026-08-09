---
kind: rks-spec-result
outcome: completed
terminal_stage: verification
---

# Spec Result: Enforce four source layers before package split

## Delivered

- Reorganized the single-package source into `core`, `engine`, `extensions`, and `cli` with core-owned Agent contracts, sibling engine/extension layers, and CLI-owned product composition.
- Added stable core and extensions public entries while preserving root, engine, and legacy tool consumers.
- Added a zero-baseline dependency gate for ownership, allowed directions, public boundaries, external dependencies, and runtime/type-only cycles, integrated into normal lint and prepublish checks.
- Added architecture regression coverage, built-package consumer smoke coverage, memory persistence coverage, and updated architecture/import documentation.

## Success Evidence

| Condition | Evidence |
|---|---|
| SC-1 | Four-directory production source inventory and approved complete-change review. |
| SC-2 | Passing architecture gate and core API/persistence inspection. |
| SC-3 | Passing complete dependency graph plus CLI composition inspection. |
| SC-4 | Seven passing negative architecture cases and zero reported graph cycles. |
| SC-5 | Passing `npm run lint`; `prepublishOnly` includes that gate. |
| SC-6 | Passing built-package import and CLI smoke checks; approved export compatibility review. |
| SC-7 | Fresh lint/build/1,095-test verification, package dry-run, diff check, and residue inspection. |

## Repository Result

- Changed paths: core contracts/persistence, engine imports/exports, extensions relocation, CLI composition/session ownership, package exports, dependency policy, tests, and directly related documentation plus durable SDD evidence.
- Baseline or accepted result: baseline `8370871bb9b1762bacc1e201a8eac44c44201183`; accepted result is the single local task commit containing this completed change.
- Parent rollback required: no

## Artifacts

- `TaskContract.md`
- `spec.md`
- `plan.md`
- `reviews/change-review.md`
- `verification/completion-evidence.md`

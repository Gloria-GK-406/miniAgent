---
kind: rks-spec-result
outcome: completed
terminal_stage: verification
---

# Spec Result: Executable Schema contracts

## Delivered

- Public data, protocol, opaque-object, and function Schema categories now have matching runtime behavior and inferred types.
- Identity-bearing core and CLI protocols validate structure while preserving the original instance.
- CLI Schema assertions and predicate-free custom Schemas were removed, with a strengthened syntax-aware detector preventing their return.
- Tool arguments are parsed before approval and execution without expanding the current-turn Tool lookup boundary.
- Aggregate and installed split-package consumers verify public Schema types, runtime parsing, identity, and Tool JSON Schema conversion.
- Documentation, CI/release gates, and active release metadata now describe version 0.10.0.

## Success Evidence

| Condition | Evidence |
|---|---|
| SC-1 through SC-8 | `verification/completion-evidence.md` records the fresh condition mapping and passing commands. |
| Independent review | `reviews/change-review.md` records `verdict: approved`. |

## Repository Result

- Changed paths: 98 tracked implementation, test, documentation, workflow, release, and task-artifact paths in the isolated worktree.
- Baseline or accepted result: complete diff from `1e1715c97214b506e69346a8406ba34cabaf7d41` on `codex/schema-runtime-contracts`, ready for one verified local result commit.
- Parent rollback required: no.

## Artifacts

- `TaskContract.md`
- `spec.md`
- `plan.md`
- `reviews/change-review.md`
- `verification/completion-evidence.md`


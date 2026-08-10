---
kind: rks-task-contract
revision: 1
state: ready
---

# TaskContract: Make public Schemas executable runtime contracts

## Context

### Source Request

The user asked to perform another refactoring task after narrowing the work to Schema-related concerns only. The agreed boundary includes the previously discussed T1-T7 and the Schema-specific documentation and release checks from T10, while excluding Agent lifecycle work (T8) and privileged capability registration (T9).

### Current Situation

The 0.9.1 schema-first migration enforces that exported public types are syntactically derived from Zod Schemas, but it does not ensure those Schemas faithfully validate their declared structures. Protocols represented with `z.object()` lose class-instance identity, predicate-free `z.custom<T>()` accepts arbitrary values, CLI data Schemas contain handwritten `z.ZodType` assertions, and tool arguments can reach approval and execution without their declared parameter Schema being applied.

## Goal

Make MiniAgent's public Schemas the authoritative executable source for their data, protocol, and opaque-object contracts, with runtime identity preservation where required and enforceable regression protection.

## Scope

### In

- Define and document consistent categories for data Schemas, identity-bearing protocol Schemas, and opaque external-object Schemas.
- Correct public core, engine, extension, and CLI Schema definitions that currently clone protocol instances, rely on handwritten exported structural assertions, or accept arbitrary values.
- Ensure tool-call arguments are validated by the Tool parameter Schema before approval and execution, with one parsed value used by both.
- Strengthen static Schema policy checks, runtime contract tests, public-package consumer checks, and Schema-related release verification.
- Correct Schema-related README and release metadata, including choosing the next appropriate pre-1.0 version for the changed public behavior.

### Out

- Agent run lifecycle, model-switch atomicity, and after-turn sequencing changes described as T8.
- Trusted registration or privileged capability redesign described as T9.
- Unrelated architecture changes, feature work, dependency upgrades, and cleanup of pre-existing failures.
- Publishing packages, pushing branches, opening pull requests, or modifying remote systems.

## Constraints

- Preserve the repository's TypeScript, ESM, Zod-derived exported-type, import-boundary, and code-style rules in `AGENTS.md`.
- Data structures must be genuinely described by Zod rather than hidden behind handwritten exported structural types.
- Identity-bearing protocol validation must return the original valid object so class methods retain their receiver state.
- Opaque-object validation must use a real runtime predicate or class-instance check.
- Changes to tool validation must not extend into lifecycle or capability authorization design.
- Existing user work and unrelated files must remain untouched.

## Success Conditions

| ID | Observable condition | Required evidence |
|---|---|---|
| SC-1 | Public Schema categories are consistently implemented and documented. | Repository policy documentation and representative data, protocol, and opaque Schema tests agree on the same classification. |
| SC-2 | Valid protocol instances retain identity and invalid protocol structures are rejected. | Runtime tests demonstrate strict identity for representative class-backed protocols, successful method calls after parsing, and rejection when required methods are absent. |
| SC-3 | CLI exported types no longer depend on handwritten `z.ZodType` structural assertions or predicate-free `z.custom<T>()`. | Static repository scan and policy detector tests report no prohibited occurrences, with only explicitly validated opaque/factory uses allowed. |
| SC-4 | Data, service, function, generic, and opaque Schema inputs reject representative invalid values and accept valid values. | A runtime Schema contract matrix covers `42`, `null`, `{}`, missing methods, valid values, and identity-sensitive values as applicable. |
| SC-5 | Tool arguments cannot reach approval or execution without passing the declared parameter Schema. | Regression tests prove invalid arguments bypass approval/execution and valid transformed/defaulted arguments are shared by approval and execution. |
| SC-6 | Public package consumers can import and use the supported public Schemas, including tool parameter JSON Schema conversion. | Package smoke or consumer-fixture verification compiles and runs against built package artifacts. |
| SC-7 | Static checks reject fake schema-first constructs without rejecting legitimate Schema factories and opaque predicates. | Negative detector fixtures cover asserted incompatible Schemas, predicate-free structural custom Schemas, and predicate-free service Schemas. |
| SC-8 | The complete repository result is release-ready within the authorized scope. | Lint, build, full tests, Schema checks, and relevant release/package verification all pass; documentation and version metadata reflect the public Schema behavior change. |

## Authorization

| Capability | Evidence | Authorized scope |
|---|---|---|
| task | After agreeing that the task would include only Schema-related T1-T7 and Schema-specific T10 while excluding T8/T9, the user said: “可以，那就再来一次重构任务吧”. | Implement and verify the bounded Schema-runtime-contract refactor described above, including task-local workflow artifacts and one verified local result commit. |

## Requires Confirmation

- Publishing packages, pushing a branch, opening a pull request, merging, or cleaning up a task worktree requires separate authorization.

## Assumptions

- The next pre-1.0 minor version is the appropriate compatibility signal if runtime Schema behavior changes remain externally observable after implementation.

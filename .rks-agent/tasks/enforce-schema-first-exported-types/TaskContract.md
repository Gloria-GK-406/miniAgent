---
kind: rks-task-contract
revision: 2
state: ready
---

# TaskContract: Enforce Schema-First Exported Types

## Context

### Source Request

“这次的任务就是对整个项目完成禁止非schema导出类型出现。包括重构代码和检测器框架，如果eslint无法实现那就添加相应的插件或者新的检测器来实现检查和拒绝功能。”

### Current Situation

The project currently exports interfaces, enums, literal unions, function aliases, utility-derived aliases, and other named TypeScript types that are not directly inferred from Zod schemas. The existing lint pipeline does not reject these exports, so the repository does not satisfy the requested schema-first public-type policy and can regress after migration.

## Goal

Every project-owned named type exported from source modules is derived from a Zod schema, and the standard lint pipeline rejects any future non-schema exported type declaration.

## Scope

### In

- Refactor exported named types throughout `src` so they are derived with `z.infer`, `z.input`, or `z.output` from corresponding Zod schemas.
- Preserve public behavior and TypeScript compatibility as far as the schema-first constraint permits.
- Replace exported enums and exported handwritten interfaces or aliases with schema-first equivalents.
- Add and test a repository detector that rejects non-schema exported type declarations and integrate it into `npm run lint`.
- Update affected tests and public barrels.

### Out

- Requiring non-exported implementation-only types to be schema-derived.
- Redesigning unrelated runtime behavior or package features.
- Publishing, pushing, merging, or releasing the result.

## Constraints

- TypeScript remains strict ESM with `.js` import suffixes and inline type imports.
- Existing four-layer dependency boundaries remain valid.
- The detector must cover explicit exported declarations and exported aliases owned by this project without rejecting pure re-exports of compliant schema-derived types.
- Existing user changes must be preserved.

## Success Conditions

| ID | Observable condition | Required evidence |
|---|---|---|
| SC-1 | No project-owned exported `interface` or exported `enum` remains under `src`. | Detector scan passes and targeted source inspection confirms zero matches. |
| SC-2 | Every exported project-owned named `type` under `src` is declared through `z.infer`, `z.input`, or `z.output` over a Zod schema or schema-factory result. | Detector scan passes over the complete source tree. |
| SC-3 | Public source barrels expose the migrated schemas and inferred types without breaking supported package entry points. | Build, typecheck, existing tests, and package-facing tests pass. |
| SC-4 | A deliberately invalid exported interface, enum, or handwritten type alias is rejected automatically. | Automated detector tests cover passing and failing fixtures. |
| SC-5 | The standard lint command runs the schema-first detector and rejects violations. | `npm run lint` passes on the migrated tree and test evidence demonstrates rejection behavior. |
| SC-6 | The migration introduces no known functional regression. | Full lint, build, and test suites pass from the final task workspace. |

## Authorization

| Capability | Evidence | Authorized scope |
|---|---|---|
| task | “好，这次的任务就是对整个项目完成禁止非schema导出类型出现。包括重构代码和检测器框架，如果eslint无法实现那就添加相应的插件或者新的检测器来实现检查和拒绝功能。” | Refactor the entire project’s exported type surface, add enforcement and tests, update in-scope artifacts, verify the result, and create the workflow-authorized local result commit. |

## Requires Confirmation

- Merge, push, pull request creation, release, publication, and task-worktree cleanup require separate authorization.

## Assumptions

- “导出类型” means explicitly exported named declarations in `src`, including locally owned aliases surfaced through public barrels; internal non-exported types are outside the prohibition.
- External library types referenced in implementations are not project-owned exported type declarations, but a project-owned exported wrapper around them must still be schema-derived.

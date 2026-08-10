---
kind: rks-plan
spec:
  path: ./spec.md
state: ready
---

# Implementation Plan: Enforced Schema-First Export Surface

## Implementation Approach

Introduce a source-aware policy checker with failing and passing fixtures before the broad migration so every subsequent slice has an objective acceptance gate. Then migrate exported declarations in dependency order from `core` through `engine` and `extensions` to `cli`, preserving runtime enum-style values and public names. Finish by reconciling barrels and package entry points, then run the complete policy and regression evidence. Internal non-exported implementation types remain untouched unless a migrated exported declaration requires a local adjustment.

## Owned Boundaries

| ID | Owned path or interface | Change intent | Inputs | Outputs |
|---|---|---|---|---|
| BD-001 | `scripts/check-schema-exports.mjs`, its automated tests, and `package.json` lint scripts | Define and enforce the exported-type policy with actionable diagnostics and positive/negative coverage. | Specification definitions and current TypeScript source forms. | Executable detector, regression tests, and standard lint integration. |
| BD-002 | `src/core/**` exported declarations and `src/core/index.ts` | Make the foundational public contracts schema-derived while preserving runtime and API behavior. | Existing core schemas, protocols, enums, and consumers. | Schema-first core export surface. |
| BD-003 | `src/engine/**` and `src/extensions/**` exported declarations and barrels | Migrate adapter and extension public contracts against the new core surface. | BD-002 types and existing adapter behavior. | Schema-first engine and extension export surfaces. |
| BD-004 | `src/cli/**` exported declarations, UI props, runtime services, runner DTOs, and CLI public barrel | Migrate the product layer without changing CLI behavior. | BD-002 and BD-003 public contracts plus existing CLI tests. | Schema-first CLI export surface. |
| BD-005 | Root/package public barrels and package-facing compatibility tests | Reconcile reachable schemas/types and prove supported entry-point compatibility. | Migrated layer exports and package export map. | Consistent public API and complete acceptance evidence. |

## Ordered Tasks

### T-001: Lock the exported-type policy

- Covers: RQ-001, RQ-002, RQ-003, RQ-005
- Boundaries: BD-001
- Inputs: Approved specification and observed export declaration forms.
- Outputs: Detector implementation, fixtures/tests, and lint pipeline integration that initially exposes the migration backlog.

#### Steps

1. Implement source-tree traversal and TypeScript AST analysis for exported interfaces, enums, and type aliases.
2. Accept only Zod inference/input/output aliases, including schema-factory result forms, and ignore compliant type-only re-exports.
3. Add positive and negative automated cases, including later export lists and actionable diagnostics.
4. Add the detector to the standard lint pipeline.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-001 | `node --test scripts/check-schema-exports.test.mjs` | Invalid exported declarations are rejected and compliant declarations/re-exports pass. |
| CK-002 | `node scripts/check-schema-exports.mjs src` | The pre-migration source fails with a complete actionable backlog, proving detector reach. |

### T-002: Migrate the core export surface

- Depends on: T-001
- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-006
- Boundaries: BD-002
- Inputs: Detector policy, existing core schemas, and core regression tests.
- Outputs: Schema-derived core types and compatible schema/runtime exports.

#### Steps

1. Replace exported enums with schema-backed inferred types and compatible runtime member objects.
2. Convert exported data aliases, protocol interfaces, generic handles, callbacks, and option objects to schema-derived aliases.
3. Update core consumers and barrel exports while retaining supported names.
4. Run core-focused type and behavior checks before proceeding upward.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-003 | `node scripts/check-schema-exports.mjs src/core` | The core tree has no policy violations. |
| CK-004 | `npx vitest run src/core` | Core behavior remains passing. |

### T-003: Migrate engine and extension export surfaces

- Depends on: T-002
- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-006
- Boundaries: BD-003
- Inputs: Migrated core contracts and existing engine/extension tests.
- Outputs: Schema-derived engine and extension public contracts with compatible barrels.

#### Steps

1. Convert exported stream options, extension DTOs, factories, plugin entries, compressor options, and todo types to schema-backed aliases.
2. Update affected imports, factories, and public barrels.
3. Preserve provider conversion and extension runtime behavior.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-005 | `node scripts/check-schema-exports.mjs src/engine src/extensions` | Engine and extension trees have no policy violations. |
| CK-006 | `npx vitest run src/engine src/extensions` | Engine and extension regressions remain passing. |

### T-004: Migrate the CLI export surface

- Depends on: T-003
- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-006
- Boundaries: BD-004
- Inputs: Migrated lower-layer contracts, current CLI DTOs/services/components, and CLI regression tests.
- Outputs: Schema-derived CLI exports and unchanged observable CLI behavior.

#### Steps

1. Convert runner request/result/output declarations, runtime service contracts, state/event models, component props, and toolkit contracts.
2. Preserve generic behavior and optional-property semantics required by strict TypeScript settings.
3. Reconcile CLI imports and public exports.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-007 | `node scripts/check-schema-exports.mjs src/cli` | The CLI tree has no policy violations. |
| CK-008 | `npx vitest run src/cli` | CLI behavior and type-level consumers remain passing. |

### T-005: Reconcile and prove the complete invariant

- Depends on: T-004
- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-005, RQ-006
- Boundaries: BD-001, BD-002, BD-003, BD-004, BD-005
- Inputs: All migrated layers, detector tests, public barrels, and package entry points.
- Outputs: Complete schema-first export surface with automated rejection and full compatibility evidence.

#### Steps

1. Inspect the complete diff and exported declaration inventory for missed or accidentally hidden API names.
2. Run detector unit cases and the complete source scan.
3. Run all repository-required lint, build, and regression suites; remediate only migration-related failures.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-009 | `node --test scripts/check-schema-exports.test.mjs && node scripts/check-schema-exports.mjs src` | Detector behavior passes and the entire source tree is compliant. |
| CK-010 | `npm run lint` | Code, dependency, and schema-first policies all pass. |
| CK-011 | `npm run build` | Public declarations and implementation compile successfully. |
| CK-012 | `npm test` | Full regression suite passes. |

## Requirement Coverage

| Requirement | Tasks | Boundaries | Evidence |
|---|---|---|---|
| RQ-001 | T-001, T-002, T-003, T-004, T-005 | BD-001, BD-002, BD-003, BD-004, BD-005 | CK-001, CK-003, CK-005, CK-007, CK-009, CK-010 |
| RQ-002 | T-001, T-002, T-003, T-004, T-005 | BD-001, BD-002, BD-003, BD-004, BD-005 | CK-001, CK-003, CK-005, CK-007, CK-009, CK-010 |
| RQ-003 | T-001, T-002, T-003, T-004, T-005 | BD-001, BD-002, BD-003, BD-004, BD-005 | CK-001, CK-003, CK-005, CK-007, CK-009, CK-010 |
| RQ-004 | T-002, T-003, T-004, T-005 | BD-002, BD-003, BD-004, BD-005 | CK-004, CK-006, CK-008, CK-011, CK-012 |
| RQ-005 | T-001, T-005 | BD-001, BD-005 | CK-001, CK-002, CK-009, CK-010 |
| RQ-006 | T-002, T-003, T-004, T-005 | BD-002, BD-003, BD-004, BD-005 | CK-004, CK-006, CK-008, CK-012 |

## Risks and Rollback

- Risk: Weak `z.custom` schemas could satisfy syntax without providing meaningful validation; prefer structural schemas for data and reserve custom/function schemas for protocols or opaque external values.
- Risk: Generic exported contracts may require schema factories; preserve their type parameters and inferred public shape rather than collapsing them to `unknown`.
- Risk: Enum migration can break runtime member access; preserve the value namespace with const objects covered by existing tests.
- Rollback: If the approved boundary becomes unattainable, restore only this isolated attempt to baseline `dd9c1091f83d726f75abd5a0778710f27697741e` while preserving durable task evidence.

## Assumptions

- The current package export map is the authoritative supported entry-point list.
- Internal declarations may stay handwritten when they are not exported or re-exported.

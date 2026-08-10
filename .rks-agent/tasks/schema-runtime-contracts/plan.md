---
kind: rks-plan
spec:
  path: ./spec.md
state: ready
---

# Implementation Plan: Executable Schema contracts

## Implementation Approach

Begin with failing identity and invalid-input regressions plus shared Function and Protocol Schema primitives, because every later service migration consumes those semantics. Migrate core/engine/extensions before CLI so the CLI can reuse public lower-layer contracts without crossing dependency boundaries. Then convert CLI data and protocol definitions category by category, harden the detector against the exact fake-schema forms exposed by the migration, and enforce Tool parameter parsing with regression tests. Finish with public-consumer, documentation, version, and release checks after the runtime surface is stable.

## Owned Boundaries

| ID | Owned path or interface | Change intent | Inputs | Outputs |
|---|---|---|---|---|
| BD-001 | `src/core/function-schema.ts`, new core protocol-Schema primitive, `src/core/index.ts`, and focused core Schema contract tests | Establish real function validation and identity-preserving structural protocol validation as public lower-layer primitives. | Zod 4 runtime behavior and RQ-003/RQ-004. | Reusable typed Schema factories with identity and rejection evidence. |
| BD-002 | Public protocol and opaque Schema declarations under `src/core/`, `src/engine/`, and `src/extensions/` excluding Tool execution ordering | Classify and migrate identity-bearing protocols, callback functions, option data, generic factories, and external opaque instances. | BD-001 primitives and existing public contracts. | Lower-layer Schemas whose runtime behavior matches inferred public types. |
| BD-003 | Public Schema declarations and consumers under `src/cli/` plus CLI Schema runtime tests | Remove handwritten structural Schema assertions and predicate-free custom Schemas; model data and protocols by category. | BD-001/BD-002 public contracts and existing CLI behavior. | CLI Schemas with genuine validation, correct input/output inference, and preserved service identity. |
| BD-004 | `scripts/check-schema-exports.mjs` and `scripts/check-schema-exports.test.mjs` | Reject asserted fake Schemas and predicate-free structural/service custom Schemas while preserving legitimate factories and predicates. | Corrected source patterns from BD-001 through BD-003. | Actionable static policy and positive/negative fixtures. |
| BD-005 | Tool parameter interface in `src/core/tool.ts`, Tool-call handling in `src/core/agent.ts`, and focused Agent tests | Resolve Tools and validate arguments before approval/execution, sharing the parsed output. | Existing Tool Schema and Zod parameter output behavior. | Enforced Tool parameter runtime boundary and regression evidence. |
| BD-006 | Public-package smoke/consumer checks in `scripts/`, package exports used by those checks, and related tests | Verify external consumers can import, infer, parse, and convert supported public Schemas from built artifacts. | Stable public Schemas from BD-001 through BD-005. | External consumer evidence including Zod JSON Schema conversion. |
| BD-007 | `README.md`, `README_CN.md`, Schema architecture guidance under `docs/`, `package.json`, `package-lock.json`, and version-coupled release contracts, fixtures, and tests under `scripts/` | Document the taxonomy, remove obsolete dependency claims, signal version 0.10.0, and include Schema checks in release readiness. | Final runtime/static behavior and current release tooling. | Consistent documentation, metadata, fixtures, and release checks. |

## Ordered Tasks

### T-001: Establish executable Schema primitives

- Covers: RQ-003, RQ-004, RQ-009
- Boundaries: BD-001
- Inputs: Existing `createFunctionSchema`, class-backed protocol failures, Zod 4 identity behavior.
- Outputs: Typed Function and Protocol Schema factories plus focused positive, negative, identity, and post-parse method tests.

#### Steps

1. Add failing regressions for class-backed protocol identity, incomplete-member rejection, function rejection, and callable identity.
2. Implement the shared protocol factory using structural validation without returning the structural parser's cloned output.
3. Export the reusable primitives through the core public entry point and confirm generic inference does not require handwritten exported structures.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-001 | `npx vitest run src/core/function-schema.test.ts src/core/protocol-schema.test.ts` | Function and protocol positive, negative, identity, and usability regressions pass. |
| CK-002 | `npm run typecheck` | Factory generics and public exports satisfy strict TypeScript without assertions that redefine exported structures. |

### T-002: Migrate lower-layer Schema contracts

- Depends on: T-001
- Covers: RQ-002, RQ-003, RQ-004, RQ-009
- Boundaries: BD-001, BD-002
- Inputs: Shared factories and inventory of core, engine, and extension public Schemas.
- Outputs: Correctly classified lower-layer Data, Protocol, Function, generic, and Opaque-object Schemas.

#### Steps

1. Convert identity-bearing core services and capability protocols to identity-preserving validation while leaving value records and callback-bearing option data structurally described.
2. Classify stream handles/controllers, Tool-related protocols, token-usage services, context services, notifiers, handlers, factories, and require/injection protocols.
3. Replace lower-layer custom Schemas with real function, protocol, or opaque predicates as appropriate and retain generic factory inference.
4. Expand the contract matrix with representative lower-layer invalid values and class-backed identity cases.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-003 | `npx vitest run src/core src/engine src/extensions` | Lower-layer suites pass with protocol identity and invalid-input coverage. |
| CK-004 | `npx tsx -e 'import { MemoryStore, StoreSchema, LLMEngineManager, LLMRequestSchema } from "./src/core/index.ts"; const store = new MemoryStore(); const manager = new LLMEngineManager(); if (StoreSchema.parse(store) !== store || LLMRequestSchema.parse(manager) !== manager) process.exit(1);'` | Representative public protocol Schemas preserve exact class instances. |

### T-003: Make CLI Schemas authoritative

- Depends on: T-002
- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-005, RQ-009
- Boundaries: BD-003
- Inputs: Shared public Schema primitives, CLI assertion/custom inventory, and existing CLI tests.
- Outputs: CLI Data/Protocol/Function/Opaque Schemas inferred from real validation with compatible consumers.

#### Steps

1. Remove structural `z.ZodType` assertions from leaf data Schemas and adjust consumers to their true Zod input/output types.
2. Replace predicate-free custom data, Options, Props, and union fragments with explicit Zod records, variants, intersections, extensions, or factories.
3. Replace CLI services, runtime controllers, subscribers, command contracts, and generic service dependencies with identity-preserving protocol or function Schemas.
4. Use real instance or platform predicates for opaque external values, and reorder or factor declarations where lazy construction existed only to satisfy declaration order.
5. Expand the CLI contract matrix to cover primitive/null/empty-object rejection, valid service identity, data transformations, and generic factories.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-005 | `test "$(rg -o 'as z\.ZodType' src/cli --glob '*.{ts,tsx}' | wc -l | tr -d ' ')" = 0` | No CLI Schema redefines its exported structural type through `as z.ZodType`. |
| CK-006 | `npx vitest run src/cli/schema-first-runtime.test.ts src/cli` | CLI Schemas reject invalid values, preserve service identity, and all CLI regressions pass. |
| CK-007 | `npm run typecheck` | CLI consumers accept genuine Zod input/output inference under strict settings. |

### T-004: Harden the Schema policy detector

- Depends on: T-003
- Covers: RQ-001, RQ-002, RQ-004, RQ-006, RQ-009
- Boundaries: BD-004
- Inputs: Corrected allowed source patterns and prohibited fixture examples.
- Outputs: Static diagnostics for fake schema-first constructs with documented narrow exceptions.

#### Steps

1. Add negative fixtures for asserted incompatible Schemas, predicate-free structural custom Schemas, and predicate-free service custom Schemas.
2. Add positive fixtures for central Protocol/Function factories, real custom predicates, opaque instance checks, and Schema factory parameter constraints.
3. Extend source analysis to identify the prohibited construction behind exported derived types without treating generic Schema constraints as exported facts.
4. Run the detector against the whole source tree and remove any remaining prohibited pattern rather than adding local suppressions.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-008 | `node --test scripts/check-schema-exports.test.mjs` | All prohibited fixtures fail and all legitimate factory/predicate fixtures pass with actionable results. |
| CK-009 | `npm run lint:schema` | The complete corrected source tree satisfies the strengthened policy. |

### T-005: Enforce Tool parameter contracts

- Depends on: T-002
- Covers: RQ-007, RQ-009
- Boundaries: BD-005
- Inputs: Tool parameter Schemas, Agent Tool lookup/approval/execution behavior, and parsed Zod output semantics.
- Outputs: One validated parameter value shared by approval and execution; invalid and missing Tools do not invoke approval/execution.

#### Steps

1. Add regressions for invalid arguments, defaulted or transformed arguments, approval denial after validation, and missing Tools.
2. Resolve the selected Tool before approval, parse its arguments once, and route validation errors through the existing Tool-result error behavior without invoking approvers or execution.
3. Supply the parsed output to every approver and the Tool implementation, preserving abort and stop behavior.
4. Align the Tool protocol's parameter and execution types with Zod output without weakening JSON Schema conversion.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-010 | `npx vitest run src/core/agent.test.ts src/core/tool.test.ts` | Invalid/missing calls skip approval and execution; valid transformed/defaulted output is shared and executes once. |
| CK-011 | `npm run typecheck` | Tool parameter and execution contracts remain type-safe for existing Tools and external consumers. |

### T-006: Verify public consumption and release metadata

- Depends on: T-004, T-005
- Covers: RQ-001, RQ-006, RQ-008, RQ-009, RQ-010
- Boundaries: BD-006, BD-007
- Inputs: Final public Schemas, strengthened policy, package build layout, existing release contract, and bilingual README claims.
- Outputs: External consumer checks, Schema guidance, accurate dependency claims, version 0.10.0 metadata, and passing release/package gates.

#### Steps

1. Add or extend built-package consumer checks for representative public Data, Protocol, Function, Opaque, generic, and Tool parameter Schemas, including Zod JSON Schema conversion.
2. Document the category rules and update bilingual README claims so runtime guarantees match actual behavior and unused direct dependencies are not advertised.
3. Update root/package lock and version-coupled release contracts, intent marker, fixtures, expected archive names, dependency pins, and tests from 0.9.1 to 0.10.0 where they represent the current release candidate rather than historical negative test data.
4. Ensure release readiness invokes the strengthened Schema policy and runtime contract coverage before package verification.
5. Run the complete repository, package-smoke, and release verification suite from a clean build.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-012 | `npm run build && npm run package:smoke` | Built package entry points expose usable public Schemas and CLI package smoke succeeds. |
| CK-013 | `npm run release:test && npm run release:build && npm run release:verify` | Release contracts, archives, dependency graph, and candidate verification pass for 0.10.0. |
| CK-014 | `npm run lint && npm run build && npm test` | Full lint, dependency policy, Schema policy, compilation, and all tests pass. |
| CK-015 | `Non-command: Compare the Schema guidance, README claims, package metadata, and release contract against RQ-001 and RQ-010.` | Documentation and release-facing metadata consistently describe the executable Schema model and version 0.10.0. |

## Requirement Coverage

| Requirement | Tasks | Boundaries | Evidence |
|---|---|---|---|
| RQ-001 | T-003, T-004, T-006 | BD-003, BD-004, BD-007 | CK-006, CK-008, CK-009, CK-015 |
| RQ-002 | T-002, T-003, T-004 | BD-002, BD-003, BD-004 | CK-003, CK-005, CK-007, CK-009 |
| RQ-003 | T-001, T-002, T-003 | BD-001, BD-002, BD-003 | CK-001, CK-004, CK-006 |
| RQ-004 | T-001, T-002, T-003, T-004 | BD-001, BD-002, BD-003, BD-004 | CK-001, CK-003, CK-006, CK-008 |
| RQ-005 | T-003 | BD-003 | CK-005, CK-006, CK-007 |
| RQ-006 | T-004, T-006 | BD-004, BD-006, BD-007 | CK-008, CK-009, CK-012, CK-013 |
| RQ-007 | T-005 | BD-005 | CK-010, CK-011 |
| RQ-008 | T-006 | BD-006 | CK-012, CK-013 |
| RQ-009 | T-001, T-002, T-003, T-004, T-005, T-006 | BD-001, BD-002, BD-003, BD-004, BD-005, BD-006 | CK-001, CK-003, CK-006, CK-008, CK-010, CK-012, CK-014 |
| RQ-010 | T-006 | BD-006, BD-007 | CK-012, CK-013, CK-014, CK-015 |

## Risks and Rollback

- Risk: Identity-preserving validation intentionally stops Zod from returning stripped or transformed protocol objects; mitigate by reserving the protocol category for identity-bearing values and keeping Options/data as structural Schemas.
- Risk: Removing assertions exposes real `z.input`/`z.output` differences across CLI defaults and optionals; resolve consumers against actual semantics rather than restoring assertions.
- Risk: Updating version-coupled release fixtures can accidentally alter historical negative scenarios; change only values that model the active release contract and retain deliberately mismatched versions in negative tests.
- Rollback: If the approved acceptance boundary becomes impossible, preserve the durable task evidence and use the isolated-worktree controller's exact rollback to baseline `1e1715c97214b506e69346a8406ba34cabaf7d41`; do not alter the source checkout.

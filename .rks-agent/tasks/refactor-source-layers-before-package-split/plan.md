---
kind: rks-plan
spec:
  path: ./spec.md
state: ready
---

# Implementation Plan: Enforce four source layers before package split

## Implementation Approach

Establish the future package graph inside the current single package. The earliest core outcome is relocating extension and persistence contracts into the kernel and removing core's concrete filesystem defaults; concrete implementations can then move without reverse edges. Next relocate optional implementations into extensions and product assembly into cli, preserving behavior through public compatibility barrels. Only after the valid graph exists, enable zero-baseline boundary and cycle enforcement, then validate public consumers and the full repository. This ordering prevents the rules or directory moves from forcing temporary architectural exceptions.

## Owned Boundaries

| ID | Owned path or interface | Change intent | Inputs | Outputs |
|---|---|---|---|---|
| BD-001 | `src/core/**` and core-facing tests | Make core own Agent extension, capability, Store, and MessageSource contracts; remove concrete extension imports and resolve internal type cycles. | Existing core runtime, tool contracts, capability contract, persistence abstractions. | Self-contained core API and behavior-preserving persistence injection/default mechanism. |
| BD-002 | `src/extensions/**`, former `src/tool/**`, `src/context/**`, `src/store/**`, and related tests | Consolidate concrete optional Agent features and adapters under extensions with core-only outward dependencies. | Core contracts and existing implementations. | Extensions public surface containing tools, context, integration, and file-persistence implementations. |
| BD-003 | `src/cli/**`, former `src/assembly/**`, `src/core/session.ts`, and related tests | Make CLI own blueprint composition, defaults, filesystem session product behavior, and concrete engine-extension wiring. | Core, engine, extensions public surfaces and existing CLI behavior. | One product composition layer with unchanged observable CLI assembly and session behavior. |
| BD-004 | Layer public barrels, `src/index.ts`, `package.json` exports, and compatibility consumer tests | Provide stable layer entry points and preserve supported root, engine, and tool imports while adding extensions access. | Reorganized four-layer APIs and current declared exports. | Declared core, engine, extensions, and tool-compatibility public surfaces. |
| BD-005 | `eslint.config.js`, dependency policy configuration, architecture regression fixtures/tests, `package.json`, and lockfile | Mechanically enforce ownership, direction, entry points, external dependency boundaries, and zero cycles through the normal lint gate. | Four-layer dependency matrix and current Node/ESLint toolchain. | Strict actionable architecture checks with demonstrated failure cases and no violation baseline. |
| BD-006 | README/developer documentation and verification evidence | Align documented imports and architecture guidance and prove preserved behavior. | Final public entry points, dependency rules, and repository checks. | Accurate migration guidance and complete acceptance evidence. |

## Ordered Tasks

### T-001: Make core a self-contained runtime contract layer

- Covers: RQ-001, RQ-002, RQ-005
- Boundaries: BD-001
- Inputs: Existing Agent registration, Tool schemas, capability schemas, Store and MessageSource abstractions, persistence defaults, and core tests.
- Outputs: Core-owned contracts, a core-only import graph, and preserved Agent behavior without concrete filesystem dependencies.

#### Steps

1. Add a core public barrel and relocate Tool, ToolProvider, ToolApprover, capability, Store, and MessageSource contracts into cohesive core modules.
2. Update AgentRegistrable, MiniAgent, configuration, events, LLM request types, and consumers to use core-local contracts.
3. Separate concrete filesystem persistence from core construction; provide only the minimum core-owned in-memory behavior or explicit injection necessary to preserve standalone Agent operation.
4. Remove the direct config/types type cycle by assigning each request and message contract a single direction of ownership.
5. Adapt core tests to prove registration, approval, persistence injection/default behavior, and public core exports remain correct.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-001 | `npx vitest run src/core` | Core behavior tests pass after contract relocation and persistence decoupling. |
| CK-002 | `npm run typecheck` | Core and current downstream consumers type-check without reverse contract imports. |
| CK-003 | Non-command: inspect all production imports originating in the core layer. | No core production file imports engine, concrete extensions, CLI, vendor SDKs, or filesystem adapters. |

### T-002: Consolidate concrete optional features under extensions

- Depends on: T-001
- Covers: RQ-001, RQ-003, RQ-005, RQ-008
- Boundaries: BD-002
- Inputs: Core-owned contracts and existing tool, context, persistence, MCP, Skill, Subagent, and helper implementations.
- Outputs: One extensions layer whose concrete features depend only on core and extension-local code.

#### Steps

1. Establish extensions subdomains for tools, context, persistence, MCP, Skill, and Subagent behavior.
2. Move implementation and colocated test files from the former top-level tool, context, and store areas while preserving public symbol behavior.
3. Move feature-local parsing helpers beside their owning extension and replace assembly capability imports with core contracts.
4. Update engine-independent downstream consumers to use extensions public entry points rather than implementation internals.
5. Run extension-focused behavior tests and correct only relocation-induced failures.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-004 | `npx vitest run src/extensions` | All relocated extension behavior tests pass. |
| CK-005 | `npm run typecheck` | Extensions compile with no engine or CLI dependency. |
| CK-006 | Non-command: inspect extensions production imports and public barrels. | Every outward extension dependency targets core, and concrete subdomains have intentional public entry points. |

### T-003: Make CLI the sole composition and product layer

- Depends on: T-002
- Covers: RQ-001, RQ-004, RQ-008, RQ-009
- Boundaries: BD-003
- Inputs: Reorganized core, engine, and extensions layers plus existing assembly, session, and CLI code.
- Outputs: CLI-owned blueprints, built-in selection, session behavior, and concrete wiring with no independent assembly layer.

#### Steps

1. Relocate blueprint schemas, BlueprintManager, built-in registrations, and default blueprint construction into the CLI application layer.
2. Relocate filesystem-backed SessionManager behavior into CLI and update CLI runtime consumers.
3. Change CLI assembly to import only declared core, engine, and extensions entry points at cross-layer boundaries.
4. Preserve headless, interactive, subagent, persistence, approval, context, and engine-selection behavior through existing tests.
5. Remove obsolete top-level architectural directories after every owned implementation and test has a destination.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-007 | `npx vitest run src/cli` | CLI and composition behavior tests pass. |
| CK-008 | `npm run build` | The complete reorganized production source builds successfully. |
| CK-009 | Non-command: inspect concrete engine and extension construction sites. | Only CLI composes concrete engines and extensions; the repository remains one package. |

### T-004: Stabilize public and compatibility entry points

- Depends on: T-003
- Covers: RQ-005, RQ-007, RQ-008, RQ-009
- Boundaries: BD-004
- Inputs: Four-layer source APIs and current declared package exports.
- Outputs: Stable core, engine, extensions, root, and legacy tool public imports with no internal deep-path dependency.

#### Steps

1. Define public barrels for each layer and intentional extensions subdomains without allowing cross-layer consumers to depend on private files.
2. Update the root public API to preserve current supported symbols while sourcing them from their new owners.
3. Add a declared extensions package export and preserve the existing engine and tool export behavior through compatibility forwarding.
4. Add built-consumer tests that resolve and exercise every supported entry point from package output.
5. Update import documentation that currently points at undeclared or obsolete subpaths.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-010 | `npm run build && npm run package:smoke` | Built CLI and declared public entry points remain usable. |
| CK-011 | `npm run package:smoke` | Built package consumers resolve supported engine, extension, root, and legacy tool APIs. |
| CK-012 | Non-command: inspect package exports and public barrels. | Every documented supported import resolves through a declared export without source-internal access. |

### T-005: Enforce the architecture with zero-baseline automated checks

- Depends on: T-004
- Covers: RQ-001, RQ-003, RQ-004, RQ-005, RQ-006
- Boundaries: BD-005
- Inputs: Valid four-layer graph, declared public entry points, current ESLint configuration, and package scripts.
- Outputs: Mandatory layer, entry-point, ownership, external dependency, and cycle checks plus regression evidence.

#### Steps

1. Add an ESLint-compatible boundary policy that classifies the four source layers, rejects unknown production ownership, forbids reverse and sibling-layer imports, and requires cross-layer public entry points.
2. Add whole-graph dependency validation that rejects runtime and type-only cycles and duplicates the critical layer direction rules.
3. Restrict each layer to its intended external dependency classes so core cannot acquire vendor, filesystem-adapter, integration, or UI dependencies.
4. Add representative automated negative cases for reverse, sibling, deep-internal, unknown-layer, and circular imports.
5. Make the normal lint script run both code-quality and architecture checks without violation snapshots or broad disables.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-013 | `npm run lint` | Code-quality and architecture checks pass on the valid repository. |
| CK-014 | `npx vitest run -t "architecture boundary"` | Representative invalid dependency fixtures are rejected for the expected policy reasons. |
| CK-015 | Non-command: inspect policy configuration and source suppressions. | Both value and type edges are governed, every production file is classified, and no persistent baseline or broad inline disable exists. |

### T-006: Complete behavior-preservation and acceptance verification

- Depends on: T-005
- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-005, RQ-006, RQ-007, RQ-008, RQ-009
- Boundaries: BD-001, BD-002, BD-003, BD-004, BD-005, BD-006
- Inputs: Completed four-layer refactor, public compatibility surfaces, policy checks, and updated documentation.
- Outputs: Complete verified result with no task-introduced residue.

#### Steps

1. Update architecture and consumer documentation to describe the four layers, allowed dependency matrix, extensions naming, and supported import paths.
2. Run the repository's mandatory quality gates and package-oriented smoke coverage from a fresh built state.
3. Inspect the complete diff, production dependency graph, package topology, generated output handling, and worktree status for scope drift or residue.
4. Remediate only failures or review findings caused by this task and repeat affected checks.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-016 | `npm run lint && npm run build && npm test` | All repository-mandated checks pass from the completed source state. |
| CK-017 | `npm run package:smoke` | Package consumers and CLI smoke behavior pass. |
| CK-018 | Non-command: inspect the final dependency graph, diff, package manifest, documentation, and Git status. | All nine requirements are satisfied, the repository remains one package, and only intended task files and durable evidence are present. |

## Requirement Coverage

| Requirement | Tasks | Boundaries | Evidence |
|---|---|---|---|
| RQ-001 | T-001, T-002, T-003, T-005, T-006 | BD-001, BD-002, BD-003, BD-005, BD-006 | CK-001, CK-003, CK-004, CK-006, CK-007, CK-009, CK-013, CK-014, CK-015, CK-016, CK-018 |
| RQ-002 | T-001, T-006 | BD-001, BD-006 | CK-001, CK-002, CK-003, CK-016, CK-018 |
| RQ-003 | T-002, T-005, T-006 | BD-002, BD-005, BD-006 | CK-004, CK-005, CK-006, CK-013, CK-014, CK-016, CK-018 |
| RQ-004 | T-003, T-005, T-006 | BD-003, BD-005, BD-006 | CK-007, CK-009, CK-013, CK-014, CK-016, CK-018 |
| RQ-005 | T-001, T-002, T-004, T-005, T-006 | BD-001, BD-002, BD-004, BD-005, BD-006 | CK-002, CK-003, CK-005, CK-006, CK-010, CK-012, CK-013, CK-014, CK-015, CK-016, CK-018 |
| RQ-006 | T-005, T-006 | BD-005, BD-006 | CK-013, CK-014, CK-015, CK-016, CK-018 |
| RQ-007 | T-004, T-006 | BD-004, BD-006 | CK-010, CK-011, CK-012, CK-016, CK-017, CK-018 |
| RQ-008 | T-002, T-003, T-004, T-006 | BD-002, BD-003, BD-004, BD-006 | CK-004, CK-007, CK-008, CK-010, CK-011, CK-016, CK-017, CK-018 |
| RQ-009 | T-003, T-004, T-006 | BD-003, BD-004, BD-006 | CK-008, CK-009, CK-012, CK-016, CK-018 |

## Risks and Rollback

- Risk: Public barrels can introduce static loading or hidden cycles even when direct module imports were acyclic; keep internal same-layer imports local and validate the complete graph including re-exports.
- Risk: Moving filesystem defaults out of core can accidentally change standalone Agent persistence behavior; preserve covered behavior with a core memory default and explicit CLI file-persistence composition.
- Risk: Architecture tooling may classify tests or compatibility entry points incorrectly; use explicit narrow categories for those surfaces rather than disabling rules broadly.
- Rollback: If the approved architecture proves infeasible, preserve durable workflow evidence and use the isolated-worktree controller to restore only this unaccepted attempt to baseline `8370871bb9b1762bacc1e201a8eac44c44201183`.

## Assumptions

- Node 24 in the task workspace supports the selected current architecture-analysis tooling.
- Existing declared root, engine, and tool exports define the compatibility baseline; undeclared deep subpaths do not.

---
kind: rks-spec
contract:
  path: ./TaskContract.md
  revision: 1
state: ready
---

# Specification: Enforce four source layers before package split

## Why and Outcome

MiniAgent needs a source architecture that already behaves like the intended future packages before package manifests are separated. The accepted result is one npm package whose production code has four unambiguous layers, whose dependencies flow only toward the core, whose existing supported consumers continue to work, and whose automated checks reject future boundary or cycle regressions.

## Task Perspective

- Core outcome: Maintainers can treat core, engine, extensions, and cli as independently separable units with a mechanically enforced acyclic dependency graph.
- Necessary support: Agent extension contracts belong to core, concrete adapters and optional features remain outside core, product composition belongs to cli, and supported imports and CLI behavior remain compatible.
- Peripheral assurance: Static architecture diagnostics, public-consumer smoke coverage, build output, tests, and a clean repository state prove and protect the result.

## Scope and Non-Goals

### In Scope

- Four-layer ownership for all production source responsibilities.
- Core ownership of Agent registration and extension contracts.
- Separation of abstract runtime mechanisms from concrete model, feature, persistence, and product implementations.
- Stable public entry points for core, engine, and extensions consumers, including a compatibility path for the former tool entry point.
- Automated enforcement of dependency direction, public boundaries, file ownership, and acyclicity.
- Preservation of current supported library behavior and CLI behavior.

### Non-Goals

- Creating multiple npm packages or workspaces.
- Publishing, changing release versions, pushing, or opening a pull request.
- Adding new Agent capabilities, engines, extensions, or CLI features.
- Correcting unrelated pre-existing defects.

## Constraints

- Core may implement Agent runtime mechanisms and required in-memory behavior, but it must not select or depend on concrete engines, concrete extensions, filesystem adapters, CLI behavior, vendor SDKs, or product defaults.
- Engine and extensions are sibling layers and must not depend on each other.
- CLI is the sole layer permitted to select and compose concrete engines and extensions into the shipped product.
- Architecture enforcement applies equally to runtime and type-only dependencies and cannot rely on a persistent violation baseline or broad suppression.

## Definitions

| Term | Meaning |
|---|---|
| core | The Agent runtime kernel plus stable contracts consumed by engines and extensions. |
| engine | Model-provider adapters that implement core model execution contracts. |
| extensions | Optional concrete Agent capabilities, integrations, context features, and persistence adapters implemented against core contracts. |
| cli | The application and composition layer that selects concrete engines and extensions and exposes command-line behavior. |
| supported public entry point | A package export currently declared for consumers, plus the new extensions-facing entry point established by this change. |

## External Behavior and Data Rules

- Existing supported root, engine, and tool library imports continue to resolve with equivalent exported behavior.
- Consumers have an unambiguous extensions-oriented public entry point and do not need source-internal paths.
- Existing CLI commands, configuration behavior, session behavior, and runtime assembly remain observably equivalent.
- An architecture violation causes the repository's normal lint gate to fail with actionable diagnostics.

## Observable Requirements

| ID | Requirement |
|---|---|
| RQ-001 | Every production source unit has one unambiguous ownership layer among core, engine, extensions, and cli. |
| RQ-002 | Core exposes the Agent extension contracts required to register, supply, approve, execute, contextualize, persist, and observe Agent behavior without depending on concrete extensions. |
| RQ-003 | Concrete model adapters depend only on core contracts and engine-local implementation, while concrete Agent extensions depend only on core contracts and extension-local implementation. |
| RQ-004 | Product defaults and concrete engine-extension composition are owned only by cli. |
| RQ-005 | The complete production dependency graph is acyclic, including type-only edges, and cross-layer consumers use declared public boundaries rather than implementation internals. |
| RQ-006 | Automated repository checks reject forbidden layer directions, unknown source ownership, cross-layer internal access, and dependency cycles as part of the normal lint gate. |
| RQ-007 | Supported library imports remain compatible and an extensions-oriented public entry point is available without requiring source-internal imports. |
| RQ-008 | Existing CLI and Agent behavior remains equivalent for current covered workflows after the architectural reorganization. |
| RQ-009 | The repository remains one npm package and introduces no unrelated product behavior or release mutation. |

## Acceptance Scenarios

| ID | Covers | Given | When | Then |
|---|---|---|---|---|
| AC-001 | RQ-001, RQ-002 | The reorganized production source tree | A maintainer classifies its runtime contracts and concrete implementations | Each unit belongs to exactly one of the four layers and Agent extension contracts are available from core. |
| AC-002 | RQ-003, RQ-004 | Engine, extension, and CLI production code | Their complete dependencies and composition responsibilities are inspected | Engine and extensions are mutually independent siblings over core, and only CLI selects concrete implementations together. |
| AC-003 | RQ-005, RQ-006 | A clean repository and its architecture policy | The normal lint gate analyzes production and test imports | The valid graph passes, while representative reverse, deep-internal, unknown-layer, and circular dependencies are rejected. |
| AC-004 | RQ-007 | A consumer using each supported package entry point | The built package API is resolved and exercised | Existing entry points retain equivalent exports and the extensions entry point resolves through declared package exports. |
| AC-005 | RQ-008 | Existing library and CLI workflows covered by the repository | The reorganized implementation is built and exercised | Their observable results remain equivalent with no architecture-specific behavior regression. |
| AC-006 | RQ-009 | The completed change set | Package topology and product changes are reviewed | The repository is still one package and the diff contains no release or unrelated feature mutation. |

## Success Evidence

| ID | Requirements | Scenarios | Evidence class |
|---|---|---|---|
| EV-001 | RQ-001, RQ-002 | AC-001 | Source ownership inventory, core public API inspection, and static boundary report. |
| EV-002 | RQ-003, RQ-004 | AC-002 | Complete dependency graph and composition-root inspection with no forbidden edges. |
| EV-003 | RQ-005, RQ-006 | AC-003 | Passing architecture gate plus automated policy regression cases that demonstrate representative violations fail. |
| EV-004 | RQ-007 | AC-004 | Built-package consumer smoke evidence for supported and extensions-oriented exports. |
| EV-005 | RQ-008 | AC-005 | Passing behavior-focused automated tests, build validation, and CLI package smoke evidence. |
| EV-006 | RQ-009 | AC-006 | Final package manifest, repository topology, diff, and clean-state inspection. |

## Assumptions

- Necessary pure in-memory defaults are part of the core runtime mechanism; filesystem-backed persistence remains an extension.
- The compatibility promise applies to declared package exports and existing CLI behavior, not undocumented direct imports into source or undeclared package subpaths.

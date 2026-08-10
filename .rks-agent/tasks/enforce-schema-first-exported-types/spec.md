---
kind: rks-spec
contract:
  path: ./TaskContract.md
  revision: 2
state: ready
---

# Specification: Schema-First Exported Types

## Why and Outcome

The repository currently permits project-owned exported TypeScript types to exist independently of runtime schemas, creating drift between public compile-time contracts and validation behavior. After this change, every named type owned and exported by the source tree has a Zod schema as its source, and the ordinary repository lint boundary prevents violations from being introduced again.

## Task Perspective

- Core outcome: Consumers and maintainers can rely on every project-owned exported named type having a corresponding Zod source of truth.
- Necessary support: Existing runtime behavior, supported package entry points, type names, and layering constraints remain compatible while exported enums, interfaces, and handwritten aliases are migrated.
- Peripheral assurance: Automated positive and negative detector coverage plus full repository verification demonstrate and protect the invariant.

## Scope and Non-Goals

### In Scope

- Explicitly exported named type declarations owned by source modules.
- Project-owned types re-exported through source barrels and supported package entry points.
- Runtime schema exports needed to serve as the source of migrated types.
- Automatic rejection of future non-schema exported type declarations.

### Non-Goals

- Schema derivation for non-exported implementation-only types.
- Prohibiting imported external SDK types inside implementation details.
- Unrelated feature redesign, package publication, or repository integration.

## Constraints

- Strict TypeScript ESM compatibility, public entry-point coverage, and the established layer dependency direction remain intact.
- A migrated runtime value previously exposed alongside a type, including enum-style member access, remains observably compatible unless impossible under Zod derivation.
- Schema-backed protocol or function-bearing types may use Zod custom/function validation where structural runtime validation is not meaningful, but their exported named type must still be inferred from that schema.

## Definitions

| Term | Meaning |
|---|---|
| Project-owned exported named type | A named type declaration exported from a source module, or a named type whose declaration is in the source tree and is surfaced by a source barrel. |
| Schema-derived type | A type alias whose declared type is produced through Zod `infer`, `input`, or `output` from a schema value or schema-factory result. |
| External type | A type declared by a dependency or platform library; importing or referencing it does not make its declaration project-owned. |

## External Behavior and Data Rules

- Supported package entry points continue to expose their existing project-owned public type names unless a name was demonstrably internal despite being exported.
- Each migrated exported type has an exported or publicly reachable corresponding Schema where the type is part of the supported package API.
- Exported enum declarations are replaced by schema-backed types while preserving their existing runtime string values and member-style access.

## Observable Requirements

| ID | Requirement |
|---|---|
| RQ-001 | The source tree contains no project-owned exported interface declaration. |
| RQ-002 | The source tree contains no project-owned exported enum declaration. |
| RQ-003 | Every project-owned exported named type declaration is schema-derived. |
| RQ-004 | Existing supported package entry points retain compatible project-owned public type names, runtime behavior, and schema access. |
| RQ-005 | The repository's standard lint boundary rejects exported interfaces, exported enums, and exported handwritten type aliases while accepting compliant schema-derived exports and re-exports. |
| RQ-006 | Existing functional behavior remains unchanged outside the schema-first public-type contract. |

## Acceptance Scenarios

| ID | Covers | Given | When | Then |
|---|---|---|---|---|
| AC-001 | RQ-001, RQ-002, RQ-003 | The complete source tree after migration | Its exported named declarations are analyzed | No exported interface or enum is present and every exported type alias is schema-derived. |
| AC-002 | RQ-004, RQ-006 | Existing public consumers and repository tests | The project is built and exercised | Supported imports, enum-style runtime values, and functional behavior remain compatible. |
| AC-003 | RQ-005 | A source fixture containing an exported interface, enum, or handwritten alias | The policy detector analyzes it | The detector fails with an actionable file and declaration diagnostic. |
| AC-004 | RQ-005 | A source fixture containing schema-derived aliases and compliant re-exports | The policy detector analyzes it | The detector succeeds without false positives. |
| AC-005 | RQ-005 | The migrated repository | The standard lint boundary runs | The schema-first policy is included and succeeds. |

## Success Evidence

| ID | Requirements | Scenarios | Evidence class |
|---|---|---|---|
| EV-001 | RQ-001, RQ-002, RQ-003 | AC-001 | Complete source-aware detector report for the source tree. |
| EV-002 | RQ-004, RQ-006 | AC-002 | Passing compile, package-facing, and functional regression suites. |
| EV-003 | RQ-005 | AC-003, AC-004 | Automated detector tests containing both rejection and acceptance cases. |
| EV-004 | RQ-005 | AC-005 | Passing standard lint result showing policy integration. |

## Assumptions

- Type-only re-exports of compliant project-owned types are accepted because their defining declaration remains schema-derived.
- Pure external dependency type declarations are outside the ownership boundary, but locally exported wrappers or aliases around them are project-owned and must be schema-derived.

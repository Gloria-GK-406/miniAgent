---
kind: rks-spec
contract:
  path: ./TaskContract.md
  revision: 1
state: ready
---

# Specification: Executable Schema contracts

## Why and Outcome

MiniAgent currently presents public Zod Schemas as the source of truth while several exported Schemas either accept arbitrary input, describe a handwritten type that Zod did not infer, or clone identity-bearing service instances into unusable plain objects. The corrected system must make a public Schema's runtime behavior, inferred type, and documented category agree, and it must apply declared Tool parameter validation before untrusted model arguments reach approval or execution.

## Task Perspective

- Core outcome: Consumers can rely on every supported public Schema to validate the contract its inferred type advertises, while identity-bearing protocol instances remain usable after parsing.
- Necessary support: Schema categories have consistent rules; CLI and core exports follow them; Tool arguments are parsed before use; legitimate generic, function, and opaque contracts remain expressible.
- Peripheral assurance: Static policy checks, runtime matrices, package-consumer checks, release verification, and documentation prevent a syntactically compliant but operationally false schema-first implementation from returning.

## Scope and Non-Goals

### In Scope

- Public data, protocol, function, generic, and opaque-object Schema behavior across core, engines, extensions, and CLI.
- Runtime validation and identity behavior exposed by public Schemas.
- Tool parameter validation before approval and execution.
- Static policy, package-consumer, documentation, and release metadata behavior related to Schema contracts.

### Non-Goals

- Agent running-state, model-switch, after-turn, or event atomicity changes.
- Registration trust levels or privileged capability authorization.
- New Agent features, provider behavior, dependency upgrades, publication, or remote repository operations.

## Constraints

- Public structural types remain derived from their corresponding Zod Schemas.
- Valid protocol parsing returns the exact input object, not a clone or projection.
- Invalid Tool parameters never reach an approver or Tool implementation.
- The same successfully parsed Tool parameter value is supplied to approval and execution.
- Existing valid public inputs remain accepted unless their acceptance depended on a Schema that did not actually validate its advertised contract.

## Definitions

| Term | Meaning |
|---|---|
| Data Schema | A Schema whose complete value structure and transformations are expressed by Zod data combinators and whose output type is inferred from that expression. |
| Protocol Schema | A structural runtime contract for an identity-bearing service, callback-bearing component, or stateful object that validates required members while returning the original object. |
| Opaque-object Schema | A contract for a value whose internals are outside MiniAgent's structural data model and which is accepted only by a real runtime predicate or class-instance check. |
| Function Schema | A contract that rejects non-functions and preserves the original callable value. |

## External Behavior and Data Rules

- Data Schemas reject values that do not satisfy their declared fields, variants, and nested contracts.
- Protocol Schemas reject primitives, `null`, empty objects missing required members, and objects with incorrectly typed required members.
- Protocol and function Schemas preserve reference identity for valid values.
- Opaque-object Schemas do not accept a value solely because it satisfies a TypeScript generic argument.
- Defaulting, coercion, transformation, and stripping performed by a Tool parameter Schema are reflected identically in approval and execution inputs.
- The next release metadata communicates the externally observable pre-1.0 Schema behavior change as version 0.10.0.

## Observable Requirements

| ID | Requirement |
|---|---|
| RQ-001 | Project-facing Schema guidance distinguishes Data, Protocol, Opaque-object, and Function Schemas using the definitions and runtime rules in this specification. |
| RQ-002 | Every supported public Data Schema validates its advertised structure without relying on a handwritten structural type assertion to redefine the inferred result. |
| RQ-003 | Every supported public Protocol Schema validates required structural members, rejects incomplete or incorrectly typed candidates, and returns the exact valid input object. |
| RQ-004 | Every supported public Opaque-object and Function Schema applies a real runtime check and preserves each valid value's identity. |
| RQ-005 | Public CLI Schemas reject representative invalid primitive, null, and incomplete-object inputs according to their declared category while continuing to accept valid values. |
| RQ-006 | The Schema policy rejects exported types backed by asserted incompatible Schemas, predicate-free structural custom Schemas, and predicate-free service Schemas, while permitting legitimate Schema factories and real opaque predicates. |
| RQ-007 | A Tool call is resolved and its arguments are parsed by the Tool's declared parameter Schema before approval or execution; validation failures invoke neither, and successful parsing supplies one equivalent parsed result to both. |
| RQ-008 | Supported public package entry points expose usable runtime Schemas and inferred types to an external npm-style consumer, including Tool parameter conversion to JSON Schema. |
| RQ-009 | Runtime contract coverage represents Data, Protocol, Opaque-object, Function, generic service, and Tool parameter behavior, including invalid values and identity-sensitive cases. |
| RQ-010 | Schema documentation, dependency descriptions, release checks, and package version metadata accurately describe and enforce the corrected 0.10.0 behavior. |

## Acceptance Scenarios

| ID | Covers | Given | When | Then |
|---|---|---|---|---|
| AC-001 | RQ-001 | A contributor consults the project Schema guidance | They classify a plain record, a stateful service, an external class instance, and a callback | Each example has one unambiguous category and the stated validation and identity behavior matches runtime policy. |
| AC-002 | RQ-002 | A public Data Schema advertises required, optional, nested, union, or transformed fields | Valid and invalid representative values are parsed | Valid values produce the inferred Zod output and wrong structures are rejected without a handwritten exported structural override. |
| AC-003 | RQ-003 | A class-backed Store or request manager and incomplete protocol candidates are available | They are parsed by their public Protocol Schemas | Valid instances compare strictly equal to the parsed result and retain working methods; incomplete candidates fail. |
| AC-004 | RQ-004 | Valid functions and opaque instances plus unrelated values are available | Their Schemas parse the values | Only values satisfying real runtime checks pass, and each passing result is strictly identical to its input. |
| AC-005 | RQ-005 | Representative CLI data, option, service, Props, and runtime contracts are available | `42`, `null`, `{}`, valid data, and valid service objects are parsed as applicable | Invalid values fail according to category, valid values pass, and valid services retain identity. |
| AC-006 | RQ-006 | Source fixtures contain each prohibited fake-schema pattern and each allowed factory or real-predicate pattern | The repository Schema policy analyzes them | Every prohibited fixture fails with an actionable diagnostic and every legitimate fixture passes. |
| AC-007 | RQ-007 | A Tool parameter contract rejects one call and transforms or defaults another call | The Agent handles both calls | The invalid call reaches neither approval nor execution; the valid call reaches both with the parsed output and executes once. |
| AC-008 | RQ-008 | A consumer uses built package artifacts rather than repository source | It imports representative public Schemas and converts a Tool parameter Schema to JSON Schema | Imports, type use, runtime parsing, and parameter conversion succeed through supported package entry points. |
| AC-009 | RQ-009 | The unified contract suite exercises all declared Schema categories and generic boundaries | The suite runs | Each category has positive, negative, and identity evidence appropriate to its contract. |
| AC-010 | RQ-010 | The repository is prepared as a release candidate | Documentation, version metadata, package checks, and release verification are inspected | They consistently describe version 0.10.0 and enforce the corrected Schema contract without claiming an unused direct dependency. |

## Success Evidence

| ID | Requirements | Scenarios | Evidence class |
|---|---|---|---|
| EV-001 | RQ-001 | AC-001 | Published repository guidance reviewed against representative runtime contracts. |
| EV-002 | RQ-002 | AC-002 | Static source-policy evidence plus positive and negative Data Schema runtime tests. |
| EV-003 | RQ-003 | AC-003 | Protocol identity, missing-member rejection, and post-parse method-call regression tests. |
| EV-004 | RQ-004 | AC-004 | Function and opaque-object predicate and identity tests. |
| EV-005 | RQ-005 | AC-005 | CLI runtime Schema matrix covering invalid and valid category representatives. |
| EV-006 | RQ-006 | AC-006 | Static detector fixture results for every prohibited and permitted pattern. |
| EV-007 | RQ-007 | AC-007 | Agent Tool-call ordering, rejection, transformation, approval, and execution regression tests. |
| EV-008 | RQ-008 | AC-008 | Built-package external consumer compilation and runtime smoke evidence. |
| EV-009 | RQ-009 | AC-009 | Complete unified Schema contract suite results. |
| EV-010 | RQ-010 | AC-010 | Documentation, version, lint, build, test, package, and release-verification evidence. |

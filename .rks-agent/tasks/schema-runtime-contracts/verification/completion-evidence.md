---
kind: rks-verification
decision: pass
---

# Completion Evidence: Executable Schema contracts

## Claim

The complete change from baseline `1e1715c97214b506e69346a8406ba34cabaf7d41` makes MiniAgent's public Schemas executable runtime contracts within the authorized Schema-only boundary and is ready for a local result commit.

## Condition-to-evidence mapping

| Condition | Fresh evidence |
|---|---|
| SC-1 | `docs/architecture/schema-contracts.md` defines Data, Protocol, Opaque-object, and Function categories; manual comparison confirmed the names and rules agree with the shared factories and runtime tests. |
| SC-2 | `npm run test:schema` passed 4 files / 36 tests, including Store and LLM request identity, missing-member rejection, and post-parse method calls. |
| SC-3 | The exact CLI scan for `as z.ZodType` returned zero; predicate-free custom scan returned zero; `npm run lint:schema` passed. |
| SC-4 | The 36-test Schema suite covers primitive, null, empty-object, function, service, Props, Tool, and identity-sensitive cases. |
| SC-5 | Agent regressions prove invalid arguments reach neither approval nor execution, transformed/defaulted output is shared by identity, missing Tools skip approval, and pre-turn Tools remain non-executable. |
| SC-6 | `npm run package:smoke` compiled and ran the aggregate consumer; installed-candidate `release:verify` compiled and ran Store/Tool/JSON-Schema assertions against the split `@piaoxianguo/miniagent-core` tarball. |
| SC-7 | `node --test scripts/check-schema-exports.test.mjs` passed 12/12, including incompatible assertions, angle-bracket assertions, named/aliased Zod bindings, predicate-free custom Schemas, and allowed predicates/factories. |
| SC-8 | `npm run lint`, `npm run build`, and `npm test` passed (142 files / 1121 tests); pinned Node 22.22.0/npm 10.9.4 release tests passed 14/14; deterministic build and verification passed for candidate `sha256:ab2fa77a8dac4f371e221de6cb05cef8e87d663519686693bdd1dc3a8c7e54a3`. |

## Review gate

Independent change re-review is `approved` in `../reviews/change-review.md`; all three initial blocking findings were independently confirmed closed.


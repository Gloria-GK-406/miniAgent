---
kind: rks-verification
decision: pass
---

# Completion Verification: Schema-First Exported Types

## Exact Claim

The complete current change satisfies TaskContract revision 2: every project-owned named type exported from `src` is derived from a genuine Zod schema, the standard lint pipeline rejects future violations including fake Zod operands and declaration-file exports, supported package behavior remains compatible, and the migration has no demonstrated functional regression.

## Condition-to-Evidence Mapping

| Condition | Fresh evidence |
|---|---|
| SC-1 | `node scripts/check-schema-exports.mjs src` passed; direct inventory found `0` exported interface or enum declarations. |
| SC-2 | The semantic detector passed over all of `src`; it uses the TypeScript checker to require the inferred operand's Zod `_zod` brand and covers schema-factory result types. |
| SC-3 | `npm run build` and `npm run package:smoke` passed; the independent change review approved public compatibility after prior comparison found no removed public symbols or type/value-kind changes. |
| SC-4 | `node --test scripts/check-schema-exports.test.mjs` passed 7/7 cases, rejecting direct and later exports, namespace exports, lookalikes, non-schema operands, and `.d.ts` violations while accepting genuine schema-derived aliases and re-exports. |
| SC-5 | `npm run lint` passed and included `lint:schema`; dependency architecture also passed. |
| SC-6 | `npm test` passed 141 files and 1105 tests; the schema runtime suite passed representative rejection checks; `git diff --check` passed. |

## Review Gate

- Independent complete-change review: `approved`.
- The review's detector, schema-washing, and Node-platform findings were remediated and independently re-reviewed before this verification.

## Repository State

- Baseline: `dd9c1091f83d726f75abd5a0778710f27697741e`.
- Branch: `codex/enforce-schema-first-exported-types`.
- Current product/test/config change set: 108 paths before adding durable task artifacts.
- Verification found no skipped or unavailable required condition.

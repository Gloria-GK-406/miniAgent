---
kind: rks-review
verdict: approved
---

# Change Review

## Reviewed Change

- Scope: complete change from baseline `dd9c109` to the current worktree (105 changed paths), checked against TaskContract revision 2, the approved specification, and the approved plan.
- The prior Node-platform blocker is resolved by the single structural `NodePlatformSchema` in `src/cli/config.ts`; `LoadConfigOptionsSchema`, `CLIAboutInfoSchema`, and `ResolveEditorInvocationOptionsSchema` all consume it.
- Fresh runtime evidence accepts `"linux"` and rejects both `42` and the unknown platform `"plan9"` in all three consumers. The change's regression test covers the same representative valid/number/unknown cases through `LoadConfigOptionsSchema`.
- The prior detector bypasses remain resolved: the detector validates the operand's Zod brand through the TypeScript checker, includes declaration files, and its negative lookalike/non-schema-operand/`.d.ts` fixtures pass. The previously washed `CLIEntryActionSchema`, `AgentUseFactoryResultSchema`, and `CLIStateSchema` retain structural rejection coverage.
- A fresh inventory of all remaining `z.custom` uses found no additional practical-data-only schema violation: the retained customs are function/callback-bearing protocols, service or class instances, dependency-injection surfaces, or opaque external runtime values. Structurally meaningful data schemas remain expressed with Zod objects, enums, unions, and intersections.

## Fresh Evidence

- `node --test scripts/check-schema-exports.test.mjs`: 7/7 passed.
- `node scripts/check-schema-exports.mjs src`: passed.
- `npx vitest run src/cli/schema-first-runtime.test.ts`: 4/4 passed.
- Direct three-consumer Node-platform probe: valid platform accepted; number and unknown platform rejected by every consumer.
- `npm run lint`: passed, including dependency and schema-export checks.
- `npm run build`: passed.
- `npm test`: 141 files and 1105 tests passed.
- `git diff --check dd9c109 --`: passed.

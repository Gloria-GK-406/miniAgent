---
kind: rks-review
verdict: approved
---

# Change Re-review: Executable Schema contracts

The complete working-tree change against baseline `1e1715c97214b506e69346a8406ba34cabaf7d41` is approved for the configured change-review gate. All three previously blocking findings are resolved:

- The installed release-candidate consumer now compiles and runs representative `@piaoxianguo/miniagent-core` Schema behavior, including Store identity and invalid-input rejection, Tool identity, and Tool parameter JSON Schema conversion (`scripts/verify-release-packages.mjs:322-375`).
- The Schema detector recognizes named `custom` imports, named/aliased `ZodType` imports, and both `as` and angle-bracket assertion forms (`scripts/check-schema-exports.mjs:44-80,146-165,222-250`), with negative regression fixtures (`scripts/check-schema-exports.test.mjs:143-186`). Independent adversarial probes now report diagnostics for both original bypasses.
- Tool resolution is again restricted to `turnToolMap` before validation, approval, and execution (`src/core/agent.ts:540-577`). A regression proves a registered Tool cannot execute before selection into the current turn map (`src/core/agent.test.ts:491-515`), while the built-in approval test primes the map through a real run (`src/cli/assembly/builtins.test.ts:196-220`).

Fresh reviewer evidence passed: focused Tool/built-in tests (18/18), detector fixtures (12/12), TypeScript build, Schema policy and contract suite (36/36), deterministic three-package release build, and installed-candidate release verification under Node 22.22.0/npm 10.9.4.

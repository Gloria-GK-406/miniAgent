---
kind: rks-spec-result
outcome: completed
terminal_stage: verification
---

# Spec Result: Isolated one-shot LLM calls with shared token accounting

## Delivered

- Registered components receive a fresh, credential-opaque, tool-free `OneShotLLM` through a factory contract; each caller captures current Agent settings and accepts one invocation.
- Context compression now uses the one-shot capability and no longer receives raw LLM/runtime configuration.
- Token reporting, reading, and resetting are separate interfaces combined by `TokenUsageService`; `MiniAgent` holds that aggregate interface while one-shot callers consume only the reporter capability.
- Supported provider streams preserve authoritative token usage, and the shared collector reports it exactly once only after normal terminal completion and valid response assembly.
- Main Agent turns and internal one-shot calls share accounting, while missing usage, interruption, and malformed terminal responses do not create usage reports.

## Success Evidence

| Condition | Evidence |
|---|---|
| SC-1 | One-shot and Agent tests cover injection, captured settings, empty tools, streaming, abort, and second-use rejection. |
| SC-2 | Compressor tests cover current settings, generated summaries, missing dependency no-op, and failure fallback. |
| SC-3 | Usage-service tests cover interface narrowing, aggregation, defensive reads, normalization, and reset. |
| SC-4 | Collector, Agent, one-shot, and provider stream tests cover non-zero shared totals, exact-once reporting, absent usage, interruption windows, and response-validation failure. |
| SC-5 | Root export tests cover new contracts and absence of retired runtime/config injection schemas. |
| SC-6 | Independent review approved; fresh lint, build, 137-file/1086-test suite, and diff checks passed. |

## Repository Result

- Changed paths: Core stream types/collection, supported provider stream adapters, token usage and one-shot modules, Agent registration/accounting, context compression, root exports, API documentation, and focused tests; colocated SDD artifacts record the contract, Spec, Plan, review, and verification.
- Baseline or accepted result: Verified completion candidate based on `711e0fd6380386cb2ec1e6aa3bcb48af593146f3`, sealed by the containing accepted-result commit.
- Parent rollback required: no

## Artifacts

- `TaskContract.md`
- `spec.md`
- `plan.md`
- `reviews/change-review.md`
- `verification/completion-evidence.md`

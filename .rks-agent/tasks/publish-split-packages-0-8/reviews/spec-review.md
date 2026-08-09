---
kind: rks-review
verdict: approved
---

# Spec Review: Publish split MiniAgent 0.8 packages

## Review Target

- Reviewer role: third fresh independent governed Spec reviewer
- Review skill: `reviewing-specs`
- TaskContract: revision 1, SHA-256 `63e182e672ef81360cd939befa4247ad92af291fe9378547ad8d442472d947a6`
- Reviewed Spec: ready, SHA-256 `048fc512a081dd310e5dcf028854b9b5bcc36fa0b4d20c1158079eab494390d9`
- Immutable challenge set: SHA-256 `3fbde1f536dd42bb62e772e4a0bd7754a95f38a2d6b3e7877535961133610354`; its recorded pre-remediation Spec target was `ce23a3ce15b897b19c98fc80ea4a2dfca0f8a4398ca960f1b4b33512023159b6`

## Verdict

Approved. The revised Spec covers the TaskContract's goal, in-scope outcomes, constraints, success conditions, and required evidence. All three high-risk challenges have proportionate, observable remediations, with requirement-to-scenario-to-evidence mappings. No unresolved blocking nonconformance or direct remediation regression was observed.

## Challenge Dispositions

### CH-1 — confirmed, resolved

The original omission could have allowed an immutable but unstable or peer-invalid dependency graph. The revised package contracts now bind every external runtime dependency to a source-grounded range, state how relevant Zod peers are satisfied, and require a peer-valid clean installation with one compatible Zod resolution. RQ-016, AC-001/AC-008, and EV-001/EV-006 make the correction observable without prescribing an unrelated implementation mechanism.

### CH-2 — confirmed, resolved

The original evidence-to-mutation identity gap could have allowed CI to publish artifacts different from those accepted before the irreversible boundary. The revised frozen-candidate constraint and RQ-017 require publication of the accepted candidate or complete re-acceptance of the exact unchanged candidate. AC-012 and EV-010 cover regeneration, transfer, perturbation, identity tracing, and rejection of unaccepted differences. This is the minimum sufficient behavioral binding for the demonstrated risk.

### CH-3 — confirmed, resolved

Version-only skip behavior could have mixed artifacts from different revisions during overlapping or partial releases. The revised Spec requires serialized Registry mutations and same-candidate continuity for partial retries in RQ-018, while AC-006/AC-013 and EV-011 cover interleaving and later-candidate rejection. The remedy preserves retry-safe per-package skipping while preventing a mixed immutable release set.

## Applied Rules

- Coverage: each TaskContract success condition is represented by observable requirements and mapped acceptance evidence, including package contracts, dependency direction, publication gating/order/retry behavior, pre- and post-publication consumer checks, root/CLI exclusion, documentation, and credential confinement.
- WHAT/HOW boundary: dependency metadata, export surfaces, archive boundaries, candidate identity, serialization, and retry continuity are authorized observable release properties at the npm mutation boundary; the Spec does not force a particular script layout, persistence design, CI artifact transport, hash algorithm, or test implementation.
- Proportionality: CH-1 constrains immutable consumer metadata, CH-2 binds proof to the mutation target, and CH-3 prevents ordinary-run interleaving and mixed candidates. Each correction directly addresses an irreversible high-consequence path and adds no broader release scope.
- Remediation regression check: the new peer, frozen-candidate, and serialization rules remain consistent with the TaskContract's three-package boundary, CI-only credential rule, core-first order, safe partial retries, and 0.8.0-only scope.

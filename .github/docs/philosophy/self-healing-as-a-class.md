# Self-Healing as a Class

> **Core Principle #9**: A remediation that only fixes the instance in front of you is incomplete.

---

## The Philosophy

**Principle**: An unaddressed manual intervention anywhere in the delivery pipeline is a defect — on the same footing as a functional bug, not routine overhead to be absorbed.

**Why it matters**:

- A stalled build, a repeatedly hand-fixed deploy step, a flaky test someone quietly re-runs, a review comment shaped just like last month's — each of these is an acceptance test-case of process debt, not a one-off inconvenience.
- The gap that let the same class of problem recur more than once is not the instance you just fixed — it's the missing capability (a check, a guard, a template, a piece of automation) that would have caught it automatically the first time.
- A fix without a captured lesson is a one-off patch, not a closed loop. It will recur, and someone will pay the cost of re-diagnosing it from scratch.

**Reality Check**: if the same kind of problem needs a human to notice and hand-fix it twice, the second occurrence is evidence the first fix was incomplete.

---

## The Loop

Every incident — at whatever scale fits the finding — follows the same four stages:

### Detect

Notice the divergence between what should be true and what is true.

- Prefer a check that would catch **shapes not yet seen** — a general invariant, a reconciliation, a review gate — over a narrow signature that only matches the exact failure just observed.
- There will always be an "(n+1)": a failure shape nobody has hit yet. A finite catalogue of pre-coded detectors only ever covers the past.

### Diagnose

Find the root cause, not the first plausible explanation.

- Escalate to whoever holds deeper context — a lead, an on-call, a specialist — when the fix isn't obvious at the layer where the symptom appeared.
- A plausible-sounding cause stated with confidence is not the same as a verified one. Check the actual failing command or state directly before asserting why something failed.

### Remediate

Fix the instance in front of you, at the layer where it actually lives.

- A patch that only silences this occurrence — a retry, a longer timeout, a manual unstick — is incomplete on its own. It buys time; it doesn't close the loop.

### Learn

Capture the fix as a durable, reusable capability.

- A lint rule, a CI check, a test, a template fix, or a revision to a guide — whichever layer would have caught it automatically next time.
- **A remediation without a captured lesson is a one-off patch, not a closed loop.**

---

## Ownership

Every project should name who is Responsible and who is Accountable for each stage of this loop — they may be the same person on a small team. A class of failure needs an owner beyond "whoever noticed it this time."

A failure at any stage that silently requires a human to bridge it, cycle after cycle, is itself a work item under this principle — not a fact of life to route around.

---

## Applying It

Before closing any finding, ask explicitly: **could this recur in a different shape?**

If so, the fix is incomplete until it's paired with the durable capability that catches the whole class — not just a regression test for this one instance, but the check, guide update, or automation that would have stopped the first occurrence too.

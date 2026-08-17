---
title: 'Eval Group teardown checkpoint receives an exhausted 1ms deadline'
severity: 'major'
target: 'niceeval'
---

A completed Mempal Eval Group tried to persist its checkpoint during teardown, but NiceEval passed only 1ms to the sandbox command. The run printed mempal-checkpoint-save-failed: Command timed out after 1ms after all 36 attempts had settled. Teardown hooks that preserve cross-attempt state need a dedicated cleanup deadline or a reserved grace period; inheriting the exhausted attempt deadline makes persistence nondeterministically impossible. Reproduced in run c17a52e1-10da-436c-8456-92d01643c231.

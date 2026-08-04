# How Joe is audited

The old method was **follow the log**: wait for something to fail, read the
stack trace, chase it. It works for anything that crashes and is blind to
everything that doesn't — which is most of a user interface. A panel showing
the wrong conversation's build prints no error. A button with no handler
prints no error. A success message for work that was never done prints no
error, by definition.

The user found the session-leak defect himself and said so plainly. He was
right, and this file exists because of that.

## The method: sweep an invariant, not a symptom

State a property that must hold **everywhere**, then check **every place it
could be broken** — mechanically, not by reading. The output of a sweep is a
list of call sites, each either satisfying the invariant or named as a
deliberate exception **with its reason written down**. "It was already like
that" is not a reason.

Every sweep that finds something becomes a test, so the rule outlives whoever
remembers it. A sweep that lives only in a chat message has already been
forgotten.

## The invariants, and where each is enforced

| # | Invariant | Enforced by |
|---|-----------|-------------|
| 1 | **Session scope** — anything that displays a run belongs to the run's session: it filters incoming events by the session on screen and clears (or archives) when that session changes. | `api/src/__tests__/session-scope.test.ts` (enumerates every `SocketService.subscribe` consumer), live: `verify_session_panels.ts` |
| 2 | **Reachability** — every name the system can utter reaches something real; nothing is written and then abandoned. | `wiring-policy.test.ts` |
| 3 | **Ownership** — every terminal, event and artefact has an owner, and one user's run never lands in another user's UI. | `wiring-policy.test.ts`, `verify_event_ownership.ts` |
| 4 | **Honesty** — no success is reported for work that was not verified; what was asked for and not built is listed by name; a capability the code lacks is never claimed. | `wiring-policy.test.ts` (`what was not built is said out loud`), `verify_honest_results.ts`, `verify_publish_honesty.ts` |
| 5 | **Live controls** — every rendered control does something, or is disabled with a stated reason. | sweep below; `app-audit.ts` runs the same check against every page Joe builds |
| 6 | **Cleanup** — every subscription, interval, watch and process is released. | sweep below |

## Running a sweep

The sweeps are ordinary code, kept short enough to write on the spot:

```bash
# 1. session scope — the enforced version
cd api && npx jest src/__tests__/session-scope.test.ts

# 5. dead controls — a rendered button with no handler
cd web/src && python3 - <<'PY'
import re, os
for root,_,files in os.walk('.'):
    for f in files:
        if not f.endswith('.tsx'): continue
        p = os.path.join(root, f); src = open(p, encoding='utf-8').read()
        for m in re.finditer(r'<button\b((?:[^>]|\n){0,400}?)>', src):
            a = m.group(1)
            if not any(k in a for k in ('onClick', 'onMouseDown', 'type="submit"', 'disabled')):
                print(f"{p}:{src[:m.start()].count(chr(10))+1}")
PY

# 6. leaked timers — setInterval without a matching clearInterval
cd web/src && for f in $(grep -rl "setInterval" --include=*.tsx .); do
  echo "$f set=$(grep -c setInterval $f) clear=$(grep -c clearInterval $f)"; done
```

## What the first run of invariant 1 found

Three defects, none of them reported by anyone:

- `TodosPanel` accepted a `sessionId` prop and never once looked at it — every
  agent task list from any run was merged in, and nothing cleared on a switch.
- `TaskTracker` took no session at all: one conversation's progress ring was
  drawn over whichever chat happened to be open.
- `CommandComposer` kept the **attachment** and the half-typed line across a
  session switch — a photo attached in one chat rode into the next and would
  have been sent with a message that had nothing to do with it.

And invariant 5 found an "Analyze Hash" button on the Sentinel security screen
with no handler at all, promising per-file integrity checking the server never
implemented. It is now the verification the server really performs, under its
true name.

## The rule for a fix

A fix is finished when: the defect is measured, the fix is proven **live**
(a real browser or a real process — not a mock), the proof is shown to FAIL
against the previous code, and the invariant is left behind as a test.

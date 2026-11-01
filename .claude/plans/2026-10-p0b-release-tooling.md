# P0b: release tooling

Child plan of `.claude/plans/audit-remediation-2026-10/glowing-dazzling-brooks.md` (step 0.5b; contracts C1 deploy identity and C2; C7's heavy-build lock moves to relay HEAVY, below). Order: `beta-resequence.md`, wave G0; build after P0, release after P0. **Tier: Standard**, correcting the program's "Simple" (see Dependency Graph). Final revision, 2026-11-01, against `bdf0d2b`, after three critic rounds (`-critic-r1.md`, `-critic-r2.md`, `-critic.md`). Lee ruled no fourth critic.

## Intent (grilled)

From the program plan's ruling table; the full table is there. The two rows P0b serves:

| # | Ruling | Audit option taken |
|---|---|---|
| — | Deploys go **per relay**, each followed by live production guards | — |
| — | The map lane and the story lane run as **two parallel worktree sessions** | — |

> Skip line: no separate `/grill` for the program. The audit synthesis, its eight structured decisions and Lee's answers above serve as the grill. **The calculator phase runs a real `/grill`** before its plan is written (step K.2), because its intent is not yet written down.

**Binding correction.** C2 and step 0.5 say "Lee pushes". DECISIONS, Deploy entry, amended by Lee 2026-10-05, supersedes that: "the session pushes a release to main after Lee's yes in conversation, with green checks and a named rollback; Lee no longer pushes from his terminal." So `check-push` is run by the session immediately before its own push, and again by a pre-push hook on the push itself. **Lee, 2026-11-01: hook on.** On this repo, `/save` and terminal pushes to `main` refuse without passing the check. That moves past C2's "nothing technically stops a direct push", by his ruling. **Enforcement remains cooperative:** `--no-verify`, a GitHub web merge, a push from another machine or an unset `core.hooksPath` all get past it. A bypass is detected afterwards, when reconciliation finds a published deploy the ledger never recorded, and that halts scheduling. Rollback is not amended: "a session never rolls back production on its own" stands.

**Second C2 wording change, noted beside it in P0b-4.** C2 says "the candidate SHA equals the local `main` head". Here it means the SHA actually being pushed. Local `refs/heads/main` is checked out in Lee's primary and shared by every worktree, so moving it before the lease lets two lanes collide on it. Releases do not touch it.

**Lee, 2026-11-01: the full release tool, trimmed, with the push hook, and no fourth critic.** `heavy-run` leaves this relay; `halt --lee` and `verify` are gone.

**Carried acceptance conditions (critic r7, r8):** atomic reclaim; crash-safe tokens; halted state in `check-push`; a shared primitive (`dir-mutex`, which HEAVY reuses). PID-reuse, parent-killed and pre-launch classification go to HEAVY.

**Out of scope, indexed in the Parking Lot by P0b-4:** relay HEAVY (below); recording build peak memory (C7, build relays); the live guards themselves (M1a); C1 asset versioning; retargeting the two `audit:live` tests (M1a batch 0, routed below); a server-side gate by locking Netlify auto-publish (needs Lee to amend "Deploy is git-triggered"; the escalation if the hook proves insufficient); a `netlify.toml` `ignore` for docs-only commits (if the docs route below proves too heavy; 8 of the last 19 production deploys were docs); teaching `/save` the release path (a marvin change).

## Facts checked against the tree (2026-11-01)

| Fact | Evidence | Consequence |
|---|---|---|
| Next is 16.4.2, `output: "export"` | `package.json`, `next.config.ts` | Server components run during `next build`, so a non-`NEXT_PUBLIC_` env var read in the root layout lands in the HTML and stays out of the client bundle (`docs/01-app/02-guides/static-exports.md`, `.../environment-variables.md`) |
| Custom meta is `metadata.other` | `docs/01-app/03-api-reference/04-functions/generate-metadata.md`, `### other` | No `<head>` edit; the static `metadata` export is at `src/app/layout.tsx:20` |
| `src/app/map/layout.tsx` and `src/app/privacy/page.tsx` export their own `metadata`; nothing in `src/app` sets `other` | grep | Inheritance is proved on built HTML, not assumed |
| The tag is absent from production | fetched `https://opencanopy.ca/` | Natural negative control for the live guard |
| **`COMMIT_REF` is not buildbot-only.** The CLI sets it from `git rev-parse HEAD`, no dirty check, on every non-buildbot build, alongside `NETLIFY_LOCAL: 'true'` | `@netlify/config/lib/env/git.js:7-11`, `env/main.js:12,76-88` in CLI 26.1.0 | `netlify build` on a reverted tree would claim its unreverted SHA. `resolveBuildId` must check `NETLIFY_LOCAL` |
| `netlify api getSite --data '{"site_id":"6b007878-a00d-4ada-86d4-5cf84e9acc2a"}'` works; `.published_deploy` has `id, state, commit_ref, branch, context, locked, created_at` | run live: `6ada8fe8...`, `ready`, `120cc100...`, `production`, `locked: null` | The published-deploy read. Always pass the site id; worktree site links are recorded dead |
| `netlify api listSiteDeploys --data '{"site_id":"...","per_page":20}'` works, newest first | run live | The in-flight read. Documented list params are only `page`, `per_page`; `state` is a free string, so filter client-side |
| **A `new`/production deploy from 2026-03-29 (`69c870ae...`, no commit ref) sits in history forever**; also a cancelled `error` (`6a2b9099`) and four `deploy-preview`s, one on `main` | run live | A naive "non-terminal means in flight" halts on day one. See classification |
| `lockDeploy` and `unlockDeploy` exist | `netlify api --list` | Repair text for a locked site |
| Pre-push hooks fire from any worktree when `core.hooksPath` is absolute; `--no-verify` skips them; **a missing hooks directory, or a hook without the executable bit, lets the push through** (the latter with only a hint); pushed by URL, `$1` is the URL, not `origin`, while stdin still names `refs/heads/main` | probed in a scratch repo, 2026-11-01 | A tracked relative path would leave any worktree forked before P0b ungated. Hence the installed copy, P8's executable check, and gating on the stdin ref |
| On this host `rename` of a directory onto a non-empty one fails `ENOTEMPTY`, onto an empty or absent one succeeds | probed in Node, 2026-11-01 | The mutex holder is atomic with its content |
| In zsh, `$TIP:refs/heads/main` applies the `:r` modifier and mangles the refspec | probed: `HEADefs/heads/x` | The runbook spells `"${TIP}:refs/heads/main"` |
| No `core.hooksPath` and no active hooks in the common `.git` | `git config`, `ls hooks` | Setting it displaces nothing |
| `/save` G.1-G.4 merges into a scratch worktree at `origin/main` and pushes from it; `relay-close` does not push | `~/marvin/.claude/skills/save/SKILL.md:207-301` | Its SHA does not exist until it pushes. It cannot pass the gate, and fails at the hook, loudly |
| `netlify.toml` has no `ignore`: every push to main deploys | `netlify.toml` | A docs commit is a release. Post-release records cannot be pushed on their own |
| `~/marvin` tracks 1,619 files under `state/`; the new paths are not ignored | `git ls-files`, `check-ignore` | `init` refuses until they are |
| Vitest collects only `src/**/*.test.{ts,tsx}`, default env happy-dom | `vitest.config.ts` | Script tests go in `src/test/pipeline/`, each starting `// @vitest-environment node` |
| `npm run lint` is bare `eslint`; `.mjs` under `scripts/**` is linted with the `any` and `require` relaxations; `tsconfig.json` includes no `.mjs` | `eslint --print-config` | Lint locally; scripts are untypechecked, so tests carry correctness |
| `audit:live` fails by construction at `e2e/monitoring/live-health.spec.ts:187` and `:243` (non-public layers) | read | Not P0b's guard, and it cannot be plain evidence for `init` |
| Root `ARCHITECTURE.md` exists | `ls` | Home of the release runbook |
| `~/marvin/skills/notify/send.mjs` exists | `ls` | The notice on relaxing records |
| `git config core.hooksPath` run from `~/marvin` answers about that repo, not this one | critic measured; `~/marvin` has its own | P8 reads the recorded repo, or `GATE OFF` cries wolf on every coordinator tick |
| Under contention, a rename loser can read `owner` as `ENOENT` when the holder has just released: 56-79 per run over 200 cycles, 8 processes | critic measured | `ENOENT` means released, retry |

## Files

No new dependencies: the tool runs on bare Node 22.

| File | Change | Batch | Purpose |
|---|---|---|---|
| `src/lib/build-id.ts` | add | P0b-1 | `resolveBuildId(ref, netlifyLocal): string` |
| `src/app/layout.tsx` | edit | P0b-1 | `metadata.other = { "oc-build": resolveBuildId(process.env.COMMIT_REF, process.env.NETLIFY_LOCAL) }` |
| `src/test/lib/build-id.test.ts` | add | P0b-1 | Resolver and root-layout metadata |
| `scripts/lib/dir-mutex.mjs` | add | P0b-2 | `withMutex(dir, fn, {timeoutMs})`: the shared primitive |
| `scripts/lib/release-state.mjs` | add | P0b-2 | `parseLedger(path)`, `fold(records)` |
| `scripts/release-ledger.mjs` | add, then edit | P0b-2, 3 | The CLI |
| `src/test/pipeline/release-harness.ts` | add | P0b-2 | Temp state and `HOME`, spawn helper (scrubs `GIT_*`; commits with `-c user.name`), bare-origin fixture, fake netlify bin |
| `src/test/pipeline/release-ledger.test.ts` | add | P0b-2 | Lease, tokens, fencing, malformed ledger |
| `scripts/lib/netlify-read.mjs` | add | P0b-3 | `readPublished()`, `listDeploys()`, `classifyInFlight(deploys, published, acks, now)` |
| `scripts/hooks/pre-push` | add, mode `100755` | P0b-3 | Calls the installed tool |
| `src/test/pipeline/release-check-push.test.ts` | add | P0b-3 | Predicates, hook, takeover, reconcile |
| `ROADMAP.md`, `.claude/handoff.md`, `ARCHITECTURE.md`, program plan (0.5b, C2), `beta-resequence.md` (wave G2) | edit | P0b-4 | Pre-merge docs |

## Design

### Deploy identity (C1)

`<meta name="oc-build" content="<sha>">` on every route. `resolveBuildId` returns the ref only when it matches `/^[0-9a-f]{40}$/` **and `NETLIFY_LOCAL` is unset**; otherwise the literal `"local"`. So `next build`, CI, `netlify build` and `netlify deploy --build` from this machine all read `local`; only the buildbot stamps a SHA. Never `git rev-parse`: a dirty tree would claim a SHA it does not contain. `local` never equals a candidate, so a guard polling for identity fails closed into "unverified".

P0 and P0b verify by CLI (`commit_ref` equals the SHA, `state` is `ready`); from S0a on, guards read the tag. C1's close record comes from `summary --sha`: SHA, deploy id, data version, guard results.

### State and overrides

| Item | Default path under `~/marvin/state/` | Form |
|---|---|---|
| Ledger | `opencanopy-releases.jsonl` | Append-only JSONL; one `write` + `fsync` per line |
| Lease | `opencanopy-release.lock/` | `mkdir`; holds `lease.json` {lane, sha, kind, token, ts} |
| Mutex | `opencanopy-release.mutex/` | Directory holding `owner` {pid, startTicks, ts}, created atomically with its content (below). Held for milliseconds |
| Installed tool | `opencanopy-release-tool/` | Copy of the CLI, `lib/` and `hooks/pre-push` (`100755`). **The one canonical invocation** |

Ignore patterns needed in `~/marvin`: `state/opencanopy-release*`, and `state/heavy-build.lock*` for HEAVY in the same commit.

**The mutex holder is atomic.** Acquire: make a temp sibling (`<mutex>.tmp.<pid>.<random>`), write `owner` into it, `rename` it onto the mutex path. `ENOTEMPTY` or `EEXIST` means held; a stray empty directory is simply taken. So a held mutex always has an `owner`. **`ENOENT` on reading `owner` means the holder just released: retry the acquire**, never read it as dead. Release: `rename` the mutex to a temp name, then remove that, so a successor is never touched. A leftover temp sibling is harmless. A holder is dead only when `owner` parses and its PID and start time fail the check; a live holder is exit 4, never exit 3. An unparseable `owner`, which this protocol cannot produce, is exit 3 with the manual text.

**Canonical tool.** Sessions run `node ~/marvin/state/opencanopy-release-tool/release-ledger.mjs`, so a stale worktree's older copy never meets a newer record type and halts on it. **`install --lee "WORDS"` requires Lee's yes every time, and the words are recorded.** His 2026-11-01 ruling is that yes for the first install only. It sets a repo-wide git hook and replaces the code that authorizes pushes, so it is not a session's call. **It cannot downgrade the gate:** it fetches, then installs **from the objects at live origin main's exact SHA**, never the working tree, so neither a stale worktree nor a dirty file can become the gate. If origin main lacks the tool paths it refuses. The only exception is the first install, when no tool exists and origin cannot yet hold it: that one installs from the objects at `HEAD`, and bootstrap re-installs once P0b is on origin. **It is atomic, under the release mutex:** refuses while a lease is held, and fails the same `check-ignore` as `init`; each file is written to a temp name and renamed into place, the hook last, `chmod 755` verified; `core.hooksPath` is set to the installed `hooks/`, absolute, only after the hook exists. A crash at any point leaves a present, executable hook once one has been installed, and a re-run completes it. It tolerates a bad ledger, so a bad tool can be replaced; a held lease refuses, printing the manual route (release it, or on Lee's word remove the lease dir). Every run writes `installed.json` in the tool directory: source SHA, Lee's words, the repo's common dir. `genesis` copies the first into the ledger, since `init` comes after; later runs also append an `install` record when the ledger is healthy. Under the override it refuses unless the repo's common dir sits under the test's temp root.

**`OC_RELEASE_STATE_DIR`** relocates all of it. The script **exits 2** if `VITEST` is set and the override is absent or resolves inside the real state dir, and **`check-push` exits 2 if the override is set and `VITEST` is not**, so no fake universe can print a real-looking GO. Test seams, honoured only when the override is set: `OC_RELEASE_NOW`, `OC_RELEASE_NETLIFY_BIN`, `OC_RELEASE_NOTIFY_BIN`, `OC_RELEASE_SITE_URL`, `OC_RELEASE_POLL_MS`, `OC_RELEASE_READ_TIMEOUT_MS`, `OC_RELEASE_CRASH_AT`, `OC_RELEASE_MARVIN_ROOT`.

Exit codes: 0 ok or GO; 1 NO-GO; 2 refused (bad input, stale token, lost race, duplicate); 3 HALTED; 4 BUSY (mutex timeout, 5 s, live holder). Every external read (`netlify`, `git ls-remote`) has a **30 s timeout** and kills the reader's whole process group.

**A new halt is a decision for Lee.** `reconcile` exits 3 throughout a halt, so the trigger is `NEW HALT`, printed only by the command that appended it: that session or the coordinator tells Lee in plain words what stopped and what the choices are, and sends `/notify`. Any other exit 3 is reported, not re-notified. The stderr text says so, in words a session can relay. `ARCHITECTURE.md` names the owner: whichever session holds the coordinator role, and failing that, the next session to touch the tool. No daemon watches for it, and that limit is stated there.

### Ledger records

`{v:1, ts, type, token, ...}`, required fields per type. Types: `genesis, claim, takeover, request, push, deploy, build-failed, guard, negative-control, corrective-auth, rollback, ack-deploy, release, halt, repair, install`. An unknown `v` or `type`, a bad line, a torn last line, a non-monotonic token, or a lease token above the ledger's maximum is **malformed**. `fold` derives current token, current deploy, known-good deploy, candidate, predecessor status, and a **set of open halts**, each closed by its own rule. Verdict history is keyed on `commit_ref` as well as deploy id, so a rebuild inherits its SHA's red. Only `guard --result green` makes known-good, and only when no halt stays open after it. If known-good goes red with no previous green, it becomes null, the text says no rollback target exists, and Lee is told.

**Idempotent.** Under the mutex a record is appended only on a state change: reconcile and `await-live` cannot both add `deploy` for one deploy, reconcile and `record-rollback` cannot record one rollback twice (except that `record-rollback` adds Lee's words to an observed rollback, once), and a coordinator polling a stuck state adds one `halt`, not one per tick. A later `request` with new words is a state change, which is how an expired yes is renewed.

**Torn reads.** `check-push` and `status` read without the mutex, so a torn last line seen there is re-read once under it before being declared malformed.

**Malformed, unreadable or missing halts everything.** Every ledger-reading command exits 3 with `SCHEDULING HALTED` and writes nothing. A missing ledger says `not initialized`, and is never silently recreated.

**Human repair, in `--help` and in the error text.** Keeps the ledger absent, so everything stays halted throughout, and cannot reuse a token:
1. `mv` the ledger to an aside file.
2. Produce a corrected copy.
3. `repair-note --aside A --fixed F --reason TEXT`: validates F, scans A tolerantly for its highest token, appends a `repair` record burning past it, renames F into place, and removes any lease dir, since a repair fences its holder and that lease would otherwise block claims until it went stale.

### Lease, tokens, atomic reclaim

C2 says reclamation is serialized through the same `mkdir` lock. r7 is right that an occupied directory cannot admit a reclaimer, so there are two: the lease, held for hours, and a short mutex. **Every state change runs under the mutex**, closing the check-then-append race. Netlify is read before taking it, never during.

**A Netlify read is only acted on if the ledger did not move during it.** `reconcile` and `takeover` take the ledger's byte length before the read; under the mutex, if it changed, the read is dropped and redone, at most three times, then exit 4. Otherwise a lane could read the site just before another lane's deploy record lands and log a rollback that never happened.

- **Token authority is the ledger** (maximum plus one). `lease.json` is a cache.
- **Claim, after a reconcile read:** under mutex, `mkdir` the lease; on EEXIST, succeed only if the lease is reclaimable (below), else exit 2 with nothing written. Append `claim`; write `lease.json` by temp and rename.
- **Release:** token-checked; append `release`, then remove the lease.
- **Reclaimable by `claim`, under the mutex:** a lease dir with no `lease.json`, or one whose token the ledger shows released. Both are crash residue.
- **Crash inside the mutex needs a human first.** Exit 137 leaves a dead holder. **A dead mutex holder is never auto-broken:** breaking it has the same race one level down. The next caller exits 3 printing the exact `rm -r <path>` (the directory holds a file, so `rmdir` would fail); after that, recovery is automatic as above. Rare, safe, and surfaced to Lee.
- **Takeover never removes the lease directory.** Allowed only when the lease is **stale, older than exactly 2 h**, after a successful reconcile, which means the read succeeded and added no new halt; an open halt does not block it, because a red waits on Lee and sessions end. Under mutex: require `--observed-token` to equal the ledger's current token (else lost, exit 2); no lease at all is exit 2; append `takeover`; rename a new `lease.json` into place. Nothing is deleted, so a loser cannot remove a successor's lease. A crash after the append burns a token and leaves the old `lease.json`; its holder is already fenced, and the lease stays stale for the next takeover.
- **Fencing:** every write carries `--token`; anything other than the ledger's current token exits 2, including after `release`. Named exceptions: `init`, `claim`, `takeover`, `ack-deploy`, `repair-note`, which allocate or repair; `record-rollback` and `authorize-corrective` **when no lease is held**, which carry `--lee`; and `reconcile`, which observes Netlify rather than acting, and stamps its records with the current token read under the mutex.
- **Further refusals, exit 2:** `request --sha` differing from the lease's SHA; `release --abandon` once the candidate is pushed by any record (`record-push`, adoption, reconcile); `record-push` when `git ls-remote origin refs/heads/main` does not equal the SHA, so a failed push cannot be recorded and the candidate can still be abandoned.
- **Fencing exception:** `guard --result red` on the current deploy with no lease held needs no token. A red only restricts, and a known-good deploy can go red after its lease is released.

### CLI

```
install --lee "LEE'S WORDS"
status [--json]                     # offline; exit 3 when halted
summary (--sha S | --unrecorded)
init --evidence TEXT                # adopts the published deploy as known-good; see refusals
claim --lane M|S|session (--sha S | --deploy D) --kind instrumentation|behaviour|corrective [--data-version V]   # --deploy only for an acked deploy with no commit_ref, or one record-rollback made current
release --token N [--abandon]
reconcile                           # the coordinator's scheduling read; exit 3 when halted
takeover --lane L --observed-token N
request --token N --sha S --parent P --approval "LEE'S WORDS" --checks EVIDENCE
check-push --token N [--pushed-sha S --remote-sha R]
record-push --token N --sha S
await-live --token N --sha S --source netlify|meta [--timeout-min 10]
guard [--token N] [--sha S] --deploy D --result green|red|unverified|negative-control --evidence PATH [--lee "LEE'S WORDS"]
authorize-corrective [--token N] --sha S --lee "LEE'S WORDS"
record-rollback [--token N] --deploy D --lee "LEE'S WORDS"
ack-deploy --deploy D --lee "LEE'S WORDS"
repair-note --aside A --fixed F --reason TEXT
```

`--approval`, `--checks`, every `--lee` **and `guard --result green` itself** are **attestations by the session, not proof**: the tool runs no guard and cannot verify Lee said anything. `--sha` on `guard` may be omitted only when the current deploy has no ref. `negative-control` is accepted only on `instrumentation` and does not halt.

**What counts as his words:** verbatim from his own message, never a paraphrase; a peer session's relay is recorded as relayed, and by whom. Empty or whitespace is refused.

**A notice goes to Lee on each relaxing `--lee` record:** red to green, `ack-deploy`, `record-rollback`, `authorize-corrective`, `install`. The tool runs `node ~/marvin/skills/notify/send.mjs` with the door and the verbatim words, best effort and never blocking. Not on `request`: he has just said yes. This is detection, not proof.

**Privacy:** `summary --sha` feeds a public file, so it prints SHA, deploy id, data version and guard results only. The words stay in the private ledger, `status` and the terminal.

**`init` refuses** if a ledger exists, a deploy is in flight, or `git -C ~/marvin check-ignore` fails for any state path (skipped under the override unless `OC_RELEASE_MARVIN_ROOT` is set).

**`guard` refuses** unless `--sha` and `--deploy` match fold's current deploy and `--evidence` is non-empty, newer than the deploy record, and contains the deploy id or SHA, which stops a stale file from the last release certifying this one. This is the only door to known-good. It is the release's **single aggregate verdict**; results per guard live in the evidence file.

**A session cannot lift a red halt without stating in writing that Lee said so.** Re-running a guard until it passes is not a recovery: C2 says "Lee chooses".

| Verdict on one commit | Allowed |
|---|---|
| none to green, red or unverified | Yes (a rebuild of a red SHA is not "none": it inherits red) |
| unverified to green or red | Yes: the check had not finished |
| **red to green** | **Only with `--lee`**, which covers a genuine flake |
| green to red | Yes. Known-good moves back to the previous green, and it halts |
| same verdict again | No-op, unless it closes a halt (the restored deploy after a rollback) |
| negative-control | As above; no transition |
| **Anything else, including red to unverified and green to unverified** | **Exit 2, nothing written** |

**Every halt has a door.** P7 fails while any halt is open, except that a bound corrective passes while only red, unverified or build-failed halts are open.

| Open halt | Closed by | With no lease held |
|---|---|---|
| Red on a commit | Green with `--lee` on that commit, any rebuild included; or green on a deploy `record-rollback` made current; or green on a corrective release | `record-rollback` or `authorize-corrective` take no token, then `claim --deploy` or `claim --kind corrective`, which give the token the guard needs. A dead holder: `takeover` first |
| Unverified on a commit | Green on that commit; or as red | As red |
| Build failed | Green on a corrective release (green on the unchanged known-good leaves the ledger unchanged) | `authorize-corrective` |
| Unclassifiable, published deploy | `ack-deploy`, which makes it current, then green | `ack-deploy` needs no token |
| Unclassifiable, deploy later settled or stranded | `ack-deploy` on it alone | Same |

An observed `rollback` from reconcile has no words and closes nothing until `record-rollback` adds them. Malformed is not in the set: its door is repair.

**The remaining limit is stated, not closed.** A session willing to write words Lee did not say can pass. That is **weaker than `--no-verify`**: a bypass shows up as an unrecorded deploy with no help from anyone's honesty, whereas a false `--lee` is a valid record, and its only detector is Lee reading the notice, which brings detection to seconds. Accepted because the threat is a hurried session, not a hostile one, and proof would put him back at a terminal, against his 2026-10-05 amendment.

**`await-live`** reads the deploy id from Netlify in both source modes and appends `deploy`. It exits fast on `state: error` for the candidate's `commit_ref`, appending `build-failed`, which halts with the text "production is unchanged; the known-good deploy is still live". Past the timeout it appends `guard unverified`, bound to the SHA with a null deploy if no deploy id exists yet; if that deploy later publishes, reconcile's second row picks it up and the halt lifts on its green guard. Its deadline uses a real monotonic clock, not `OC_RELEASE_NOW`; `--timeout-min` may be fractional.

**Duplicate SHA:** `claim` refuses a SHA already registered unless that registration was abandoned, and writes nothing.

### check-push

Prints `GO sha=... parent=... rollback=<known-good deploy id>`, or `NO-GO` with **every** failed reason. Writes nothing. Any read failure is NO-GO.

| # | Predicate | Source |
|---|---|---|
| P1 | `--token` equals the ledger's current token, and an un-pushed `request` exists **under that same token, younger than 60 minutes** (past that, ask Lee again; C2 wants him present for the window) | ledger |
| P2 | The SHA being pushed equals the requested SHA, and the parent is its ancestor | `--pushed-sha`, else `HEAD`; `git merge-base --is-ancestor` |
| P3 | Live origin main equals the request's `--parent` (and `--remote-sha` when given) | `git ls-remote origin refs/heads/main`; **never the cached `origin/main`**. Failed or empty is NO-GO |
| P4 | No deploy in flight, none locked | `classifyInFlight`; `locked` not true |
| P5 | Ledger readable and reconciled: published equals current. Valid JSON with no `published_deploy` is NO-GO | `getSite`, `fold` |
| P6 | Predecessor green, **or** an unconsumed `corrective-auth` bound to exactly this SHA | `fold` |
| P7 | **No open halt**, or the corrective exception above | `fold` |
| P8 | `core.hooksPath` of the repo recorded in `installed.json` equals the installed hooks directory, and the hook exists **and is executable** | `git -C <recorded> config`, `fs.access(X_OK)` |

**Pre-push hook.** For **every stdin line whose remote ref is `refs/heads/main`, whatever the remote is called** (a URL arrives as `$1`, so `$1` is ignored), it runs the installed `check-push --token "$OC_RELEASE_TOKEN" --pushed-sha L --remote-sha R`; nonzero blocks. No token is NO-GO. Deleting `main` (zero local SHA) is always refused. Other refs pass through. **`/save` on this repo therefore stops at the hook, loudly**, and its own rule stops it reporting "merged". During the program it is not a release path.

### Release sequence

Lives in `ARCHITECTURE.md` (P0b-4), which `--help` points to, since no later session loads this plan.

1. Rebase the relay branch on `origin/main`. Commit the relay's pre-merge ROADMAP and handoff edits.
2. Run checks **on that tip**: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
3. `claim --sha <tip>`. If origin moves, abandon, rebase, repeat.
4. Ask Lee, naming the rollback target and the 20-minute window. On yes: `request --parent <origin main>`.
5. `check-push` immediately before pushing. Only GO continues.
6. `OC_RELEASE_TOKEN=N git push origin "${TIP}:refs/heads/main"` (braces and quotes: zsh otherwise mangles it). The hook checks again. `record-push`, which consumes any corrective.
7. `await-live`, the release's guards, `guard`, then `release`.
8. Fast-forward the primary's `main` only if it is clean and on `main`; otherwise leave it and say so.
9. If the release touched the tool paths, ask Lee, then `install --lee` after `release`. Otherwise every session keeps running the old gate.

**Post-release records** (`shipped`, guard results, deploy id) ride **in the next release's first commit**, since pushing them alone is itself a release. The ledger is the durable record meanwhile. Whichever lane releases next runs `summary --unrecorded` at step 1, which lists every release whose SHA is absent from origin's `handoff.md`, so a lane also carries the other lane's records.

**Docs and rulings.** A docs commit is a release. `decisions-check.sh` reads origin's default branch, so a ruling held on one lane's branch is invisible to the other. A ruling the other lane must see goes as a docs-only `behaviour` release through the normal sequence, its blocking guard being HTTP 200 on `/`, `/map`, `/privacy` and identity. Everything else rides the next release.

**Red release.** `guard red` or `unverified` halts both lanes, and the failed candidate stays live until Lee acts. Lee chooses rollback (`record-rollback`; green `guard` against the restored deploy closes the halt; **origin main still contains the failed commit, so the next release must revert it, and `check-push` will not notice**) or one corrective (`authorize-corrective`; `release`; `claim --kind corrective --sha` for that bound SHA only).

**Failed build.** `build-failed` halts, production unchanged, rollback meaningless. Origin main still holds the commit, so the only way on is a corrective.

**Bypass or stranded deploy.** `ack-deploy --lee` for an unrecorded published deploy makes it current and pending. Then `claim --sha <its commit_ref>`, or `claim --deploy D` for a deploy with no ref, as CLI deploys can have (allowed while halted only for that acked deploy), the guards, `guard` green, `release`; the next release gets GO. `ack-deploy` on a non-published deploy means stranded: it is excluded from in-flight from then on. A null `commit_ref` never equals another null. This also recovers the `--no-verify` valve, which needs Lee's yes.

**Locked site.** If a rollback left the deploy locked, P4 says so; the repair text names `netlify api unlockDeploy` on Lee's word. Whether a console rollback locks is unprobed, and P4 fails closed either way.

### Netlify classification and reconcile

`classifyInFlight` considers `context: production` deploys in the last 20 that are **newer than the published deploy, or non-terminal and under 24 h old** (an older deploy still building could publish over a newer one). The March deploy falls outside both. `ready` and `error` are settled. Anything else blocks `check-push`. For takeover, one of C2's `enqueued`, `building`, `processing` whose `commit_ref` equals the candidate is adopted: the `takeover` record carries `adopted: {sha, deploy}`, which marks the candidate pushed, so the new owner goes straight to `await-live` and `guard` without a `record-push`. Every other case halts until `ack-deploy`.

`claim` and `takeover` run `reconcile` first; so does the coordinator before scheduling. C2's "reconcile before publishing" is `check-push` P5. **A failed read exits nonzero and writes nothing; only a successful read that cannot be classified appends `halt`.** `reconcile` also evaluates P8 against the recorded repo, printing `GATE OFF` when it fails, and reports the SHA the gate runs from; both are reported, not halts.

| Netlify shows | Ledger action |
|---|---|
| Published equals current | Nothing |
| Published `commit_ref` equals the candidate, `ready` (the session may have died before `record-push`) | Append `deploy`, pending, never known-good |
| Published is the known-good, by id or commit ref, and not current | Append `rollback` observed; restored deploy is current; a Lee-worded `record-rollback` and a green guard are still needed to close a halt |
| Anything else, including a direct push | Append `halt`; exit 3 |

Unprobed: whether a console rollback keeps the deploy id. The rule accepts either, and no rollback is run to find out.

### Relay HEAVY (G2, before S0b)

Lee, 2026-11-01: `heavy-run` and C7's lock are their own small relay, named for wave G2, before S0b, which the program says waits on the lock. Nothing consumes it in G0-G1. It reads no ledger and shares no predicate, and leaving the installed tool means a build-lock fix never needs Lee's yes for `install`. Its own `scripts/heavy-run.mjs` and test, reusing `dir-mutex`, with its own child plan. The rules three critic rounds settled, binding on it:

- `~/marvin/state/heavy-build.lock` by `O_CREAT|O_EXCL`: PID, host, start time, job, startTicks, pgid, with `.mutex` beside it. Own state-dir override, same path guard.
- **Unmeasured is heavy.** A job measured below 8 GB does not call it. Known heavy: `build-year-overlays.py` (12 GB), `build-raster-tiles.py`, `preprocess:v2`.
- Under the mutex: live is refused; dead is replaced; `MemAvailable` below 16,777,216 kB (16 GiB, the strict reading of C7) refused with no lock left; then lock, spawn as its own group, record pgid, release, so a launcher crash leaves a dead holder and a manual clear, never a second build. Release under the mutex, only if still its own. Unparseable lock reads live.
- **Liveness:** `kill -0` plus `/proc` start time and not `Z`; or `kill(-pgid, 0)`. Another host reads live. Stated limits: `setsid` escapes; pgid reuse is a false live.
- Child's exit code passes through; refusals reserved at 240-244 with a marked stderr line. Signals forward to the group. Retry 240, 241, 243 every 10 min, 6 times, then Lee.
- **Tests:** live build respected; killed build recovered; parent killed with child surviving; PID reuse; crash before pgid; corrupt lock; memory boundary; two reclaimers; owner-safe release; other host; exit status; signals; malformed ledger irrelevant. Revert-proven by mutants on start time, group check, spawn under the mutex, memory boundary, release ownership.

### Conflict matrix additions (C2; `beta-resequence.md`, PIPE)

Applied to C2's table in P0b-4. The existing rows stand.

| Shared surface | Touched by | Rule |
|---|---|---|
| `scripts/build-scrub-tables.py`, `scripts/build-year-overlays.py`, the dots builder (not yet in `scripts/`; its relay names the path) | Lane S relays (S0b, S1-lite, MERGE, S1′), PIPE | PIPE never edits them while a Lane S relay does; PIPE builds after those relays per its graph edge |
| `scripts/pipeline/*` | T-pre, PIPE, REBUILD (runs only) | One relay at a time; PIPE after T-pre merges; Lane S treats it as read-only while PIPE is open |
| `src/app/layout.tsx`, existing row | adds P0b (`oc-build`) | P0b lands first; `metadata.other["oc-build"]` must survive M2's and S2-pages' rebases |
| `scripts/release-ledger.mjs`, `scripts/lib/{dir-mutex,release-state,netlify-read}.mjs`, `scripts/hooks/pre-push` | P0b, then any relay fixing them | `install` refuses while a lease is held: the tool that authorizes a push does not change under the push |

## Dependency Graph

| ID | Files | Depends on | Parallel group | Root |
|---|---|---|---|---|
| P0b-1 | 3 | — | A | `src/` (app identity) |
| P0b-2 | 5 | — | A | release tooling |
| P0b-3 | 4 | P0b-2 | B | release tooling |
| P0b-4 | 5 | P0b-1 to 3 | C | docs |

**Pack:** tier `standard`, `batches[]` as above. Ted, then Razor after P0b-2 and after P0b-3, then fix. No Behavioral or Jen (no UI). The program's "Simple" is corrected because the relay's table gives Simple 1-3 files and no fix stage, and this tool can wrongly authorize or halt every later release. "One root" treats `scripts/` and its tests in `src/test/pipeline/` as one subsystem, because Vitest collects nothing else.

### P0b-1. Deploy identity

Tests, `build-id.test.ts`:
- `resolveBuildId`: 40-hex passes through; `undefined`, `""`, short and uppercase give `"local"`; a valid SHA with `NETLIFY_LOCAL` set gives `"local"`.
- With `next/font/google` and `next/script` mocked, `vi.stubEnv` then dynamic import of `@/app/layout` gives `metadata.other["oc-build"]` equal to the SHA; unset gives `"local"`.

Run once and quoted in the report: `COMMIT_REF=<40 hex> npm run build`, then `out/index.html`, `out/map.html`, `out/privacy.html`, `out/404.html` each have exactly one `<meta name="oc-build"` element, inside `<head>`, with that content (count elements, as the SHA may also appear in the RSC payload); `env -u COMMIT_REF npm run build` gives `local`; `netlify build --offline` gives `local`, proving `NETLIFY_LOCAL` reaches the build command.

### P0b-2. Ledger, lease, fencing

Subprocess against temp state; every case fakes `HOME`. Timeout 30 s per test. Assert outcomes (exit code, reason, bytes), never timing.

| Named case | Assertion |
|---|---|
| **Concurrent claims** | 8 processes, distinct SHAs: exactly one exit 0, the others exit 2 or 4; one `claim` record; lease names the winner |
| **Duplicate SHA** | Same SHA after release: exit 2, ledger unchanged. After `--abandon`: accepted. 2 processes at once: one record |
| **Stale lease** | With `OC_RELEASE_NOW`: at 2 h minus 1 s takeover exits 2; at 2 h plus 1 s it passes. Reconcile failure still blocks (P0b-3) |
| **Malformed ledger** | Bad JSON mid-file, torn last line, unknown `type`, unknown `v`, descending token, lease token above maximum, path is a directory, missing file. For each: `status`, `claim`, `request`, `guard`, `takeover` exit 3 with `SCHEDULING HALTED`, bytes unchanged |
| **Repair** | With a lease present and without: the three-step procedure recovers and a claim succeeds at once; a claim afterwards has a token above every token in the aside, including when the removed line was the last `claim`; during the procedure everything exits 3 |
| **Resumed former owner** | Token 5, takeover to 6: every token write with 5 exits 2, ledger and lease unchanged |
| **Crash-safe tokens** | `OC_RELEASE_CRASH_AT=claim-after-mkdir`, `claim-after-append`, `release-after-append`, `takeover-after-append`: next caller exits 3 printing `rm -r`; the test runs exactly what was printed; next claim or takeover recovers, per the rules above; tokens across 10 cycles strictly increase |
| Mutex | Dead holder, unparseable `owner`: exit 3, lease untouched. Live holder past 5 s: exit 4, never 3. Stray empty directory: taken. Release leaves a successor's mutex alone. **Acquire-and-release loop, 8 processes: no exit 3**, the `ENOENT` case |
| Edge refusals | `request` with another SHA; token write after `release`; `--abandon` after `record-push`, after adoption, after reconcile's pushed row; `record-push` with origin not at the SHA (then `--abandon` works): each exit 2 |
| Fold honesty | `pending` then `unverified`: known-good is still the previous deploy. After green: this deploy |
| Guard binding | Wrong `--sha`, wrong `--deploy`, missing, empty or older evidence, evidence naming another deploy: exit 2, known-good unchanged. Null-ref deploy with no `--sha`: accepted |
| **Red halt cannot self-lift** | `guard red` then `guard green` on one deploy, same token, no `--lee`: exit 2, still halted, known-good unchanged. With `--lee`: lifts, words recorded. **Red, unverified, green with no words: exit 2 at the second step.** Rebuild of a red SHA, green with no words: refused; known-good unchanged |
| Transition table | One row per table line, the refusals included. Green then red: known-good is the previous green, halted. No previous green: null, text says so. Same verdict twice: one record. Red with no lease and no token: accepted |
| **Every halt reaches GO** | Table-driven over the halt table: red with holder alive; red with holder dead (`takeover` during the halt); **red after `release`, with no token**; unverified; build-failed; unclassifiable published; unclassifiable then settled `error`; rebuild of a red SHA. Each reaches GO by its named door, with no hand edit |
| Open-halt set | Direct push during an `unverified` halt: green on the first leaves the second open. Green on the unchanged known-good after `build-failed`: ledger unchanged, halt stays. Observed `rollback` with no words: stays until `record-rollback`. Unclassifiable open: a bound corrective is NO-GO |
| Words and notices | `--lee ""` or whitespace: exit 2. Each relaxing record calls the notify seam with door and words; a failing notifier blocks nothing; `request` does not call it. `summary --sha` output contains no words |
| `summary` | `--unrecorded` lists an unrecorded release; omits a recorded one and an abandoned one |
| Idempotence | Same `deploy` twice, same rollback twice, repeated `halt`: one record each, and `NEW HALT` printed once |
| Torn read | The test holds the mutex, starts the command, completes the line, releases: not malformed. Still torn: exit 3 |
| Corrective | Auth for A: corrective claim for B while halted exits 2; A accepted; second one after `record-push` exits 2 |
| Negative control | Accepted on `instrumentation`, no halt; refused on `behaviour` |
| Path safety | `VITEST` set, no override: exit 2. Override inside the fake real path: exit 2. No override, `VITEST` unset: writes land under fake `HOME`, proving the default. Seams with no override are ignored. Override set, `VITEST` unset: `check-push` exit 2 |

### P0b-3. Netlify, check-push, hook, takeover

Fixtures: a fake netlify bin serving JSON shaped like the measured reads, including the stranded `new` deploy and a building `deploy-preview`; a temp repo with a bare origin.

| Named case | Assertion |
|---|---|
| **P1** | Stale token: NO-GO, exit 1, named. Current token, no request: NO-GO. Request 60 min and 1 s old: NO-GO; 59 min: passes; expired, re-requested with new words: GO |
| **P2** | Pushed SHA differs from requested: NO-GO. Parent not an ancestor: NO-GO |
| **P3** | Origin advanced **with cached `origin/main` left old**: NO-GO. `ls-remote` fails or returns empty: NO-GO. `--remote-sha` mismatch: NO-GO |
| **P4** | `enqueued`, `building`, `processing`, unknown `frobnicating`, newer than published: NO-GO. Older than published, non-terminal, under 24 h: NO-GO. `locked: true`: NO-GO. Stranded March `new` and building preview: no block. Stuck `new` newer than published: blocks; after `ack-deploy`: GO |
| **P5** | Published not current: NO-GO. Bin exits 1, prints non-JSON, hangs past `OC_RELEASE_READ_TIMEOUT_MS` through a grandchild holding the pipe, or omits `published_deploy`: NO-GO |
| **P6** | Predecessor red or `unverified`: NO-GO. Corrective for this SHA: GO. For another SHA, or consumed: NO-GO |
| **P7** | **Halted with every other predicate true: NO-GO**, the path where a takeover halted and that deploy later settled `error`. Bound corrective: GO |
| **P8** | `core.hooksPath` unset, or elsewhere; hook missing; hook `chmod -x`: NO-GO. `reconcile` prints `GATE OFF` in each. `reconcile` run from another repo with the gate on: no `GATE OFF` |
| All pass; several fail | GO, exit 0, names rollback, appends nothing. Every failed reason printed |
| **Hook** | Real `git push` against the bare origin, from the main fixture **and from a linked worktree**, with hook installed: no token rejected and origin unmoved; valid token passes; wrong SHA rejected; a branch push passes. Pushed by URL: gated. `main` as one line of a multi-ref push: gated. Deleting `main`: refused |
| **Request queued before takeover** | Request under 5; takeover; `check-push --token 5` NO-GO; `--token 6` also NO-GO; new owner's own request then GO |
| **Two competing reclaimers** | 8 `takeover --observed-token 5` on a stale lease: exactly one exit 0, one record, lease dir inode unchanged |
| Late reclaimer; no lease | Observed 5 after a successor at 6: exit 2, lease intact. Takeover after `release`: exit 2 |
| Takeover in flight | Candidate's `commit_ref` building: `adopted` on the record, and the row continues through `await-live` to `guard` without `record-push`. Another: exit 3, lease unchanged |
| **No false rollback** | Fake bin that appends a valid `deploy` record while answering published = known-good: no `rollback` appended, read redone; if it moves every time, exit 4. Same for `takeover` |
| Reconcile table | One test per row, including death between push and `record-push`, and a direct push. **A failed read: nonzero, no bytes written, not halted.** `claim` after a direct push exits 3 via its reconcile read |
| Ack lift | Direct push, `ack-deploy`, claim its SHA, `guard` green, `release`: next release GO. Before the guard: NO-GO. Deploy with null `commit_ref`: `claim --deploy` path; null never matches null in reconcile row 3 |
| Rollback lift | `record-rollback`, still halted; green guard lifts; known-good correct |
| `init` | Empty state: genesis, carrying the first install's words. Ledger exists, or in flight: exit 2. `OC_RELEASE_MARVIN_ROOT` repo without ignores: exit 2; with them: passes |
| `install` | No `--lee`: exit 2. Installs from origin's exact SHA, sets an absolute hooks path in the fixture repo only, hook executable. **Worktree one commit behind, or with a dirty tool file: the installed bytes equal origin's**, no downgrade. Origin lacks the tool: exit 2. Lease held: exit 2. Not ignored: exit 2. Common dir outside the temp root under the override: exit 2. First install from `HEAD`. `installed.json` written every run. Lease held prints the manual route. `OC_RELEASE_CRASH_AT=install-mid-copy`: hook still present and executable, a re-run completes |
| `await-live` | `netlify`: returns at match and appends `deploy`. `meta`: local server. `local` until timeout (fractional minutes): `unverified`, halts. `netlify` mode with no deploy by timeout: `unverified`, null deploy; deploy later publishes, reconcile records it, green lifts. `state: error`: exits fast, `build-failed`, text says production unchanged |

### P0b-4. Pre-merge docs

Docs only, through the writers (`~/marvin/scripts/update-handoff.mjs`, `--repo-root`, `--check`); the push waits for the sequence.

- **Program plan and `beta-resequence.md`:** C7's lock owner moves from 0.5b to HEAVY, in G2 before S0b. C2: matrix rows above; a note citing the 2026-10-05 amendment, Lee's 2026-11-01 hook ruling, the SHA-being-pushed reading, the post-release-record rule, and: "M1a's instrumentation acceptance cannot read `audit:live` as green until the tests at `live-health.spec.ts:187` and `:243` are retargeted; M1a batch 0 owns that."
- **`ARCHITECTURE.md`:** a release section: sequence, red path, the verdict and halt tables, bypass recovery, docs route, repair, what counts as Lee's words, who surfaces a halt, `install` needing Lee's yes.
- **ROADMAP:** `current` and `next`. Parking Lot index lines for every out-of-scope item above. **`shipped` waits for the post-release record.**
- **`handoff.md`:** `owed_add`: "Relay HEAVY before S0b (G2)." `owed_add`: "M1a batch 0 retargets the two `audit:live` tests before its acceptance can pass." `owed_add`: "P0b's post-release record: ride in the next release's first commit." `owed_add`: "P0b's first CI run on main (owner: the session that pushed): if red, the fix goes out as the next release and the three-run count restarts." `owed_add`, until a marvin change lands: "`/save` is not a release path for OpenCanopy; it stops at the pre-push hook."
- **DECISIONS:** none auto-written. His 2026-11-01 ruling is the entry the relay proposes: push authority runs through `check-push` and the hook, cooperatively.

**Post-release, not in this batch:** `summary --sha` into `log_entry` and the `shipped` entry, per the rule above.

## Verification

```
npx vitest run src/test/lib/build-id.test.ts src/test/pipeline/release-ledger.test.ts src/test/pipeline/release-check-push.test.ts
npm test && npx tsc --noEmit && npm run lint && npm run build
```

After every run, `~/marvin/state` shows no new or changed `opencanopy-release*` entry, and `core.hooksPath` in the real `.git` is **unchanged** from before the run. Run the suite 5 times locally, once of them as `taskset -c 0,1 npm test` so the likely flake class shows before the push. The first CI run on the pushed release is a close condition with an owner and a red path (P0b-4): these suites enter `npm test`, on small runners, against the beta's "green three runs running".

**Revert-proven guards.** `node ~/marvin/scripts/mutation-battery.mjs <spec.json>`, `mutants[]` of `{id, path, find, replace}`. **One spec per test file**, each with `test_command` scoped to that file and `total_timeout_ms` measured from its baseline (default 30 min is too short for an unscoped run). Spec in the relay's state dir. Exit 0 required; self-reported tables do not count. `find` strings are fixed at implementation; below is what each must break. Razor reads the journal in `~/.local/state/marvin/mutation-battery/`.

| ID | Break | Must die in |
|---|---|---|
| M1 | Layout drops `other` | layout metadata |
| M2 | Fallback returns `""`, or regex removed (two) | resolver |
| M3 | `NETLIFY_LOCAL` ignored | resolver |
| M4 | Claim skips the EEXIST refusal | concurrent claims |
| M5 | Duplicate SHA check removed | duplicate SHA |
| M6 | Stale threshold 1 h; 3 h (two) | stale lease |
| M7 | Parser skips bad lines | malformed ledger |
| M8 | Fence reads the lease cache; fence removed (two) | resumed former owner; crash-safe tokens |
| M9 | Token allocated after the lease write, not from the ledger | crash-safe tokens |
| M10 | `claim` no longer treats released residue as reclaimable | crash-safe tokens |
| M11 | `repair-note` does not burn past the aside | repair |
| M12 | Guard does not bind SHA and deploy | guard binding |
| M13 | Each predicate P1-P8 skipped (eight) | its row |
| M14 | P3 reads cached `origin/main` | P3 |
| M15 | P1 ignores the request's token | request queued before takeover |
| M16 | Hook exits 0 on missing token | hook |
| M17 | Takeover removes and re-creates the lease dir | two competing reclaimers |
| M18 | Takeover ignores `--observed-token` | late reclaimer |
| M19 | In-flight filter drops the age bound; drops the context filter; drops the under-24 h clause (three) | P4 |
| M20 | Unknown state treated as settled | P4 `frobnicating` |
| M21 | Failed read appends `halt` | reconcile table |
| M22 | `claim` skips reconcile | reconcile table |
| M23 | Pending counted as known-good | fold honesty |
| M24 | Corrective not bound to SHA; not consumed (two) | P6 |
| M25 | `await-live` ignores `state: error` | `await-live` |
| M31 | Path guard removed | path safety, under fake `HOME` |
| M32 | Red to green allowed without `--lee` | red halt cannot self-lift |
| M33 | Any green closes any halt | open-halt set |
| M34 | Later red leaves known-good in place | transition table |
| M35 | Mutex writes `owner` after making the directory | concurrent claims; mutex |
| M36 | Live holder reported as exit 3 | mutex |
| M37 | Ledger-moved check removed | no false rollback |
| M38 | Takeover skips reconcile (C2) | takeover in flight |
| M39 | `install` reads the working tree; accepts an ancestor; skips `--lee`; skips the lease refusal; skips `check-ignore`; skips the temp-root refusal; writes hook first or non-atomically (seven) | `install` |
| M40 | P8 ignores the executable bit | P8 |
| M41 | Hook gates on `$1` being `origin`; allows deleting `main` (two) | hook |
| M42 | `init` skips `check-ignore` | `init` |
| M43 | `check-push` allowed with override and no `VITEST` | path safety |
| M44 | Negative control accepted on `behaviour` | negative control |
| M45 | Each edge refusal removed (four) | edge refusals |
| M46 | Stranded ack ignored | P4 |
| M47 | Null `commit_ref` matches null | ack lift |
| M48 | Request age unchecked | P1 |
| M49 | Records appended without a state change | idempotence |
| M50 | Torn read treated as malformed at once | torn read |
| M51 | `repair-note` leaves the lease | repair |
| M53 | `reconcile` omits P8; P8 reads the cwd's repo (two) | P8 |
| M54 | Unlisted transitions allowed (red to unverified) | red halt cannot self-lift |
| M55 | `record-rollback` and `authorize-corrective` need a token with no lease | every halt reaches GO |
| M56 | `takeover` blocked by an open halt | every halt reaches GO |
| M57 | Stranded `ack-deploy` leaves its halt open | every halt reaches GO |
| M58 | Verdicts keyed on deploy id only; known-good moves with a halt still open (two) | red halt cannot self-lift; open-halt set |
| M59 | One halted flag instead of a set | open-halt set |
| M60 | `ENOENT` on `owner` read as dead | mutex loop |
| M61 | Evidence freshness unchecked | guard binding |
| M62 | Empty `--lee` accepted; notify missing on a relaxing record; notifier failure blocks; words in `summary --sha` (four) | words and notices |
| M63 | `NEW HALT` on every exit 3 | idempotence |

M26-M30 and M52 moved with HEAVY; ids are not reused.

**Live guard.** P0b's own release; blocking: `oc-build` equals the SHA on `/`, `/map`, `/privacy`, each 200. P0b is `--kind behaviour`. Negative control, the tag absent on today's published deploy, goes in the guard's evidence file before pushing, since the `negative-control` verdict is M1a batch 0's only. Not `audit:live`, for the reason in the facts table.

**Bootstrap.**
0. **A marvin session commits the ignore patterns.** `init` refuses until it does; this plan cannot make that commit.
1. **Answered: "Lee, 2026-11-01: hook on", relayed by the coordinator.** `/save` and terminal pushes on this repo refuse without passing the check. That ruling is his yes for the first install only.
2. Rebase, checks, then `install --lee "Lee, 2026-11-01: hook on (relayed by the coordinator)"` from the tip (first install, from `HEAD`).
3. `init --evidence "audit:live: N passed, two named failures by construction at live-health.spec.ts:187 and :243; HTTP 200 on /, /map, /privacy"`, with N measured that day. This is the honest basis of genesis, and it says what was not green.
4. The normal sequence from `claim`. Identity by CLI first, then the tag.
5. Ask Lee, then re-`install` from origin once P0b is there, so the installed bytes are what shipped.

P0 and CI ship earlier, outside the ledger, and are absorbed by `init`. If they have not shipped when P0b lands, they go through the gate like anything else.

## Rollback

- **Site:** Netlify instant rollback to the known-good `check-push` named, on Lee's word; the session never does it alone. The tag is inert until S0a's guards depend on it.
- **Tooling:** on Lee's word, `git revert`, then `git config --unset core.hooksPath`, which takes the gate off every worktree at once. Move the ledger aside, never delete it; `rm -r` the lease and mutex; remove the installed tool.
- **While the tool is broken:** releases halt, failing closed. The human route is the repair text, and at worst Lee's yes to `--no-verify`, recorded by `ack-deploy` afterwards. Cooperative enforcement cuts both ways.

## Review Focus

1. **P0b-2, crash points:** walk each `OC_RELEASE_CRASH_AT` position and the gaps between. Can any path reuse a token, leave two owners, or delete a successor's lease?
2. **P0b-3, `check-push`, hook and `guard`:** can any input print GO on a read failure, stale `origin/main`, halted ledger or fake state? Can a hook failure let a push through other than by the stated bypasses? Can any verdict sequence without `--lee` close a red halt, and does any halt lack a door?
3. **P0b-3, `classifyInFlight`:** the window against stranded deploys, rollback and clock order. Blocks on unknown; never halts forever on the March deploy.
4. **P0b-2, mutex liveness:** the rename-based holder under contention, `ENOENT`, PID reuse in `owner`. False-live is acceptable; false-dead is not.
5. **P0b-2, path guard and seams:** can a test or stray env var reach real `~/marvin/state` or the real `core.hooksPath`? `install` under the override must write config only in the fixture repo.

## Revision log

Three critic rounds; the full findings are in the critic files beside this plan.

- **Round 1, FAIL:** no halted predicate; `/save` could not pass the gate; lanes collided on local `main`; crash tests contradicted the mutex rule. Folded: P7, the pre-push hook, claim before landing, Standard tier, cuts. `NETLIFY_LOCAL` verified in the CLI source.
- **Round 2, narrow FAIL:** a session could lift a red with a re-run; the mutex read a live holder as dead; reconcile could log a false rollback; `install` could downgrade. All folded.
- **Round 3, narrow FAIL:** a red after `release` had no exit but hand-editing the ledger. Folded with the rest of its list, and Lee ruled no fourth critic: Razor and the mutation battery are the next checks.

**Changed from a critic's proposal:** `core.hooksPath` points at an installed copy, not a tracked path, because a missing hooks directory passes silently (probed). Repair moves the ledger aside first. `install` always uses origin's objects rather than requiring a clean, current `HEAD`.

**Rejected:**
- **Round 1, a CI run before the push.** It stays a close condition with an owner and a red path. `ci.yml` has no `workflow_dispatch`, a branch push runs nothing, and a PR on a public repo is a bigger outward step than this needs.
- **Round 3, cut E (lease as a fold, deleting the lease directory).** The critic left it to the author or Lee, and Lee's ruling names the other cuts and not this one. It changes a design three rounds have read and no critic would read the change, and C2 names the `mkdir`. It stays available if the lease and ledger disagree again.
- **Round 3, core 1's "no" branch.** Moot: Lee ruled hook on.

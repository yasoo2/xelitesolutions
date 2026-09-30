# MUSE Wiring Discovery 025 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 25)
HEAD=70ca099d + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for network_api 12/12 via
canonical path (registry entry, 163 verified; ToolService.executeTool
inside firewall runInContext; session-root fixtures created + removed by
the probe; execution embargo care: STRICT no-live-network embargo —
fetch-family legs are pre-network shapes only (empty/malformed/sync-
reject URLs, zero I/O by undici construction); search_api/discovery
valid-query legs EMBARGOED (duck-duck-scrape/catalog-refresh touch the
network); inspect_api/validate_api ZERO live legs (no pre-service
guard — any call cold-refreshes the catalog); google legs are
not-connected guards only (gmail_send NEVER called — sends real
email); payments legs interlocked on STRIPE_SECRET_KEY absence (a
present key would attempt a REAL Stripe call); search_text/swagger_docs
fully local legs) + static checker partition over the trunk +
pure-function verdict table over source-grounded shapes. Full trunk
probe ran 2x filed runs A/B with 43/43 legs verdict-identical (ok +
error-prefix + output-shape, verdictDiffs=0; decl + verdict table also
byte-stable). One pilot run preceded the filed pair and is reported
honestly below (fixture-root correction). No live process survived; no
stray files (session/default/api roots re-verified clean, FX removed).
EVIDENCE=tmp/wiring-audit/trunk_net.mts + trunk_net_run{A,B}.json +
trunk_net_run{A,B}.log + trunk_net_run1.log (pilot) +
compare_net_runs.py (this worktree; A/B filed)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-024.md (language_runtimes LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands with effect note)

network_api = api_tester, google_account, html_extract, http_fetch,
inspect_api, payments_create_checkout_session, rss_fetch, search_api,
search_public_apis, search_text, swagger_docs, validate_api (12). All
12 exist in the live registry. 0/12 are task-level checkers. EFFECT
ASYMMETRY (proven live, not a membership challenge): search_text and
swagger_docs NEVER touch the network (local grep / local file
generator) while the other 10 are network-or-credential tools — same
trunk, opposite I/O effects. Purpose-merge stands; the matrix rows
carry the asymmetry. CORRECTION to 024's header: 024 wrote "14/19"
for 132 tools, but 132 tools = 15 merge trunks by membership
(163-4-12-2-10-7=128 before language_runtimes, 128+4=132 with it).
This checkpoint stories the 16th trunk (144 tools); 3 trunks remain
(media_images=2, planning_orchestration=10, memory_knowledge=7).

## New findings (all Muse-branch @ 70ca099d)

### F189. http_fetch/html_extract/rss_fetch have NO URL policy; non-http shapes reach fetch (LIVE 2x, P1-016 NEW)

hf.filescheme {url:'file:///etc/hostname'} -> ok:false + 'fetch
failed' BOTH runs: the tool passed a file: URL to fetch and only
undici's own scheme support rejected it — ZERO tool-level validation
(ContentTools.ts:24-38 has no scheme/host check; html_extract
:53-88 and rss_fetch :101-120 likewise). Contrast api_tester's
explicit ^https?:// guard (ApiTesterTool.ts:44-46, live-proven F191)
and api-discovery's assertSafePublicUrl (network-policy.ts:36-49:
scheme + credential + internal-host + private-IP + DNS-rebinding
checks) — the IN-REPO precedents this family ignores. Consequence
(code-certain, never live-probed): http://link-local/metadata or
intranet URLs reach fetch and return a 1000-char snippet — an SSRF
read surface. Rate 60/min on http_fetch + priority-listed
http_fetch/html_extract widen the exposure (F199 note). Repair
direction (batch P1-016): apply one shared URL policy (at minimum
the api_tester scheme rule; preferably the assertSafePublicUrl
class) to all three tools + rss limit sanity; regression asserts
file:/internal shapes refused pre-fetch with a sentence + honest
sync-reject shapes preserved.

### F190. rss_fetch failure cause is LOST: empty-message AggregateError -> gateway substitution (LIVE 2x, EXTEND P2-005)

rss.empty/rss.garbage -> ok:false + 'Tool reported failure without
an error message' BOTH runs, output null, zero tool logs. Mechanism
RESOLVED by a direct no-network parser probe: rss-parser
parseURL('') and parseURL('not a url at all') both throw
AggregateError with EMPTY message (typeof object, no I/O — sync
reject); the tool's catch yields error: e.message = '' (falsy), so
the ToolService wrapper substitutes the generic sentence
(ContentTools.ts:116-118). 5th instance class for WIRING-P2-005
(after batch-1/2 absences, 013/F76 substitution, 014/F83 variance,
016/F102 engine exitCode): here the cause dies INSIDE the
dependency's throw shape, not below the tools. Bonus gap in the
same tool: inputSchema required:['url'] is NEVER enforced — {}
reached the parser (no 'url required' guard unlike its two
ContentTools siblings) — decorative-required instance for P2-004.
Repair rides P2-005: tool must surface a cause-bearing sentence
(String(e).slice + parser error aggregation) and enforce the url
guard; regression asserts ok:false WITH a specific error.

### F191. api_tester guards are honest; method is decorative-required (LIVE 2x, P2-004 + #20)

at.empty -> 'api_tester needs a url to call.'; at.noscheme/at.ftp ->
'api_tester needs an http(s) url' with the offending value quoted;
at.nomethod (no method key) reaches the SAME scheme check — proving
required:['url','method'] does not gate execution (method defaults
to GET at :47). Decorative-required instance for P2-004 (live 2x).
The scheme guard itself is the CORRECT in-repo pattern F189 cites.
Consumer note: the tool's honest ok-shape carries numeric
output.status (200/404...), which the verdict mapping misreads —
rides MISMATCH #20 (F192), not a tool defect.

### F192. MISMATCH #20 NEW: verdict mapping misreads numeric HTTP status as workflow status (pure function + source shapes)

'fetch ok-shape' {ok:true, output:{status:200}} => incomplete;
'tester ok-shape' {ok:true, output:{status:200}} => incomplete.
Root: verificationResultFromToolResult reads output.status through
a WORKFLOW vocabulary (:656, :663 — only
completed/passed/success/succeeded/ok pass; anything else truthy =>
incomplete). HTTP 200 is a correct, honest tool field — the CONSUMER
reinterprets it as "not finished". Mechanistically DISTINCT from
the #13/#14/#15 output-boolean blindness (there the mapping ignores
flags; here it misreads a present field through the wrong
vocabulary), hence a new number. Every http_fetch/api_tester
success receipt maps incomplete. Repair direction (batch P2-042):
the mapping must not treat numeric status as a workflow word
(type-gate the status vocabulary, or prefer ok + output
success/valid/health booleans); regression pins 200-shape =>
passed and preserves genuine incomplete shapes.

### F193. Output-boolean blindness EXTENSIONS (no new number, ride the #13 batch)

Two more table-proven instances of the #13/#14/#15 root (verdictOf
keys on ok/error-text/status-word and never reads output
semantics): 'validate unknown-shape' {ok:true, api:{health:
'UNKNOWN', healthDetail:'no_trusted_probe'}} => passed — an
UNVALIDATED API closes a check as passed; 'sw validate-fail'
{ok:false, output:{valid:false, issues:[...]}, NO error key} =>
incomplete — a decisive invalid verdict is understated because the
tool reports through output.valid instead of error. Same repair
batch as #13 (verdict must read output success/valid/health-class
fields); recorded here as shapes, not numbers, per audit
discipline.

### F194. Discovery-trio live behavior beyond guards is UNPROVEN (embargo-honest UNKNOWNs + code-cited design)

sp.empty -> 'query is required' (pre-service guard, LIVE 2x).
inspect_api/validate_api have NO pre-service guard: any call
reaches ensureLoaded -> provider.load({refresh:true}) on a cold
registry -> axios.get to raw.githubusercontent.com (8s timeout)
— so ZERO live legs under the network embargo. Code-cited design
notes (service.ts, public-apis-provider.ts): (a) graceful
degradation is REAL — refresh failure falls back to cache then to
a 5-entry vetted BOOTSTRAP, never empty; (b) cache write uses
tmp+rename atomicity (GOOD hygiene); (c) validate() short-circuits
to UNKNOWN with NO network when the entry has no probe profile
(:59-65) or probe credentials are absent (:66-72) — the honest
no-probe path behind F193's mapping note; (d) unknown inspect id
=> api_not_found, but only AFTER the cold refresh — first-call
latency/availability depends on the network even for misses.
No batch: design works as documented; owner live-checks with a
loopback-catalog harness if desired.

### F195. google_account: honest unconnected guard + guard order (LIVE 2x); gmail_send injection is code-cited (P2-044)

ga.empty/ga.unknown -> ok:false + 'google_not_connected' + helpful
bilingual message BOTH runs. Guard ORDER proven: unknown action
'explode' returns the CONNECTION error, never 'unknown_action' —
action validation happens after auth (honest direction: no oracle
for action names to unconnected callers). required:['action'] is
decorative ({} never yields a schema error) -> P2-004 instance.
Code-cited (NO live legs possible without OAuth — and gmail_send
must NEVER be live-probed since it sends real email):
GoogleAccountTool.ts:104-106 interpolates raw to/subject/body into
RFC822 headers — to/subject containing CRLF inject headers
(header-injection surface); sideEffects=[] despite gmail_send
(send-email is a side effect by any definition); max is clamped
1..25 (:63, positive). Repair rides P2-044: validate to as
single-address + strip/forbid CRLF in to/subject + declare
sideEffects + keep the guard order as the regression anchor.

### F196. payments: honest unconfigured gate (LIVE 2x, interlocked); amount/redirects unvalidated, side effects undeclared (P2-044)

pay.empty/pay.validshape -> ok:false + 'stripe_not_configured' +
setup sentence BOTH runs, with STRIPE_SECRET_KEY verified absent
(interlock held; legs would have been SKIPPED otherwise since a
valid shape + present key attempts a REAL Stripe call).
required:['amount','productName'] decorative: {} and the valid
shape yield BYTE-IDENTICAL errors -> P2-004 instance. Code-cited:
amount is never validated (NaN/negative/zero reach
Math.round(amount) -> Stripe); success_url/cancel_url are
unvalidated strings (merchant-redirect surface); sideEffects=[]
for a FINANCIAL tool — self-admitted at PaymentsTool.ts:54
("Financial actions are side effects, but not in strict type
yet"). Repair rides P2-044 with F195 (same credential-tool
hardening area): positive-amount validation + URL validation +
sideEffects declaration; regression keeps stripe_not_configured
as the no-key anchor.

### F197. POSITIVE: search_text is exact, contained, and session-rooted (LIVE 2x)

st.fixture/st.pattern-alias -> ok:true + total:1 +
{file:'grepme.txt', line:2, token-bearing text} BOTH runs (the
pattern alias satisfies the requiredAny contract live);
st.badregex -> 'bad_regex: ... Unterminated group'; st.empty ->
needs-a-query sentence; st.outside ('../..') ->
'path_outside_workspace' (UtilityTools.ts:17-32 containment
HOLDS). Session-root attribution proven by the pilot: the same
token file under the session-agnostic default root scanned 0
files, while the session-root copy matched — the tool resolves
through the auto-assigned session workspace, not the default
root. Membership note: a LOCAL grep that never touches the
network (trunk effect asymmetry, cf. F181). No batch.

### F198. swagger_docs: honest core, uncontained paths, raw-title HTML, TypeError leg (LIVE 2x, P1-015 + P2-043)

sw.generate -> ok:true + endpointCount:3 (2 regex-scanned
GET+POST /fxitems from the fixture routes.ts + 1 manual /manual),
spec + swagger-ui.html byte-verified on disk; sw.validate ->
{valid:true, issues:[]}; sw.validate-missing/addendpoint-missing
honest not-found sentences; sw.serve instructions; sw.unknown/
sw.noaction honest. Three defects: (a) UNCONTAINED PATHS —
generate/addEndpoint/validate call raw fs with input paths
(SwaggerDocsTool.ts:129-177, :249-267, :280-285): no
resolveToolPath anywhere, defaults './src' and './docs/
swagger.json' are cwd-relative (api/ in production). LIVE proof
is contained (explicit absolute FX path honored); outside-write
reach is code-certain — owner live-checks with a
fixture-owned outside dir (same protocol as F179). P1-015 NEW.
(b) TITLE RAW INTO HTML — 'fx<b>net' appears byte-verbatim in
swagger-ui.html (generateSwaggerHTML :339-362 interpolates
without escaping) — generated-file XSS hygiene. (c) sw.
addendpoint-nomethod -> raw TypeError "Cannot read properties of
undefined (reading 'toLowerCase')" (:260, ep.method unguarded) —
error-hygiene family (F183-class). (b)+(c) + code-cited scan
hygiene (scanRoutes :203-244: unbounded recursion, statSync
follows symlinks, scans dist/ .js since only node_modules +
dotfiles are excluded) ride P2-043. Repair: session-anchor all
paths + escape title + validate method/path + bound the scan;
regressions pin FX landing + refusal + sentence-errors.

### F199. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 12/12, ALL rank-1 on the self-name goal —
the strongest self-grounding of any trunk so far (no rank-7
stragglers as in F186). Priority-listed: http_fetch,
html_extract, search_api — arbitrary-URL fetch + web search on
the priority surface: least-privilege review note (same class as
F186's execute_python note; the F189 missing URL policy makes
this instance sharper). 0/12 ROUTER_EXCLUDED. Rate limits: tester
30, discovery-trio 20 each, google 20, payments 10, fetch-family
60/30/default-60, search_text/swagger default-60 (rss_fetch,
search_text, swagger_docs declare NO explicit limit and ride the
60/min default). Boot permission-default list UNCHANGED at 21;
rate-default list UNCHANGED at 2 (central_answer,
web_page_builder). 0/12 checkers of any level (checker set stays
14 task-level + project_run live-gate-only).

### F200. Verdict table + consumer notes (MISMATCH #20 + #13-rides)

23 shapes: all 15 guard shapes => failed (correct, incl. the rss
substituted-shape: substitution preserves DIRECTION, loses cause
— P2-005); extract/rss-ok, tester-4xx, inspect-notfound,
google/pay guards, st-match, sw-generate/unknown map correctly.
Three consumer defects: fetch-ok/tester-ok => incomplete
(MISMATCH #20 NEW, F192); validate-unknown => passed and
sw-validate-fail => incomplete (ride #13, F193). No
EXECUTABLE_NOT_VERIFIABLE addition: 144/144 swept tools remain
verdict-mappable — #20 joins as a mapping defect, not an
unmappable tool (same standing rule as #13-15).

### F201. Positives: guards, bytes, hygiene, cleanup (LIVE 2x)

9 tools with honest pre-network/config guards (fetch/extract/
tester/search/discovery/google/pay/search-text/swagger);
swagger spec round-trips through its own validator;
search match byte-exact; catalog cache tmp+rename + vetted
bootstrap (code-cited); gmail max clamp 1..25 (code-cited);
tester scheme guard as the in-repo precedent; no
approval-gate pre-emption on any leg; '[ToolService]
Auto-assigned workspace context: session-audit-sess' fired
(context propagation visible); cleanup=ok both runs; pilot +
A/B nodes all exit 0.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=16/19 fully storied (network_api 12/12 LEVEL-4 +
static verification-compat + checker-set 0/12) — 132 + 12 = 144
tools (024's "14/19" header corrected to 15/19 for 132 tools; see
membership note)
TRUNK_NET=12/12 SELECTABLE (all rank-1 self-name); 43/43 live legs
canonical 2x filed verdict-identical (verdictDiffs=0; decl +
verdict table byte-stable); 23-shape verdict table; fixtures
removed (session/default/api roots re-verified, FX removed)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=20 confirmed (NEW #20: verdictOf numeric-HTTP-
status misread F192; F193 shapes ride #13 without new numbers;
F189/F190/F195/F196/F198 are tool-local honesty/containment/
validation, same class as F113/F175/F155)
EXECUTABLE_NOT_VERIFIABLE=0 on 16 swept trunks (144/144 verdict-
mappable; #20 joins as mapping defect under P2-042)
CHECKER_SET=14 task-level + project_run live-gate-only (unchanged;
0/12 trunk task-level checkers)
P1_ITEMS=2 new (P1-015 swagger uncontained write F198a, P1-016
fetch-family SSRF surface F189)
P2_ITEMS=3 new (P2-042 status-vocabulary #20 F192, P2-043 swagger
correctness F198b/c/d, P2-044 credential-tool hardening F195+F196)
+ extensions to P2-004 (4 decorative-required instances: tester
method, payments amount/productName, google action, rss url) and
P2-005 (rss AggregateError empty-message instance)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-015 (swagger uncontained paths F198a): session-anchor
  projectPath/outputPath via the shared path util after P2-037 decides
  the ONE rule; reject traversal/absolute-outside with a sentence;
  regression asserts session-root landing + refusal + no api/ strays;
  owner live-checks outside-write reach with a fixture-owned dir.
- NEW WIRING-P1-016 (fetch-family SSRF F189): one shared URL policy
  (api_tester scheme rule minimum, assertSafePublicUrl class
  preferred) for http_fetch/html_extract/rss_fetch; regression asserts
  file:/internal refusal pre-fetch + honest sync-reject preserved.
- NEW WIRING-P2-042 (status vocabulary #20 F192): type-gate the
  verdict status vocabulary (numeric != workflow word) and/or prefer
  output success/valid/health booleans; regression pins 200-shape =>
  passed + genuine incomplete preserved.
- NEW WIRING-P2-043 (swagger correctness F198b/c/d): escape title
  into generated HTML; validate endpoint method/path with sentences;
  bound scan (depth + symlink + dist exclusion); regressions pin
  escaped bytes + sentence-errors + bounded scan.
- NEW WIRING-P2-044 (credential-tool hardening F195+F196): gmail_send
  to/address + CRLF validation; payments positive-amount + redirect-
  URL validation; sideEffects declarations for both; regressions keep
  the not-connected/not-configured anchors + new sentence negatives.
- EXTEND WIRING-P2-004 (decorative required): + tester method, +
  payments amount/productName, + google action, + rss url (all live
  2x this checkpoint).
- EXTEND WIRING-P2-005 (cause substitution): + rss AggregateError
  empty-message instance (live 2x + direct parser proof).
- EXTEND the #13 verdict batch with F193 shapes (validate UNKNOWN =>
  passed, swagger valid:false => incomplete).
- LIFTED nothing; embargoes hold (ALL live network legs, SSRF live
  payloads beyond sync-reject shapes, credentialed legs, gmail_send,
  Stripe calls, catalog refresh, model legs, outside-write live legs,
  live injection payloads).

## Working hypotheses (formed at source-read, before first run)

- 'all twelve selectable by self-name' — CONFIRMED rank-1 all (F199).
- 'fetch/extract/tester/search/discovery empties guarded' — CONFIRMED (F189/F191/F194).
- 'rss {} guarded like its siblings' — REFUTED: no guard, parser throw (F190).
- 'file: URL rejected by tool policy' — REFUTED: reached fetch, undici rejected (F189).
- 'api_tester enforces required method' — REFUTED: defaults GET (F191).
- 'payments {} differs from valid shape' — REFUTED: byte-identical config error (F196).
- 'google {} yields schema error' — REFUTED: connection error (guard order, F195).
- 'search fixture matches under default root' — REFUTED by pilot (scanned 0),
  CORRECTED to session root and CONFIRMED (F197).
- 'swagger generate round-trips' — CONFIRMED (spec validates, F198).
- 'swagger title escaped in HTML' — REFUTED: raw bytes (F198b).
- 'swagger addEndpoint validates method' — REFUTED: TypeError (F198c).
- 'validate UNKNOWN maps failed/incomplete' — REFUTED: passed (F193).
- 'fetch/tester ok-shapes map passed' — REFUTED: incomplete (F192).
- '0/12 checkers' — CONFIRMED (F199).

## Limits / UNKNOWNs

- 3/19 trunks still unstories: media_images=2 (image_studio boundary
  care — open security scope, coordinate before live project-entry
  legs), planning_orchestration=10 (NVIDIA-OWNED — do not story
  without coordination), memory_knowledge=7 (overlaps NVIDIA-claimed
  files — do not story without coordination). Suggested next:
  media_images=2 with fixture-contained legs only.
- F189 internal-host reach is code-certain but never live-probed
  (embargo); owner verifies refusal with loopback legs AFTER the
  policy lands (never before).
- F194 discovery-trio valid-input behavior (ranking quality,
  inspect content, probe outcomes) entirely UNPROVEN live.
- F195/F196 post-auth/post-config behavior (gmail list/send,
  Stripe session creation) UNPROVEN and UNPROVABLE in this env.
- F198a outside-write reach is code-certain; owner live-checks
  with a fixture-owned outside dir.
- search_api limit edge (negative/huge) unprobed (needs network
  items to observe slice behavior).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (probes perform zero source edits;
  CLI-BATCH1 review duty retained, no committed NVIDIA diff exists
  yet to review — main still e8fd9589, CLI work dirty/uncommitted).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: the sandbox CWD arrives as
`\?`-prefixed, which node cannot resolve relatively — reset the
process directory and invoke node with ABSOLUTE paths):
  [System.IO.Directory]::SetCurrentDirectory('D:\Joe\muse-worktree\api')
  $fx='<worktree>\tmp\wiring-audit\fx-net' (auto-created+removed for tmp)
  $env:TEMP=Join-Path $fx 'tmp'; $env:TMP=Join-Path $fx 'tmp'
  $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true'
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=Join-Path $fx 'store'
  $env:ARTIFACT_DIR=Join-Path $fx 'artifacts'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN and STRIPE_SECRET_KEY unset — the probe interlocks
  payments legs if a Stripe key is present)
  node D:\Joe\muse-worktree\api\node_modules\tsx\dist\cli.mjs D:\Joe\muse-worktree\tmp\wiring-audit\trunk_net.mts
Expected: 12/12 SELECTABLE rank-1; 43 legs, 7 ok (exact: hf 0/4,
hx 0/2, rss 0/2, at 0/4, sa 0/1, sp 0/1, ga 0/2, pay 0/2,
st.fixture + st.pattern-alias + st.fixture-compare, sw.generate +
sw.validate + sw.serve + sw.generate-compare; 12 compare-entries;
cleanup=ok); rss legs show
the substituted generic error; st.fixture total=1 line=2;
sw.generate endpointCount=3 + raw-title-true + nomethod-TypeError;
node process exits 0.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied (hence the fx tmp redirect); full trunk run ~1-2 min.
Compare filed runs: python tmp/wiring-audit/compare_net_runs.py
(exit 0, verdictDiffs=0).

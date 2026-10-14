# AGENCY Content Platform: Platform Strategy Audit and Remediation Plan (October 2026)

## Context
Michael asked for the Agency Ops Platform Strategy process to be run on the content platform (this repo, agency-review-portal), the same way it was run on agency-ops in September (`agency-ops/docs/ux-audit-2026-09.md`, `agency-ops/docs/process-gap-audit-2026-09.md`): criteria first, read-only audits of the platform as each user's working day, every data source and every output, a scorecard, then a phased plan with decisions locked and one PR per phase.

Five read-only audits ran on 14 October 2026 against the code on disk (main at `425ce6d`, which is the production deployment, plus the `lakeside-mobile` branch and its uncommitted hospitality fence), the live database (Supabase `bhiryqznxxjeynsqmyce`, read-only SQL) and the Vercel project (environment variable names, deployments, runtime errors). Nothing was changed. The four users: Michael as admin, Sam Quartly of Lakeside Brasserie on a phone, a B2B client on a Pro trial, and Markey's weekly AGENCY content run. The Lakeside trial went live on 14 October 2026.

**Verdict.** The hospitality loop built for Lakeside (home, approvals, write a post, library, staff link, weekly interview, weather post) is the best-built part of the platform and is close to whole. Everything around it is in worse shape than the ops platform was in September: a client of one company can read and overwrite another company's posts; self-serve signup and the trial emails have never worked; the B2B Strategise phase cannot save; most of what a B2B client can click calls an admin-only route; thirteen files still carry retired Claude model ids and the fallback chain hides it; the admin has no view of what is waiting across clients and no way to see what a client sees; and the portal's review of Markey's posts has no effect on what Markey publishes. The outcome we are aiming for is **a platform Sam can run her week from, that Michael can see as Sam sees it, that never shows one client another client's data, and that tells the truth about what each button does**. It is not a redesign.

## The criteria (each journey stage scored 1 to 5)
| # | Criterion | Test |
|---|---|---|
| C1 | One front door | For this role, exactly one surface answers "what do I do next". |
| C2 | Act where you see it | An item on a summary can be approved, edited or dismissed in place. |
| C3 | Handoff continuity | Setup feeds generation, photo feeds post, post feeds approval, approval feeds export, with no re-keying. |
| C4 | Truthful controls | Every button does what its label says and nothing else. A route that 404s on a retired model id, a missing key or a free-tier quota is an untruthful control, whether or not a fallback hides it. |
| C5 | Findability and fences | Every page is reachable from its menu or parent. No duplicate pages for one job. A user never lands on a page for a role, pack or plan they do not have. An admin can see what a client sees. |
| C6 | Honest state | Loading, empty and error states exist; nothing fails silently; an AI failure is surfaced to the person who needs to act. |
| C7 | Consistency | Plain words for the reader, British English, one visual language, and no vendor or model names shown to a client. |
| C8 | Phone | Works at 390px, one-handed, without drag, with 44px targets. Weighted for Sam, lightly for Markey. |

Two platform-level checks sit above the stages and are pass or fail, not scored: **tenant isolation** (every read and write is scoped to the caller's company) and **provider truth** (every AI call uses a live model id on a key that exists, and the record says who actually wrote).

## Facts from the live platform (14 October 2026)
- **Six companies, four users.** AGENCY Bristol (agency plan, b2b), Star Linen UK, Believe Digital, BCB Medical, a "Quality Sweep Test Co" left over from April, and Lakeside Brasserie (pro, hospitality, created 14 October). Two users are Lakeside clients. The two admins are Michael (no company) and a test admin attached to the test company.
- **Seventeen content pieces in total, all AGENCY's own**, last written 28 September. Thirteen pending, three approved, one with changes requested. No client company has ever generated a piece in the portal.
- **Generation jobs: 29 completed, 55 failed.** Publishing jobs: five, two failed. No LinkedIn connections. No weather runs yet. 77 approved photos, all AGENCY's own.
- **Support tickets, comments, review documents, strategy sessions, slot briefs, week ecosystems, story bank: all empty.**
- **Production environment** holds Supabase, Anthropic (sensitive, added 14 October), OpenAI (sensitive, known invalid), one Gemini key (`GOOGLE_GEMINI_API_KEY`, free tier), fal, Manus, LinkedIn OAuth, Resend, the encryption key, `CRON_SECRET` (added 14 October), the week-board flag, and seven `CONTENT_*` bridge variables. **It does not hold** any Stripe key or price id, Proxycurl, the website GitHub token, `GEMINI_API_KEY`, `SIGNUP_WEBHOOK_URL` or `PLATFORM_COMPANY_SLUG`.
- **No runtime errors in Vercel for the last seven days.** That is a measure of traffic, not health: the broken routes below have simply not been called.
- **Database and environment are ahead of main.** Migrations `native_ops_content` and `portal_ops_connector_export` (four `ops_content_*` tables with RLS on and no policies) were applied live on 11 October from the branch `codex/native-content-engine`, which is two commits ahead of main and twenty behind it. The seven `CONTENT_*` variables belong to it. No code on main reads either.
- **Migration history is loose.** The live `schema_migrations` table starts in May 2026; everything before was applied by hand. The repo has two files numbered 024, has 027 to 030 misfiled in `supabase/` rather than `supabase/migrations/`, and its 042 to 044 were applied live under the names 039 to 041. `strategy_*`, `support_tickets`, `post_analytics` and `project_milestones` exist live from the misfiled files. `profiles` and `company_members`, which the code writes to, do not exist at all.
- **Buckets:** `captures` and `content-drafts` are private; `content-assets` (no size limit), `media` and `renders` are public. Compliance documents are uploaded to the public bucket.
- **Unit tests: 484 pass.** Playwright smoke, a11y and UX suites exist but cover no `/admin` page. The API smoke test checks three routes by body length and cannot detect a provider fallback.

## Scorecard (current state)

### Michael, admin
| Stage | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | Headline |
|---|---|---|---|---|---|---|---|---|---|
| Sign in and land | 1 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | Password sign-in lands on /dashboard, magic link on /home. Two homes. |
| What is waiting across clients | **1** | 2 | 2 | 3 | **1** | **1** | 3 | 2 | Only pending drafts are counted. Photos, tickets, trial expiries, failed jobs have no summary anywhere. |
| Open a client, fix setup | 2 | 3 | 2 | **1** | 2 | 3 | 3 | 3 | Company tabs ignore the pack. Setup AI routes call a model id the code itself marks retired. |
| See what a client sees | **1** | **1** | **1** | 2 | **1** | 2 | 2 | 2 | No view-as. Admins skip every fence, so Michael cannot see Sam's screens. |
| Plans, users, invites, tickets | 2 | 3 | **1** | 2 | 2 | 2 | 3 | **1** | Existing users cannot be edited. Failed saves are swallowed. Tables clip on a phone. |
| Two admin trees | **1** | 2 | **1** | 2 | **1** | 3 | 2 | **1** | 13 of 15 legacy /admin pages are not in the sidebar; most duplicate a page in (app). |

### Sam, Lakeside Brasserie, on a phone
| Stage | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | Headline |
|---|---|---|---|---|---|---|---|---|---|
| Invite and first login | 4 | 4 | n/a | 3 | 3 | 2 | 3 | 3 | Lands on /home. Login opens on a password she never set. Raw Supabase errors. |
| Home and sidebar | 5 | 4 | 4 | 4 | 2 | 2 | 4 | 3 | Good front door. "Brand" leads into the B2B setup checklist. |
| Waiting for you | 4 | 3 | 4 | 3 | 4 | 3 | 4 | 2 | Approve and edit work. Staff photos are judged on another page. No unapprove. |
| 07:00 weather post | n/a | 3 | 4 | 3 | n/a | **1** | 4 | n/a | Timing holds in BST and GMT. A failed draft is silent. |
| Write a post | 4 | 2 | 3 | 3 | 4 | 3 | 4 | 3 | She cannot choose the photo, the date or the time. |
| Library and staff link | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | Solid: HEIC, resumable upload, tags, rate limits. Approve and Reject are 24px tall. |
| Talk through the week | 4 | 4 | 4 | 2 | 4 | 3 | 4 | 2 | iPhone webm recording is doubtful. A key failure is blamed on her audio. |
| Calendar, Weeks and export | 2 | 2 | 3 | **1** | **1** | 3 | **1** | **1** | B2B pages: LinkedIn icons, "Publish to LinkedIn", a drag-only seven-column calendar, "Metricool" named. |
| Settings | 3 | 3 | n/a | 2 | **1** | 3 | 2 | 3 | She can switch her own venue to B2B, which removes the fence. |
| Fence, billing, help, notifications | 2 | 2 | n/a | **1** | 2 | 2 | **1** | 3 | Fence catches typed addresses only. Upgrade is dead. Help chat knows LinkedIn only. In-app notifications never show. |

### B2B client, Pro trial
| Stage | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | Headline |
|---|---|---|---|---|---|---|---|---|---|
| Signup, first login | 2 | 3 | 2 | **1** | 2 | 2 | 4 | 3 | Self-serve signup writes to a table and a column that do not exist. Trial emails never send. |
| Setup | **1** | **1** | 2 | **1** | **1** | 2 | 2 | 3 | Clients see every tab but every save is admin-only. |
| Strategise | 2 | 2 | **1** | **1** | 3 | 2 | 4 | 3 | The interview sends `currentStep`, the route demands `step`. Two routes it calls do not exist. |
| Plan | 3 | 2 | 2 | 2 | 2 | 3 | 4 | 2 | Schedule edits are admin-only. Seven-column grids on a phone. |
| Create | 2 | 3 | 2 | **1** | 2 | 2 | **1** | 3 | Quick Post works through a silent fallback. Week Batch and Article call admin-only routes. |
| Review | 2 | 2 | 3 | **1** | 2 | 2 | 2 | 3 | Inline approve calls an admin-only route and shows "Not saved". Regulatory review leaks across companies. |
| Publish | **1** | **1** | 2 | **1** | **1** | 2 | 2 | 3 | "Publish" is admin-only or export-only. `can_publish` is never enforced. |
| Analytics | 3 | 2 | 3 | 3 | 3 | 3 | 4 | 3 | Read-only; Poll is admin-only and reads only portal-published posts. |
| Plan gating and trial | 2 | 2 | 2 | **1** | 2 | 2 | 4 | 3 | Copy says "moves to Free", code gives Starter. Stripe is unconfigured. |
| Help and notifications | 4 | 4 | 3 | 4 | 4 | 3 | 4 | 4 | Works on a current model. |

### Markey, the weekly AGENCY content run
| Stage | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | Headline |
|---|---|---|---|---|---|---|---|---|---|
| Planning | 2 | 3 | 2 | 2 | 2 | 4 | 2 | 2 | Two plans (Drive and Week Board). `slot_briefs` and `week_ecosystems` are unused. |
| Generation | 2 | 3 | 3 | **1** | 3 | 3 | 2 | 2 | Week Board to Mac run is the strongest join in the platform. Job rows say Claude when Gemini wrote. |
| Media | 2 | 3 | 3 | 2 | 2 | 3 | 2 | 2 | The Bank feeds the runner. Four orphan admin pages. |
| Review | **1** | 3 | 2 | 2 | 3 | 2 | **1** | 2 | The Mac writes pieces as pending and never reads approval back. |
| Publish | **1** | 2 | **1** | **1** | 2 | 2 | **1** | 2 | One CSV per company, no BOM, 08:26 default time. Website publish has no token. |
| Analytics | 2 | 2 | **1** | 2 | 3 | 2 | 2 | 2 | Polls only posts the portal itself published, so nothing for Markey's feed. |

### Platform checks
| Check | Result |
|---|---|
| Tenant isolation | **Fail.** Four routes (below). |
| Provider truth | **Fail.** Thirteen files carry retired ids; the chain records the wrong provider; the Gemini key is free tier; the OpenAI key is invalid. |

## Findings, with evidence

### Tenant isolation and security (verified in source)
1. **Regulatory review reads and writes across companies.** `src/app/api/review/regulatory/route.ts:113-125` loads `content_pieces` by `weekId` or `pieceIds` with the service-role client and never filters on `company_id`, after passing `requireCompanyUser(companyId)` for a different id. It writes `regulatory_status`, `regulatory_score` and `regulatory_review` back at `:320-338`. Any client can read another company's posts and overwrite their compliance record.
2. **Overlay writes an image onto any piece.** `src/app/api/generate/overlay/route.ts:118-142` never checks that `contentPieceId` belongs to `companyId`.
3. **Any signed-in user can read any generation job**, including input and output payloads and error text (`src/app/api/generate/status/[jobId]/route.ts:42-64`). Needs a leaked UUID.
4. **LinkedIn OAuth callback has no authentication and no nonce.** `state` is the bare company id (`src/app/api/auth/linkedin/callback/route.ts:18-25`), so anyone can bind their own LinkedIn token to any company.
5. **Voice transcription has no sign-in check** and runs on the platform's keys (`src/app/api/generate/transcribe/voice/route.ts:8`).
6. **Transcription can borrow another tenant's key.** `src/lib/providers/transcription/transcribe.ts:56-66` falls back to any company's active Gemini key with no company filter.
7. **`can_publish` is never enforced by an API.** `publish/linkedin-direct` and `publish/bluesky` let any member post from Quick Post; both fetch caller-supplied image URLs server-side.
8. **Trial-emails cron fails open** when `CRON_SECRET` is unset (`src/app/api/cron/trial-emails/route.ts:24-29`). `CRON_SECRET` also doubles as the staff-upload IP-hash salt, with the service-role key as fallback salt (`src/lib/staff-upload/access.ts:36`).
9. **Strategy share tokens are 12 hex characters** (about 44 bits), never expire, cannot be revoked, and are read with the service role on a public route (`src/app/api/strategy/generate-document/route.ts:117`, `src/app/strategy/[shareToken]/page.tsx:20-35`).
10. **Compliance documents go to the public `content-assets` bucket** (`src/app/api/compliance/documents/route.ts:118-119`).

### Broken paths that have never worked
- **Self-serve signup.** `src/app/api/onboarding/route.ts:39,74` reads and updates a `profiles` table; the table is `users`. `:60` inserts `trial_ends_at`; the column is `trial_expires_at`. Every marketing CTA (`src/app/(marketing)/page.tsx:188,560,585,606,636`, `pricing/page.tsx:98`) leads here. Google signup sends no company name and dead-ends on "Almost there, ask an admin" (`signup/page.tsx:96-97`, `auth/callback/route.ts:170-175`).
- **Trial emails.** The cron selects `trial_ends_at` (`cron/trial-emails/route.ts:44-46,101-103`). No warning or expiry email has ever gone out.
- **Stripe.** No key or price id in production; checkout also requires a `company_members` row that no table provides (`stripe/checkout/route.ts:39-46`), so every checkout is a 403. The webhook maps a Starter price to "free" (`stripe/webhook/route.ts:83-89`). `/upgrade` sends its main button to `/setup` (`upgrade/page.tsx:57-58`).
- **Strategise.** The interview sends `currentStep` (`src/components/strategy/StrategyInterview.tsx:269`), the route demands `step` (`src/app/api/strategy/interview/route.ts:100-101`), so every save is a 400. The last steps call `/api/strategy/suggest-pillars` and `/api/strategy/generate` (`StrategyInterview.tsx:352,396`), which do not exist. `strategy_completed` never becomes true, so /home nags for ever.
- **Week Batch for a client** calls `/api/post-types`, which does not exist (`src/app/(app)/generate/page.tsx:300`), and five admin-only routes.
- **Website publish** returns 503 because `WEBSITE_GITHUB_TOKEN` is not in production (`publish/website/route.ts:94-101`).

### Provider truth
- **Retired ids still in code:** `claude-sonnet-4-20250514` in `src/lib/providers/content-generation/anthropic.ts:34`, `content-adaptation/claude-util.ts:2`, `api/generate/repurpose/route.ts:132`, `generate/translate/route.ts:115`, `review/regulatory/route.ts:278`, `setup/scan-linkedin/route.ts:101,152`, `setup/voice-analyse/route.ts:123`, `config/strategy/route.ts:274`, `generate/broll/route.ts:169`, `generate/report/route.ts:130`, and `scripts/seed-agency-bristol.mjs:292,299` (which writes it into `company_api_configs`, overriding code defaults). `claude-3-5-haiku-20241022` in `anthropic.ts:35`, `generate/voice-score/route.ts:16` and `image-generation/prompt-enhancer.ts:17`. `claude-opus-4-20250514` in `anthropic.ts:33`. `claude-haiku-4-20250514`, which is not a model id at all, in `src/lib/generation/content-intelligence.ts:209`, so every quality gate "passes by default" (`:386-390`).
- **What the user sees:** scan-linkedin, voice-analyse and broll return raw 404 text or a 500; config/strategy swallows the error, saves zero themes and topics and marks the step done (`:345-352`); report shows a generic fallback paragraph; prompt-enhancer silently returns the raw prompt; every writer path through `callClaude` falls back to Gemini 2.5 Pro (quota zero on the free key), then Flash (20 calls a day, shared with the hospitality writers and the tagger), then GPT-4o (invalid key), while the job row still records `provider: anthropic_claude` (`generate/content/route.ts:185`).
- **Only two call sites are current:** `generate-text.ts:42` (`claude-sonnet-5-5`, no temperature, thinking off, structured output) and `vision/tag-image.ts:42` (`claude-haiku-5-5`). `generateText` tries Gemini Pro first and always fails over, which wastes one call per request; its header comment says Claude is primary (`:4,161`).
- **Four names for the Gemini key** (`GOOGLE_GEMINI_API_KEY`, `GEMINI_API_KEY`, `Gemini`, `GEMINI`); `image-routing.ts:80`, `generate/quick/route.ts:642,706` and `transcribe/voice/route.ts:22` each read a subset. Production has only the first. `FAL_AI_API_KEY` and `MANUS_API_KEY` are in production but nothing in `src` reads them; image providers take keys from `company_api_configs` only.
- **Vendor and env names shown to clients:** `PROXYCURL_API_KEY` (`setup/[companyId]/people/page.tsx:331-333`, `spokespersons/enrich/route.ts:29-32`, `setup/quick/route.ts:35-37`); "ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY" (`review/regulatory/route.ts:147`); "Check your Anthropic API key" (`generate/page.tsx:674`); "Claude will extract" (`setup/[companyId]/strategy/page.tsx:235`); "Anthropic Claude", "OpenAI GPT-4" (`api-keys/page.tsx:82-95`); Metricool (`publish/page.tsx:727`, `review/[weekId]/page.tsx:151,204`, `MetricoolExportButton.tsx:87`); raw provider error bodies from broll, scan-linkedin, transcription and regulatory review.

### Michael, admin
- **Two homes.** `/` goes to /home (`middleware.ts:93-98`), /login goes to /dashboard (`:102-104`), password sign-in goes to /dashboard (`login/page.tsx:40`), magic link to /home (`auth/callback/route.ts:43,64`). /dashboard is on the hospitality blocklist, so a hospitality user who signs in with a password lands on /not-available. /dashboard shows the admin an arbitrary company (first alphabetically, `dashboard/page.tsx:211-217`), links "Review Content" to `/content`, which 404s (`:564`), and links to `/generate/studio`, which is permanently redirected (`next.config.ts:6`).
- **No cross-client view of what is waiting.** /home counts pending drafts only (`home/page.tsx:64-65`). Pending photos are counted only for a hospitality client's own company (`(app)/layout.tsx:71-78`). Tickets appear only on /admin/tickets. Trial expiries are computed only for client users (`layout.tsx:67`). Failed generation jobs appear only on the orphan /admin/generate (last ten). Failed publishing jobs appear only per selected company on /publish.
- **The layout's agency-id injection never reaches a page.** `(app)/layout.tsx:96-99` mutates its own copy of the profile; `getUserProfile` is uncached (`lib/supabase/server.ts:38-53`), so every page reads `company_id` null for the admin.
- **Company tabs ignore the pack** (`CompanyTabs.tsx:7-20`): Lakeside gets Strategy, Topics and Blueprint; a B2B client gets "Venue and posting". Brand-style and image-mapping are reachable only from overview cards.
- **No view-as.** Admins skip the menu branch (`Sidebar.tsx:89,91`), plan locks (`:368`), complexity filters (`:347`), the hospitality home (`home/page.tsx:31`) and the layout fence (`layout.tsx:82`).
- **Plans page** offers Free, Pro and Agency while Starter exists as a tier (`(app)/admin/page.tsx:15-60,106`, `config/company/route.ts:22`, `Sidebar.tsx:24`); a failed list load shows an empty list. **Tickets** carry no company id and a failed status save is invisible (`TicketsTable.tsx:6-25,63-80`). **Users** page cannot edit role, `can_publish` or company for an existing user (`users/page.tsx:54,94`). Both tables sit in `overflow-hidden` and clip at 390px.
- **Two admin trees under one URL segment.** `src/app/(app)/admin/{page,tickets}` and `src/app/admin/*` with its own layout (`src/app/admin/layout.tsx`) that renders the plain fixed-width sidebar with no drawer, no pack and no logo. Of the fifteen legacy pages, thirteen are not in the sidebar; `/admin/companies/*` (six pages) duplicate `/setup/[id]/*`, `/admin/users` duplicates `/users`, `/admin/publish` duplicates `/publish`, `/admin/generate` and `/admin/generate/batch` duplicate `/generate`, and `/admin/upload` and `/admin/video` are orphans. The LinkedIn callback still redirects into the legacy tree when `returnTo` is missing (`api/auth/linkedin/route.ts:128,137`); the flows started from /publish and Quick Post do not pass it.
- Sidebar "Brand & People" goes to /settings, which redirects admins to /setup, duplicating "Companies" (`Sidebar.tsx:154`, `settings/page.tsx:8-9`).

### Sam, Lakeside Brasserie
- **What works.** Hospitality home with 44px cards (`HospitalityHome.tsx:56,94`); the drawer (`ResponsiveSidebar.tsx:61,107-119`); Approve saves edits first (`ApprovalCard.tsx:37-49`); HEIC conversion in a worker (`lib/upload/heic.ts:31-52`); resumable 6 MB chunks with token renewal (`tus-upload.ts:30-73`); camera from `image/*` (`UploadPanel.tsx:66`); tagging Flash then Haiku 5.5 with a plain failure message (`media/register/route.ts:244-246`, `MediaBank.tsx:361-364`); the staff page with one big button and fail-closed rate limits (`StaffUploader.tsx:47-56`, `rate-limit.ts:9-24`); the price and glued-digit checks (`generate.ts:69-87`); the weather cron at 04:00 UTC drafting a day ahead, so 07:00 London holds in both seasons (`home.ts:9-13`, `draft-post.ts:71-72,92`), behind `CRON_SECRET` which fails closed.
- **Where her day breaks.**
  - The sidebar's "Weeks and export" is the B2B Content Review page: "Plan Next Week" goes to /generate, guidance says "published to LinkedIn" (`review/page.tsx:92-97,132`); the week page has an admin-only "Strategy Report" that opens raw "Unauthorized" in a new tab and a "Publish to LinkedIn" button (`review/[weekId]/page.tsx:142-148,207-216`). The calendar reschedules by drag only (`ContentCalendar.tsx:661,967`), is a seven-column grid (`:1063`) and shows LinkedIn icons (`:436,1191`).
  - "Brand" goes to /settings, then /setup/[id], the B2B setup checklist with Platform Complexity, a LinkedIn URL prompt and "API Keys" (`settings/page.tsx:12-13`, `setup/[companyId]/page.tsx:77-79,101,189-209`).
  - She can switch "What kind of posts" to Business to business herself (`VenueSettings.tsx:70-80`, `settings.ts:47-49`), which turns the fence off.
  - A failed weather draft is recorded as `failed` and nothing else happens: no email, no notification, no retry (`draft-post.ts:116-120`). Home keeps promising the next post (`home.ts:57-66`). Nothing reads `weather_post_runs`.
  - Write a post never sends a photo, a date or a time (`HospitalityQuickPost.tsx:34`); the route defaults to today at 12:00 even at 15:00 (`hospitality/quick/route.ts:55-56`); a save failure is an unhandled 500 (`:87`).
  - The amber "waiting" circle counts posts only; staff photos waiting read as 0 (`HospitalityHome.tsx:45`). Photos are judged on /library with 24px Approve and Reject buttons (`MediaBank.tsx:291-292`). Menu rows are about 36px (`Sidebar.tsx:396`).
  - The interview recorder asks for `audio/webm`, which older iPhone Safari cannot record (`WeeklyInterview.tsx:31-37`); after a Gemini failure and the invalid OpenAI key she is told "We could not make out the recording" (`week-plan/route.ts:70-72`).
  - The export is per week while weather posts are approved daily; a re-export repeats posts already imported. Nothing tells her where the file goes. With no networks set, it falls back to LinkedIn (`lib/export/networks.ts:23`).
  - The trial banner links to /pricing, which sells LinkedIn publishing (`TrialBanner.tsx:30`). The help chat prompt describes LinkedIn only (`api/chat/help/route.ts:12-61`). In-app notifications are written (`notify.ts:24`) but only /dashboard shows them, and /dashboard is fenced. The login page opens in password mode (`login/page.tsx:10`) and shows raw Supabase errors (`:37,50`). The tab title reads "Quick Generate" (`generate/quick/page.tsx:7`).
- **The uncommitted fence** (`src/lib/hospitality/b2b-only.ts`, `pack-guard.ts`, eight `refuseHospitality` calls in seven routes, `x-pathname` from middleware, `/not-available`) is the right shape and still misses: in-app link clicks, because a shared layout does not re-run on soft navigation (needs a browser check); `/setup/*`, `/content/*`, `/review/*` and `/upgrade`; the client-callable routes `setup/quick-strategy`, `generate/voice-score`, `carousel`, `quick-image`, `publish/linkedin-direct`, `publish/bluesky`, `review/regulatory`; the client's own ability to change `post_pack`; and /login to /dashboard, /pricing and the help prompt.
- **The LinkedIn-only-hidden-for-hospitality gap** is a symptom of keying visibility on `post_pack`. A B2B client with no LinkedIn account connected sees the same LinkedIn pages and buttons. Visibility should follow what the company has connected and what pack it writes, not the pack alone.

### B2B client
- **Setup is read-only for clients while looking editable.** Blueprint, API Keys, URLs and social accounts are admin-only for every method (`config/urls:5`, `blueprint:9`, `api-providers:11`, `social-accounts:10`). Voice, topics, spokespersons, signoffs, schedule and strategy allow GET and refuse writes (`config/voice:54`, `topic-bank:43`, `posting-schedule:56`). The pages do not hide save.
- **Create.** Week Batch, Article (`ArticleForm.tsx:82` to admin-only `generate/blog`), Meme and Mini infographic (`production:"mac"`, `post-types.ts:372,392`, hitting admin-only `/api/admin/single-post`) all fail for a client. Quick Post works through the fallback chain.
- **Review.** `/review` renders `InlineApproveButtons` (`review/page.tsx:181`) that call admin-only `content/approve` (`approve/route.ts:15`) and show "Not saved". `/content/[id]` approves directly under RLS and works (`ApprovalButtons.tsx:29-35`). Two paths that disagree.
- **Publish.** "Connect LinkedIn" is a plain link to an admin-only route, so the client sees raw JSON 401 (`social/page.tsx:243`, `auth/linkedin/route.ts:55-57`). /publish calls three admin-only routes and its own copy says "Jobs are currently queued only" (`publish/page.tsx:727`), while /upgrade promises direct LinkedIn publishing (`upgrade/page.tsx:18`). The sidebar shows Publish to non-publishers because `item.minPlan` is truthy (`Sidebar.tsx:346`).
- **Plan gating has two sources.** Only /calendar, /compliance and /generate check the plan at route level; /publish, /analytics and /plan/weekly rely on the sidebar. At expiry the effective plan falls to `starter` (`get-effective-plan.ts:14-21`); pricing says Free (`pricing/page.tsx:134`). Every trial is seven days in code; nothing says fourteen.
- **Duplicate setup surfaces:** voice in four places, strategy in four, topics in three, schedule in three, social connections in four, home in two, piece detail in three, upgrade in three.

### Markey
- **Ownership.** The Mac runs the week end to end (`markey.md:340,357,537,1581`): Slack interview, `production_runner.py`, photos, two Metricool CSVs with a BOM and separate brands, website blog, newsletter. The portal does two real jobs: the Week Board queues a `weekly_production` job that `job_bridge_poller.py` runs (lease, orphan sweep, heartbeat, 4-second polling with `last_error`, the strongest join in the platform), and `portal_writeback.py:191` writes the Mac's posts into /review as `pending`. **Nothing on the Mac reads `approval_status` back.** The poller comment claims the blog and PDF are "approved in /review before Phase B publishes them" (`job_bridge_poller.py:809`); no code enforces it. A portal approval has no effect on what ships.
- **Export disagrees with the process.** One CSV per company (the process needs the MCT personal profile and the AGENCY page as separate brand files, `markey.md:795-797`), no BOM (`markey.md:2767` requires one), `scheduled_time` never set by the write-back so every post lands at the 08:26 default (`metricool-row.ts:168-170`, `markey.md:68` forbids it), Pinterest and YouTube always false, brand name always empty.
- **Two plans.** `calendar_slots` reach weeks only when `seed-weeks-from-slots.sql` is run by hand; Week Batch reads `posting_slots`, not `calendar_slots` (`generate/week/route.ts:84`); `slot_briefs` and `week_ecosystems` have no reader or writer.
- **markey.md is stale on its side too:** blogs to Wix (`:1507,1510`), Substack deprecated (`:359`) while the portal syndicates to Substack and Medium (Medium no longer issues integration tokens; Substack has no public API), Manus "no longer used" while still offered (`providers/index.ts:382,458`).
- **Flag.** `NEXT_PUBLIC_WEEK_BOARD_ENABLED` exists in production (value not decrypted); off, the board pages show "Not enabled" and the APIs 404. `/admin/bank` is not gated. The launchd poller is installed, so the board is in use.
- **Analytics** polls only `publishing_jobs` the portal published (`analytics/poll/route.ts:23-28`); Metricool-scheduled posts have no URN, so Markey's feed shows nothing.

## Decisions (locked unless marked for Michael)
1. **Sam's trial comes first.** Nothing B2B that is broken ships to Lakeside; every B2B surface she can reach is either fenced or replaced with a hospitality page by Phase 1.
2. **Home is `/home`.** `/dashboard` becomes a redirect to `/home`; login, the auth callback and the welcome email all land on `/home`. The admin's `/home` becomes the cross-client "what is waiting" surface.
3. **One admin tree, inside `(app)`.** Week Board, Clips, Bank, Source Calendar and Slot Planner move under `(app)/admin/*` with the drawer layout; the ten duplicates and two orphans are deleted; `src/app/admin/layout.tsx` goes. The LinkedIn callback always returns to the `(app)` page.
4. **The operator sets the pack and the networks. A client cannot.** `post_pack` leaves Venue settings. Page and button visibility follow `post_pack` plus `companies.social_networks` (what is connected), not the pack alone, so LinkedIn-era pages are hidden for any company without LinkedIn.
5. **Fences live in middleware and in the route, never only in a layout.** Middleware reads the caller's pack once per request on B2B-only paths; every client-callable route that generates or publishes calls `refuseHospitality`.
6. **One provider module.** Every Claude call goes through `generate-text.ts` and `claude-util.ts` with `claude-sonnet-5-5` or `claude-haiku-5-5`, no temperature, thinking off. Order: Claude, then Gemini Flash. Gemini Pro and OpenAI leave the chain until a paid key and a valid key exist. Job rows record the provider that actually wrote. The seed script stops writing model ids.
7. **Metricool CSV is the publishing path for every client.** Direct LinkedIn and Bluesky publishing from a client click is switched off until the OAuth state and `can_publish` are fixed (Phase 3), consistent with the Lakeside decision of 14 October.
8. **Markey's run stays on the Mac; the portal is the review surface, and the review must count.** The Mac reads `approval_status` back before Phase B, or the write-back stops. *Michael to confirm read-back over Slack-only review.*
9. **Trial fallback is Starter, and the copy says so.** *Michael to confirm: pricing page says Free today.*
10. **Stripe stays hidden until the first paying client.** Upgrade and billing links point at a "talk to us" page, not checkout. *Michael to confirm.*
11. **View-as reuses the agency-ops pattern:** a signed, one-hour, httpOnly cookie under its own `VIEW_AS_SECRET`, honoured only when the real session is admin, read-only, confined to the viewed company's page set.

## Plan (six phases, one PR each, in this order)

### Phase 0: Stop the damage (security, data integrity, dead model ids). Do first, small.
1. **Regulatory review is company-scoped.** Add `.eq("company_id", companyId)` to the pieces query in `review/regulatory/route.ts:113-125`; refuse any `pieceIds` outside it. Same for the write at `:320-338`.
2. **Overlay checks piece ownership** before writing `content_images` (`generate/overlay/route.ts:118`).
3. **Job status is scoped.** `generate/status/[jobId]` checks the job's `company_id` against the caller (`canAccessCompany`).
4. **LinkedIn OAuth:** the start route signs a nonce into `state` (HMAC over company id, user id, expiry); the callback verifies it and requires the signed-in admin. Always `returnTo` the `(app)` social page.
5. **Transcription:** `generate/transcribe/voice` requires a signed-in company user; `transcribe.ts:56-66` loses the any-company key fallback.
6. **`can_publish` enforced** in `publish/linkedin-direct` and `publish/bluesky`; both refuse image URLs that are not in our buckets.
7. **Crons fail closed.** `cron/trial-emails` refuses when `CRON_SECRET` is unset. The staff-upload salt gets its own variable.
8. **Columns and tables that do not exist.** `onboarding/route.ts` writes `users` and `trial_expires_at`; `cron/trial-emails` reads `trial_expires_at`; `stripe/checkout` checks `users.company_id`, not `company_members`.
9. **Retired model ids.** Every file in the Provider truth list switches to `generateText` or `callClaude` with the 5.5 ids; `content-intelligence.ts:209` and `prompt-enhancer.ts:17` included; `scripts/seed-agency-bristol.mjs` stops writing a model; a one-off SQL clears `provider_settings.model` where it names a retired id. `callClaude` records the provider that answered. The chain is Claude, then Flash (decision 6).
10. **Share and storage.** Strategy share tokens become 192-bit with a 30-day expiry and a revoke; compliance documents move to the private `content-drafts` bucket and are served through signed URLs.
11. **A repo `CLAUDE.md`** recording the auth helpers, the provider module, the fence, the bucket rule and the migration rule, so the next session does not reintroduce any of the above.

Verification: `npx tsc --noEmit`, `npm test` plus new tests for each scoped route (two companies, cross-call refused), a signed-state test for the OAuth callback, and a live check that `/api/review/regulatory` with another company's `pieceIds` returns 403.

### Phase 1: Sam's whole day (and Michael's view of it)
1. **Fence finished.** Middleware reads `post_pack` for the signed-in user on B2B-only paths and redirects to `/not-available`; `/setup/*` except `/setup/[id]/hospitality`, `/content/*`, `/review/*` and `/upgrade` join the list; `refuseHospitality` lands in `setup/quick-strategy`, `generate/voice-score`, `carousel`, `quick-image`, `publish/linkedin-direct`, `publish/bluesky`, `review/regulatory`. `post_pack` leaves `VenueSettings` and `api/company/hospitality` (decision 4). `/login` redirects to `/home`. `b2b-only.test.ts` keeps failing when a page is in neither camp.
2. **Hospitality pages for the three B2B leaks.** "Weeks and export" becomes a hospitality "This week" page: approved posts by day, one export per day range with the posts already exported marked, and a plain explanation of where the file goes without naming the vendor beyond the button. "Brand" goes to Venue and posting. The calendar for hospitality lists by day with tap-to-move, no drag, no network icons.
3. **Weather post failure is loud.** A failed run notifies Michael (email) and shows on Sam's home as "This morning's post did not draft, tap to write one"; the cron retries once at 05:00 UTC; home reads `weather_post_runs`.
4. **Write a post** gets a photo picker from the library, a date and a time; the default time is the next sensible slot, not 12:00 in the past; `createHospitalityDraft` failures return a plain message.
5. **Waiting for you** counts photos as well as posts; staff photos are decided on the same page with 44px buttons; approved posts can be unapproved until exported. Menu rows go to 44px.
6. **Talk through the week** records `audio/mp4` where webm is unsupported; a transcription key failure says "We could not transcribe just now, you can type instead", not that her audio was bad.
7. **Help chat** reads the company's pack and answers for Facebook and Instagram venues. **Notifications** get a page in the hospitality menu. The trial banner and `/upgrade` point to a "talk to us" page (decision 10). Login opens in magic-link mode when the address has no password set. Tab title "Write a post".
8. **View-as for Michael** (decision 11): `src/lib/view-as.ts`, `VIEW_AS_SECRET`, a "View as" button on each company card, `getEffectiveProfile()` wrapping `getUserProfile`, the layout, sidebar and role-branching pages switched to it, the agency-id injection skipped while viewing, API routes and RLS untouched so the view is read-only, and a banner with "Stop viewing".

Verification: Playwright at 390px as Sam on the Vercel preview: invite, home, approve a draft, approve a staff photo, write a post with a photo and a time, upload from camera, talk through the week by typing, export this week, type `/strategy` and `/review/[weekId]` and land on `/not-available`, click every sidebar link and never see "LinkedIn". As Michael: view as Lakeside and see exactly that.

### Phase 2: One front door, one admin tree, one navigation map
1. `/dashboard` redirects to `/home`; the OnboardingWizard moves into signup. The admin `/home` shows four panels in the Command Centre shape: Waiting (pending drafts and photos across clients, with Approve in place), Clients (trials ending, setup incomplete, last activity), Jobs (failed generation and publishing in the last seven days, with Retry), Tickets (open, with status in place). Each panel is its own Suspense boundary with `ErrorState`.
2. **One admin tree** (decision 3), with `src/app/admin/layout.tsx` deleted and the LinkedIn callback return fixed.
3. **`src/app/(app)/nav.ts` is the one navigation map** for admin, B2B and hospitality menus, with a test that every entry is a real page and every page is in exactly one menu or declared orphan-by-design, the pattern agency-ops uses.
4. **Company tabs follow the pack.** Lakeside gets Venue and posting, Photos, People; a B2B company gets the B2B tabs. Brand-style and image-mapping become tabs or go.
5. **Users** can be edited (role, company, `can_publish`); the Plans page lists Starter; tickets carry a company and a failed save says so; tables scroll on a phone.
6. A shared `PageHeader` and the shared empty, loading and error primitives, as in agency-ops.

### Phase 3: The B2B journey tells the truth
1. **Strategise works:** the route accepts the client's payload, `suggest-pillars` and `generate` exist (or the interview calls `generate-document`), `strategy_completed` is set, the share link is produced.
2. **Clients can save their own setup** where the product intends it (voice, topics, spokespersons, signoffs, schedule) through `requireCompanyUser`; what is operator-only (API keys, blueprint, social accounts, URLs) is hidden from client pages rather than shown and refused.
3. **One approval path.** `/review` inline approve uses the same company-scoped route as `/content/[id]`; `content/approve` admits company users for their own pieces.
4. **Publish is honest.** For clients, Publish is the export page; direct publishing returns only with signed OAuth state and `can_publish` (Phase 0 items 4 and 6) and only when the company has a connected account. `/upgrade` stops promising it. Week Batch, Article, Meme and Mini infographic are hidden for clients or given client-safe routes; `/api/post-types` exists.
5. **Plan gating has one source:** a `requirePlan(feature)` used by both the sidebar and the route, with the plan-to-feature table in one file. Trial fallback and pricing copy agree (decision 9). Self-serve signup works end to end (Phase 0 item 8) with the hospitality choice setting `post_pack`.
6. Vendor and env names stripped from every client-visible string and error.

### Phase 4: Markey and the portal agree
1. **Approval reads back** (decision 8): `job_bridge_poller.py` reads `approval_status` for the week's pieces before Phase B and publishes only approved ones, or the write-back is removed and the portal's review for AGENCY is retired. `markey.md` updated either way (Wix, Substack, Manus, Week Board).
2. **Export matches the process:** one CSV per brand (personal profile and company page) with a BOM, `scheduled_time` carried from the write-back, no 08:26 default.
3. `WEBSITE_GITHUB_TOKEN` in production or the website button removed; Medium and Substack syndication removed; Manus removed from the provider list; `FAL_AI_API_KEY` and `MANUS_API_KEY` either read or deleted from Vercel.
4. `slot_briefs`, `week_ecosystems` and the `seed-weeks-from-slots.sql` step are either wired or dropped; Week Batch and the Slot Planner read the same slots.
5. Analytics polls posts by URN from Metricool exports or is labelled as portal-published only.

### Phase 5: Hygiene
1. **Migrations reconciled:** 027 to 030 into `supabase/migrations/`, the duplicate 024 renamed, 042 to 044 reconciled with the live names, `codex/native-content-engine` merged or its four tables and seven variables dropped, every table the code writes present in a migration, `profiles` and `company_members` references gone.
2. **Buckets:** `content-assets` gets a size limit; nothing private is written to a public bucket.
3. **Tests:** Playwright smoke across every `(app)/admin` page; an API smoke that fails when the provider that answered is not the one requested; a tenant-isolation test suite that runs two companies against every company-scoped route.
4. **One Gemini key name.** `GEMINI_API_KEY` removed from code; the paid Gemini key in Vercel once billing is on.
5. Delete `/generate/studio`, `/setup/content/*`, the test company and its admin user (Michael's call on the data).

## Verification (per phase)
- `npx tsc --noEmit`, `npm test`, `npm run build`.
- Playwright against the Vercel preview at 1440px and 390px, as each of the four users, walking the stages in the scorecard. Each phase re-scores its stages; the target is 4 or above on C1 to C5 for every stage that phase touches, and both platform checks passing from Phase 0 onwards.
- Phase 0: a SQL check that no `content_pieces.regulatory_review` has been written by a user of another company; a live call with another company's `pieceIds` returns 403; `/api/generate/transcribe/voice` without a session returns 401.
- Phase 1: Michael views as Lakeside and walks Sam's day himself before the second week of November.

## Not verified
- Whether Next 15 re-runs the `(app)` layout fence on soft navigation (the design in Phase 1 does not depend on it).
- The decrypted value of `NEXT_PUBLIC_WEEK_BOARD_ENABLED`, `NEXT_PUBLIC_APP_URL` and `CONTENT_DIRECT_RELEASE_ENABLED` in production.
- Whether `imagen-3.0-generate-002`, `claude-opus-4-20250514` and `dall-e-3` are still served.
- Whether iPhone Safari on Sam's iOS records `audio/webm`.
- Which time zone Metricool reads CSV times in, and whether it de-duplicates a re-imported post.
- Whether Supabase RLS lets an admin's anon-key client read every company's `content_pieces` on `/home`.
- Everything above is a reading of the code and the database; no authenticated browser walk was run, because no test credentials exist for Sam's or a B2B client's view.

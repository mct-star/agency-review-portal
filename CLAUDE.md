# agency-review-portal: repo guide for the next session

AGENCY's content platform. Next.js 15 App Router, TypeScript strict, Supabase
(project `bhiryqznxxjeynsqmyce`), Vercel (`agency-review-portal.vercel.app`),
Tailwind. Multi-tenant: one `companies` row per client, `users.role` is `admin`
(AGENCY staff, every company) or `client` (one company, `users.company_id`).
A company's `post_pack` is `b2b` (LinkedIn-first) or `hospitality` (Facebook
and Instagram, the Lakeside Brasserie trial). The audit and plan this repo is
working through is `docs/platform-strategy-audit-2026-10.md`; read its
Decisions section before changing anything structural.

## Running it

```bash
npm run dev        # port 3000
npm test           # vitest, ~500 tests, 25 seconds
npx tsc --noEmit
npm run build
```

Run `npx tsc --noEmit` and `npm test` after any non-trivial change.

## Rules that protect clients from each other

- **Every API route authorises before it reads.** Use `requireAdmin()`,
  `requireCompanyUser(companyId)` or `getSignedInProfile()` from
  `src/lib/supabase/admin.ts`, then `canAccessCompany` from
  `src/lib/auth/permissions.ts` for anything the route touches that carries a
  `company_id`. The service-role client bypasses RLS, so **every query it
  runs filters on `company_id`** (or checks the row's `company_id` against
  the caller). `src/app/api/tenant-isolation.test.ts` is the pattern: two
  companies, the caller in A, the route must refuse B.
- **A piece, job, image or document named by id in the request body is
  checked against the caller's company before it is read or written.**
- **Publishing needs `can_publish`** (or admin). Server-side fetches of
  caller-supplied URLs go through `isOurStorageUrl`
  (`src/lib/media/our-storage-url.ts`).
- **OAuth state is signed** (`src/lib/linkedin/oauth-state.ts`); the callback
  requires the admin who started the flow.
- **Crons fail closed** on a missing `CRON_SECRET`.
- **Hospitality fence.** `src/lib/hospitality/b2b-only.ts` names the B2B-only
  pages; `refuseHospitality` in `pack-guard.ts` goes in every client-callable
  generating or publishing route. `b2b-only.test.ts` fails when a page is in
  neither camp.
- **Buckets.** `captures` and `content-drafts` are private (signed URLs);
  `content-assets`, `media` and `renders` are public. Anything a client would
  not publish (compliance documents, raw uploads) goes in a private bucket.

## One provider module

Every Claude call goes through `src/lib/providers/content-adaptation/claude-util.ts`
(`callText`, `callClaude`, `currentClaudeModel`),
`src/lib/providers/content-generation/generate-text.ts` or, for images,
`src/lib/providers/vision/tag-image.ts`. Do not write a
`fetch("https://api.anthropic.com/...")` anywhere else. Current ids are
`claude-sonnet-5-5` (writing) and `claude-haiku-5-5` (classification, scoring,
tagging). The 5.5 models reject `temperature` and think by default, so the
module sends no temperature, switches thinking off and reads the first text
block. Fallback is Gemini 2.5 Flash only. The result names the provider that
answered; record that, not the one you asked for.

## Database

Migrations live in `supabase/migrations/` and are applied by hand (the
Supabase MCP `apply_migration`, or the dashboard) before the code that reads
them is pushed. Every statement is `IF NOT EXISTS` so it is safe to re-run.
Columns the code writes must exist: `companies.trial_expires_at` (not
`trial_ends_at`), the table is `users` (not `profiles`), there is no
`company_members`.

## Things that look odd but are deliberate

- The scheduler export is the personal-feed brand only for the platform company (the company page posts never reach the portal), so its file is `posts_MCT_week<N>.csv`. Medium, Substack and Manus are retired: do not rebuild them.
- `/generate/single` and `/generate/studio` are permanent redirects
  (`next.config.ts`).
- The week board pages are behind `NEXT_PUBLIC_WEEK_BOARD_ENABLED` and are
  used by Markey's Mac pipeline through `content_generation_jobs`.
- There is one admin tree, `src/app/(app)/admin/*`, inside the (app) layout
  (Decision 3 of the audit). The legacy `src/app/admin/*` tree and its layout
  are gone; route groups keep the addresses, so `/admin/weeks` is unchanged.
  The (app) layout only requires a sign-in, so every admin page calls
  `requireAdmin()` itself.
- `src/app/(app)/nav.ts` is the one navigation map: the admin, client and
  hospitality menus, `sectionsFor(user, postPack)` and `DETAIL_PAGES`. The
  sidebar only renders it. `nav.test.ts` fails when a menu href has no page or
  a page under (app) is in neither a menu nor `DETAIL_PAGES`.
- The company tabs (`setup/[companyId]/CompanyTabs.tsx`) follow the pack: a
  hospitality company gets Overview, Venue and posting, People and Photos.

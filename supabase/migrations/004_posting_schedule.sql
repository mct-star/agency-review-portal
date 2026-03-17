-- ============================================================
-- Migration 004: Posting Schedule System
-- Creates post_types (template library) and posting_slots
-- (per-company weekly schedule). Seeds 13 post types with
-- day-specific prompt templates and AGENCY Bristol's 11-slot
-- weekly schedule.
-- ============================================================

-- ============================================================
-- 1. Post Type Library
-- Shared across companies. Each post type defines a content
-- structure with prompt template instructions.
-- ============================================================
create table public.post_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  content_type text not null default 'social_post'
    check (content_type in ('social_post', 'blog_article', 'linkedin_article', 'pdf_guide', 'video_script')),
  word_count_min integer,
  word_count_max integer,
  default_image_archetype text,
  template_instructions text,
  is_system boolean default true,
  created_at timestamptz default now()
);

-- RLS
alter table public.post_types enable row level security;

create policy "Anyone can read post types" on public.post_types
  for select using (true);

create policy "Admin manages post types" on public.post_types
  for all using (public.get_user_role() = 'admin');

-- ============================================================
-- 2. Per-Company Posting Slots
-- Each slot maps a post type to a day/time in the weekly
-- schedule. Companies build their own schedule by adding slots.
-- ============================================================
create table public.posting_slots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  post_type_id uuid not null references public.post_types(id),
  day_of_week integer not null check (day_of_week between 0 and 6),
  scheduled_time time not null,
  slot_label text,
  image_archetype text,
  cta_url text,
  cta_link_text text,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create index idx_posting_slots_company on public.posting_slots(company_id);

-- RLS
alter table public.posting_slots enable row level security;

create policy "Admin manages posting slots" on public.posting_slots
  for all using (public.get_user_role() = 'admin');

create policy "Client reads own slots" on public.posting_slots
  for select using (company_id = public.get_user_company_id());

-- ============================================================
-- 3. Seed Post Types (13 types)
-- ============================================================

insert into public.post_types (slug, label, content_type, word_count_min, word_count_max, default_image_archetype, template_instructions) values

('problem_post', 'The Mistake (Problem Post)', 'social_post', 150, 250, 'A1_green',
'STRUCTURE (follow this exact sequence):
1. RE-HOOK (1 sentence) — Complements the image hook. Adds context or shifts angle. Must NOT repeat image text. Must be ONE sentence, fully visible above LinkedIn "see more" fold. Opens with tension, not preamble.
2. THE MISTAKE (2-3 sentences) — What they are doing wrong. Be specific about the behaviour. Not an accusation, an observation.
3. WHY IT FEELS RIGHT (2-3 sentences) — Validate why they made this choice. Show you understand the logic. "It made sense when..."
4. THE HIDDEN COST (2-3 sentences) — What they are actually losing. Concrete, not abstract. Connect to something they care about.
5. THE SHIFT (1-2 sentences) — Hint at what is different. NO prescription, just a direction. Leave them wanting to know more.
6. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

TONE: Diagnosis and recognition ("Finally, someone gets it"). Understated.
AVOID: TED Talk voice, consultant validation, corporate comms, formal academic tone.'),

('launch_story', 'Launch Story (47 Launches)', 'social_post', 200, 350, 'A7_infographic',
'STRUCTURE (follow this exact sequence):
1. SCENE SETTING (2-3 sentences) — Specific launch moment. Time, place, vivid detail. Put the reader in the room.
2. THE CHALLENGE (2-3 sentences) — What the team faced. Connect to the topic theme. Be specific.
3. WHAT WE LEARNED (3-4 sentences) — The insight. Why it mattered. How it changed thinking going forward.
4. THE PATTERN (2-3 sentences) — "I have seen this in X other launches." Show this is not isolated. Pattern recognition from 47 launches.
5. THE TAKEAWAY (1-2 sentences) — What the reader can apply. Thought-provoking. Optional: link to blog if relevant.
6. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

TONE: First-person reflective. Vulnerable where appropriate. Shows pattern recognition across many launches.
KEY: Story must anchor to a real launch experience. 47 launches is the unique asset. First person throughout. Specific details (names can be anonymised).'),

('if_i_was', 'If I Was... (Stay-in-Lane Advice)', 'social_post', 200, 300, 'A1_purple',
'STRUCTURE (follow this exact sequence):
1. SETUP / RE-HOOK (1 sentence) — "If I was [specific healthcare marketing role]..." Short and tight. Fully visible above LinkedIn "see more" fold. Under 16 words.
2. WHAT I WOULD DO (4-6 points) — Concrete, actionable steps. MUST stay in marketing/demand generation territory ONLY. Not sales, clinical, or operations advice. Conversational format (prose or simple numbered list). NOT bold subheaders or slide deck structure.
3. WHY THIS MATTERS (1-2 sentences) — Connect to bigger picture. Stakes without drama.
4. THE CAVEAT (optional, 1 sentence) — Acknowledge what you do not know. Show humility.
5. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

CRITICAL: Must stay in marketing/demand generation lane. NOT sales advice, NOT clinical advice, NOT operations advice.
TONE: Practical, direct, stays in lane.
FORMAT: No bold subheaders. No formal colon announcements like "Here is what I would do:". Conversational prose.'),

('contrarian', 'Contrarian (Challenge the Norm)', 'social_post', 200, 300, 'A1_blue',
'STRUCTURE (follow this exact sequence):
1. THE ASSUMPTION (1 sentence) — RE-HOOK: State the assumption everyone makes. ONE sentence, above fold.
2. WHY IT IS WRONG (3-4 sentences) — Structural reason. Data if available. Logic that is hard to dismiss.
3. WHAT IS ACTUALLY TRUE (3-4 sentences) — Your contrarian position. Why it matters. What changes if they accept this.
4. THE IMPLICATION (1-2 sentences) — What should they do differently. Direction, not full prescription.
5. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

TONE: Challenging, uncomfortable (but earned). Methodology-driven, not opinion-based.
KEY: Challenges a GENUINE industry assumption. Has evidence or logic. Does not soften too quickly. The discomfort is EARNED, not just contrarian for attention.'),

('tactical', 'Tactical How-To', 'social_post', 150, 250, 'A1_green',
'STRUCTURE (follow this exact sequence):
1. THE PROBLEM (1 sentence) — RE-HOOK: Frame the tactical challenge. ONE sentence, above fold.
2. THE APPROACH (3-5 numbered points) — Concrete steps. Each one actionable. Practice not theory. Cannot be found via a basic Google search.
3. WHY THIS WORKS (1-2 sentences) — Brief logic. What makes this different from obvious advice.
4. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

TONE: Direct, practical, competence-driven.
KEY: Solves a real problem. Immediately usable. Not basic. Shows deep competence in healthcare marketing/demand generation.'),

('founder_friday', 'Founder Friday (Fantasy vs Reality)', 'social_post', 250, 400, 'A4_pixar',
'STRUCTURE (follow this exact sequence):
1. THE SETUP (2-3 sentences) — Specific founder moment. Real, not polished.
2. THE FANTASY VS REALITY (3-4 sentences) — What people think vs actual reality. Be honest about trade-offs.
3. THE HUMAN MOMENT (3-4 sentences) — Something specific that happened. Vulnerability without oversharing.
4. THE RESOLUTION (2-3 sentences) — What you have learned or are learning. Navigating, not "figured it out". Honours different paths. MUST resolve into something positive, useful, or forward-looking. MUST NOT end on sadness or self-pity.
5. THE CONNECTION (1-2 sentences) — Relate back to reader. Do not preach. Often a question.
6. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

CRITICAL THEME: Fantasy vs Reality ONLY. NOT a business lesson.
TOPICS THAT WORK: Growth vs lifestyle decisions, being your own boss reality, family/work navigation, moments of doubt, trade-offs, what you miss about employed life, surprises.
TOPICS TO AVOID: Your dog (explicitly prohibited), hobbies unrelated to work, humble brags, "5 things I learned" lists.
CRITICAL TONE: Must balance genuine vulnerability with forward motion. Reader finishes thinking "I am glad I read that", not "That was depressing." Not forced positivity but EARNED growth.'),

('weekend_personal', 'Weekend Personal (Bristol/Local)', 'social_post', 100, 150, 'A3B_real_photo',
'STRUCTURE (follow this exact sequence):
1. THE MOMENT (2-3 sentences) — Something specific to Bristol or the local area. Real and observed. Light and human.
2. THE THOUGHT (1-2 sentences) — Brief reflection. Do not overthink. Can be a question or observation.
3. THE CLOSE (1 sentence) — Human sign-off. Weekend energy.
4. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

CRITICAL: LOCAL, CURRENT, CULTURAL theme ONLY. NOT industry observations.
Must be specifically about Bristol or the local area. Timely to the current moment (not evergreen). Shows the human side. Could NOT be posted from anywhere else.
TOPICS: Bristol events, weekend activities, seasonal observations, cultural moments, local spots.
AVOID: Industry observations, business lessons, generic weekend vibes.'),

('blog_teaser', 'Blog Teaser (Sunday)', 'social_post', 60, 120, 'A5_carousel',
'STRUCTURE (follow this exact sequence):
1. THE HOOK (1-2 sentences) — Core tension or insight from the blog. Same energy as blog opening. Put them in the room. Do NOT announce the blog. Do NOT say "New this week" or "The blog has gone live."
2. THE STAKES (2-3 sentences) — Why it matters. What is at risk. Concrete, not abstract.
3. THE BRIDGE (1 sentence) — What the article covers. SPECIFIC about what they will learn (e.g. "three shifts that actually work" not "I explore this topic").
4. BRACKET (optional, ONE max) — Reading time or note, e.g. "(About ten minutes. Worth it, I think.)"
5. LINK — Simple, direct link to the blog post.
6. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

CRITICAL: Makes the argument, does NOT announce the blog. Opens with a moment, not meta. Specific bridge (tells exactly what the article adds).
HEALTHCARE ANCHOR: Must be unmistakably healthcare. Include a healthcare job title, company type, or scenario. Could NOT describe a SaaS company.

FIRST COMMENT: Coffee comment (NOT a CTA). Soft, human, 1-2 sentences. Examples: "Coffee is on. Quiet house. Good morning for thinking." / "Hope you are having a slow one. Back to the chaos tomorrow."'),

('blog_cta', 'Blog CTA (Standalone)', 'social_post', 40, 60, null,
'STRUCTURE:
1. SHORT HOOK (1 sentence) — Connect to the week theme or blog topic.
2. CTA (1-2 sentences) — Drive to newsletter signup or blog.
3. LINK — Include the CTA URL.
4. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

CRITICAL: This is a STANDALONE post. Must NOT reference any other post from the week. Must work on its own. Very short (40-60 words). No image needed (LinkedIn link preview displays).

FIRST COMMENT: Drive to newsletter signup.'),

('triage_cta', 'Triage CTA (Week Theme)', 'social_post', 50, 80, null,
'STRUCTURE:
1. HOOK (1 sentence) — Connect to this week content theme.
2. OFFER (1-2 sentences) — Offer of triage, consultation, or resource related to the week theme.
3. LINK — Include the CTA URL.
4. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

This is a short CTA post tied to the current week theme. No image needed (LinkedIn link preview displays). Very concise.

FIRST COMMENT: Drive to the relevant resource or booking link.'),

('industry_news', 'Industry News Reaction', 'social_post', 150, 300, 'A2_editorial',
'STRUCTURE:
1. THE NEWS (1-2 sentences) — What happened. Brief, factual.
2. WHY IT MATTERS (2-3 sentences) — Your take on the implications. Connect to healthcare marketing/demand generation.
3. WHAT I THINK (2-3 sentences) — Personal perspective. Hedging language, not declarative. "I think there is..." not "This means..."
4. THE QUESTION (1 sentence) — Ask the audience what they think.
5. SIGN-OFF (mandatory — use exact text from blueprint Section E3)

TONE: Reactive, timely, opinionated but hedging. Shows you are paying attention to the industry.
KEY: Must be about a REAL, current industry event or news item. Must connect to healthcare commercial/marketing territory.'),

('blog_article', 'Blog Article (Full)', 'blog_article', 1800, 2500, null,
'STRUCTURE (8 sections):
1. HOOK (100 words) — Problem setup. Put the reader in the room. Specific healthcare scenario.
2. THE CONVENTIONAL RESPONSE (300 words) — What they usually do. Standard industry approach.
3. WHY IT DOES NOT WORK (500 words) — Structural reasons with data. Why the conventional approach fails.
4. WHAT IS ACTUALLY HAPPENING (400 words) — The real diagnosis. Reframe the problem.
5. A DIFFERENT APPROACH (500 words) — What works instead. Practical, specific.
6. CASE STUDY (200-300 words) — MANDATORY. Must include: client type (anonymised), specific problem, conventional approach they tried, shift they made, measurable outcome.
7. PRACTICAL FIRST STEPS (300 words) — What the reader can do tomorrow. Actionable.
8. CLOSE (100 words) — The real stakes. Understated, reflective.

ALSO GENERATE: SEO title (60 chars max), meta description (155 chars max), URL slug, excerpt (2 sentences).
FORMAT: Anti-contraction style ("do not" not "don''t"). Minimum 3 bracketed asides. 2-3 ellipses for thinking pauses. At least 2 dry humour instances. At least 1 self-deprecating moment.
IMAGES: Generate 5-6 image placement markers: 1 cover (1200x630px), 1 hero, 4-5 inline.'),

('linkedin_article', 'LinkedIn Article', 'linkedin_article', 600, 1000, null,
'STRUCTURE:
1. Thought-provoking title (no colons or hyphens).
2. Opening that frames the problem from real-world healthcare experience.
3. 3-4 sections with clear subheadings.
4. Professional insights grounded in specific healthcare commercial scenarios.
5. Conclusion that positions the author as a thoughtful practitioner, not a guru.

ALSO GENERATE: SEO title, meta description, excerpt.
FORMAT: Anti-contraction style. Hedging over declaring. Observations over verdicts. UK spelling throughout.');

-- ============================================================
-- 4. Seed AGENCY Bristol Posting Slots
-- Links to post types by slug lookup. Only runs if AGENCY
-- Bristol company exists.
-- ============================================================

-- Use a DO block to look up IDs dynamically
do $$
declare
  v_company_id uuid;
  v_problem_post_id uuid;
  v_launch_story_id uuid;
  v_if_i_was_id uuid;
  v_contrarian_id uuid;
  v_blog_cta_id uuid;
  v_triage_cta_id uuid;
  v_founder_friday_id uuid;
  v_weekend_personal_id uuid;
  v_blog_teaser_id uuid;
  v_blog_article_id uuid;
  v_linkedin_article_id uuid;
begin
  -- Find AGENCY Bristol
  select id into v_company_id from public.companies where slug = 'agency-bristol';
  if v_company_id is null then
    raise notice 'AGENCY Bristol not found — skipping slot seeding';
    return;
  end if;

  -- Look up post type IDs
  select id into v_problem_post_id from public.post_types where slug = 'problem_post';
  select id into v_launch_story_id from public.post_types where slug = 'launch_story';
  select id into v_if_i_was_id from public.post_types where slug = 'if_i_was';
  select id into v_contrarian_id from public.post_types where slug = 'contrarian';
  select id into v_blog_cta_id from public.post_types where slug = 'blog_cta';
  select id into v_triage_cta_id from public.post_types where slug = 'triage_cta';
  select id into v_founder_friday_id from public.post_types where slug = 'founder_friday';
  select id into v_weekend_personal_id from public.post_types where slug = 'weekend_personal';
  select id into v_blog_teaser_id from public.post_types where slug = 'blog_teaser';
  select id into v_blog_article_id from public.post_types where slug = 'blog_article';
  select id into v_linkedin_article_id from public.post_types where slug = 'linkedin_article';

  -- Insert 11 slots for AGENCY Bristol
  insert into public.posting_slots (company_id, post_type_id, day_of_week, scheduled_time, slot_label, image_archetype, cta_url, cta_link_text, sort_order) values
    -- Sunday 08:26 — Blog Teaser
    (v_company_id, v_blog_teaser_id, 0, '08:26:00', 'Sunday AM', 'A5_carousel', 'https://www.agencybristol.com/blog', 'Read the blog', 0),
    -- Monday 08:26 — The Mistake
    (v_company_id, v_problem_post_id, 1, '08:26:00', 'Monday AM', 'A1_green', 'https://www.agencybristol.com/how-to-generate-demand', 'Demand Gen Guide', 1),
    -- Tuesday 08:26 — Launch Story
    (v_company_id, v_launch_story_id, 2, '08:26:00', 'Tuesday AM', 'A7_infographic', 'https://www.agencybristol.com/download-product-playbook-framework', 'Product Messaging Playbook', 2),
    -- Wednesday 08:26 — If I Was
    (v_company_id, v_if_i_was_id, 3, '08:26:00', 'Wednesday AM', 'A1_purple', 'https://www.agencybristol.com/how-to-generate-demand', 'Demand Gen Guide', 3),
    -- Wednesday 12:02 — Blog CTA
    (v_company_id, v_blog_cta_id, 3, '12:02:00', 'Wednesday PM', null, 'https://www.agencybristol.com/sign-up', 'Newsletter', 4),
    -- Thursday 08:26 — Contrarian (will alternate with tactical based on week number)
    (v_company_id, v_contrarian_id, 4, '08:26:00', 'Thursday AM', 'A1_blue', 'https://www.agencybristol.com/download-product-playbook-framework', 'Product Messaging Playbook', 5),
    -- Thursday 12:02 — Triage CTA
    (v_company_id, v_triage_cta_id, 4, '12:02:00', 'Thursday PM', null, 'https://www.agencybristol.com/sign-up', 'Newsletter', 6),
    -- Friday 08:26 — Founder Friday
    (v_company_id, v_founder_friday_id, 5, '08:26:00', 'Friday AM', 'A4_pixar', 'https://www.agencybristol.com/sign-up', 'Newsletter', 7),
    -- Saturday 10:30 — Weekend Personal
    (v_company_id, v_weekend_personal_id, 6, '10:30:00', 'Saturday AM', 'A3B_real_photo', 'https://www.agencybristol.com/blog', 'Blog', 8),
    -- Blog Article (not a specific day slot — produced weekly)
    (v_company_id, v_blog_article_id, 1, '09:00:00', 'Weekly Blog', null, null, null, 9),
    -- LinkedIn Article (optional weekly)
    (v_company_id, v_linkedin_article_id, 2, '10:00:00', 'LinkedIn Article', null, null, null, 10);

end $$;

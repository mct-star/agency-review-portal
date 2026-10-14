-- ============================================================
-- Migration 040: Blog and LinkedIn article templates, brought
-- into canon (Phase 0 containment, 29 Sept 2026)
--
-- The seed in 004_posting_schedule.sql banned contractions, printed its
-- own section labels as headings ("THE CONVENTIONAL RESPONSE", "WHY IT
-- DOES NOT WORK", "CLOSE"), and made a case study with a measurable
-- outcome mandatory even when no real figure was supplied. On 28 Sept
-- this produced an article with a withdrawn statistic, an unapproved
-- client figure, a stilted "is not it?", and the section labels printed
-- verbatim as headings. This migration does not touch that seed (already
-- applied); it rewrites the two rows forward, idempotently.
-- ============================================================

update public.post_types
set template_instructions =
'SECTION PLAN (about 1,800 to 2,500 words). The beats below are planning labels for you. Never print them as headings.
1. Hook (about 100 words): put the reader in the room with a specific healthcare scene. Follow it with one short paragraph that says exactly what this piece gives the reader.
2. The obvious objection: ask it and answer it in one or two lines before the argument builds.
3. What most teams do, and why it feels right (about 300 words). Give the best version of it. No strawman.
4. Why it does not hold (about 500 words): structural reasons, not blame.
5. What is actually happening (about 400 words): the real diagnosis and the reframe.
6. A different approach (about 500 words): what works instead, without selling.
7. An example (200 to 300 words): use only a case supplied in this brief or in the stories provided. Keep the client anonymous unless the brief says the client has approved being named. Never invent a client, a figure, a timeline or a result. If no case is supplied, write a short hypothetical that is clearly framed as one, with no figures.
8. Where to start (about 300 words): a direction the reader can act on tomorrow, not a step-by-step manual. End on the real stakes in one or two understated lines.

HEADINGS: write your own H2 headings. They talk like a person and pull the reader forward, for example "Is this pie in the sky?" or "The number that stung". Never topic labels. No colons or hyphens in headings or in the title.
ONE QUOTABLE LINE per section: a declarative line of six to ten words that could stand on its own, embedded in the prose.
FIGURES: quote a figure only if it appears in this brief (the topic, the stories provided, or the notes from Michael). Anything else in your context is background and must not be quoted as a figure. If a point needs a number you do not have, make the point without one.
VOICE: contractions are natural and welcome. At least three bracketed asides, each a real aside such as an owned admission or a dry observation, never emphasis like "(This is important.)". Two or three ellipses for thinking pauses. At least two moments of dry British understatement and at least one self-deprecating line.
ALSO GENERATE: SEO title (60 characters max), meta description (155 characters max), URL slug, excerpt (two sentences).
IMAGES: write [[image: hero]] on its own line under the title, and [[image: 1]], [[image: 2]], [[image: 3]] on their own lines after the sections they belong to. The image prompts themselves go in the assets, never in the article text.'
where slug = 'blog_article';

update public.post_types
set template_instructions =
'STRUCTURE:
1. Thought-provoking title (no colons or hyphens).
2. Opening that frames the problem from real-world healthcare experience.
3. 3-4 sections with clear subheadings.
4. Professional insights grounded in specific healthcare commercial scenarios.
5. Conclusion that positions the author as a thoughtful practitioner, not a guru.

ALSO GENERATE: SEO title, meta description, excerpt.
FORMAT: Contractions are natural and welcome. Hedging over declaring. Observations over verdicts. UK spelling throughout.'
where slug = 'linkedin_article';

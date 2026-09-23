-- Mini infographic: the house four-panel split out from the meme (Michael, 23 Sept 2026).
-- Sunday on the founder feed; the meme stays Saturday.
insert into public.post_types (slug, label, content_type, word_count_min, word_count_max, default_image_archetype, template_instructions)
values (
  'mini_infographic',
  'Mini infographic',
  'social_post',
  8,
  40,
  'infographic_card',
  'Four panels that escalate or compare, each under 10 words, drawn from the week''s thesis. A repeated label on the left and the escalating line on the right. No statistics unless sourced. No client names. No emojis. Produced on the Mac as a house-drawn image.'
)
on conflict (slug) do nothing;

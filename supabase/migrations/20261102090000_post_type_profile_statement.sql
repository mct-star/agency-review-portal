-- Profile statement: a dark profile card in the author's own name, a three-beat statement beneath.
-- The caption is the normal post body; the on-image copy comes from the image_copy asset.
insert into public.post_types (slug, label, content_type, word_count_min, word_count_max, default_image_archetype, template_instructions)
values (
  'profile_statement',
  'Profile statement',
  'social_post',
  80,
  180,
  'profile_statement_card',
  'The post is a caption beside a dark profile card that carries the on-image copy in the author''s own name. The on-image copy has three beats, 25 to 45 words in total: a statement (one sentence, 6 to 16 words, a position the reader could disagree with), proof (two to four short sentences or imperatives, at most 25 words, the behaviour behind the statement) and a payoff (one sentence, at most 10 words, what follows, earned and not promised). Banned on the card: statistics unless sourced from supplied material, client names, emojis, hashtags, em dashes, absolute guarantees such as "inevitable", "guaranteed" or "always works". British English. The caption adds the reasoning or a specific example and does not repeat the card text.'
)
on conflict (slug) do nothing;

# AGENCY Bristol — Landing Page Brief for Lovable

## Overview
Build a marketing landing page for a B2B SaaS platform that helps healthcare and pharmaceutical companies create compliant, on-brand social content using AI. The platform has three modules: Copy Engine, Regulatory Review, and Creative AI.

The landing page should look premium, modern, and trustworthy — this sells to pharma marketing directors and healthcare consultancies. Think clean SaaS landing page (Linear, Vercel, Stripe aesthetic), not startup-playful.

## Tech Requirements
- **Connect to existing Supabase project** (same project as the main platform)
- Signup form on the page uses Supabase Auth (email + password)
- On successful signup, redirect to: `https://agency-review-portal.vercel.app/dashboard`
- Custom domain will be configured later

## Brand
- **Company:** AGENCY Bristol
- **Primary colour:** #7C3AED (violet)
- **Secondary colours:** #DC2626 (red, for regulatory), #D97706 (amber, for creative AI)
- **Font:** Inter or similar clean sans-serif
- **Tone:** Confident, direct, expert. Not corporate-stuffy, not startup-casual. Think "the adults in the room who also happen to be creative."

---

## Page Structure

### 1. Navigation Bar
- Logo: "AGENCY" in bold text (left)
- Links: Features, Pricing, How It Works
- Right side: "Log in" (text link → https://agency-review-portal.vercel.app/login) + "Start free trial" (violet button, scrolls to signup section)

### 2. Hero Section
- **Badge:** "7-day free trial. No credit card required." (small violet pill above headline)
- **Headline:** "Healthcare content that takes minutes, not weeks"
- **Subheadline:** "Three AI modules that work together: a Copy Engine that writes like you, Regulatory Review that catches what humans miss, and Creative AI that makes every post stop the scroll."
- **CTA buttons:** "Start your free trial" (violet, primary) + "See how it works" (outlined, secondary, scrolls to How It Works section)
- **Background:** Subtle violet gradient glow or mesh behind the hero text. Clean, not busy.

### 3. Social Proof Bar
- Light grey background strip
- Text: "Built by AGENCY Bristol — a healthcare demand generation consultancy that built this for their own 10-week production workflow, then opened it up."

### 4. Three Premium Modules Section
- **Section heading:** "Three modules. One platform."
- **Subheading:** "Start with what you need. Add modules as you grow. Each one makes the others more powerful."

Three large cards, each with a coloured accent bar at the top, alternating layout (text left/features right, then swapped):

**Card 1 — Copy Engine (violet accent #7C3AED)**
- Tag: "Copy Engine" in violet pill
- Title: "AI that writes like you, not like a robot"
- Description: "Record a voice note, paste your LinkedIn, or upload writing samples. The platform learns your cadence, vocabulary, and signature devices. Every post sounds unmistakably like you."
- Features list (with violet checkmarks):
  - Voice profile from audio, LinkedIn, or documents
  - 7 post types designed for B2B engagement
  - Content intelligence: hook tension, healthcare gates, AI detection
  - Sign-off and first comment automation
  - Content calendar with strategic ecosystem linking

**Card 2 — Regulatory Review (red accent #DC2626)**
- Tag: "Regulatory Review" in red pill
- Title: "Compliance review that catches what humans miss"
- Description: "Three-colour MLR workflow maps every sentence to Legal, Regulatory, or Compliance responsibilities. Sentence-level analysis with regulation references and suggested compliant alternatives."
- Features list (with red checkmarks):
  - ABPI, MHRA, FDA, EU MDR frameworks
  - Three-colour coding: Legal / Regulatory / Compliance
  - Sentence-level flagging with suggested alternatives
  - Professional numbered compliance reports with PDF export
  - Audit trail for every review
  - 10+ country market coverage

**Card 3 — Creative AI (amber accent #D97706)**
- Tag: "Creative AI" in amber pill
- Title: "Premium visuals that stop the scroll"
- Description: "From Pixar-quality 3D scenes to bold quote cards, every post gets an image that matches your brand. Upload a photo and the AI generates characters that look like your spokesperson."
- Features list (with amber checkmarks):
  - Pixar/Disney-quality 3D character scenes
  - Face-consistent generation from reference photos
  - Programmatic quote cards (perfect text, every time)
  - Carousel slide generation
  - Editorial and lifestyle photography styles
  - Branded overlay with logo, CTA, and profile picture

### 5. Platform Features Strip
- Grey background
- Heading: "Included in every plan"
- 4 features in a grid:
  1. **One-Click Publishing** — Post directly to LinkedIn with images and first comments
  2. **Multi-Spokesperson** — Multiple voices, one brand. Each person gets their own voice profile
  3. **Content Calendar** — Plan weeks and months with strategic ecosystem linking
  4. **Voice Dictation** — Set up your brand voice by simply speaking

### 6. How It Works Section
- **Heading:** "From zero to published in four steps"
- **Subheading:** "Set up once, generate every week. Each post is strategically connected."

Four steps in a grid:
1. **01 — Set up your brand** — Record a voice note, paste your LinkedIn URL, or fill in details. We extract your voice, audience, and differentiators in under a minute.
2. **02 — Choose your modules** — Start with the Copy Engine. Add Regulatory Review for compliance-heavy industries. Add Creative AI for premium visual assets.
3. **03 — Generate content** — AI creates posts in your voice with quality gates for healthcare specificity, hook tension, and brand consistency.
4. **04 — Review, approve, publish** — Compliance review flags issues before they become problems. One click to publish to LinkedIn with images and first comments.

### 7. Pricing Section
- **Heading:** "Start free. Add what you need."
- **Subheading:** "Every plan includes the core platform. Premium modules unlock advanced capabilities."

Three pricing cards:

**Starter — $0/month**
- 1 spokesperson
- 5 posts per month
- Copy Engine (basic)
- Quote card images
- Brand overlay
- LinkedIn publishing
- CTA: "Get started free" (outlined button)

**Pro — $99/month** (HIGHLIGHTED with violet border + "Most popular" badge)
- Unlimited spokespersons
- Unlimited content generation
- **+ Copy Engine** (full voice profile, quality gates)
- **+ Regulatory Review** (ABPI, MHRA, FDA)
- Content calendar
- Voice dictation setup
- Multi-platform publishing
- CTA: "Start 7-day free trial" (violet solid button)

**Agency — $299/month**
- Everything in Pro
- **+ Creative AI** (Pixar 3D, face-match, carousels)
- Multi-company management
- White-label branding
- Full month batch generation
- Multi-market compliance (10+ countries)
- Priority support
- CTA: "Start 7-day free trial" (outlined button)

**Below the cards:**
- "All plans include a 7-day Pro trial. No credit card required."
- "Need Creative AI without the Agency plan? Add it to Pro for $49/month."

### 8. Signup Section (with Supabase Auth)
- **Heading:** "Ready to transform your healthcare content?"
- **Subheading:** "Start your free trial today. Set up in under 2 minutes. No credit card required."
- **Signup form:** Email + Password fields + "Start your free trial" button
- This form should use **Supabase Auth** (connected to the same Supabase project as the platform)
- On successful signup, redirect to: `https://agency-review-portal.vercel.app/dashboard`
- Below the form: "Already have an account? Log in" (link to https://agency-review-portal.vercel.app/login)

### 9. Footer
- Left: "AGENCY Bristol" + copyright
- Links: Privacy Policy, Terms of Service
- Right: "Powered by AGENCY Bristol — Healthcare Demand Generation"

---

## Design Notes
- Use generous whitespace — this is a premium product
- Cards should have subtle shadows and rounded corners (rounded-xl or rounded-2xl)
- The three module cards should feel weighty and important — they're the core USPs
- Pricing cards: the Pro tier should visually dominate (larger, highlighted border, badge)
- Mobile responsive: cards stack vertically, pricing scrolls horizontally or stacks
- No stock photos — this is a text-and-layout focused page
- Animations: subtle fade-in on scroll for sections, nothing flashy

## Supabase Connection
- **Supabase URL:** (will be provided — same as the main platform)
- **Supabase Anon Key:** (will be provided — same as the main platform)
- Use Supabase Auth with email/password signup
- The signup creates a user in the same Supabase project the platform uses
- After signup, the user can immediately log into the platform at agency-review-portal.vercel.app

---
name: feelistic-aries-design-system
version: 1.0.0
description: >-
  Design-system skill for building premium AI, fintech, enterprise and frontier-tech websites
  inspired by the visual language of Feelistic and Aries Global. Use the references as
  aesthetic and interaction guidance, never as templates to copy literally.
references:
  - https://www.feelistic.com/
  - https://www.aries.global/
use_when:
  - premium AI / decision intelligence landing pages
  - regulated fintech / institutional technology
  - enterprise AI infrastructure
  - frontier-tech / agentic software
  - high-end corporate product storytelling
---

# Feelistic × Aries Design System Skill

## 0. Mission

Create websites that feel **institutional, intelligent, premium and slightly futuristic** without falling into generic “AI SaaS” aesthetics.

The system combines two complementary visual languages:

- **Feelistic mode** → precision, regulation, deterministic systems, black space, champagne-gold metal, diagrammatic logic, controlled intensity.
- **Aries mode** → frontier technology, atmospheric depth, emerald/teal worlds, cosmic imagery, warm signal gradients, oversized editorial composition.
- **Hybrid mode** → Feelistic structure + Aries atmosphere. This is the default when no mode is specified.

The final interface must look designed by an experienced art director, not assembled from common SaaS components.

Do **not** reproduce exact site sections, proprietary assets, copy, logos or distinctive compositions. Extract principles and rebuild them for the target product.

---

# 1. Core aesthetic

## 1.1 Keywords

Use these words as the visual north star:

**Institutional / cinematic / intelligent / restrained / tactile / precise / editorial / high-contrast / atmospheric / technical / premium / consequential.**

Avoid:

**cute / bubbly / startup-generic / neon-cyberpunk / gaming / dashboard-everywhere / rainbow-AI / excessive glassmorphism / purple-gradient SaaS.**

## 1.2 Emotional balance

Target this mix:

- 35% trust and authority
- 25% technical sophistication
- 20% visual wonder
- 15% editorial sophistication
- 5% surprise

The site should communicate: **“serious infrastructure, built with frontier technology.”**

---

# 2. Reference signatures

## 2.1 Feelistic signature

Feelistic’s strongest reusable characteristics:

1. **Near-black field** as the primary canvas.
2. **Champagne / metallic gold** as the premium signal color.
3. **Isolated 3D metallic objects** on transparent/dark backgrounds.
4. Technical themes expressed through physical metaphors: processor, decision nodes, inspection, architecture.
5. **All-caps or tightly controlled labels** combined with larger statements.
6. Metrics, methodology steps and institutional claims are presented as structural proof, not decorative marketing.
7. High separation between sections: dark void → object → text → proof.
8. Large areas of negative space.
9. Sparse but deliberate visual ornament.
10. Motion should feel engineered, slow and exact.

### Feelistic should feel like

A private banking research terminal crossed with a luxury industrial design studio.

### Never turn Feelistic into

- black-and-yellow “cybersecurity” cliché;
- gold gradients everywhere;
- glossy luxury e-commerce;
- crypto branding;
- generic 3D blobs.

---

## 2.2 Aries signature

Aries’ strongest reusable characteristics:

1. **Deep emerald / black-green atmosphere**.
2. Editorial hero copy broken into dramatic line groups.
3. Large typography that becomes part of the composition.
4. **Organic distorted imagery**: water, sky, liquid refraction, celestial landscapes, analog textures.
5. Warm counterpoint: **orange → cream → white** signal gradients.
6. Alternation between immersive imagery and very clean product explanation.
7. Brand language is confident but sparse.
8. Imagery often carries a cinematic / frontier / cosmic feeling rather than literal product screenshots.
9. Rounded image containers may appear, but not every card should be rounded.
10. The product is explained through layers and systems, while the visual world remains emotional.

### Aries should feel like

A frontier research company with the polish of an editorial culture magazine and the confidence of a major infrastructure business.

### Never turn Aries into

- generic nature-tech branding;
- “aurora gradient” wallpaper;
- sci-fi HUD interfaces;
- excessive star fields;
- dark teal SaaS with ordinary cards.

---

# 3. Mode selector

Before designing, choose one mode.

## Mode A — FEELISTIC / Institutional Intelligence

Use when the product is about:

- finance
- regulation
- risk
- compliance
- decision systems
- auditability
- governance
- security
- institutional operations

Visual ratio:

- 75% near-black
- 15% warm neutral
- 8% metallic gold
- 2% accent light

## Mode B — ARIES / Frontier Enterprise

Use when the product is about:

- AI infrastructure
- operating systems
- agents
- enterprise automation
- critical technology
- acquisition platform / software group
- frontier engineering

Visual ratio:

- 45% dark green / black
- 25% warm ivory / white
- 15% photographic atmosphere
- 10% orange/cream signal gradients
- 5% teal highlights

## Mode C — HYBRID / Default

Use Feelistic for:

- navigation
- information architecture
- product proof
- metrics
- technical diagrams
- methodology
- CTA precision

Use Aries for:

- hero atmosphere
- large-scale typography
- image direction
- section transitions
- emotional storytelling
- feature-world backgrounds

Recommended ratio:

**60% Feelistic discipline + 40% Aries atmosphere.**

---

# 4. Color system

> These values are practical approximations inspired by the references. They are design tokens, not claims about the sites’ original CSS values.

## 4.1 Shared foundation

```css
:root {
  --ink-000: #000000;
  --ink-050: #050706;
  --ink-100: #0A0D0B;
  --ink-200: #101512;

  --paper-000: #FFFFFF;
  --paper-050: #FAF8F1;
  --paper-100: #F2EEE4;
  --paper-200: #E7E0D2;

  --text-primary-dark: #F7F5EF;
  --text-secondary-dark: rgba(247, 245, 239, 0.68);
  --text-tertiary-dark: rgba(247, 245, 239, 0.44);

  --text-primary-light: #111410;
  --text-secondary-light: rgba(17, 20, 16, 0.64);

  --line-dark: rgba(255,255,255,0.12);
  --line-light: rgba(12,18,14,0.14);
}
```

## 4.2 Feelistic palette

```css
:root {
  --feelistic-bg: #030403;
  --feelistic-panel: #0A0A08;
  --feelistic-panel-raised: #11100C;

  --gold-50: #FFF5D6;
  --gold-100: #F4D995;
  --gold-200: #DDB96E;
  --gold-300: #B88B43;
  --gold-400: #7A572A;
  --gold-shadow: #3B2812;

  --bronze-muted: #80663E;
  --champagne: #E9D2A3;
}
```

Use gold as a **material**, not just a flat color. Prefer multi-stop highlights:

```css
background: linear-gradient(
  135deg,
  #6F4A21 0%,
  #D8AE61 24%,
  #FFF0B4 46%,
  #A77432 68%,
  #F1D189 100%
);
```

Never use this gradient on large text blocks. Use it for icons, rails, micro-borders, visual objects and rare CTA accents.

## 4.3 Aries palette

```css
:root {
  --aries-void: #06100E;
  --aries-deep: #0C1C18;
  --aries-forest: #12332C;
  --aries-teal: #24665E;
  --aries-aqua: #72B4A6;

  --aries-cream: #FFF8DC;
  --aries-peach: #F2B080;
  --aries-coral: #FF6A3A;
  --aries-rust: #A44828;
}
```

Signal gradient:

```css
background: linear-gradient(
  180deg,
  #FFFDF1 0%,
  #FFF0B7 20%,
  #FFAA72 44%,
  #FF6038 62%,
  #7A3828 78%,
  #10221D 100%
);
```

Dark atmospheric gradient:

```css
background:
  radial-gradient(circle at 72% 18%, rgba(99,190,175,.35), transparent 34%),
  radial-gradient(circle at 22% 78%, rgba(28,92,78,.28), transparent 42%),
  linear-gradient(145deg, #07100E 0%, #0A211C 55%, #163F36 100%);
```

## 4.4 Color discipline

- One section = one dominant color idea.
- Never use more than **one saturated accent family** in the same viewport.
- Large body copy should be neutral, not gold/orange.
- On dark sections, secondary text opacity should generally stay between `.52` and `.72`.
- Borders must be quieter than typography.
- Avoid pure white on huge surfaces; warm white is usually more premium.

---

# 5. Typography

## 5.1 Font strategy

Do not depend on the exact proprietary/reference fonts.

Use a pairing:

- **Primary sans:** modern grotesk / neo-grotesk with neutral geometry.
- **Editorial serif (optional):** restrained high-contrast serif for brand/logo moments, pull quotes, special display words.
- **Mono (rare):** only for telemetry, model IDs, system states and technical labels.

Recommended accessible substitutes:

- Sans: Inter, Geist, Manrope, Instrument Sans, IBM Plex Sans
- Editorial serif: Instrument Serif, DM Serif Display, Source Serif 4
- Mono: IBM Plex Mono, Geist Mono

## 5.2 Type scale

```css
:root {
  --fs-hero-xl: clamp(4.75rem, 10vw, 10.5rem);
  --fs-hero: clamp(3.75rem, 7.2vw, 8rem);
  --fs-display: clamp(3rem, 5.2vw, 6rem);
  --fs-h1: clamp(2.5rem, 4vw, 4.75rem);
  --fs-h2: clamp(2rem, 3vw, 3.5rem);
  --fs-h3: clamp(1.45rem, 2vw, 2.2rem);
  --fs-lead: clamp(1.15rem, 1.4vw, 1.5rem);
  --fs-body: 1rem;
  --fs-small: 0.875rem;
  --fs-label: 0.72rem;
}
```

## 5.3 Headline rules

### Aries headlines

- 2–6 lines are acceptable.
- Use deliberate line breaks.
- Keep line-height tight: `0.88–0.98` for huge display copy.
- Often align left but allow the text block to become an image-like composition.
- Use mixed visual rhythm: a short line, then a long line, then a short line.
- Avoid center alignment for every section.

### Feelistic headlines

- More compact and architectural.
- Uppercase may be used for institutional statements.
- Tracking can be slightly expanded for labels, never for paragraphs.
- Headings should feel like declarations or system rules.

## 5.4 Labels

```css
.ds-label {
  font-size: 0.72rem;
  line-height: 1;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 600;
}
```

Use labels for:

- section index
- capability name
- status
- system layer
- geography
- metric context

Do not make every piece of text uppercase.

---

# 6. Layout system

## 6.1 Grid

Desktop:

```text
max-width: 1440–1600 px
content padding: 32–64 px
12-column grid
column gap: 16–28 px
section vertical padding: 112–220 px
```

Tablet:

```text
8-column grid
padding: 24–32 px
section padding: 80–144 px
```

Mobile:

```text
4-column grid
padding: 18–22 px
section padding: 64–104 px
```

## 6.2 Width rhythm

Do not lock every section to the same width.

Alternate between:

- edge-to-edge cinematic image
- wide 12-column editorial block
- narrow 6–8 column explanation
- split 5/7 or 4/8 feature section
- centered 6-column manifesto

This variation is essential to prevent a generic SaaS layout.

## 6.3 Vertical rhythm

Use large silence between ideas.

Recommended spacing tokens:

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;
  --space-10: 128px;
  --space-11: 160px;
  --space-12: 224px;
}
```

Use `96–224px` gaps for major narrative transitions.

---

# 7. Radius system

The references do not rely on uniformly rounded SaaS cards.

```css
:root {
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 22px;
  --radius-xl: 32px;
  --radius-pill: 999px;
}
```

Rules:

- Data/system UI: 6–14px.
- Editorial imagery: 18–32px when softness is needed.
- Buttons: pill or 10–14px depending on brand tone.
- Do not apply `24px` to every object.

---

# 8. Navigation

## 8.1 Desktop navbar

Use a minimal header with 3 layers:

```text
[brand]                [product] [company] [insights]          [primary action]
```

Characteristics:

- height: 64–84px
- transparent over hero when contrast allows
- optional thin bottom rule
- small but high-quality typography
- no giant multi-row mega-nav unless content truly requires it

## 8.2 Dark atmospheric navbar

```css
.nav {
  background: rgba(5, 12, 10, 0.32);
  border-bottom: 1px solid rgba(255,255,255,.09);
  backdrop-filter: blur(16px) saturate(120%);
}
```

Use blur sparingly. The entire site must not become glass.

## 8.3 Primary action

CTA should be short:

- Apply
- Book a call
- Explore platform
- View system
- Request access
- Run assessment

Avoid: “Get Started For Free Today”.

---

# 9. Hero system

## 9.1 Aries hero recipe

Structure:

```text
NAV

LARGE MULTILINE DISPLAY STATEMENT
               atmospheric image / video / shader
short supporting sentence
small binary/system control or CTA
```

Rules:

- hero min-height: `90–110svh`
- headline occupies 40–75% of visual attention
- image should be atmospheric rather than literal
- keep the CTA restrained
- crop imagery dramatically
- use visual depth: image may disappear into dark background

Suggested typography:

```css
.hero-title {
  font-size: clamp(4rem, 9vw, 10rem);
  line-height: .9;
  letter-spacing: -0.055em;
  font-weight: 500;
  max-width: 12ch;
}
```

## 9.2 Feelistic hero recipe

Structure:

```text
NAV
small institutional eyebrow
large declaration
short proof-oriented description
primary + secondary CTA
floating / anchored metallic object
```

Composition:

- black background
- metallic object may occupy right 40–55%
- object should have realistic material response
- copy should remain dry and confident
- avoid decorative particles

## 9.3 Hybrid hero

Best general recipe:

```text
Near-black / emerald field
Oversized Aries-like line-broken statement
Feelistic-style metallic technical object
One warm/gold signal
Quiet institutional CTA
```

---

# 10. Image direction

## 10.1 Feelistic imagery

Prefer:

- metallic gold / champagne 3D objects
- abstract processors
- rails, nodes, decision trees represented physically
- magnifiers / inspection metaphors
- topographic or algorithmic textures
- subtle glowing typographic patterns
- black void backgrounds

Material properties:

```text
brushed gold
satin metal
soft specular highlights
warm rim light
high contrast
low ambient fill
```

Avoid:

- cartoon 3D
- clay render style
- emoji-like icons
- random glossy spheres without semantic purpose

## 10.2 Aries imagery

Prefer:

- dark teal liquid distortion
- refracted landscapes
- star-filled atmospheric scenes
- organic macro textures
- blurred / analog grain
- warped water surfaces
- warm dawn highlights against teal shadows

Treat images as **world-building**, not illustration filler.

## 10.3 Grain

A very fine film grain may be added:

```css
.visual::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: .045;
  mix-blend-mode: soft-light;
  background-image: url('/textures/noise.png');
}
```

Never use obvious noise.

---

# 11. Gradient language

## 11.1 Aries signal columns

Use vertical gradients as visualized “energy” or “system state”.

Pattern:

```text
cream → yellow-white → peach → saturated orange → rust → deep green
```

Can be repeated across adjacent vertical strips with different heights.

Use this for:

- product architecture
- process phases
- system layers
- data intensity
- section transitions

Never use it behind long paragraphs.

## 11.2 Feelistic metallic gradient

Gold should imitate reflected metal, not a web gradient.

Use narrow highlights and asymmetric stops.

```css
--metal-gold: linear-gradient(
  112deg,
  #4D3219 0%,
  #9D7139 18%,
  #F6DEA1 35%,
  #B7813F 48%,
  #FFF0B4 58%,
  #8A5B2B 78%,
  #D5AE68 100%
);
```

---

# 12. Cards and surfaces

## 12.1 Default principle

**Do not cardify everything.**

Before adding a card ask:

> Does this information need a bounded surface, or can spacing and typography communicate hierarchy?

## 12.2 Technical card

```css
.technical-card {
  background: rgba(255,255,255,.025);
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 12px;
  padding: 28px;
}
```

Use for:

- system capabilities
- model layer
- metrics
- audit evidence

## 12.3 Editorial card

Image-heavy, larger, less UI-like.

```text
image ratio: 4:3 / 16:10 / large portrait
radius: 20–30px
caption outside image preferred
```

## 12.4 Avoid

- identical 3-column card grids repeated section after section
- drop shadows on dark surfaces
- floating white cards on dark backgrounds without narrative reason
- excessive icons in colored circles

---

# 13. Buttons and interactions

## 13.1 Primary dark button

```css
.btn-primary {
  min-height: 46px;
  padding: 0 20px;
  border-radius: 999px;
  background: #F7F3E8;
  color: #0A0D0B;
  border: 1px solid rgba(255,255,255,.24);
}
```

Hover:

- translate `0 → -1px`
- subtle brightness change
- arrow moves `2–4px`
- 180–260ms

## 13.2 Gold institutional CTA

Gold should usually be the border, icon, dot or tiny highlight — not the full button fill.

Preferred:

```css
.btn-gold-outline {
  color: #F3DCA7;
  border: 1px solid rgba(221,185,110,.55);
  background: rgba(221,185,110,.04);
}
```

## 13.3 Text links

Use directional motion:

```text
Explore system  ↗
Read methodology  →
```

Underline may animate from left to right.

---

# 14. Metrics

Metrics should look like proof.

Recommended structure:

```text
small context label
85%+
Short factual explanation
```

Style:

- huge number
- muted explanation
- minimal framing
- separated by hairlines or large whitespace

Never create colorful dashboard KPI cards for institutional landing pages.

---

# 15. Methodology / process sections

Inspired by Feelistic’s strongly structured process language.

Use large step indices:

```text
01  Define
02  Structure
03  Validate
04  Deploy
```

Each step contains:

- 2-digit index
- imperative title
- one concise paragraph
- optional 3D symbolic object / technical diagram

Desktop behavior:

- sticky left title + scrolling steps
or
- horizontal step rail
or
- asymmetric 4-column sequence

Mobile behavior:

- vertical sequence
- never horizontal-scroll core information

---

# 16. Product architecture sections

Inspired by Aries’ “operating system / embedded across functions” logic.

Best pattern:

```text
Section title
short system claim

[Layer tabs]
Data / Orchestration / Human / Visibility

large changing visual
supporting explanation
```

Interaction rules:

- switching a layer should update one major visual, not the entire viewport
- transition: crossfade + 8–16px movement
- selected layer = bright text + thin signal line
- inactive layers = 45–60% opacity

Do not imitate dashboard tabs if the experience is editorial.

---

# 17. Section archetypes

Use 6–9 different archetypes over a long landing page.

Recommended set:

### A. Manifesto hero
Huge typography + atmospheric visual.

### B. Proof strip
3–4 metrics with almost no boxes.

### C. System layers
Interactive feature architecture.

### D. Full-bleed cinematic visual
No UI chrome; one line of copy.

### E. Institutional methodology
Numbered process with strict structure.

### F. Contrast section
Switch from dark green/black to warm ivory.

### G. Artifact showcase
Metallic technical object + explanation.

### H. Editorial statement
Large quote or thesis occupying 6–10 columns.

### I. Final CTA
Simple, large and confident; avoid a complex footer-card stack.

---

# 18. Motion system

Motion should communicate **depth, system response and confidence**.

## 18.1 Timing tokens

```css
:root {
  --dur-fast: 160ms;
  --dur-ui: 240ms;
  --dur-section: 650ms;
  --dur-cinematic: 1200ms;
  --ease-out: cubic-bezier(.16,1,.3,1);
  --ease-soft: cubic-bezier(.22,.61,.36,1);
}
```

## 18.2 Recommended motion

- opacity reveal + 12–32px vertical translation
- masked headline reveal
- image scale `1.04 → 1.00`
- slow background parallax 2–6%
- gradient drift
- gentle liquid distortion
- line drawing for system diagrams
- tab-to-tab visual crossfade
- metallic object rotation under 2–5° only when pointer moves

## 18.3 Avoid

- bouncy spring on every object
- spinning gradients
- fast infinite marquee everywhere
- floating cards
- gratuitous cursor followers
- aggressive WebGL that interferes with reading

## 18.4 Reduced motion

Always support:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

# 19. Scroll choreography

A premium page should change visual energy as the user moves.

Suggested sequence:

```text
1. Deep atmospheric hero
2. Minimal thesis / white-space pause
3. Product architecture
4. Visual immersion
5. Hard proof / metrics
6. Methodology
7. Warm or light contrast section
8. Editorial company / trust narrative
9. Dark final CTA
```

Do not keep the same darkness, same component density and same card rhythm for the entire page.

---

# 20. Light sections

Even if the site is primarily dark, use one or two warm-light sections.

```css
.light-section {
  background: #F6F2E8;
  color: #121510;
}
```

Purpose:

- reset visual fatigue
- show product detail
- present proof or methodology
- make the next dark section feel more cinematic

Aries-style warm signal gradients work especially well near these transitions.

---

# 21. Decorative system

Use decorative elements only when they reinforce the product story.

Allowed:

- thin rules
- coordinate marks
- tiny system dots
- subtle index numbers
- 1px crosshairs
- sparse node graphs
- abstract gradient columns
- slow liquid image masks
- metallic micro-objects

Not allowed:

- random floating circles
- AI sparkles
- excessive grid overlays
- generic neural-network backgrounds
- neon borders on every surface

---

# 22. Data visualization

For charts:

- dark or warm neutral canvas
- one highlight color
- thin axes
- sparse labels
- no rainbow series
- emphasize the conclusion rather than plotting everything

Preferred chart palette:

```css
--chart-main: #E1C17A;   /* Feelistic */
--chart-alt: #79B6AA;    /* Aries */
--chart-muted: rgba(255,255,255,.24);
```

Use gold **or** teal as the primary chart signal, rarely both in equal strength.

---

# 23. Accessibility

Premium styling does not justify poor usability.

Must satisfy:

- visible focus state
- keyboard operability
- WCAG AA contrast for body copy
- minimum interactive size ~44px
- semantic headings
- meaningful alt text
- reduced-motion support
- color is never the only signal
- text over atmospheric images must have reliable contrast support

Use gradient scrims behind text if needed:

```css
background: linear-gradient(
  90deg,
  rgba(4,9,7,.86) 0%,
  rgba(4,9,7,.46) 48%,
  transparent 82%
);
```

---

# 24. Responsive behavior

## Desktop

- embrace dramatic line breaks
- allow oversized type
- use asymmetric layouts
- use cinematic imagery

## Tablet

- reduce headline scale by ~20–30%
- simplify overlapping layers
- convert 4-column feature matrices to 2-column

## Mobile

- hero title: usually 44–72px
- do not preserve desktop line breaks blindly
- remove low-value decorative images
- maintain strong vertical rhythm
- all CTA targets >= 44px
- product-layer tabs may become stacked or horizontally scrollable only if labels are short
- keep atmospheric imagery, but crop more aggressively

---

# 25. Component specification

## 25.1 `HeroEditorial`

Props:

```ts
type HeroEditorialProps = {
  eyebrow?: string
  title: string
  body?: string
  primaryAction?: Action
  secondaryAction?: Action
  visual?: Media
  tone?: 'aries' | 'feelistic' | 'hybrid'
}
```

Behavior:

- `aries`: image-led, huge text, teal atmosphere
- `feelistic`: black + metallic technical artifact
- `hybrid`: atmospheric field + metallic object

## 25.2 `MetricProof`

```ts
type MetricProof = {
  value: string
  label: string
  note?: string
}
```

No default card background.

## 25.3 `SystemLayerTabs`

```ts
type SystemLayer = {
  id: string
  name: string
  headline: string
  body: string
  visual: Media
}
```

Use for infrastructure / architecture storytelling.

## 25.4 `MethodStep`

```ts
type MethodStep = {
  index: string
  title: string
  body: string
  artifact?: Media
}
```

## 25.5 `CinematicPanel`

Full-width visual with optional title overlay.

Properties:

```text
min-height: 60–90svh
image: cover
radius: 0–32px depending on context
overlay: restrained
```

## 25.6 `InstitutionalCTA`

Use one strong sentence and one action.

Avoid complex conversion forms in the cinematic landing flow.

---

# 26. CSS starter tokens

```css
:root {
  /* canvas */
  --bg: #06100E;
  --surface: #0C1713;
  --surface-2: #121E19;
  --fg: #F6F3EA;
  --muted: rgba(246,243,234,.64);
  --hairline: rgba(255,255,255,.11);

  /* Feelistic */
  --gold: #DDB96E;
  --gold-hi: #FFF0B4;
  --gold-low: #7A572A;

  /* Aries */
  --teal: #24665E;
  --aqua: #72B4A6;
  --coral: #FF6A3A;
  --cream: #FFF8DC;

  /* geometry */
  --page-pad: clamp(20px, 4vw, 64px);
  --content-max: 1540px;
  --radius: 14px;
  --radius-media: 28px;

  /* motion */
  --ease: cubic-bezier(.16,1,.3,1);
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: Inter, system-ui, sans-serif;
  text-rendering: optimizeLegibility;
}

.container {
  width: min(calc(100% - 2 * var(--page-pad)), var(--content-max));
  margin-inline: auto;
}

.display {
  font-size: clamp(3.75rem, 8vw, 9rem);
  line-height: .91;
  letter-spacing: -0.055em;
  font-weight: 500;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: .12em;
  font-size: .72rem;
  font-weight: 600;
}
```

---

# 27. React / implementation guidance

For web implementation prefer:

- React / Next.js
- semantic HTML first
- CSS variables for design tokens
- Framer Motion or Motion One only where motion materially improves narrative
- CSS gradients before WebGL
- WebGL only for one or two hero-level moments
- `<picture>` / responsive images
- AVIF/WebP for cinematic assets

Do not add a heavyweight 3D engine just because the reference uses rich imagery.

If creating metallic artifacts procedurally:

- use static pre-rendered assets first
- if interactive 3D is required, lazy-load it
- provide poster fallback
- pause rendering when offscreen

---

# 28. Page-building algorithm for an AI agent

When this skill is active, follow this exact process.

## Step 1 — classify the product

Classify into one:

```text
regulated / institutional
frontier / AI infrastructure
hybrid
```

## Step 2 — choose dominant reference

- regulated → Feelistic 70 / Aries 30
- frontier → Aries 70 / Feelistic 30
- hybrid → 55 / 45 based on content

## Step 3 — choose one visual metaphor

Examples:

- decision engine → metallic processor / branching rail
- orchestration → layered signal field
- trusted AI → audited physical artifact
- enterprise OS → atmospheric interconnected world

Use **one** core metaphor per major section.

## Step 4 — write the hierarchy before styling

Each page needs:

1. one thesis
2. one product explanation
3. one proof layer
4. one method / architecture layer
5. one trust layer
6. one CTA

## Step 5 — assign visual energy

Mark every section:

```text
LOW / MEDIUM / HIGH
```

Never place more than two HIGH-energy sections adjacent.

## Step 6 — build desktop composition

Use editorial grid, not card stack.

## Step 7 — derive mobile composition independently

Do not simply shrink desktop.

## Step 8 — add motion last

Motion supports hierarchy; it never creates hierarchy.

---

# 29. Hybrid recipes

## Recipe 1 — Premium AI infrastructure

```text
Hero: Aries
Architecture: Feelistic
Imagery: Aries liquid / cosmic
Proof: Feelistic metrics
CTA: Aries editorial line + Feelistic precise button
```

## Recipe 2 — Regulated fintech AI

```text
Hero: Feelistic
Artifact: metallic gold decision object
Methodology: Feelistic
Trust section: warm Aries light section
Final CTA: deep emerald cinematic
```

## Recipe 3 — Agentic enterprise OS

```text
Hero: Aries multiline statement
System layers: Aries
Capability proof: Feelistic
Case studies: light editorial
Closing: cosmic/cinematic Aries visual
```

---

# 30. Copy style

The design works best with concise copy.

## Headlines

Prefer:

- “Decision logic, made executable.”
- “Infrastructure for autonomous operations.”
- “Your institutional knowledge, encoded.”
- “AI that can act. Systems you can audit.”

Avoid:

- “Revolutionizing the future with AI-powered innovation.”
- “Unlock the power of AI.”
- “Transform your business today.”

## Body copy

- short sentences
- concrete nouns
- fewer adjectives
- no hype stacking
- claims should be followed by architecture, evidence or measurable outcomes

---

# 31. Do / Don't

## DO

- use oversized editorial typography
- leave large areas of negative space
- mix immersive imagery with rigorous product proof
- use black, emerald, warm ivory and metallic gold thoughtfully
- create asymmetry
- use section-level visual contrast
- treat imagery as art direction
- make metrics feel evidential
- use motion slowly and intentionally
- build responsive layouts separately

## DON'T

- default to purple-blue AI gradients
- create 10 nearly identical cards
- put everything inside glass panels
- use gold as a cheap luxury effect
- use cosmic images unrelated to product narrative
- center-align the whole site
- animate every element
- use more than two decorative accent systems simultaneously
- hide weak information architecture behind visuals
- directly copy either reference

---

# 32. Quality gates

Before shipping, score each item `0 / 1`.

```text
[ ] Hero has a unique composition rather than a standard SaaS split.
[ ] Typography is large enough to create editorial identity.
[ ] Body copy remains readable and restrained.
[ ] At least one section uses strong negative space.
[ ] At least one section changes surface tone dramatically.
[ ] Gold/orange is used as a signal, not wallpaper.
[ ] Atmospheric imagery has a conceptual connection to the product.
[ ] There are fewer cards than a typical SaaS landing page.
[ ] Product architecture is understandable without animation.
[ ] Motion survives prefers-reduced-motion.
[ ] Mobile design is intentionally recomposed.
[ ] No low-contrast body text over complex imagery.
[ ] The page does not look like a template from a component library.
[ ] The experience feels expensive even with animations disabled.
```

Target: **12/14 minimum**.

---

# 33. Anti-generic enforcement

If the generated page contains three or more of the following, redesign it:

```text
- centered badge + centered H1 + centered subtitle + two centered CTAs
- generic gradient orb
- 3-column icon card grid
- purple/blue glow
- testimonials in identical rounded cards
- “Trusted by” logo strip directly below hero
- pill on every label
- Bento grid with no narrative purpose
- arbitrary glassmorphism
- generic AI sparkles
```

Replace them with:

- editorial line breaks
- asymmetric grid
- full-bleed atmospheric image
- physical technical artifact
- proof strip
- architectural system diagram
- light/dark section transition

---

# 34. Final design brief template

Before generating the interface, internally formulate:

```text
MODE:
Feelistic / Aries / Hybrid

PRODUCT CHARACTER:
Institutional / Frontier / Regulated / Technical

PRIMARY SURFACE:
Near-black / Deep emerald / Warm ivory

PRIMARY SIGNAL:
Metallic gold / Teal / Orange-cream gradient

HERO METAPHOR:
...

TYPOGRAPHIC CHARACTER:
Architectural / Editorial / Mixed

VISUAL ENERGY:
Hero HIGH
Proof LOW
Architecture MEDIUM
Cinematic HIGH
Method LOW
CTA MEDIUM

PRIMARY MOTION:
...

WHAT WE WILL NOT USE:
...
```

Then build the page.

---

# 35. Source notes

This skill was derived from visual and structural study of:

- Feelistic — https://www.feelistic.com/
- Aries Global — https://www.aries.global/

Observed Feelistic traits include dark institutional presentation, gold/metallic technical visual assets, regulator/decision-intelligence messaging, quantitative proof sections and numbered methodology structures.

Observed Aries traits include large editorial hero typography, dark emerald/teal atmospheric imagery, organic distorted/cosmic imagery, warm orange-to-cream gradient visuals, system-layer storytelling and large cinematic section transitions.

Token values in this file are **intentional approximations for implementation**, not extracted proprietary source values.

---

# 36. One-line instruction for coding agents

> Build the interface as if Feelistic supplied the institutional rigor and metallic precision, while Aries supplied the cinematic atmosphere, editorial scale and frontier-tech emotion. Keep the result sparse, high-contrast, technically credible and visually authored; never fall back to generic SaaS patterns.

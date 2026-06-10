# Design

Generated from the live token system in `ai_recruitment-fe/src/styles/brand.css` and `src/tokens.ts`. Edit those files to re-brand; this document describes intent.

## Theme

Light, single theme. Scene: a recruiter on a laptop in a bright office mid-morning, scanning candidate scores between calls. Background `#F4F5F6` (near-white, cool), white working surfaces, ink-navy text.

## Color

Strategy: **restrained**. Tinted neutrals plus one accent under 10% of any screen.

- Primary ink / brand: `--nu-lapis #050766` (deep lapis; headers, primary buttons, links)
- Accent: `--nu-red #E62A32` (NULogic red; destructive, alerts, the rare emphasis)
- Success `#1F9E6C`, Warning `#C77A12` with matching light tints for badges
- Text: `#0F1640` primary, `#5A5F7A` muted, `#c0c2d4` subtle
- Surfaces: bg `#F4F5F6`, card `#FFFFFF`, border `#e4e5ec`, divider `#f0f1f5`
- Brand gradient (`#ED3027 to #7B469B`) appears only in the logo mark, never on UI surfaces or text.

## Typography

- Display: Sora (600/700), `tracking-tight`, for page titles and key numerals
- Body: Instrument Sans (400/500), 14px base in app surfaces
- Numbers in tables and scores: tabular-nums; monospace only for IDs
- Body line length capped at 65ch; hierarchy via >=1.25 scale steps and weight contrast

## Components

- Buttons: `.btn-primary` lapis fill, 12px radius, subtle sheen on hover, `active:scale-[0.98]`
- Inputs: white, 1.5px border `#e4e5ec`, 12px radius, 4px brand-ring focus shadow, label above
- Tables/lists: full-width rows separated by `--brand-divider`; row hover `#f7f8fc`; no boxed mini-cards
- Badges: tinted background + dark text of the same hue (success/warning/accent tints)
- Cards: only for true elevation (modals, popovers). Group page content with whitespace and 1px dividers instead.

## Layout

- App shell: fixed light sidebar, content area `max-w-[1400px]` with generous left-aligned page headers
- Spacing rhythm: 4px base; sections breathe (32 to 48px), dense data tightens (8 to 12px)
- No identical card grids; metrics sit on the baseline grid as typography, separated by dividers

## Motion

- Durations: 140 / 240 / 420ms; ease-out-expo `cubic-bezier(0.16, 1, 0.3, 1)` for entrances, spring for pop-ins
- Compositor-only (`transform`, `opacity`); staggered list entrances at 60 to 90ms steps
- Respect `prefers-reduced-motion`

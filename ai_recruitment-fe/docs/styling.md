# Styling System

The design system is built on **Tailwind CSS + CSS Custom Properties**.
All brand colors live in one file — swap it to re-brand the entire app.

---

## File Structure

```
ai_recruitment-fe/src/
├── styles/
│   ├── brand.css       ← ONLY file to edit when re-branding
│   └── print.css       Print / PDF export styles
├── index.css           Global entry: imports brand + print, then Tailwind + components
└── tokens.ts           TypeScript color constants for inline style={} props
```

`main.tsx` imports `index.css` once — that is the single CSS entry point for the app.

---

## Brand Tokens (`src/styles/brand.css`)

All values are CSS custom properties on `:root`. Every component class and print
style references these — no hardcoded hex values elsewhere in CSS files.

### Core Palette

| Variable | Value | Usage |
|----------|-------|-------|
| `--nu-lapis` | `#050766` | Primary brand colour |
| `--nu-navy` | `#25255C` | Primary dark |
| `--nu-red` | `#E62A32` | Accent / error |
| `--nu-purple` | `#8939A1` | Purple accent |
| `--nu-teal` | `#133E49` | Teal accent |
| `--nu-near-white` | `#F4F5F6` | Page background |
| `--nu-coral` | `#EE777C` | Coral / soft red |
| `--nu-light-purple` | `#B17DC1` | Light purple |
| `--nu-indigo` | `#61629D` | Mid indigo |

### Semantic — Primary

| Variable | Value |
|----------|-------|
| `--brand-primary` | `#050766` |
| `--brand-primary-dark` | `#25255C` |
| `--brand-primary-light` | `#eef0fa` |
| `--brand-primary-ring` | `rgba(5,7,102,0.12)` |
| `--brand-primary-shadow` | `rgba(5,7,102,0.22)` |

### Semantic — States

| Variable | Value | Use |
|----------|-------|-----|
| `--brand-success` | `#1F9E6C` | Positive score, selected JD |
| `--brand-success-light` | `#e6f7f0` | Success background |
| `--brand-success-border` | `#b3e6d4` | Success border |
| `--brand-success-text` | `#155c3e` | Dark text on success bg |
| `--brand-warning` | `#C77A12` | Medium score |
| `--brand-warning-light` | `#fef3e1` | Warning background |
| `--brand-warning-border` | `#f5d9a0` | Warning border |
| `--brand-accent` | `#E62A32` | Low score / error / rejection |
| `--brand-accent-light` | `#fce8e9` | Accent background |
| `--brand-accent-border` | `#f5c2c4` | Accent border |

### Typography

| Variable | Value |
|----------|-------|
| `--brand-text` | `#0F1640` |
| `--brand-text-muted` | `#5A5F7A` |
| `--brand-text-subtle` | `#c0c2d4` |

### Surfaces

| Variable | Value |
|----------|-------|
| `--brand-bg` | `#F4F5F6` |
| `--brand-card` | `#FFFFFF` |
| `--brand-border` | `#e4e5ec` |
| `--brand-border-strong` | `#d0d2df` |
| `--brand-divider` | `#f0f1f5` |
| `--brand-row-hover` | `#f7f8fc` |
| `--brand-skeleton` | `#edeef5` |
| `--brand-neutral` | `#f0f0f2` |

### Gradients

| Variable | Value | Usage |
|----------|-------|-------|
| `--nu-grad-primary` | `135deg, #D42F7B → #E8623A` | `.btn-gradient`, workflow stage icons |
| `--nu-grad-dark` | `135deg, #1B1F4E → #7B2D8E` | Dashboard header, active nav pill |
| `--nu-grad-brand` | `→right, #ED3027 → #7B469B` | Sidebar logo icon |

---

## TypeScript Tokens (`src/tokens.ts`)

Mirror of brand.css for use in JSX `style={}` props where CSS classes are insufficient.

```tsx
import { C } from '../tokens'

<div style={{ color: C.TEXT, backgroundColor: C.PRIMARY_LIGHT }} />
<span style={{ color: C.SUCCESS }} />
```

**To re-brand:** update **both** `brand.css` and `tokens.ts`.
They serve the same values — CSS variables for stylesheet rules, TypeScript constants for inline styles.

---

## Global CSS (`src/index.css`)

Import order matters:

```
1. @import './styles/brand.css'    CSS custom properties
2. @import './styles/print.css'    Print media styles
3. @tailwind base                  Tailwind reset
4. @tailwind components            Tailwind component layer
5. @tailwind utilities             Tailwind utility classes
6. @keyframes                      Animation definitions
7. @layer base                     body defaults
8. @layer components               Shared UI classes
```

> `@import` must precede all other rules per CSS spec.
> Vite inlines both imports before PostCSS / Tailwind runs.

---

## Component Classes

All defined in `@layer components` inside `index.css`.

### `.card`

White rounded panel with border and subtle shadow.

```css
.card {
  @apply bg-white rounded-2xl shadow-sm p-6 transition-shadow duration-200;
  border: 1px solid var(--brand-border);
}
```

`.card-interactive` — adds lift-on-hover transform (`translateY(-2px)`).

---

### `.btn-primary`

Primary CTA button — lapis background, white text.

```css
.btn-primary {
  @apply inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm;
  background-color: var(--brand-primary);
  color: #ffffff;
  box-shadow: 0 1px 4px 0 var(--brand-primary-shadow);
}
```

Hover: `background-color: var(--brand-primary-dark)`, `translateY(-1px)`.  
Active: `scale(0.95)`.  
Disabled: `opacity: 0.5`, no transform.

---

### `.btn-secondary`

Outline button — white background, brand border.

```css
.btn-secondary {
  @apply inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-white;
  border: 1px solid var(--brand-border);
  color: var(--brand-text);
}
```

Hover: `background-color: var(--brand-primary-light)`, text turns `var(--brand-primary)`.

---

### `.btn-gradient`

Gradient CTA for special actions (workflow stages).

```css
.btn-gradient {
  background: var(--nu-grad-primary);  /* #D42F7B → #E8623A */
  box-shadow: 0 4px 16px rgba(212, 47, 123, 0.32);
}
```

---

### `.input`

Standard form input / select field.

```css
.input {
  @apply w-full px-3 py-2.5 rounded-xl text-sm bg-white;
  border: 1px solid var(--brand-border);
  color: var(--brand-text);
}
```

Focus: `border-color: var(--brand-primary)`, `box-shadow: 0 0 0 3px var(--brand-primary-ring)`.

---

### `.label`

Form field label.

```css
.label {
  @apply block text-sm font-semibold mb-1.5;
  color: var(--brand-text);
}
```

---

### Badges

| Class | Colours |
|-------|---------|
| `.badge-primary` / `.badge-blue` | `--brand-primary-light` bg, `--brand-primary` text |
| `.badge-green` | `--brand-success-light` bg, `--brand-success` text |
| `.badge-yellow` | `--brand-warning-light` bg, `--brand-warning` text |
| `.badge-red` | `--brand-accent-light` bg, `--brand-accent` text |
| `.badge-purple` | `#f0eefa` bg, `#5b21b6` text |
| `.badge-gray` | Tailwind `bg-gray-100 text-gray-500` |

All badges use `@apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold`.

---

### `.section-label`

Uppercase small caps section heading.

```css
.section-label {
  @apply text-xs font-bold uppercase tracking-widest;
  color: var(--brand-text-muted);
}
```

---

### `.shimmer`

Animated skeleton loader background.

```css
.shimmer {
  background: linear-gradient(
    90deg,
    var(--brand-skeleton) 25%,
    #e0e1ed 50%,
    var(--brand-skeleton) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
}
```

---

### Animation Helpers

| Class | Keyframe | Duration |
|-------|----------|----------|
| `.animate-fade-in-up` | `fadeInUp` (slide up + fade) | 0.4 s |
| `.animate-fade-in` | `fadeIn` (opacity only) | 0.3 s |
| `.animate-scale-in` | `scaleIn` (scale + fade) | 0.25 s |
| `.animate-slide-in-right` | `slideInRight` | 0.35 s |

Use `animationDelay` inline style for staggered list reveals:

```tsx
<li style={{ animationDelay: `${i * 60}ms` }} className="animate-fade-in-up">
```

---

## Print System

### How it works

1. User clicks **Print / Export** inside an expanded interview guide.
2. `printGuide(key)` adds class `print-target` to the specific guide card `div`.
3. `window.print()` opens the browser print dialog.
4. `@media print` in `src/styles/print.css` applies:
   - Entire page → `visibility: hidden`
   - `#print-area` and children → `visibility: visible`
   - All `.guide-card` without `.print-target` → `display: none`
   - `.print-header` (hidden on screen) → `display: flex`
5. `afterprint` event removes `print-target` class, restoring normal view.

### Print header

The branded header is a hidden-on-screen `div` inside `#print-area`:

```tsx
<div className="print-header">
  <div className="print-header-brand">
    <div className="print-logo-mark">NL</div>
    <div>
      <div className="print-logo-name">NULogic</div>
      <div className="print-logo-tag">Recruitment Intelligence</div>
    </div>
  </div>
  <div className="print-header-meta">
    <div className="print-doc-title">Interview Guide</div>
    <div className="print-doc-date">Printed on {date}</div>
  </div>
</div>
```

### CSS hooks summary

| Class / ID | Purpose |
|------------|---------|
| `#print-area` | Wrapper around all guide cards; anchored to top-left in print |
| `.print-target` | Added to specific guide card being printed |
| `.guide-card` | Each guide card — non-target cards hidden in print |
| `.guide-toggle-btn` | Accordion toggle button — chevron hidden in print |
| `.guide-body` | Expanded guide content — forced `display: block` in print |
| `.guide-actions` | Copy/Print buttons — hidden in print |
| `.print-section-heading` | "Generated Guides" heading row — hidden in print |
| `.print-red-flag` | Red flag list items — accent colour forced with `print-color-adjust` |
| `.print-header` | Branded header — `display: none` on screen, `flex` in print |

All colours in `print.css` use `var(--brand-*)` tokens — no hardcoded hex.

---

## Re-branding Guide

To apply a new brand:

1. **Edit `src/styles/brand.css`** — update `:root` values.
2. **Edit `src/tokens.ts`** — update the `C` constant to match.
3. Everything else (buttons, cards, badges, print header, sidebar gradient, etc.) updates automatically.

No changes needed to component files, Tailwind config, or Vite config.

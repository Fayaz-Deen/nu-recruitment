/**
 * NULogic Design Tokens — TypeScript side
 *
 * Used for inline style={} props in TSX components.
 * CSS counterpart (component classes, Tailwind, print): src/styles/brand.css
 *
 * To re-brand: update BOTH this file AND brand.css together.
 *
 * Usage:
 *   import { C } from '../tokens'
 *   <div style={{ color: C.TEXT, backgroundColor: C.PRIMARY_LIGHT }} />
 */

export const C = {

  // ── Brand palette ──────────────────────────────────────────────────────
  LAPIS:          '#050766',   // nu-lapis  — primary
  PINK:           '#D42F7B',   // nu-grad-primary start — comms stage / hot-pink
  NAVY:           '#25255C',   // nu-navy   — primary dark
  RED:            '#E62A32',   // nu-red    — accent / error
  PURPLE:         '#8939A1',   // nu-purple
  TEAL:           '#133E49',   // nu-teal
  INDIGO:         '#61629D',   // nu-indigo
  LIGHT_PURPLE:   '#B17DC1',   // nu-light-purple
  CORAL:          '#EE777C',   // nu-coral

  // ── Typography ─────────────────────────────────────────────────────────
  WHITE:          '#ffffff',   // white — active nav text / icons on dark backgrounds
  TEXT:           '#0F1640',   // primary body text
  TEXT_MUTED:     '#5A5F7A',   // secondary / muted text
  TEXT_SUBTLE:    '#c0c2d4',   // chevrons, placeholders, disabled

  // ── Surfaces ───────────────────────────────────────────────────────────
  BG:             '#F4F5F6',   // page background
  BORDER:         '#e4e5ec',   // card / input border
  DIVIDER:        '#f0f1f5',   // light row divider
  ROW_HOVER:      '#f7f8fc',   // subtle row hover background
  PRIMARY_LIGHT:  '#eef0fa',   // primary tint — hover / chip bg
  PRIMARY_RING:   '#d4d6f0',   // primary light border
  SKELETON:       '#edeef5',   // shimmer base colour
  NEUTRAL:        '#f0f0f2',   // neutral / below-threshold score background
  HOVER_LIGHT:    '#fafafa',   // legacy light hover background (near-white)
  VIOLET:         '#7c3aed',   // culture fit bar (one-off purple, not in brand palette)

  // ── Semantic: success ──────────────────────────────────────────────────
  SUCCESS:        '#1F9E6C',
  SUCCESS_BG:     '#e6f7f0',
  SUCCESS_BORDER: '#b3e6d4',
  SUCCESS_TEXT:   '#155c3e',   // dark text on success bg (JD selected state)

  // ── Semantic: warning ──────────────────────────────────────────────────
  WARNING:        '#C77A12',
  WARNING_BG:     '#fef3e1',
  WARNING_BORDER: '#f5d9a0',

  // ── Semantic: accent / error ───────────────────────────────────────────
  ACCENT_BG:      '#fce8e9',
  ACCENT_BORDER:  '#f5c2c4',

  // ── Gradients — brand ──────────────────────────────────────────────────
  /** nu-grad-dark: dashboard header, active nav pill */
  GRAD_DARK:    'linear-gradient(135deg, #1B1F4E 0%, #7B2D8E 100%)',
  /** nu-grad-primary: CTA buttons (.btn-gradient) */
  GRAD_PRIMARY: 'linear-gradient(135deg, #D42F7B, #E8623A)',
  /** nu-grad-brand: sidebar logo icon */
  GRAD_BRAND:   'linear-gradient(135deg, #ED3027 0%, #7B469B 100%)',

  // ── Gradients — workflow stages (135 deg, badge / icon backgrounds) ────
  GRAD_JD:     'linear-gradient(135deg, #050766 0%, #61629D 100%)',
  GRAD_SCREEN: 'linear-gradient(135deg, #8939A1 0%, #B17DC1 100%)',
  GRAD_GUIDE:  'linear-gradient(135deg, #133E49 0%, #050766 100%)',
  GRAD_COMMS:  'linear-gradient(135deg, #D42F7B 0%, #E8623A 100%)',

  // ── Gradients — workflow stages (90 deg, card top-bar accents) ─────────
  GRAD_JD_H:     'linear-gradient(90deg, #050766, #61629D)',
  GRAD_SCREEN_H: 'linear-gradient(90deg, #8939A1, #B17DC1)',
  GRAD_GUIDE_H:  'linear-gradient(90deg, #133E49, #050766)',
  GRAD_COMMS_H:  'linear-gradient(90deg, #D42F7B, #E8623A)',

  // ── Gradients — semantic ───────────────────────────────────────────────
  /** Delete confirm button gradient */
  GRAD_DELETE: 'linear-gradient(135deg, #E62A32, #EE777C)',
  /** Screen-with-AI button: navy → lapis */
  GRAD_SCREEN_BTN: 'linear-gradient(135deg, #25255C 0%, #050766 100%)',

} as const

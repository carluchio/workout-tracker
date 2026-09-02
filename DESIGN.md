# DESIGN.md — Comprehensive UI/UX Reference

A deep design reference compiled from current best practices, research, and
community consensus (2024-2026). This file is read on-demand when designing
or building UI. The global CLAUDE.md holds the always-on principles; this
file holds the full guidance.

**Place at**: project root (e.g., `backlog/DESIGN.md`) OR workspace root.

**How to use**: When asked to design or build any UI, scan the relevant
section(s) below before writing code. Cite specific rules when making
design choices.

---

## TABLE OF CONTENTS

1. [Typography](#1-typography)
2. [Color & Theming](#2-color--theming)
3. [Spatial Design & Layout](#3-spatial-design--layout)
4. [Motion & Micro-interactions](#4-motion--micro-interactions)
5. [Mobile-First & Touch](#5-mobile-first--touch)
6. [Human Psychology Principles](#6-human-psychology-principles)
7. [Premium Product Patterns](#7-premium-product-patterns)
8. [Anti-Patterns to Avoid](#8-anti-patterns-to-avoid)

---

## 1. TYPOGRAPHY

### 1.1 Font Selection

**Use modern, screen-optimized sans-serifs as default UI fonts.**
Preferred free families: Inter, Roboto, DM Sans, Source Sans 3, Satoshi,
Figtree. (Note: even when these are "preferred for legibility," some are on
the universal ban list — see anti-patterns. Distinctive choices like DM Sans,
Satoshi, Figtree are safer.)

For system-native feel, use platform defaults:
- Apple: `-apple-system`, SF Pro
- Windows: Segoe UI
- Android: Roboto

**Use only one primary UI family.** Add a second only for:
- Code blocks (JetBrains Mono, IBM Plex Mono)
- Display/brand accent (used sparingly)

**Avoid overused "default" fonts in serious products**: Open Sans, Lato,
Raleway, basic Roboto + Montserrat pairings. These signal template-based
design in 2025-2026.

### 1.2 Type Scale (8-12 Canonical Styles)

Limit to 8-12 named text styles. Suggested set:

| Style              | Size      | Line Height | Weight  |
|--------------------|-----------|-------------|---------|
| `text-body`        | 16px      | 1.5         | 400     |
| `text-body-sm`     | 14px      | 1.5         | 400     |
| `text-label`       | 14-16px   | 1.4         | 500     |
| `text-caption`     | 12-13px   | 1.4-1.5     | 400-500 |
| `text-heading-xs`  | 18px      | 1.4         | 500     |
| `text-heading-sm`  | 20px      | 1.3-1.4     | 500-600 |
| `text-heading-md`  | 24px      | 1.25-1.3    | 600     |
| `text-heading-lg`  | 32px      | 1.2-1.25    | 600-700 |

**Naming**: Use semantic names (`text-body`, `text-heading-md`), never
size-based names (`text-16`, `text-large`).

### 1.3 Fluid Type Scale

Use a modular ratio of **1.2-1.25** (Major Third) and `clamp()` for
responsive sizing.

If `body = 16px`:
- h6 ≈ 19px
- h5 ≈ 23px
- h4 ≈ 28px
- h3 ≈ 34px
- h2 ≈ 42px
- h1 ≈ 52px

Implementation: `font-size: clamp(15px, 1.6vw, 17px);` for body.

### 1.4 Line Height & Letter Spacing

**Line height by content type**:
- Body, long-form: 1.5-1.6
- Labels, captions, small UI text: 1.4-1.5
- Headings 18-24px: 1.3-1.4
- Headings 32px+: 1.1-1.3

Align line-heights to a **4px or 6px baseline grid** for vertical rhythm.

**Letter spacing**:
- Mixed-case body: `letter-spacing: 0` (browser default)
- All-caps labels (`OVERLINE`, `TAG`): `letter-spacing: 0.08-0.12em`,
  size 11-13px, weight 500-600
- Never use negative letter-spacing for UI text (only large branding display)

### 1.5 Type Hierarchy as Information Architecture

Map content roles to specific styles. Never freestyle per-screen:

- Page title (unique per view) → `text-heading-lg`
- Section heading → `text-heading-md`
- Card/panel title → `text-heading-sm`
- Form label, button text → `text-label`
- Body copy → `text-body`
- Helper, meta, secondary text → `text-body-sm` or `text-caption`

### 1.6 Serif vs Sans

Serif vs sans has minimal usability impact (controlled studies confirm).
Use serif for **brand personality only** — marketing headlines, hero h1.
All transactional UI (forms, tables, buttons, menus) stays in the main
sans-serif family.

---

## 2. COLOR & THEMING

### 2.1 Primitives vs Semantic Tokens

Always separate primitive color scales from semantic roles.

**Primitives** (raw scales): `gray-100…gray-900`, `blue-100…blue-900`, etc.
Use 10-12 step scales.

**Semantic tokens** (named by function):
- `color.bg-surface` → `gray-50` (light) / `gray-950` (dark)
- `color.text-primary` → `gray-900` (light) / `gray-50` (dark)
- `color.action-primary` → `blue-600`
- `color.border-subtle` → `gray-200` (light) / `gray-800` (dark)

### 2.2 Required Semantic Sets

At minimum, define:

**Foreground**: `text-primary`, `text-secondary`, `text-muted`, `text-on-accent`,
`icon-default`

**Background**: `bg-app`, `bg-surface`, `bg-subtle`, `bg-elevated`

**Border**: `border-subtle`, `border-strong`, `border-focus`

**Status**: `bg-success`, `border-success`, `text-success` (and similarly for
`warning`, `error`, `info`)

### 2.3 Color Psychology (Evidence-Based)

- **Blue** (`#3B82F6` range): trust, primary actions for SaaS/fintech
- **Green**: success, completion, growth
- **Red**: error, destructive actions, urgency
- **Amber/Orange**: warning
- **Yellow**: caution, attention-only

**Always pair color with iconography or text** — never rely on color alone
to communicate state (accessibility requirement).

### 2.4 Dark Theme Best Practices

- **Background**: Use very dark gray (`#0D1117` or `#121212`) — NEVER pure
  black (`#000000`)
- **Surface stack**: 3-4 lightness steps (Radix-style):
  - `bg-app` → step 1-2
  - `bg-surface` → step 2-3
  - `bg-elevated` → step 3-4
- **Contrast**: Minimum 4.5:1 for normal text, 3:1 for large text (WCAG AA)
- **Accent desaturation**: Reduce 10-30% versus light theme to prevent glow
- **Avoid**: high-chroma neon colors for large text blocks

### 2.5 Premium Color Systems

Top systems use **10-12 step scales per hue**:
- Steps 1-3: backgrounds, surfaces
- Steps 4-6: borders, subtle elements
- Steps 7-9: solid fills, interactive elements
- Steps 10-12: text, high-contrast elements

Use **LCH or perceptually uniform color space** for consistent lightness
across hues (Linear's approach for theme generation).

### 2.6 The 70/20/10 Rule

Premium feel comes from:
- **~70% neutral grays** (backgrounds, text, borders)
- **~20% brand hue** (primary actions, active states)
- **~10% status/supporting hues** (success, error, warning, info)

Cheap-looking UIs use saturated color everywhere. Restraint signals
sophistication.

---

## 3. SPATIAL DESIGN & LAYOUT

### 3.1 The 8px Spacing System

Base unit: **8px**, with optional 4px sub-step for tight cases.

**Spacing scale**: `4, 8, 12, 16, 24, 32, 40, 48, 64, 80px`

Apply to: margins, padding, gap between grid items, line-height multiples.

Major design systems using this: Material, Atlassian, IBM, Tailwind.

### 3.2 Baseline Grid

Lock typography to a **4px or 6px baseline grid**.

- Choose baseline: 4px (more flexibility) or 6px (looser rhythm)
- All line-heights and vertical paddings must be multiples of the baseline
- Vertical stack `gap` values must align to baseline multiples

### 3.3 Information Density vs Whitespace

Density choice depends on user type and task:

**High density (dashboards, power tools — Linear, Notion databases)**:
- Vertical gaps: 8-12px
- Table rows: 40-48px tall
- Multiple panels per viewport to minimize scrolling

**Lower density (onboarding, marketing, consumer flows)**:
- Section padding: 48-96px vertical on desktop
- Generous whitespace around primary content

**Anti-pattern**: Don't reduce density via "more padding" alone. Group and
label options instead of hiding them.

### 3.4 Layout Primitives

Build from a small set of compositional patterns:

- **Two/three-column layouts** with fixed sidebar + fluid content (Linear,
  Notion)
- **Card-based sections** with consistent padding (16-24px) and radius
- **Main + details panel** (Notion details panel, Linear issue side panels)

**Gutter spacing**:
- Mobile: 16-24px between columns
- Desktop: 24-32px between columns

### 3.5 Intentional Hierarchy

A layout feels intentional when hierarchy is consistent through alignment,
size, and spacing — not random variations.

- Align text and components to a small number of vertical axes
- Desktop: consistent 72-96px left padding for main content
- Increase spacing AND size as importance increases:
  - Primary sections: 32-64px separation
  - Related items: 8-16px gaps
- Snap everything to grid units. No "almost" alignments (off by 2-3px).

---

## 4. MOTION & MICRO-INTERACTIONS

### 4.1 Motion as Feedback, Not Decoration

Add animation only when it clarifies:
- State changes
- Navigation transitions
- Feedback for user input

**Apply animation to**:
- Button press (scale 0.98 and back)
- Navigation transitions (slide/fade views)
- Expand/collapse, modal open/close, toast notifications

**Avoid**:
- Continuous, looping decorative animations in core workflows
- Background gradients that animate
- Bouncing icons in primary UI

### 4.2 Duration by Element Size

| Element            | Duration  |
|--------------------|-----------|
| Small UI (buttons, chips, hovers)        | 150-250ms |
| Medium (modals, dropdowns, list reorders) | 200-300ms |
| Large (route transitions, full-screen)   | 250-450ms |

**Platform adjustments**:
- Mobile: 200-300ms (Material baseline)
- Tablet: ~30% longer
- Desktop: 150-200ms

### 4.3 Easing

Use non-linear easing — never `linear`.

**Default**: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out style)

- Entering elements: ease-out or standard curve
- Leaving elements: ease-in or ease-in-out
- Avoid exaggerated bounce/elastic except in playful microcontexts

### 4.4 Accessibility & Performance

**Reduced motion**:
```css
@media (prefers-reduced-motion: reduce) {
  /* Set durations to 0 or 50-100ms */
  /* Replace large movements with simple fades */
}
```

**Performance rules**:
- Animate ONLY `transform` and `opacity`
- Avoid layout-thrashing: `top`, `left`, `width`, `height`
- Use `will-change: transform, opacity` sparingly on frequently-animated
  elements

---

## 5. MOBILE-FIRST & TOUCH

### 5.1 Touch Target Sizing

- **Minimum**: 44×44 CSS pixels (WCAG AAA, Apple HIG)
- **Preferred**: 48×48px (Material)
- **Spacing**: Minimum 4-8px between adjacent touch targets

### 5.2 Thumb Zones

Position primary actions in natural thumb reach (bottom-center on large phones):

- Bottom navigation: 3-5 items for primary destinations
- Primary CTA / FAB: above the bottom nav, lower-central area
- Top corners: reserve for less frequent actions
- Avoid placing critical actions in system gesture areas

### 5.3 Cognitive Load on Mobile

Mobile imposes higher cognitive load than desktop. Each screen should have
**one primary job**.

- One main CTA per mobile screen
- Offload secondary options to progressive disclosure (drawers, "More"
  screens, accordions)
- Avoid desktop-style dense menus or sidebars
- Use bottom nav + contextual menus

### 5.4 PWA vs Native Distinction

**For PWAs**:
- Match platform conventions (bottom nav mobile, top nav/sidebar desktop)
- Keep interactions consistent across platforms
- Avoid heavy continuous animations that need native-level performance
- Stick to light, fast transitions

**For native apps**:
- Adopt OS-specific patterns more strictly
- iOS vs Android navigation, gestures, typography differ

### 5.5 Common Mobile Mistakes

- Tiny text: enforce minimum 14px labels, 16px body
- Hidden navigation: prefer visible bottom tabs over nested hamburger menus
- Modal overload: never stack modals; never "modal inside modal"
- Shrunk-down desktop layouts

---

## 6. HUMAN PSYCHOLOGY PRINCIPLES

### 6.1 Hick's Law — Structure Choices

Too many undifferentiated options slow decisions. Group and label, don't
just remove.

- For >7 options: group into 3-7 labeled categories
- Hide advanced settings behind "Advanced" panels (progressive disclosure)
- Use filter groups, sidebar sections to organize

### 6.2 Fitts's Law — Size and Position

Selection time depends on size and distance.

- Make frequent actions larger and closer to likely cursor/touch origin
- Reduce size or distance for destructive/rare actions
- On desktop: keep primary actions near where the cursor naturally ends
  (after form completion, key section)

### 6.3 Miller's Law — Working Memory

People handle 7±2 items at once. Design around chunks.

- Break long forms into 3-7 logical steps with progress indicator
- Group related options into 3-7 items per group
- Use headings and subpanels

### 6.4 Gestalt Principles — Visual Grouping

Users perceive grouped items as related based on proximity, similarity,
continuity.

- Consistent spacing + background grouping ties related inputs/cards
- Same shape/color = same behavior (all primary actions look alike)

### 6.5 Combat Decision Fatigue

- **Sensible defaults**: Preselect recommended options
- **"Recommended" labels**: Highlight one option with stronger visual
  emphasis ("Most popular", "Recommended")
- **Remember choices**: Reuse previous user decisions, don't re-ask

### 6.6 Progress, Status & Urgency

**Progress**: Use explicit indicators for multi-step flows (3-5 dots,
numbered steps) to reduce uncertainty.

**Urgency** (use sparingly):
- "Trial ends in 3 days" + subtle color change
- NEVER fake timers or deceptive scarcity

**Status signals**: Checkmarks, badges, streaks (when genuinely tracking
effort — Duolingo-style)

---

## 7. PREMIUM PRODUCT PATTERNS

### 7.1 Best-in-Class Reference Products

Study these for structural patterns (not visual copying):

- **Linear**: Ultra-fast interactions, strong keyboard support, disciplined
  theming, LCH-based color generation
- **Notion**: Modular layouts, clear separation of main content vs side
  details
- **Stripe**: Highly tuned color system, sparse but bold motion, 10-12 step
  color scales
- **Duolingo**: Layered progress, playful microinteractions, value-before-
  signup onboarding
- **Airbnb**: Editorial photography, type hierarchy, trust through clarity

When asked to "look like X", adopt **layout, density, and interaction
patterns** — not colors or branding.

### 7.2 Premium Feel Markers

Premium interfaces share:
- Strong typography with clear hierarchy
- Disciplined color (mostly neutral, restrained accents)
- Subtle, fast animations
- Fast feedback on every action
- Mostly minimal base + 1-2 focused visual moments per screen
- No competing shadows, borders, gradients

### 7.3 Trend Usage (Sparingly, Purposefully)

**Bento grids**: Use for marketing pages and dashboards where distinct
modules benefit. Don't apply to every screen.

**Glassmorphism**: Limited to key surfaces (media cards, hero panels).
Background must have low noise. Maintain accessibility contrast.

**Modern skeuomorphism**: Subtle depth and texture for affordances (toggles,
switches). Avoid heavy realism.

### 7.4 The Minimalism Trap

Plain minimalism without depth, motion, or hierarchy now reads as generic
template work.

**Always pair minimalist layouts with at least one of**:
- Strong typographic hierarchy
- Microinteractions
- Subtle gradients/textures
- Bolder color

Avoid: pure black-on-white with system fonts and no motion. This looks
unstyled, not premium.

### 7.5 Inspiration Sources

For AI agents and designers — prefer **real product UIs with proven UX**:
- Mobbin (curated real product flows)
- Page Flows (real onboarding & feature flows)
- Awwwards (live award-winning sites)
- Live production sites of best-in-class products

Avoid: isolated Dribbble shots without context, AI-generated mockups, design
concepts that never shipped.

---

## 8. ANTI-PATTERNS TO AVOID

### 8.1 AI-Slop Visual Clichés (Banned)

These patterns immediately signal AI-generated, low-effort work:

- Purple-cyan diagonal gradients as primary backgrounds
- Gradient text on metric numbers by default
- Frosted glass on every card
- Nested card-in-card with multiple shadows
- Rainbow gradients
- Emojis used as functional icons
- Every element using the brand color

**Rule**: Never use these unless the user explicitly requests a flashy
marketing/experimental concept.

### 8.2 Dated Patterns (Use Deliberately or Skip)

- **Neumorphism**: Only for isolated, large tactile elements (one card,
  one control). Never app-wide.
- **Heavy blurry background blobs**: Rare, marketing only.
- **Overly glossy gradients**: Largely retired except for stylized contexts.

### 8.3 Inconsistent Tokens

Major UX failures:
- Spacing values not from the defined scale
- Colors hardcoded instead of using tokens
- Font sizes outside the type scale
- Border radii not matching the system

**Rule**: All spacing, colors, and typography come from design tokens.
Never hardcode raw values that aren't multiples of the grid or outside
defined scales.

### 8.4 Dark Mode Failures

- Pure `#000000` background with pure `#FFFFFF` text
- Low-contrast gray (`#666`) body text on very dark backgrounds
- High-chroma neon for large text blocks
- Light theme accent colors used unchanged in dark theme (causes glow)

### 8.5 Flow Disruptors

- Multiple modals stacking
- Modal-inside-modal patterns
- Always-visible tooltips
- Modal alerts where inline validation would work
- Popup overload, intrusive interstitials

### 8.6 Default Defeats

- System fonts (Arial, Inter, Roboto, Times New Roman) on a "premium" product
- Pure white background with no surface differentiation
- Centered single-column marketing layouts as the entire product
- Generic SaaS hero: gradient background + "Built for X" headline + 3-column
  feature grid

---

## SOURCES

This reference synthesizes:

- Anthropic frontend-design skill (anti-slop philosophy)
- Andrej Karpathy's LLM coding observations (behavioral discipline)
- Refactoring UI by Adam Wathan & Steve Schoger (color systems)
- Radix Colors documentation (semantic tokens, scales)
- Stripe's "Accessible Color Systems" blog post (premium color)
- Linear's design language documentation (LCH theming, density)
- Material Design motion guidelines (timing, easing)
- WCAG AA accessibility standards (contrast, touch targets)
- Apple Human Interface Guidelines (touch targets)
- Nielsen Norman Group research (cognitive load, mobile UX)
- Mobbin & Page Flows (real product pattern libraries)
- Awwwards 2024-2026 winners (community consensus on premium)
- UX Laws collection (Hick's, Fitts's, Miller's, Gestalt)

Last updated: April 2026.

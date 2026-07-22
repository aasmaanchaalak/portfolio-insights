# Portfolio Insights — Design Language

A design spec for the Sagun Capital portfolio platform. Written for implementation
(Claude Code / any frontend dev). All colors are authored in `oklch` — keep them in
`oklch`, do not convert to hex.

---

## Governing principles

1. **Calm chrome, expressive data.** Color and weight are spent on numbers that carry
   meaning, never on containers.
2. **One neutral hue.** Every gray is hue `264` at varying lightness, so the whole UI
   reads as a single cool family.
3. **Mono + right-alignment for all figures.** Financial numbers never render in the
   proportional face; columns must scan vertically.
4. **Density with air.** Terminal-level information density, grouped into bordered cards
   with generous internal padding.
5. **Borders over shadows; tints over fills; hue over saturation.** No drop shadows in
   the base language. No neon.

---

## Type

- **Primary:** `IBM Plex Sans` (400 / 500 / 600 / 700) — all UI text, labels, headings.
- **Numeric / mono:** `IBM Plex Mono` (400 / 500 / 600) — **every** number representing
  money, %, quantity, ratio, or ticker. Single most important rule. Gives tabular
  alignment for free.
- **Do not use** display/serif faces, or Inter / Roboto / Arial.

| Role            | Size    | Weight | Tracking  | Notes |
|-----------------|---------|--------|-----------|-------|
| Page title      | 19px    | 600    | -0.01em   | top bar |
| Section heading | 14px    | 600    | —         | card headers |
| Metric value L  | 22–26px | 600    | -0.02em   | mono |
| Metric value M  | 17px    | 600    | —         | mono |
| Body / row      | 13px    | 400/500| —         | |
| Numeric cell    | 12.5px  | 400/600| —         | mono, right-aligned |
| Micro-label     | 10.5px  | 600    | +0.05–0.06em | UPPERCASE, muted |
| Section divider | 10px    | —      | +0.09em   | UPPERCASE, sidebar |

---

## Color (oklch)

### Neutrals — hue 264, chroma ≤ ~0.012
| Token              | Value                      | Use |
|--------------------|----------------------------|-----|
| `--bg-page`        | `oklch(0.97 0.004 260)`    | app background (never pure white) |
| `--surface`        | `#ffffff`                  | cards, table, top bar |
| `--surface-faint`  | `oklch(0.975 0.003 264)`   | table header fill, row hover |
| `--border`         | `oklch(0.92 0.005 264)`    | card & section hairlines |
| `--border-inner`   | `oklch(0.94 0.004 264)`    | table row rules |
| `--ink`            | `oklch(0.24 0.012 264)`    | primary text |
| `--ink-2`          | `oklch(0.45 0.01 264)`     | secondary text |
| `--ink-muted`      | `oklch(0.55 0.01 264)`     | captions |
| `--ink-label`      | `oklch(0.58 0.01 264)`     | uppercase micro-labels |

### Brand / interactive
| Token            | Value                    | Use |
|------------------|--------------------------|-----|
| `--accent`       | `oklch(0.5 0.13 264)`    | links, active states, focus |
| `--accent-hover` | `oklch(0.42 0.14 264)`   | hover |
| `--accent-bar`   | `oklch(0.55 0.11 264)`   | progress/allocation bar fills |

### Semantic — apply ONLY to signed numbers & status, never to structural chrome
| Token         | Value                   | Use |
|---------------|-------------------------|-----|
| `--positive`  | `oklch(0.5 0.13 150)`   | gains, "Add" |
| `--negative`  | `oklch(0.55 0.16 27)`   | losses, "Exit" |
| `--warning`   | hue `60` (amber)        | alerts, "Trim" |

**Chroma discipline:** neutrals ≤ ~0.012 chroma; semantic/accent hues share a moderate
chroma (~0.12–0.16) and lightness (~0.5) and differ mainly by **hue**, not intensity.
No saturated fills behind large areas.

### Sidebar (the one dark surface)
| Token             | Value                    |
|-------------------|--------------------------|
| `--side-bg`       | `oklch(0.22 0.024 264)`  |
| `--side-active`   | `oklch(0.32 0.05 264)`   | active nav chip fill |
| `--side-text`     | `oklch(0.78 0.02 264)`   | inactive nav |
| `--side-text-hi`  | `oklch(0.85 0.02 264)` / white | brand, active |
| `--side-divider`  | `oklch(0.3 0.03 264)`    |
| `--side-label`    | `oklch(0.58 0.03 264)`   | section dividers |

---

## Geometry, spacing, elevation

- **Radii:** cards `12px` · buttons/inputs `7–8px` · pills `20px` · in-row tag chips `5px`.
- **Card padding:** `20–22px`.
- **Table cells:** `11–12px` vertical · `12–16px` horizontal (16 on outer-edge columns).
- **Grid gaps:** `16–24px`. Metric grids: `repeat(auto-fit, minmax(120–150px, 1fr))`.
- **Elevation = borders, not shadows.** Depth is the `--border` hairline + white surface
  on the cool-white page. No drop shadows in the base language.

---

## Layout system

- **Shell:** fixed 236px left sidebar (`position: sticky; height: 100vh`) + fluid main column.
- **Sidebar:** brand lockup → uppercase section dividers → nav rows, each with a mono
  two-digit index prefix (`01`, `02`…) at reduced opacity → user footer. Active row =
  `--side-active` filled chip, white text; inactive = `--side-text`, transparent, hover
  lifts background.
- **Top bar:** sticky, white, bottom hairline. Left = page title + muted subtitle;
  right = total-portfolio value (mono) + last-updated stamp, separated by a vertical hairline.
- **View tabs:** underline tabs — 2px `--accent` border + weight 600 on active — sitting
  on the white header block.
- **Dashboard grid:** full-width performance strip on top, then a `1.6fr / 1fr` split —
  left = headline values + quality-metrics card, right = top-holdings + alerts.

---

## Component patterns

- **Metric cell:** uppercase micro-label → large mono value → optional muted caption /
  benchmark. Benchmarks always sit beside the metric they qualify (e.g. portfolio P/E
  next to `SMLCAP100 33.09`).
- **Performance strip:** seamless cells joined by a 1px bg-gap grid inside one rounded,
  clipped container (gap = background bleed-through, not borders).
- **Number formatting:** large sums in compact crore (`₹631.34 Cr`) for summaries; full
  precision in the table. Signs use real glyphs `+` / `−` (U+2212), not hyphen. `N/A`
  renders in muted ink, never as a colored zero.
- **Bar / rank viz:** thin `6px` track `oklch(0.94 0.005 264)` with `--accent-bar` fill,
  width normalized to the top item. Used for concentration/allocation — not pie charts.
- **In-row tags:** three compact 5px-radius chips —
  - *Conviction:* High = indigo tint · Medium = neutral · Low = amber tint
  - *Strategy:* always neutral
  - *Action:* Add = green tint · Hold = neutral · Trim = amber tint · Exit = red tint

  Tint = low-chroma bg `oklch(~0.95 <c> <hue>)` + matching mid-lightness text of the same
  hue. Category read by hue, kept quiet.
- **Filter chips (toolbar):** 20px pills; selected = filled semantic/accent + white text,
  unselected = white + hairline border + muted text.
- **Table:**
  - Left-aligned identity columns: name (600) + mono ticker beneath in muted.
  - **All numeric columns right-aligned, mono, 12.5px.**
  - Header: uppercase `10.5px / 600` muted on `--surface-faint`, sticky.
  - Rows separated by `--border-inner`, hover wash `--surface-faint`.
  - Signed columns (Gain, Contribution) carry semantic color; everything else neutral ink.

---

## CSS custom properties (drop-in)

```css
:root {
  /* neutrals */
  --bg-page: oklch(0.97 0.004 260);
  --surface: #ffffff;
  --surface-faint: oklch(0.975 0.003 264);
  --border: oklch(0.92 0.005 264);
  --border-inner: oklch(0.94 0.004 264);
  --ink: oklch(0.24 0.012 264);
  --ink-2: oklch(0.45 0.01 264);
  --ink-muted: oklch(0.55 0.01 264);
  --ink-label: oklch(0.58 0.01 264);
  /* interactive */
  --accent: oklch(0.5 0.13 264);
  --accent-hover: oklch(0.42 0.14 264);
  --accent-bar: oklch(0.55 0.11 264);
  /* semantic */
  --positive: oklch(0.5 0.13 150);
  --negative: oklch(0.55 0.16 27);
  --warning: oklch(0.7 0.15 60);
  /* sidebar */
  --side-bg: oklch(0.22 0.024 264);
  --side-active: oklch(0.32 0.05 264);
  --side-text: oklch(0.78 0.02 264);
  --side-text-hi: oklch(0.85 0.02 264);
  --side-divider: oklch(0.3 0.03 264);
  --side-label: oklch(0.58 0.03 264);
  /* geometry */
  --radius-card: 12px;
  --radius-control: 8px;
  --radius-chip: 5px;
  --radius-pill: 20px;
}

body {
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  background: var(--bg-page);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
.mono, .num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
```

Fonts: `IBM Plex Sans` + `IBM Plex Mono` via Google Fonts (weights 400/500/600, plus 700 for Sans).

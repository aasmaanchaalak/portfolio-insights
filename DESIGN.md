# Sagun Capital — Portfolio Insights Design Language

Implementation spec for the Portfolio Insights platform. Reference implementation:
`Sagun Portfolio.dc.html`. Colors are authored in `oklch` — keep them in `oklch`.

Two rules govern everything below:

1. **Brand crimson is chrome, never data.** It marks active state, selection, links and
   brand furniture. It never colors a number, because in a financial table red means loss.
2. **Calm chrome, expressive data.** Hierarchy comes from typeface, weight and rules —
   not from cards, fills or accent color.

---

## Part I — Foundations

### Type

Two families. No third.

- **`Source Serif 4`** (400 / 600 / 700, variable `opsz 8..60`) — page titles, section
  headings, and headline figures. Echoes the Sagun wordmark. Applied via a `.serif` class.
- **`Archivo`** (400 / 500 / 600 / 700) — all UI text, labels, table content, controls.
  Body default.
- **Numerals:** no monospace font. Use Archivo (or Source Serif 4 for headline figures) with
  `font-variant-numeric: tabular-nums lining-nums` — applied via a `.n` class. This gives
  column alignment without a techy third face.

```css
body { font-family: 'Archivo', system-ui, sans-serif; }
.serif { font-family: 'Source Serif 4', Georgia, serif; }
.n { font-variant-numeric: tabular-nums lining-nums; }
```

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Page title (h1) | serif | 25px | 600 | -0.015em |
| Section heading (h2) | serif | 16px | 600 | — |
| Headline figure (perf rail) | serif | 27px | 600 | -0.02em |
| Headline figure (panel) | serif | 26px | 600 | -0.02em |
| Brand-bar figure | serif | 19px | 600 | -0.01em |
| Metric value (grid) | sans | 17px | 600 | — |
| Row name | sans | 13.5px | 600 | -0.005em |
| Table cell | sans | 13px | 400/600 | — |
| Field label | sans | 11.5px | 400 | — |
| Table header | sans | 11px | 600 | — |
| Caption / sub-value | sans | 11px | 400 | — |

**No uppercase micro-labels.** Labels are sentence case (`Weighted P/E`, `Price / avg cost`).
Letterspaced all-caps 10px labels are banned — they were the single biggest generic-SaaS tell
and they hurt legibility. This applies to table headers too.

### Color

Neutrals are **true greys** (hue 0, chroma ≤ 0.003). Do not tint them toward the accent —
blue- or indigo-tinted greys are what made the earlier draft look generic.

```css
:root {
  /* surface & neutrals */
  --page:          oklch(1 0 0);            /* pure white, not off-white */
  --surface-sunk:  oklch(0.988 0.001 0);    /* nav row band */
  --row-hover:     oklch(0.975 0.002 0);
  --ink:           oklch(0.26 0.003 0);
  --ink-2:         oklch(0.42 0.003 0);
  --ink-muted:     oklch(0.5 0.003 0);
  --ink-faint:     oklch(0.58 0.003 0);

  /* rules — four weights, used deliberately */
  --rule-section:  oklch(0.24 0.003 0);     /* 2px, under section headings & table head */
  --rule-strong:   oklch(0.87 0.003 0);     /* 1px, control borders, band edges */
  --rule:          oklch(0.91 0.003 0);     /* 1px, brand bar, panel borders */
  --rule-soft:     oklch(0.945 0.003 0);    /* 1px, table row separators */

  /* brand — chrome only */
  --crimson:       oklch(0.52 0.19 27);
  --crimson-link:  oklch(0.5 0.19 27);
  --crimson-hover: oklch(0.42 0.17 27);
  --crimson-wash:  oklch(0.94 0.008 27);    /* avatar, selected density button */
  --crimson-ink:   oklch(0.45 0.18 27);     /* text on wash */

  /* semantic — data only */
  --positive:      oklch(0.45 0.11 155);
  --negative:      oklch(0.44 0.16 22);     /* browner + darker than crimson, deliberately */
  --caution:       oklch(0.7 0.14 70);      /* alert spines, pledged badge */
}
```

Crimson and `--negative` must stay visually distinct: crimson is brighter and more orange,
`--negative` darker and browner. Never place them adjacent as peers.

### Geometry

- **Radius: 4px** for controls, panels and buttons. **3px** for chips and badges. Nothing
  larger — 12px rounded cards are banned.
- **No drop shadows anywhere.** Depth comes from rules.
- **No card grid / bento layout.** Sections are delimited by a 2px `--rule-section` under the
  heading and 1px `--rule-soft` between rows. A bordered panel is permitted only when two
  figures must be visually bracketed together (e.g. the public/private split).
- Page padding `22px 30px 40px`. Section gap `26px`. Column gap `34px`.

---

## Part II — Application shell

**Horizontal nav, no sidebar.** A left sidebar with a rounded active pill is banned.

**Brand bar** — `min-height: 58px`, `flex: 0 0 auto`, bottom `1px --rule`:
- Left: `assets/sagun-logo.png` at 27px height · 1px×24px divider · "Portfolio Insights" in
  serif 16px `--ink-2`.
- Right: today's gain · Smallcap 100 today · user block, each separated by a `1px --rule`
  divider with `padding-left: 26px`. Figures are serif 19px/600 with `.n`.
  - **Today's gain** is the value-weighted 1-day P&L, shown as a signed **percent only**
    (`value × return1D / (100 + return1D)` summed, over the previous day's value), coloured by
    sign. No rupee amount.
  - **Smallcap 100 today** is the Nifty Smallcap 100 daily change (`/api/nifty-smallcap`),
    signed percent, coloured by sign — the benchmark sitting beside the portfolio's day move.
- Avatar: 30px, `radius 4px`, `--crimson-wash` bg, `--crimson-ink` initials. Not a circle.

**Nav row** — `min-height: 44px`, `--surface-sunk` bg, bottom `1px oklch(0.89 0.003 0)`:
- Items are 13px, `padding: 0 16px`, full-height flex, `border-bottom: 2px solid` +
  `margin-bottom: -1px`. Active = `--crimson` border, `--ink`, weight 600. Inactive =
  `oklch(0.46 0.003 0)`, weight 500.
- Right side carries the price timestamp.

**Never let either bar cramp.** Both bars use `min-height` + `flex: 0 0 auto`, never a fixed
`flex: 0 0 Npx`. Every nav link and toolbar control needs `white-space: nowrap` and
`flex: 0 0 auto`; the nav itself gets `min-width: 0; overflow-x: auto`. Without these, flex
compression shrinks items below their content width and text wraps even when the nav is not
overflowing.

---

## Part III — Dense data tables

Applies to Public Portfolio, PE Tracker.

### Columns

**A lean core, always on, plus an opt-in picker.** The core keeps related numerics paired
into one right-aligned two-line cell — primary value on top, comparison basis beneath at 11px
`--ink-faint`:

| Instead of four columns | Use two paired cells |
|---|---|
| Avg buy price · Current price | **Price / avg cost** — price above, cost below |
| Invested amount · Current amount | **Value / invested** — value above (600), invested below |

Core order: rank → holding (sticky) → quantity → price/cost → value/invested → gain →
weight → action → chevron.

**Additional analytical columns are opt-in** via a Columns picker in the Filters popover
(P/E, RSI, ROCE, growth, DMA, 52-week, returns, sector, contribution, remarks, etc.). The
grid may exceed nine columns when the user turns these on — the earlier hard nine-column cap
is lifted, because the screen has horizontal room and analysts want these fields inline
rather than only in the drawer. They default **off** so the core stays lean; the choice is
persisted per browser and captured by saved views. Opt-in columns insert between weight and
action, are sortable, right-aligned + tabular for numerics (semantic colour on signed
values), left-aligned for text.

**Sticky recipe** (`border-collapse: separate; border-spacing: 0` — collapsed borders vanish
under sticky cells; put `border-bottom` on each `td`):

- `thead th` → `position: sticky; top: 0; z-index: 6`, white bg, `border-bottom: 2px --rule-section`
- holding column → `position: sticky; left: 0` (header `z-index: 7`, body `2`), opaque white bg
- `tfoot` totals → `position: sticky; bottom: 0; z-index: 4–5`, `border-top: 2px --rule-section`
- scroll container → `overflow: auto; max-height: calc(100vh - 340px)`

**Default sort is portfolio weight descending, never alphabetical.** Alphabetical buries an
18% position beneath a 0.06% one. Include a rank `#` column (11.5px, `oklch(0.62 0.003 0)`).
Sorted header is `--ink` with a ` ↓` suffix; others `oklch(0.48 0.003 0)`.

### Numbers

- **Compact Indian notation** for sums: `≥1e7 → ₹X.XX Cr`, `≥1e5 → ₹X.XX L`. Full-precision
  grouping (`₹37,44,00,000`) is unscannable across 119 rows — reserve it for unit prices and
  quantities.
- Indian digit grouping (last 3, then 2s) for any full-precision figure.
- Signs use `+` / `−` (U+2212), never a hyphen.
- **Missing data is never a loud `N/A`.** Use `—` in `oklch(0.7 0.003 0)`; where the cause is
  meaningful, say it in 11px muted text (`no cost basis` under the price cell when avg buy is
  0). A ₹0 cost basis must not compute a gain, and must not enter the total.

### In-row encoding

Anything filterable must be visible in the row.

- **Conviction → 3px greyscale spine** at the left of the holding cell, height per density.
  High `oklch(0.45 0.003 0)` · Medium `oklch(0.72 0.003 0)` · Low `oklch(0.88 0.003 0)`.
  Greyscale, so hue stays reserved for meaning.
- **Strategy → plain 11px text** `--ink-muted`, beside the ticker. Not a chip.
- **Action → tinted chip**, own centered column, 11.5px/600, radius 3px:

  | Action | Background | Text |
  |---|---|---|
  | Add | `oklch(0.95 0.035 155)` | `oklch(0.38 0.1 155)` |
  | Hold | `oklch(0.96 0.002 0)` | `oklch(0.45 0.003 0)` |
  | Trim | `oklch(0.955 0.03 75)` | `oklch(0.44 0.1 60)` |
  | Exit | `oklch(0.955 0.025 22)` | `oklch(0.44 0.16 22)` |

- **Status flags → badge only when true.** Pledged renders an 10.5px `Pledged` badge
  (`oklch(0.95 0.03 75)` / `oklch(0.45 0.1 60)`) beside the ticker, quantity in `title`.
- **Holding cell:** name 13.5px/600 with `text-overflow: ellipsis; max-width: 210px`; ticker
  11px `.n` `oklch(0.55 0.003 0)` beneath.
- Row-open affordance: `›` chevron in the last column, `oklch(0.72 0.003 0)` → `--crimson`
  on hover. Whole row clickable.

### Gain & weight columns

- **Gain** is a signed percentage in the row — 13px/600, semantic colour (`--positive` /
  `--negative`), sign as `+` / `−`. No inline bar.
- **Weight** is a plain percentage — 13px `--ink`. No inline bar.
- No sparklines, pies, gauges, or in-cell bars anywhere in the grid — the numbers carry the
  signal, right-aligned and tabular so the column scans vertically.

### Table chrome

- Header: 11px/600 sentence case, white bg, `border-bottom: 2px --rule-section`,
  `white-space: nowrap`, `cursor: pointer`.
- Rows: `border-bottom: 1px --rule-soft`, hover `--row-hover`. No zebra striping.
- Totals: white bg, `border-top: 2px --rule-section`, label `Total · 119 holdings` at
  12px/600 `--ink-2`, figures 600–700, mirroring the body's paired-cell structure.

### Toolbar

One wrapping row: search (260px, 4px radius) · saved-view buttons · spacer · density toggle ·
Filters · Export.

- **No saturated primary button on a data screen.** Export and Filters are white with a
  `--rule-strong` border. A bright green Export button must never be the loudest element —
  the data is.
- Saved views: 4px radius buttons; active = `--crimson` fill, white text, 600.
- Filter chips sit below in **labelled rows** (`Conviction` / `Strategy` / `Action`), a 74px
  label column then 3px-radius chips; band closed top and bottom by rules.
- Below the table: a 12px `--ink-muted` line explaining an encoding on the left, a contextual
  link on the right.

### Editing

Never mount form controls in every row — 119 rows × 2 controls was the largest single source
of bulk and noise in the original. Editing happens on row click (drawer or expanded row) or on
a dedicated entry screen. Read-only grids stay read-only.

---

## Part IV — Overview screen patterns

- **Performance rail:** a flat row bounded top and bottom by `1px --rule-strong`, cells
  divided by `1px oklch(0.93 0.003 0)` right borders. Each cell: 11.5px label → serif 27px
  figure → 11.5px benchmark. No card, no fill.
- **Metric grid:** three columns, each cell `padding: 13px 18px 13px 0` with a
  `1px --rule-soft` bottom border. Label 11.5px → value 17px/600 → caption 11px.
- **Section heading:** serif 16px/600 on the left, 11.5px context on the right, with a
  `2px --rule-section` underneath. This rule is the primary section separator on the page.
- **Ranked bars (largest positions):** name 13px/500 and `.n` percentage on one line, then a
  4px track `oklch(0.94 0.003 0)` with a `--crimson` fill normalized to the top holding.
- **Alert list:** rows separated by `1px --rule-soft`, each led by a 3px × 26px `--caution`
  spine, name 13px/500, note 11.5px, value 13px/600 semantic.
- Benchmarks always sit adjacent to the metric they qualify (`Benchmark 33.09` under
  weighted P/E), never in a separate column or legend.

---

## Known data issues to fix in the backend

- Holdings with a ₹0 average buy price produce a meaningless gain and silently distort the
  84.55% portfolio total. Exclude them from aggregate gain and mark them `no cost basis`.
- The `Admin` nav item was tinted amber, which reads as an error state. Style privileged
  sections neutrally or move them into the user menu.

---
name: BlueprintForge AI
description: An engineering drawing set being issued. Every screen is a numbered sheet, every claim carries a callout to its source.
colors:
  blueprint-ink: "#24365f"
  whiteprint-paper: "#f6f8fb"
  paper-shade: "#eceef3"
  drafting-desk: "#d9dde5"
  graphite: "#0e1726"
  pencil-muted: "#44537a"
  selection-wash: "#dfe3ec"
  hairline: "rgb(36 54 95 / 0.24)"
  grid-line: "rgb(36 54 95 / 0.055)"
  hatch: "rgb(36 54 95 / 0.2)"
  checkers-red: "#c41d16"
  verified-highlighter: "#ffe76a"
  cyanotype-ink: "#eef3ff"
  cyanotype-paper: "#172645"
  cyanotype-paper-shade: "#132039"
  cyanotype-desk: "#0e172a"
  cyanotype-text: "#f4f7ff"
  cyanotype-muted: "#bccbee"
  cyanotype-selection: "#22314f"
  cyanotype-hairline: "rgb(238 243 255 / 0.28)"
  cyanotype-grid-line: "rgb(238 243 255 / 0.07)"
  cyanotype-red: "#ff9a90"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(28px, 3.3vw, 48px)"
    fontWeight: 820
    lineHeight: 1.05
    letterSpacing: "0.005em"
    fontVariation: "'wdth' 125"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "clamp(26px, 2.6vw, 38px)"
    fontWeight: 820
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 125"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 760
    lineHeight: 1.2
    fontVariation: "'wdth' 125"
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    fontVariation: "'wdth' 100"
    fontFeature: "tabular-nums"
  label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.14em"
    fontVariation: "'wdth' 125"
  mono:
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 650
    fontFeature: "tabular-nums"
rounded:
  none: "0px"
  callout: "50%"
spacing:
  hair: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  section: "28px"
  grid: "24px"
components:
  button-issue:
    backgroundColor: "{colors.blueprint-ink}"
    textColor: "{colors.whiteprint-paper}"
    rounded: "{rounded.none}"
    padding: "10px 16px"
  button-issue-hover:
    backgroundColor: "{colors.whiteprint-paper}"
    textColor: "{colors.blueprint-ink}"
  button-small:
    backgroundColor: "{colors.whiteprint-paper}"
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.none}"
    padding: "5px 11px"
  button-small-hover:
    backgroundColor: "{colors.blueprint-ink}"
    textColor: "{colors.whiteprint-paper}"
  button-continue:
    backgroundColor: "{colors.whiteprint-paper}"
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.none}"
    padding: "12px 18px"
  input-field:
    backgroundColor: "{colors.whiteprint-paper}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
  tag-ink:
    textColor: "{colors.blueprint-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
  tag-verified:
    backgroundColor: "{colors.verified-highlighter}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
  tag-redline:
    textColor: "{colors.checkers-red}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
  sheet-number:
    backgroundColor: "{colors.blueprint-ink}"
    textColor: "{colors.whiteprint-paper}"
    padding: "6px 14px"
  detail-callout:
    backgroundColor: "{colors.whiteprint-paper}"
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.callout}"
    size: "64px"
  index-entry-current:
    backgroundColor: "{colors.blueprint-ink}"
    textColor: "{colors.whiteprint-paper}"
    padding: "8px 6px"
---

# Design System: BlueprintForge AI

## Overview

**Creative North Star: "The Drawing Set, Issued"**

The app is a set of engineering drawings. The viewport is one sheet in a 2px ink frame with an inner border line, a faint 24px drafting grid, and zone ticks (A, B, C... / 1, 2, 3...) along its edges. A title block runs down the right edge and holds the brand, the project (selected scenario), the sheet index used as navigation, the revision log and the DRAWN BY / CHECKED BY fields. Each screen is a numbered sheet (G-001, S-101, B-201, Q-301, A-501) headed by an inked sheet-number box and an expanded-caps sheet title.

Meaning comes from the drafting vocabulary, not from decoration. Sources are detail callouts (split circles: number over document code). Measured shares are dimension strings: a 2px ink line with 45-degree architectural ticks against a dashed full-scale baseline. Changes are red revision clouds with a numbered delta triangle. Verbatim, code-checked quotes are marked with a yellow highlighter. Approval is a double-ruled rubber stamp that lands once. The surface is dense like a drawing (hairline schedules, tabular mono figures) but sized for a projector.

Two printings of the same set: light is a cool whiteprint (blue ink on near-white paper); dark, chosen through `prefers-color-scheme`, is the cyanotype original (white linework on deep blueprint blue). The structure is identical across both; only the ink and paper swap.

**Key Characteristics:**
- One sheet frame per screen, title block on the right (stacked above the sheet below 1180px).
- Square corners everywhere; the only circles are detail callouts.
- 1px, 1.5px and 2px ink rules carry all structure; no shadows, no gradients used as fills.
- Archivo at width 125 in caps for title-block lettering; normal width (100) for reading text.
- JetBrains Mono with tabular numerals for every code, number, timestamp and sheet number.
- Red and yellow are reserved signals, never decoration.

## Colors

A two-ink drafting palette (blueprint ink on whiteprint paper) with two reserved checker's marks: red for redlines, yellow for verified.

### Primary
- **Blueprint Ink** (`blueprint-ink`): all linework, frames, headings, labels, primary buttons, the current index entry, and done steps. Hover inverts paper and ink. In cyanotype it becomes **Cyanotype Ink** (`cyanotype-ink`), near-white linework.

### Secondary
- **Checker's Red** (`checkers-red`): redlines only. Revision clouds, delta triangles, rejected strikethroughs, failed steps, error log lines and the reject stamp. Cyanotype: **Cyanotype Red** (`cyanotype-red`), a light salmon that reads on deep blue.

### Tertiary
- **Verified Highlighter** (`verified-highlighter`): only on what code verified. Verbatim source quotes, the verified tag, and text selection. Always paired with graphite text, in both modes.

### Neutral
- **Whiteprint Paper** (`whiteprint-paper`): sheet and title-block ground, button fill on inverted states. Cyanotype: `cyanotype-paper`.
- **Paper Shade** (`paper-shade`): secondary paper. Cyanotype: `cyanotype-paper-shade`.
- **Drafting Desk** (`drafting-desk`): the page background around the sheet. Cyanotype: `cyanotype-desk`.
- **Graphite** (`graphite`): body text. Cyanotype: `cyanotype-text`.
- **Pencil Muted** (`pencil-muted`): secondary text, zone ticks, pending steps, visited index entries. Cyanotype: `cyanotype-muted`.
- **Selection Wash** (`selection-wash`): hover and running-row tint. Cyanotype: `cyanotype-selection`.
- **Hairline** (`hairline`), **Grid Line** (`grid-line`), **Hatch** (`hatch`): ink at 24%, 5.5% and 20% alpha for schedule rules, the drafting grid and the full-coverage hatch.

### Named Rules
**The Two Checker's Marks Rule.** Red means changed, rejected or failed. Yellow means code verified it against the source. Neither appears for emphasis, branding or decoration.

**The Never By Colour Alone Rule.** Every red or yellow signal travels with a shape or word: a cloud, a delta number, a strikethrough, a dashed border, a tag label, quotation marks.

## Typography

**Display Font:** Archivo Variable (width axis, self-hosted via @fontsource-variable/archivo/wdth.css), falling back to system-ui
**Body Font:** Archivo Variable at normal width
**Label/Mono Font:** JetBrains Mono Variable (self-hosted), falling back to ui-monospace, Menlo

**Character:** Archivo's expanded width in heavy caps reads as stencilled title-block lettering; at normal width it is a plain, legible UI sans. JetBrains Mono makes every figure line up like a drawing schedule.

### Hierarchy
- **Display** (820, clamp(28px, 3.3vw, 48px), 1.05, width 125, uppercase): the sheet title beside the sheet number.
- **Headline** (820, clamp(26px, 2.6vw, 38px), 1.05, width 125, uppercase): cover-sheet title; agent job heads use 820 / 26px.
- **Title** (760, 15px, width 125, uppercase): column heads over a 2px ink rule; entry names use 700 / 17px at normal width.
- **Body** (400, 16px, 1.55, width 100, tabular-nums): reading text; ledes at 17.5px, notes capped at 78ch, entry detail at 68ch.
- **Label** (650, 10.5 to 12.5px, width 112 to 125, uppercase, 0.06 to 0.14em tracking): title-block field names, schedule headers, tags, field labels.
- **Mono** (600 to 700, 11 to 20px): sheet numbers (20px), document codes (20px), callout numbers (15px), dimension labels (13px), log timestamps (12px).

### Named Rules
**The Lettering Width Rule.** Width 125 caps are for the drawing's own lettering (sheet titles, title block, labels, stamps). Anything a person reads as prose stays at width 100, sentence case.

**The Tabular Figure Rule.** Numbers are always tabular; codes, counts, durations and sheet numbers are always mono.

## Layout

A two-column drawing: the sheet (`minmax(0, 1fr)`) and a 330px sticky title block, 20px desk padding around both. The sheet has asymmetric drafting margins (46px top, 52px right, 40px bottom, 62px left) leaving room for zone ticks, and a 24px drafting grid. Spacing runs on a 4px base with 6, 8, 12, 16, 20 and 28px as the working steps; sections separate by 28 to 44px with a 1px ink rule before the continuation control. Content groups use auto-fit grids (schedules at minmax(310px), document index at minmax(176px)). The cover pipeline is a six-column section line joined by a 2px ink rule; the agent sheet is 340px jobs list beside the run.

Responsive: at 1180px and below the title block moves above the sheet as a two-column grid and the sheet index becomes three columns; at 720px and below it is one column, the index two columns, the revision grid and log hide, zone ticks hide, and the sheet inner border tightens to 5px.

## Elevation & Depth

Flat. Nothing floats; depth is drawn, not lit. Stacking reads through ink weight (2px frame, 1.5px controls, 1px hairlines) and inversion (ink fill for the current, done or primary item). The only `box-shadow` in the system is an inset paper-then-ink pair on the sheet (`inset 0 0 0 7px paper, inset 0 0 0 8px ink`) that draws the inner border line of a drawing frame; it is linework, not elevation.

### Named Rules
**The Drawn Not Lit Rule.** No drop shadows, no blur, no gradient fills. If something needs to stand out, invert it or weight its rule.

## Shapes

Square corners (0) on every box, control, tag and field. The single exception is the detail callout, a 64px circle split by a horizontal rule. Borders are the form language: 2px ink for frames, sheet heads, schedules and primary controls; 1.5px for small buttons, inputs and tags; 1px hairline for internal rules. Dashed borders mean held, absent or awaiting a human (hold notes, absent-country chips, empty states). A double 5px border is reserved for the stamp. Revision clouds are an 8px `border-image` of red scallops. Triangles appear as delta marks and as the disclosure caret.

## Components

### Buttons
- **Shape:** square (0).
- **Issue (primary):** ink fill, paper text, 2px ink border, 720 / 14.5px width-112 caps, 0.05em tracking, 10px 16px padding; `.big` variant 17px at 14px 22px.
- **Hover / Focus:** inverts to paper fill with ink text; active nudges down 1px; focus is a 2px ink outline at 2px offset. Disabled drops to 45% opacity.
- **Small:** paper fill, 1.5px ink border, 620 / 13.5px, 5px 11px; hover or `.solid` inverts.
- **Continue:** paper fill, 2px ink border, a label line plus the next sheet number in mono 18px; hover inverts. Right-aligned at the foot of each sheet.
- **Ghost:** no border, ink text, 600 weight.

### Chips (Tags)
- **Style:** rectangular, 1.5px border in currentColor, 650 / 11.5px width-112 caps, 2px 7px, optional 12px icon.
- **Variants:** ink (default), verified (highlighter fill, graphite text and border), redline (red), muted (hairline border), hold (dashed graphite). Geography chips are mono 12px; full coverage is hatched at -45 degrees, absent is dashed and struck through.

### Cards / Containers
- **Corner Style:** square.
- **Background:** whiteprint paper on the gridded sheet.
- **Shadow Strategy:** none (see Elevation).
- **Border:** notes 1px ink; job head and sequence 2px ink; legend 1px hairline; empty state 1.5px dashed ink.
- **Internal Padding:** 12px 16px typical.

### Inputs / Fields
- **Style:** paper fill, 1.5px ink border, square, 8px 10px, 15px text; textareas in mono 14px; checkboxes and radios use ink accent at 16px.
- **Labels:** 650 / 12.5px width-112 caps in ink above the field.
- **Focus:** the global 2px ink outline.

### Navigation (Sheet Index)
- **Style:** a list in the title block; each entry is a grid of mono sheet number (58px), sheet name, and state, separated by hairlines.
- **States:** hover takes the selection wash; current page inverts to ink fill; visited sheets drop to muted.
- **Mobile:** becomes a 3-column, then 2-column grid of cells.

### Schedules (Tables)
2px ink outer border, 1px hairline cells, ink-filled header row in width-112 caps, numbers right-aligned in mono, a 2px ink rule above the footer.

### Detail Callout (signature)
64px split circle, 2px ink border: mono 15px number above the rule, mono 10px document or sheet code below. Clickable callouts invert on hover and open the source.

### Dimension String (signature)
A 2px ink line whose length is the measured share, ending in 45-degree tick marks, over a dashed full-scale hairline baseline; the value sits centred in mono 13px on a paper knockout, or to the right when the share is under 40%.

### Revision Cloud and Delta (signature)
A changed item gets an 8px red scalloped border and a red delta triangle numbered in mono 10px. Used on blueprint entries, agent timeline steps and revised sequence cells.

### Rubber Stamp (signature)
Rotated -6 degrees, 5px double border in ink (approve) or red (reject), 860 / 22px width-125 caps title, a line and a mono date. Lands once: scales from 1.7 to 1 with fade over 420ms `cubic-bezier(0.16, 1, 0.3, 1)`.

### Agent Sequence and Timeline
A 5-column grid of step cells in a 2px ink frame: done cells invert to ink, the active cell plots a 4px ink bar across its foot, held cells take a dashed graphite outline, failed cells go red, revised cells take a cloud. Timeline rows show a mono step number, a tool chip, a duration bar (marching dashes while running) and the agent's reasoning in italic.

### Plotter (activity indicator)
A 26px by 2px ink line that draws itself (scaleX 0 to 1, 1.1s `cubic-bezier(.2, .8, .2, 1)`, repeating) beside live log text while work runs. All animation stops under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** frame every screen as a numbered sheet: inked sheet-number box, width-125 caps title, 2px ink rule under the head.
- **Do** give every claim a detail callout or source link, and mark verified quotes with the highlighter.
- **Do** show measured numbers as dimension strings or right-aligned mono figures in a schedule.
- **Do** show change as a red cloud plus a numbered delta, and approval as the stamp.
- **Do** use inversion (ink fill, paper text) for hover, current and done states.
- **Do** keep both printings in step: every new colour needs a whiteprint and a cyanotype value.

### Don't:
- **Don't** use red or yellow for anything except redlines and verified evidence.
- **Don't** round corners, except the detail callout circle.
- **Don't** add drop shadows, blur, glass or gradient fills; the drafting grid and hatch are the only patterned backgrounds.
- **Don't** set prose in width-125 caps; that width is lettering only.
- **Don't** carry meaning by colour alone; pair it with a shape, border style or word.
- **Don't** fall back to sidebar plus cards plus an accent-coloured button; the title block is the navigation and the issue control.

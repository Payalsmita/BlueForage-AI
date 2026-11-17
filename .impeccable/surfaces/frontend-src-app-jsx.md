---
version: 1
slug: "frontend-src-app-jsx"
primary_target: "frontend/src/App.jsx"
related_targets: ["frontend/src"]
---

# Surface: BlueprintForge AI app (frontend/)

Mode: Operate (app UI), shown primarily to hackathon judges via projector, screen share and recorded video; secondarily used by implementation consultants on laptops.

Audience/job: judges must grasp problem → mechanism → proof → agent in a 5-minute guided demo (DEMO_SCRIPT.md); consultants review blueprints, check customers and run the agent.
Constraints: keep every feature and API contract; projector-legible (large type, high contrast, meaning never by colour alone); keyboard operable; reduced motion; mock iCIMS export labelled as mock; fictional data labelled.
Memorable moment: the consultant's approval lands as a rubber stamp on the handover sheet; the agent's revise loop appears as a revision cloud with a delta.

## Direction contract

THESIS: The app is a drawing set being issued. Every screen is a numbered sheet, every claim carries a detail callout to its source, revisions are clouds with deltas, approval is a stamp. Refuses the category default: sidebar + cards + indigo button AI dashboard.

OWN-WORLD: Cool whiteprint paper (#f6f8fb) with a faint drafting grid; blueprint ink (#1b3a8f) for all linework and headings; checker's red (#d7261e) only for redlines/revisions/failures; checker's yellow highlighter (#ffd60a) only for code-verified evidence; graphite (#0e1726) text. Archivo (expanded caps for title-block lettering, normal width for UI) + JetBrains Mono tabular numerics. Hairline 1px and 2px ink rules, square corners, sheet borders with zone ticks, no shadows, no gradients.

STORY: Judges see the set's cover sheet (problem, pipeline as a dimensioned section, measured accuracy as dimension strings), follow the sheet index sheet by sheet, and watch the agent draw, revise (cloud) and get stamped approved.

FIRST VIEWPORT: Sheet frame filling the viewport. Right edge: title block (BLUEPRINTFORGE AI, project = selected scenario, sheet index G-001…A-501 as navigation, revision table, DRAWN BY AGENT / CHECKED BY CONSULTANT). Main field: sheet title at display scale ("G-001 COVER SHEET"), the pipeline as a horizontal section with numbered detail bubbles, three dimension strings for the measured numbers. Primary action "Generate blueprint" sits in the title block as the issue control.

FORM: Engineering drawing set, candidate 4 of 7 on my ordered list; seed key 0e2a1115. Raises: time-axis agent steps (Labanotation), code-keyed source index (doujin catalog), tabular mono numerics (Ikeda), right-aligned running figures (J-card).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

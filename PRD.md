# PRD — BlueprintForge AI

**Status:** Draft v0.1 · **Owner:** Tushar Chandel (captain) · **Team:** Tushar Chandel, Payalsmita Pradhan, Saikumar Adepu
**Related:** [IDEA_BRIEF.md](IDEA_BRIEF.md) · [TRD.md](TRD.md)

## 1. Summary

BlueprintForge AI reads past recruiting implementations and generates an **editable, evidence-backed industry blueprint**: the hiring stages, roles, and approval rules an industry usually needs. Each item shows how often it appeared and links to the source text it came from. A consultant reviews every item before the blueprint is used.

## 2. Problem

- Similar industry workflows are configured from scratch for every customer.
- Implementation knowledge lives in scattered docs and in senior consultants' heads.
- The result is weeks of repetitive effort, slower time-to-value, and inconsistent setups.

## 3. Goals and non-goals

### Goals (hackathon MVP)

- G1. Generate an airline-industry blueprint from 10–20 synthetic implementation docs.
- G2. Every blueprint item has source evidence and a confidence score.
- G3. A consultant can approve, edit, or reject every item and export the result.
- G4. The end-to-end run (upload → blueprint) takes under 10 minutes.

### Non-goals

- Writing configuration into iCIMS, or any live iCIMS API access.
- Real customer data, multi-tenant access control, authentication.
- Predictive accuracy claims or ML training.
- Polished blueprints for more than one industry. Other industries exist in the dataset only as contrast.

## 4. Users

| Persona | Need | Use of BlueprintForge |
|---|---|---|
| **Implementation consultant** (primary) | Start a new customer from a proven setup | Generate, review, edit, and export a blueprint |
| **Implementation lead** | Consistent quality across consultants | See which patterns are standard (high confidence) and which are outliers |
| **Hackathon judge** | Understand the value in 5 minutes | Watch the airlines demo story |

## 5. User stories

| ID | Story | Priority |
|---|---|---|
| US-1 | As a consultant, I upload historical implementation docs (PDF/DOCX/TXT/MD) tagged with industry and workflow type. | P0 |
| US-2 | As a consultant, I see the stages, roles, and approval rules extracted from each doc. | P0 |
| US-3 | As a consultant, I generate a blueprint for an industry + workflow type. | P0 |
| US-4 | As a consultant, I see a confidence score ("4/6 implementations") on every blueprint item. | P0 |
| US-5 | As a consultant, I click any item and see the exact source excerpts and doc names behind it. | P0 |
| US-6 | As a consultant, I approve, edit, or reject each item. | P0 |
| US-7 | As a consultant, I export the reviewed blueprint as JSON and Markdown. | P0 |
| US-8 | As a lead, I see variants. For example, "60% of airlines add a Simulator Assessment stage for pilots." | P1 |
| US-9 | As a consultant, I filter the blueprint by geography or job role. | P2 |

## 6. Functional requirements

| ID | Requirement | Story |
|---|---|---|
| FR-1 | The system accepts PDF, DOCX, TXT, and MD uploads with metadata: industry, geography, workflow type, doc ID. | US-1 |
| FR-2 | The system extracts a structured record per doc: stages (ordered), roles, approval rules, and source quote(s) for each. | US-2 |
| FR-3 | Extraction output is schema-validated. Invalid output is retried once, then the doc is flagged. | US-2 |
| FR-4 | Equivalent items across docs are normalized to one canonical name, and their aliases are kept. | US-3 |
| FR-5 | Confidence = number of docs containing the item ÷ number of docs in the group. | US-4 |
| FR-6 | Every blueprint item stores ≥1 evidence reference (doc ID + verbatim quote). Items without evidence are dropped. | US-5 |
| FR-7 | Every item has a review status (`pending`/`approved`/`edited`/`rejected`), and edits are saved. | US-6 |
| FR-8 | Export includes only approved and edited items, plus evidence and confidence. | US-7 |
| FR-9 | Extraction results are cached per doc so the demo can run without live LLM calls. | — |

## 7. UX flow

```
Upload docs ──► Extraction view (per doc) ──► Generate blueprint
                                                     │
                     ┌───────────────────────────────┘
                     ▼
     Blueprint view: Stages │ Roles │ Approval rules
       each item: name · confidence bar · [evidence ▸] · approve/edit/reject
                     │
                     ▼
               Export (JSON / MD)
```

## 8. Success metrics

| Metric | Target | How measured |
|---|---|---|
| Time from upload to blueprint | < 10 min | Timed during demo |
| Items with evidence | 100% | Automated check on blueprint JSON |
| Items with confidence score | 100% | Automated check |
| Evidence quotes found verbatim in the source | 100% | String-match check (TRD §6) |
| Manual baseline comparison | 2–4 weeks (**assumption**) | Requires a real pilot |

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM quota or outage on demo day | Cached extractions (FR-9) and a pre-generated blueprint as fallback |
| Unconvincing synthetic data | Spend dedicated time writing realistic docs and include deliberate variants |
| LLM invents a pattern | Require verbatim quotes and drop items whose quote isn't in the source (TRD §6) |
| Bad practices get templated as "standard" | Show frequency and evidence. A consultant must approve each item. |
| Real data is sensitive (future) | Anonymization and approval before any real ingestion. Out of MVP scope. |

## 10. Milestones (hackathon)

| # | Milestone | Owner |
|---|---|---|
| M1 | 10–20 synthetic docs + taxonomy written | _TBD_ |
| M2 | Extraction pipeline + schema + cache | _TBD_ |
| M3 | Aggregation + blueprint generation | _TBD_ |
| M4 | Streamlit review UI + export | _TBD_ |
| M5 | Demo script + dry run | All |

## 11. Open questions

- Q1. What is the final team name?
- Q2. Which LLM key is approved for the event (Claude / Azure OpenAI)?
- Q3. Does the export need to match any real iCIMS configuration format, or is generic JSON/MD enough?
- Q4. Who owns each milestone?

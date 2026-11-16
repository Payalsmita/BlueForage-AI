# AI-gnite Hackathon Idea Brief — BlueprintForge AI

| Field | Response |
|---|---|
| **Project title** | BlueprintForge AI |
| **Team name** | _TBD (currently "Cohort", which is the template's placeholder)_ |
| **Team members** | Tushar Chandel, Payalsmita Pradhan, Saikumar Adepu |
| **Captain / email** | TUSHARADRI.CHANDEL@icims.com |
| **Source idea** | iCIMS AI Hackathon Ideas — #2 "AI Industry Blueprint Generator" |

---

## Problem Statement

Every new customer implementation rebuilds nearly identical hiring workflows from scratch, even though the company has solved the same industry patterns dozens of times. That knowledge is trapped in scattered documents and senior consultants' heads. Implementation teams waste weeks on repetitive configuration, which raises cost, slows time-to-value, and produces inconsistent setups across customers. BlueprintForge AI turns approved historical implementations into reusable, evidence-backed industry blueprints, so implementations start from proven patterns instead of a blank page.

## Solution Idea

BlueprintForge AI learns from the company's past hiring setups. It finds the patterns each sector repeats (stages, roles, and approval rules) and turns them into ready-made templates that consultants can adjust for a new customer. **A consultant reviews and approves every blueprint item before it is used, and no recommendation is applied automatically.** Teams start from proven blueprints in any industry with enough implementation history, saving weeks of work.

## Approach

### Build steps

1. **Prepare synthetic dataset.** Write 10–20 fictional "historical implementation" docs (workflow descriptions, config snippets, stage/rule tables). Focus on **airlines** for the demo and add a few docs each for healthcare, retail, and automotive. Tag every doc with metadata: industry, geography, workflow type.
2. **Ingest and parse.** Load PDF/DOCX/TXT into clean text chunks with their metadata tags.
3. **Extract.** The LLM, using structured JSON output validated by a schema, extracts workflow patterns (roles, stages, approval rules) from each doc, along with the exact source quote for each one.
4. **Aggregate patterns.** Group extractions by their **industry + workflow-type metadata tags**. Normalize equivalent items, for example "Phone Screen" and "Recruiter Screen", and count how many implementations contain each pattern. That count is the confidence score, e.g. "found in 4/6 implementations". _Embedding-based clustering is unnecessary for the MVP because the docs are already labeled._
5. **Generate blueprint.** The LLM writes each group up as an editable industry template. Every item links back to the source excerpts that support it.
6. **Review UI + demo.** A single Streamlit app: upload docs → view extracted patterns → browse the generated blueprint → click any item to see its evidence → **approve / edit / reject** → export. Prepare a 5-minute demo script built around the airlines story.

### Tools / data

- **LLM:** Claude API via the Python SDK (`anthropic`) for extraction and synthesis, with JSON validated against a Pydantic schema.
- **Embeddings (optional):** local `sentence-transformers` model, used only to normalize similar item names. This avoids needing a second vendor key.
- **App:** a single Python + Streamlit app with no separate backend. FastAPI can be added later if another system needs an API.
- **Storage:** JSON files on disk. A vector database is not needed at MVP scale.
- **Data:** 100% synthetic, self-authored sample implementations. No customer data.
- **Dev:** `.env` for the API key. Claude Code is optional, to speed up scaffolding.

### Dependencies / risks

- **LLM API access and quota.** We need a working key and enough rate limit for repeated extraction calls. Mitigation: cache extraction results to disk so the demo can run without live calls.
- **Synthetic data quality.** The demo is only as convincing as the sample docs, so we will set aside real time to make them realistic.
- **Sensitive customer data (future work).** Real historical implementations may contain customer-identifying or sensitive information. Production use would require anonymization/redaction and approval before ingestion. The hackathon uses synthetic data only.
- **Inconsistent historical practice.** Past implementations may disagree with each other. Blueprints show frequency and evidence so a consultant can judge, and they are recommendations to review, not configuration to apply blindly.

## Expected Outcome

**Demo deliverable:** a working end-to-end prototype that:

- Ingests 10–20 synthetic historical implementation docs. The demo focuses on airlines.
- Extracts roles, hiring stages, and approval rules with an LLM using structured JSON output.
- Groups patterns by industry and workflow type and shows how often each one occurs.
- Generates an editable industry blueprint in which every item shows:
  - **Evidence:** a clickable link to the source doc excerpt
  - **Confidence:** "found in N/M implementations"
  - **Review status:** pending, approved, edited, or rejected by a consultant
- Exports the approved blueprint (JSON / Markdown).

**Expected benefit:**

- **Consultants** start from a proven, evidence-backed template instead of a blank page.
- **iCIMS** gets shorter implementation timelines, better margins, and less dependence on individual consultants' expertise.
- **Customers** get a faster go-live and more consistent quality, based on what worked for peers in their industry.
- _Assumption:_ value grows with the volume of historical data. Real value requires anonymized, approved historical implementations, which is future work.

**Success measures:**

1. A blueprint generated in under 10 minutes from raw docs, compared with an **assumed** manual baseline of 2–4 weeks.\*
2. 100% of blueprint items show source evidence and a confidence score.
3. Every item can be reviewed (approved, edited, or rejected) and exported in the UI.

Validation: timed live demo and UI inspection of evidence links. \*The baseline is an assumption. Real validation requires a pilot on actual historical data.

---

## Change log (vs. original .docx brief)

| # | Change | Why |
|---|---|---|
| 1 | Added an explicit consultant review/approve step to the solution, UI, and outcomes | The iCIMS doc says recommendations "must be configurable, not blindly applied" |
| 2 | Added a sensitive-data / anonymization risk as future work | This is the iCIMS doc's main stated risk for this idea |
| 3 | Added an inconsistent-historical-practice risk | Also stated in the iCIMS doc |
| 4 | Flagged team name "Cohort" as a placeholder | It looks like it was copied from the template |
| 5 | Replaced embedding clustering with grouping by metadata tags plus frequency counts | Docs are already labeled, so this gives the same confidence score with less to build and fewer demo-day failure points |
| 6 | Replaced OpenAI embeddings with an optional local `sentence-transformers` model | Avoids a second vendor and a second API key |
| 7 | Dropped FastAPI and the vector database in favor of one Streamlit app with JSON storage | One less layer, which is enough for the MVP |
| 8 | Changed "across every industry" to "any industry with enough implementation history" | Matches the airlines-focused MVP |
| 9 | Added caching of extraction results as an LLM quota mitigation | Lets the demo run even if the API is rate-limited |

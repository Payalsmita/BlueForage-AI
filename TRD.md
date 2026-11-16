# TRD — BlueprintForge AI

**Status:** Draft v0.1 · **Related:** [PRD.md](PRD.md) · [IDEA_BRIEF.md](IDEA_BRIEF.md)

## 1. Scope

This document covers the technical design for the hackathon MVP described in the PRD: a single Spring Boot service that turns synthetic implementation docs into a reviewed, evidence-backed industry blueprint. It does not cover production concerns such as auth, multi-tenancy, or iCIMS integration. Those are listed in §9.

## 2. Architecture

```
 docs/*.md ─► DocStore ─► Extractor ──────────► Blueprints ───────────────► Api (REST)
 manifest     metadata    LLM extract           LLM normalize names         GET / PATCH review
              + upload    verbatim-quote check  code counts support          export .json / .md
                          cache per doc         LLM writes descriptions
                               │                      │
                               ▼                      ▼
                     data/extractions/<docId>.json   data/blueprints/<industry>_<workflow>.json
```

One process with no separate backend, no database, and no vector store. All state is JSON files under `data/`.

## 3. Tech stack

> **Changed from v0.1:** the backend is Java/Spring Boot, and the LLM is any OpenAI-compatible endpoint.

| Concern | Choice | Notes |
|---|---|---|
| Language / framework | Java 21, Spring Boot 4.1 (Maven) | Single service, REST API |
| LLM | Any OpenAI-compatible Chat Completions endpoint via `openai-java` SDK | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. The endpoint must support `response_format: json_schema`. |
| Structured output | Java records → JSON schema (SDK `responseFormat(Class)`) | Schema validity is covered by a unit test |
| Doc parsing | `.md` / `.txt` as-is; `.pdf` / `.docx` / `.pptx` via Microsoft MarkItDown CLI | `MARKITDOWN_CMD` overrides the binary path |
| Storage | JSON files under `data/` | No database |
| Frontend | ReactJS (Vite) in `frontend/` | Built into Spring Boot's static folder; `npm run dev` proxies `/api` |

**Deliberately excluded:** vector DB, embeddings, agent frameworks, fine-tuning.

## 4. Repository layout

```
payal_hackathon/
├── docs/                       # synthetic input docs + manifest.csv
├── data/                       # generated JSON (gitignored)
│   ├── extractions/<docId>.json
│   └── blueprints/<industry>_<workflow>.json
└── backend/                    # Spring Boot app
    └── src/main/java/com/blueprintforge/
        ├── Api.java            # REST endpoints
        ├── DocStore.java       # manifest + doc files + upload
        ├── Extractor.java      # LLM extraction, verbatim-quote check, cache
        ├── Blueprints.java     # normalize, aggregate, synthesize, review, export
        ├── Llm.java            # OpenAI-compatible structured-output call
        └── Models.java         # all records/enums
```

## 5. Data model

### 5.1 Input manifest (`docs/manifest.csv`)

```
doc_id,filename,industry,geography,workflow_type
AIR-001,skyway_pilot_hiring.docx,airlines,US,pilot
AIR-002,...
```

### 5.2 Extraction record (one per doc)

```python
class Evidence(BaseModel):
    doc_id: str
    quote: str            # must be verbatim from source text

class Stage(BaseModel):
    name: str
    order: int
    evidence: list[Evidence]

class Role(BaseModel):
    name: str             # e.g. "Hiring Manager", "Chief Pilot"
    responsibilities: list[str]
    evidence: list[Evidence]

class ApprovalRule(BaseModel):
    trigger: str          # e.g. "offer salary above band"
    approvers: list[str]
    evidence: list[Evidence]

class Extraction(BaseModel):
    doc_id: str
    industry: str
    workflow_type: str
    stages: list[Stage]
    roles: list[Role]
    approval_rules: list[ApprovalRule]
```

### 5.3 Blueprint

```python
class BlueprintItem(BaseModel):
    id: str                       # e.g. "STG-03"
    kind: Literal["stage", "role", "approval_rule"]
    name: str                     # canonical name
    aliases: list[str]
    detail: str                   # LLM-written description
    typical_order: float | None   # stages only: mean order
    support: int                  # docs containing the item
    total: int                    # docs in group
    evidence: list[Evidence]      # ≥1 required
    status: Literal["pending", "approved", "edited", "rejected"] = "pending"
    edited_detail: str | None = None

class Blueprint(BaseModel):
    industry: str
    workflow_type: str
    source_doc_ids: list[str]
    items: list[BlueprintItem]
```

Confidence shown in the UI is `support / total`.

## 6. Pipeline

| Step | Input → Output | Logic |
|---|---|---|
| **Ingest** | file → `(doc_id, text, metadata)` | Parse by file extension and join metadata from the manifest. Reject files that are not in the manifest. |
| **Extract** | text → `Extraction` | One LLM call per doc, with the system prompt + JSON schema derived from a Java record (structured outputs guarantee the shape). Docs in a group are extracted in parallel on virtual threads. Cache to `data/extractions/<doc_id>.json` and skip the call when the cache exists. |
| **Evidence check** | `Extraction` → `Extraction` | Drop any evidence whose `quote` is not a substring of the source text after whitespace normalization. Drop items left with no evidence. **This runs deterministically and does not use the LLM.** |
| **Aggregate** | `Extraction[]` (same industry + workflow) → candidate groups | One LLM call maps all item names to canonical names (returning `{alias: canonical}`). Then deterministic code counts distinct `doc_id`s per canonical item and merges the evidence. |
| **Synthesize** | candidate groups → `Blueprint` | One LLM call writes a `detail` for each item. Support counts and evidence are copied from aggregation and never taken from LLM output. Items with support of 1 are kept but marked as outliers in the UI. |
| **Review** | `Blueprint` → `Blueprint` | `PATCH` updates `status` / `edited_detail` and saves to `data/blueprints/`. |
| **Export** | `Blueprint` → JSON + MD | Include only `approved` / `edited` items. |

**Rule:** numbers (support, total, order) and evidence come only from deterministic code. The LLM writes names and prose, never counts.

### Runnable check (`backend/src/test/.../PipelineTest.java`)

The check runs without calling the LLM. It asserts that:
1. every blueprint item has ≥1 evidence entry,
2. every evidence quote is a substring of its source doc,
3. `0 < support <= total` for every item,
4. the LLM output records are valid structured-output schemas.

## 7. Prompts (outline)

- **Extraction system prompt:** "You are an implementation analyst. Extract only what the document states. For every item, include a verbatim quote copied exactly from the document. If something is not stated, omit it." The prompt also includes the JSON schema.
- **Normalization prompt:** receives the list of item names grouped by kind and returns `{alias: canonical}`. It must not invent items.
- **Synthesis prompt:** receives the canonical items with evidence quotes and writes a 1–2 sentence `detail` for each, using only the quotes.

## 7a. Added capabilities (v0.2)

| Capability | Endpoint | LLM does | Code does |
|---|---|---|---|
| Per-country support | part of every blueprint item (`geoSupport`) | — | counts docs per geography, e.g. `DE 2/2` |
| Gap check (new customer vs blueprint) | `POST /api/blueprints/{i}/{w}/gap-check` | extracts customer items; maps them to blueprint names | MISSING if ≥50% of peers have it (customer's country ratio when peers exist there), UNIQUE if no peer has it, ALIGNED otherwise |
| Accuracy eval | `GET /api/eval/{i}/{w}` | — | precision/recall per kind vs `docs/ground_truth.json`; names fuzzy-matched by word overlap, approval rules matched by quote overlap |
| UI | `/` (static `index.html`, no build step) | — | blueprint review, evidence viewer, gap check, accuracy |

## 7b. Added capabilities (v0.3)

| Capability | Where | Notes |
|---|---|---|
| React frontend | `frontend/` (Vite + React), built into `backend/src/main/resources/static` | Replaces the single-file UI; adds a Sources tab with upload |
| PDF/DOCX/PPTX upload | `DocStore.toMarkdown` → Microsoft MarkItDown CLI | Converted Markdown is stored as `{docId}.md`; the quote check runs against it. Docs are short enough to send whole, so there's no chunking or embeddings yet. The same Markdown is ready to be chunked if docs grow. |
| Stage-order variants | `Blueprint.orderConflicts` | Stage pairs that peers run in opposite orders, with doc IDs on each side |
| Approvers per rule | `BlueprintItem.approvers` | Union of approvers named in the evidence, most frequent first |
| Mock iCIMS config export | `GET .../export.icims.json` (`IcimsExport`) | Approved/edited items mapped to workflow statuses (keyword-binned), user roles, approval chains, country scoping, traceability. **Not an official iCIMS schema.** |
| Swagger / OpenAPI | springdoc-openapi 3.2 → `/swagger-ui.html`, `/v3/api-docs(.yaml)`; committed copy in `api.yml` | Generated from the controllers, so it can't drift from the code; summaries come from `@Operation` |
| Answer keys for every doc | `MANUAL_GOLD` in `tools/gen_synthetic_docs.py` | Accuracy now covers all 7 scenarios |

## 7c. Implementation Agent, self-check and MCP (v0.4)

**Implementation Agent** (`ImplementationAgent`, `AgentRun`; `POST/GET /api/runs`, `/answers`, `/approval`, `/handover.md`, `/config.json`)

```
kickoff notes → extract_requirements (+ self-check) → gap_check → draft_questions ⏸ consultant answers
→ apply_answers → draft_config → validate_config ↺ revise_config → generate_uat → handover ⏸ consultant approval
```

- **Agentic with guardrails:** each turn, code computes the ALLOWED tools from the run state (`allowedTools`), and the LLM picks one and gives a one-sentence reason that the UI shows. Anything outside the allowed set falls back to the default next step. There are real choices: ask the customer or proceed straight to config; revise the config or move on to tests. The revise loop is capped at 2.
- **LLM vs code:**
  - The LLM: planning, question wording, interpreting free-text answers, UAT test cases.
  - Code: final requirement list, config build (via `IcimsExport`), 8 validation checks, auto-fixes, coverage.
  - The validation checks are coverage, traceability, approvers, approver roles, stage order, country scope, duplicates, and requisition approval.
- **Human in the loop:** pauses at `WAITING_FOR_ANSWERS` and `WAITING_FOR_APPROVAL`. Free-text answers are interpreted by the LLM and labelled `interpretedByAgent`.
- **State and recovery:** one JSON file per run in `data/runs/`, written atomically after every step. Runs that were RUNNING when the server restarted are marked FAILED.

**Self-check extraction** (`Extractor.SELF_CHECK`; toggle with `SELF_CHECK=false`)
- A second pass asks the model to list what its first pass missed. Additions go through the same verbatim-quote check and are stored separately (`Extraction.selfCheck`).
- The accuracy report shows recall with and without the self-check (`withoutSelfCheck`).

**MCP server** (`mcp/`, Python, official MCP SDK)
- 8 tools wrapping the REST API: scenarios, blueprint, gap check, start/get/answer/approve implementation, and handover.
- See `mcp/README.md` for Claude Desktop and Claude Code setup.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Full run over 20 docs in < 10 min with a live LLM, and < 10 s when using the cache |
| Cost | About 22 LLM calls per full run (20 extract + 1 normalize + 1 synthesize) |
| Reliability | The demo runs fully from cache when the API is down |
| Security | The API key lives only in `.env` (gitignored). No customer data. Synthetic docs are labeled "FICTIONAL". |
| Traceability | Every exported item carries doc IDs and verbatim quotes |

## 9. Out of scope / future work

- Real historical data: anonymization/redaction pipeline, data approval, tenant isolation, RBAC, audit trail.
- Embedding-based clustering and a vector DB, once the corpus grows beyond what fits in one normalization call (~hundreds of docs).
- FastAPI service for integration with other tools such as the Implementation Copilot or Drift Detector.
- Export in a real iCIMS configuration format (depends on PRD Q3).

## 10. Open technical questions

- T1. Which OpenAI-compatible endpoint/model is approved for the event? Only env vars change.
- T2. Does the normalization call fit in context for 20 docs? It should (on the order of a few hundred item names), but this needs to be confirmed with real synthetic data.
- T3. Should stage ordering conflicts across docs be shown as variants (PRD US-8)?

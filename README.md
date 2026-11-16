# BlueForage-AI — BlueprintForge AI

BlueprintForge AI learns from the company's past hiring setups across every industry. It spots the patterns each sector repeats — the stages, roles, and approval rules — and turns them into ready-made templates consultants can quickly adjust for any new customer. Instead of starting every project from a blank page, teams start from proven blueprints — saving weeks of work, no matter the sector.
See [IDEA_BRIEF.md](IDEA_BRIEF.md), [PRD.md](PRD.md), [TRD.md](TRD.md).

## Run the backend

Requires Java 21+ and Maven (`brew install maven`).

```bash
cp .env.example .env                             # then put your key in .env (gitignored)
cd backend && (set -a; . ../.env; set +a; mvn spring-boot:run)   # UI + API at http://localhost:8080
mvn test                                        # deterministic checks, no LLM needed
```

Default model: `deepseek/deepseek-v4.1-flash-1017` via OpenRouter. Any OpenAI-compatible endpoint works if the
model supports `response_format: json_schema`. Measured on this model: a 5-doc scenario takes ~45-100 s from cold, and
seconds once extractions are cached in `data/` (use *re-extract* to refresh).

## Demo flow (UI)

Open http://localhost:8080:
1. **Blueprint**: pick a scenario → *Generate blueprint* → confidence bars, per-country support (e.g. `DE 1/1`),
   "unique practice" flags, evidence quotes (click a doc ID to see the source with the quote highlighted) → approve / edit / reject → export.
2. **Gap check**: *Load sample customer* (airlines → Canadian carrier, technology → US startup) or paste notes → see what the
   customer is **missing** vs peers (country-aware), what is **unique** to them, and what is **aligned**.
3. **Accuracy**: scores the AI's extractions against the generator's answer key (precision, recall, % quotes verified).

## Demo flow (curl)

```bash
curl localhost:8080/api/groups                                      # 7 scenarios, 35 synthetic docs
curl -X POST localhost:8080/api/blueprints/airlines/pilot            # extract + aggregate + synthesize
curl localhost:8080/api/blueprints/airlines/pilot                    # view (items have support/total + evidence)
curl -X PATCH localhost:8080/api/blueprints/airlines/pilot/items/STG-01 \
     -H 'Content-Type: application/json' -d '{"status":"APPROVED"}' # or EDITED + editedDetail, REJECTED
curl localhost:8080/api/blueprints/airlines/pilot/export.md          # approved/edited items only
```

Also: `POST /api/blueprints/{industry}/{workflowType}/gap-check` (`{"text": "...", "geography": "CA"}`),
`GET /api/eval/{industry}/{workflowType}`, `GET /api/docs/{docId}/text`, `POST /api/docs` (multipart upload: `file`, `docId`, `industry`, `geography`, `workflowType`; .md/.txt),
`POST /api/extractions/{docId}`. Add `?force=true` to bypass the extraction cache.

## Synthetic scenarios

`python3 tools/gen_synthetic_docs.py` regenerates 27 docs across technology, finance, retail, automotive, healthcare and
hospitality, plus `docs/ground_truth.json` (the answer key used by the Accuracy tab). Airlines AIR-* and HC-001/002 are
hand-written and have no answer key, so the Accuracy tab skips them. Add an industry by appending `co(...)` entries.
Generate any scenario with `POST /api/blueprints/{industry}/{workflowType}`.

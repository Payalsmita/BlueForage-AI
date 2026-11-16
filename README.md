# BlueForage-AI — BlueprintForge AI

BlueprintForge AI learns from the company's past hiring setups across every industry. It spots the patterns each sector repeats — the stages, roles, and approval rules — and turns them into ready-made templates consultants can quickly adjust for any new customer. Instead of starting every project from a blank page, teams start from proven blueprints — saving weeks of work, no matter the sector.
See [IDEA_BRIEF.md](IDEA_BRIEF.md), [PRD.md](PRD.md), [TRD.md](TRD.md).

## How to run

### 1. Prerequisites

| Need | Check | Install |
|---|---|---|
| Java 21 or newer | `java -version` | macOS: `brew install openjdk@21` · Windows/Linux: [Adoptium Temurin 21](https://adoptium.net) |
| An LLM API key | — | [OpenRouter](https://openrouter.ai/keys) (default), or any OpenAI-compatible endpoint |
| MarkItDown *(for PDF/DOCX/PPTX uploads)* | `markitdown --version` | `uv tool install 'markitdown[pdf,docx,pptx]'` or `pipx install 'markitdown[pdf,docx,pptx]'` |
| Node.js 20+ *(only to change the UI)* | `node --version` | [nodejs.org](https://nodejs.org). The built UI is already committed. |
| Python 3 *(optional)* | `python3 --version` | only needed to regenerate the synthetic docs |

Maven is **not** required: the repo includes the Maven wrapper (`backend/mvnw`), which downloads Maven on first run.

> **macOS + Homebrew:** Homebrew's Java isn't on your PATH by default. If `java -version` says
> *"Unable to locate a Java Runtime"*, run this once per terminal (or add it to `~/.zshrc`):
> ```bash
> export JAVA_HOME="$(brew --prefix openjdk@21)"
> export PATH="$JAVA_HOME/bin:$PATH"
> ```

### 2. Get the code and add your API key

```bash
git clone https://github.com/Payalsmita/BlueForage-AI.git
cd BlueForage-AI
cp .env.example .env
```

Open `.env` and paste your key after `LLM_API_KEY=`. The file is gitignored, so never commit it.

```dotenv
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=deepseek/deepseek-v4.1-flash-1017
```

You can use another OpenAI-compatible provider (OpenAI, Azure OpenAI, a local vLLM or LiteLLM, ...) by changing these three values.
The model **must support structured outputs** (`response_format: json_schema`).

### 3. Start the app

**macOS / Linux**

```bash
cd backend
set -a; . ../.env; set +a        # load .env into this terminal
./mvnw spring-boot:run
```

**Windows (PowerShell)**

```powershell
cd backend
Get-Content ..\.env | Where-Object { $_ -match '=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item "env:$k" $v }
.\mvnw.cmd spring-boot:run
```

Wait for `Started BlueprintforgeApplication`, then open **http://localhost:8080**.

### 4. First run

1. Pick a scenario in the dropdown, for example **airlines · pilot**, then click **Generate blueprint**.
   The first run calls the LLM for every source doc and takes **~1–2 minutes**. Results are cached in `data/`, so later loads are instant.
   Tick **re-extract** to force fresh LLM calls.
2. Go to **Gap check**, click **Load sample customer**, then click **Check against blueprint**.
3. Go to **Accuracy** and click **Run accuracy check**. Every scenario has an answer key.
4. Go to **Sources** to see the docs behind a scenario, or upload a new one (.md, .txt, .pdf, .docx, .pptx).
   PDF, DOCX and PPTX files are converted to Markdown with MarkItDown. Click **Generate blueprint** again afterwards.

### Working on the UI (React)

The UI source is in `frontend/` (React + Vite). The backend serves the built copy from `backend/src/main/resources/static`.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, live reload; /api is proxied to the backend on :8080
npm run build    # writes the production build into backend/src/main/resources/static (commit it)
```

### 5. Run the tests (no API key needed)

```bash
cd backend
./mvnw test
```

### Troubleshooting

| Symptom | Fix |
|---|---|
| `Unable to locate a Java Runtime` / `JAVA_HOME is not set` | Install Java 21+ and set `JAVA_HOME` (see the macOS note above) |
| UI shows **"Set LLM_API_KEY and LLM_MODEL"** | `.env` wasn't loaded: run the `set -a; . ../.env; set +a` line in the **same terminal** before `./mvnw spring-boot:run` |
| `401` / `Unauthorized` from the LLM | Wrong or expired key in `.env` |
| Error mentioning `response_format` or `json_schema` | The model doesn't support structured outputs. Pick one that does. |
| `Port 8080 already in use` | Stop the other process, or run `./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port=8081` |
| Upload says **"MarkItDown not found"** | Install it (see Prerequisites) or set `MARKITDOWN_CMD=/full/path/to/markitdown` before starting |
| A blueprint looks wrong after you edit docs | Tick **re-extract** and generate again, or delete the `data/` folder |

Measured on the default model: a 5-doc scenario takes ~45–100 s from cold, and seconds once cached.

## Demo flow (UI)

Open http://localhost:8080:
1. **Blueprint**: pick a scenario → *Generate blueprint* → confidence bars, per-country support (e.g. `DE 1/1`),
   "unique practice" flags, approvers on approval rules, **order differences** (stages that peers run in opposite orders),
   evidence quotes (click a doc ID to see the source with the quote highlighted) → approve / edit / reject →
   export as Markdown, JSON or a **mock iCIMS config**.
2. **Gap check**: *Load sample customer* (airlines → Canadian carrier, technology → US startup) or paste notes → see what the
   customer is **missing** vs peers (country-aware), what is **unique** to them, and what is **aligned**.
3. **Accuracy**: scores the AI's extractions against the answer key (precision, recall, % quotes verified). All 7 scenarios have one.
4. **Sources**: the docs behind each scenario; upload more (PDF/DOCX/PPTX converted with MarkItDown).

See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the 5-minute judge walkthrough.

## API docs (Swagger / OpenAPI)

With the app running:
- **Swagger UI:** http://localhost:8080/swagger-ui.html, where you can try every endpoint from the browser
- **OpenAPI spec:** http://localhost:8080/v3/api-docs (JSON) · http://localhost:8080/v3/api-docs.yaml (YAML)
- **[`api.yml`](api.yml)** is a committed copy of the spec, generated by springdoc from the controllers. Regenerate it after API changes:
  ```bash
  curl -s localhost:8080/v3/api-docs.yaml -o api.yml
  ```

## Demo flow (curl)

```bash
curl localhost:8080/api/groups                                      # 7 scenarios, 35 synthetic docs
curl -X POST localhost:8080/api/blueprints/airlines/pilot            # extract + aggregate + synthesize
curl localhost:8080/api/blueprints/airlines/pilot                    # view (items have support/total + evidence)
curl -X PATCH localhost:8080/api/blueprints/airlines/pilot/items/STG-01 \
     -H 'Content-Type: application/json' -d '{"status":"APPROVED"}' # or EDITED + editedDetail, REJECTED
curl localhost:8080/api/blueprints/airlines/pilot/export.md          # approved/edited items only
```

Also: `GET /api/blueprints/{industry}/{workflowType}/export.icims.json` (mock iCIMS config),
`POST /api/blueprints/{industry}/{workflowType}/gap-check` (`{"text": "...", "geography": "CA"}`),
`GET /api/eval/{industry}/{workflowType}`, `GET /api/docs/{docId}/text`, `POST /api/docs` (multipart upload: `file`, `docId`, `industry`, `geography`, `workflowType`; .md/.txt/.pdf/.docx/.pptx),
`POST /api/extractions/{docId}`. Add `?force=true` to bypass the extraction cache.

## Synthetic scenarios

`python3 tools/gen_synthetic_docs.py` regenerates 27 docs across technology, finance, retail, automotive, healthcare and
hospitality, plus `docs/ground_truth.json` (the answer key used by the Accuracy tab). Airlines AIR-* and HC-001/002 are
hand-written; their answer keys are in `MANUAL_GOLD` in the same script. Add an industry by appending `co(...)` entries.
Generate any scenario with `POST /api/blueprints/{industry}/{workflowType}`.

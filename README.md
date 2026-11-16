# BlueForage-AI — BlueprintForge AI

BlueprintForge AI learns from past hiring setups and turns the patterns each industry repeats (stages, roles, approval rules) into ready-made, evidence-backed templates for new customers.

## Prerequisites

- **Java 21+** (`java -version`). Maven is not needed because the project includes the Maven wrapper.
- **An API key** for an OpenAI-compatible endpoint
- *(Optional, for PDF/DOCX/PPTX uploads)* MarkItDown: `pipx install 'markitdown[pdf,docx,pptx]'`

> **macOS + Homebrew Java:** if `java -version` says *"Unable to locate a Java Runtime"*, run:
> ```bash
> export JAVA_HOME="$(brew --prefix openjdk@21)"
> export PATH="$JAVA_HOME/bin:$PATH"
> ```

## Setup

```bash
git clone https://github.com/Payalsmita/BlueForage-AI.git
cd BlueForage-AI
cp .env.example .env
```

Edit `.env` and fill in `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. The file is gitignored.

## Launch

**macOS / Linux**

```bash
cd backend
set -a; . ../.env; set +a
./mvnw spring-boot:run
```

**Windows (PowerShell)**

```powershell
cd backend
Get-Content ..\.env | Where-Object { $_ -match '=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item "env:$k" $v }
.\mvnw.cmd spring-boot:run
```

Wait for `Started BlueprintforgeApplication`, then open:

| What | URL |
|---|---|
| App (UI) | http://localhost:8080 |
| Swagger UI | http://localhost:8080/swagger-ui.html |
| OpenAPI spec (JSON) | http://localhost:8080/v3/api-docs |
| OpenAPI spec (YAML) | http://localhost:8080/v3/api-docs.yaml (committed copy: [`api.yml`](api.yml)) |

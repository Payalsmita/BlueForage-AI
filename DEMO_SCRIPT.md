# BlueprintForge AI: 5-Minute Demo Script

**Setup (before judges arrive)**
- App running at http://localhost:8080 with a **valid** API key in `.env`.
- All 7 scenarios generated once, so they load instantly from the cache. Click **Generate blueprint** on each one the day before.
- In the airlines blueprint, leave everything *pending*: you'll approve items live.
- Browser zoom at 110–125% so the back row can read it.

**Judging message:** *"We don't just summarize past projects. We turn them into an evidence-backed starting configuration, show where it came from, and check new customers against it."*

---

## 0:00–0:40 · The problem

> "Every new iCIMS customer gets its hiring workflow configured from scratch, even though we've done the same industry dozens of times. That knowledge sits in old project docs and in senior consultants' heads. It costs weeks per implementation and the setups drift from customer to customer."

> "BlueprintForge reads past implementations and builds a **reusable industry blueprint**, where every recommendation is backed by evidence."

## 0:40–2:00 · Blueprint (airlines · pilot)

1. Select **airlines · pilot (6)** and point at the summary: *"21 items from 6 past airline implementations."*
2. **STG-01 Resume Screening: 6/6**, with the badges `CA 1/1 · UK 1/1 · US 4/4`.
   > "Confidence isn't the AI's opinion. Code counts how many real implementations did this, broken down by country."
3. **Also called: Application Review**:
   > "Different customers call the same step different things. The AI groups them under one name."
4. Open **Evidence**, then click a doc ID. The source document opens with the quote highlighted.
   > "Every item links back to the exact sentence it came from. If the AI can't quote it word for word, we drop it."
5. Point at **APR-02 Offer above standard pay band**, which shows its approvers.
6. Click **Approve** on 3–4 items, and **Edit** one description.
   > "A consultant stays in control. Nothing is applied automatically."
7. Click **iCIMS config (mock)**:
   > "Approved items export into an iCIMS-style configuration: workflow statuses, roles, approval chains and country scope, with traceability back to the source. It's a mock schema today. With the real config format it becomes a direct import."

## 2:00–3:20 · Gap check (the "wow" moment)

1. Open the **Gap check** tab and click **Load sample customer**. That loads Polar Wings, a fictional Canadian airline. Its country is set to **CA**.
2. Click **Check against blueprint** (about 20–30 s with a live model).
3. Walk through the results, which come out the same on repeat runs:
   - **Missing:** Knowledge Test, Simulator Evaluation, **Background Check (6/6 peers)** and **Requisition approval (6/6)**.
     > "Every peer airline runs a background check. This customer didn't mention one. That's a question for the kickoff call, not a defect we discover after go-live."
   - **Unique:** Social media review.
     > "Nobody else does this, so we confirm it's intentional and compliant."
   - **Not flagged:** the US drug test.
     > "It's country-aware. The drug test is a US practice, so a Canadian customer isn't told to add it."

## 3:20–4:10 · Proof it's trustworthy (Accuracy)

1. Open the **Accuracy** tab and click **Run accuracy check**.
2. Read the tiles aloud. These are real results on DeepSeek V4.1 Flash:
   > "Against a hand-checked answer key: **100% of hiring stages found** in every one of the 7 industries, approval rules 100% recall, and **100% of quotes verified word for word** in the source."
3. Open **missed / extra** to show it's honest:
   > "Where it disagrees, we can see exactly where and why. For example, it didn't count a District Manager who only approves things as a hiring role. That was by design."

## 4:10–4:40 · It works for any industry

1. Switch the dropdown to **retail · store-associate** and point at **Order differences**:
   > "It also spots where peers run the same steps in a different order. Here one retailer runs the background check *after* the offer."
2. Open **Sources** and show the upload box:
   > "Real project docs come in as PDF, Word or PowerPoint. Microsoft MarkItDown converts them, and they feed the same pipeline."
3. Mention the coverage: 7 industries and 35 implementations: airlines, tech, finance, healthcare, retail, automotive and hospitality.

## 4:40–5:00 · Close

> "Weeks of starting from a blank page become minutes starting from proven, evidence-backed patterns, with a consultant approving every line. Next steps are anonymized real implementation data and the real iCIMS config format."

---

## Backup plan

| If… | Do this |
|---|---|
| The API key or network fails | Everything already generated still works: blueprints, evidence, review, export and accuracy all run from the cache. Skip the live gap check and describe the results from this script. |
| The gap check is slow | Talk through the Missing / Unique columns while it runs. It takes about 20–30 s. |
| The app isn't running | `cd backend && set -a; . ../.env; set +a; ./mvnw spring-boot:run` (see README) |

## Likely judge questions

- **"Isn't the AI just making things up?"** Every item must quote its source word for word, and code checks that, dropping anything it can't find. Counting and confidence are done by code, not the AI. The Accuracy tab measures it.
- **"What about real customer data?"** The demo uses fictional data only. Production needs anonymization, data approval and per-customer separation. That's in the PRD as future work.
- **"Which model?"** Any OpenAI-compatible endpoint. Today it's DeepSeek V4.1 Flash via OpenRouter, and switching is three settings in `.env`.
- **"How does it scale to big documents?"** MarkItDown already produces Markdown, which is ready for chunking and embeddings when documents outgrow a single model call.

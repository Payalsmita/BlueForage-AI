"""BlueprintForge MCP server: thin stdio wrapper over the BlueprintForge REST API (no business logic here)."""
import os
from typing import Any, Literal
from urllib.parse import quote

import httpx
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import BaseModel

BASE = os.environ.get("BLUEPRINTFORGE_URL", "http://localhost:8080").rstrip("/")
# LLM-backed calls (generate, gap check, answers) can take a couple of minutes.
TIMEOUT = httpx.Timeout(180.0, connect=10.0)

mcp = MCPServer(
    "BlueprintForge",
    instructions=(
        "BlueprintForge turns past recruiting implementations into evidence-backed industry blueprints and runs "
        "implementation analyses for new customers. Every configuration decision needs a consultant's approval: "
        "present findings and questions to the user; never answer questions or approve on their behalf."
    ),
)


def seg(s: str) -> str:
    return quote(s, safe="")


async def call(method: str, path: str, json: Any = None, text: bool = False) -> Any:
    try:
        async with httpx.AsyncClient(base_url=BASE, timeout=TIMEOUT) as c:
            r = await c.request(method, path, json=json)
    except httpx.HTTPError as e:
        raise ToolError(f"Cannot reach BlueprintForge at {BASE}: {e}") from e
    if r.is_error:
        try:
            msg = r.json().get("message")
        except ValueError:
            msg = None
        raise ToolError(msg or f"HTTP {r.status_code} from {path}")
    return r.text if text else r.json()


class Answer(BaseModel):
    questionId: str
    choice: Literal["INCLUDE", "EXCLUDE", "UNSURE"] | None = None
    text: str | None = None


@mcp.tool()
async def list_scenarios() -> list[dict]:
    """List the scenarios (industry + workflow type) that have past implementations, with document counts."""
    return await call("GET", "/api/groups")


@mcp.tool()
async def get_blueprint(industry: str, workflow_type: str, approved_only: bool = False) -> dict:
    """Get the industry blueprint for a scenario: hiring stages, roles and approval rules mined from past
    implementations. Each item has support/total (how many implementations contain it), per-country support,
    approvers, review status and one evidence quote. orderConflicts lists stages peers run in opposite orders.
    approved_only=True returns only items a consultant approved or edited."""
    p = f"/api/blueprints/{seg(industry)}/{seg(workflow_type)}" + ("/export.json" if approved_only else "")
    bp = await call("GET", p)
    return {
        "industry": bp.get("industry"),
        "workflowType": bp.get("workflowType"),
        "sourceDocIds": bp.get("sourceDocIds"),
        "items": [
            {
                "id": i.get("id"),
                "kind": i.get("kind"),
                "name": i.get("name"),
                "support": f"{i.get('support')}/{i.get('total')}",
                "geoSupport": {g["geography"]: f"{g['support']}/{g['total']}" for g in i.get("geoSupport") or []},
                "approvers": i.get("approvers") or [],
                "status": i.get("status"),
                "evidence": (i.get("evidence") or [None])[0],
            }
            for i in bp.get("items", [])
        ],
        "orderConflicts": bp.get("orderConflicts") or [],
    }


@mcp.tool()
async def check_customer_gaps(industry: str, workflow_type: str, notes: str, country: str = "") -> dict:
    """Compare a new customer's requirements or meeting notes with the industry blueprint. Returns MISSING
    (common among peers, country-aware, absent for this customer), UNIQUE (no peer does it; confirm it is
    intentional) and ALIGNED findings. Findings are prompts for the consultant, not decisions. Takes ~30 s."""
    return await call("POST", f"/api/blueprints/{seg(industry)}/{seg(workflow_type)}/gap-check",
                      {"text": notes, "geography": country})


@mcp.tool()
async def start_implementation(industry: str, workflow_type: str, customer_name: str, notes: str,
                               country: str = "") -> dict:
    """Start an implementation run for a new customer: the agent extracts requirements, checks them against the
    blueprint, drafts clarifying questions, then pauses for the consultant. Returns immediately with the run id;
    poll get_implementation for progress."""
    return await call("POST", "/api/runs", {"industry": industry, "workflowType": workflow_type,
                                            "customerName": customer_name, "geography": country, "notes": notes})


@mcp.tool()
async def get_implementation(run_id: str) -> dict:
    """Get an implementation run's status: agent steps (with its reasoning), open clarifying questions,
    configuration validation counts, UAT coverage and open items."""
    run = await call("GET", f"/api/runs/{seg(run_id)}")
    keep = ("id", "status", "customerName", "industry", "workflowType", "geography", "questions", "openItems")
    out = {k: run[k] for k in keep if k in run}
    out["steps"] = [{k: s.get(k) for k in ("tool", "title", "reasoning", "summary", "status")}
                    for s in run.get("steps") or []]
    v = run.get("validation") or []
    out["validation"] = [{k: c.get(k) for k in ("severity", "check", "message")} for c in v if c.get("severity") != "PASS"]
    out["validationCounts"] = {s: sum(1 for c in v if c.get("severity") == s) for s in ("PASS", "WARN", "FAIL")}
    out["revisions"] = run.get("revisions", 0)
    out["uatCases"] = len(run.get("uat") or [])
    out["uatCoverage"] = run.get("uatCoverage")
    if run.get("error"):
        out["error"] = run["error"]
    return out


@mcp.tool()
async def answer_questions(run_id: str, answers: list[Answer]) -> dict:
    """Submit the consultant's answers to a run's clarifying questions (choice INCLUDE / EXCLUDE / UNSURE, plus
    optional free text). Only send answers the user actually gave; the agent then resumes."""
    return await call("POST", f"/api/runs/{seg(run_id)}/answers",
                      {"answers": [a.model_dump() for a in answers]})


@mcp.tool()
async def approve_implementation(run_id: str, approved: bool, comment: str = "") -> dict:
    """Record the consultant's approve/reject decision on a run's drafted configuration. Only call this with the
    user's explicit decision; never approve on their behalf."""
    return await call("POST", f"/api/runs/{seg(run_id)}/approval", {"approved": approved, "comment": comment})


@mcp.tool()
async def get_handover(run_id: str) -> str:
    """Get the run's handover pack as Markdown: requirements, decisions, configuration, validation and UAT."""
    return await call("GET", f"/api/runs/{seg(run_id)}/handover.md", text=True)


if __name__ == "__main__":
    mcp.run()

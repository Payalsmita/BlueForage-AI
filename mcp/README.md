# BlueprintForge MCP server

A stdio MCP server that exposes the BlueprintForge REST API as tools, so you can use BlueprintForge from Claude Desktop, Claude Code or any other MCP client. The BlueprintForge backend must be running.

Requires [uv](https://docs.astral.sh/uv/). Dependencies install on first run.

```bash
uv --directory /path/to/BlueForage-AI/mcp run server.py     # quick check that it starts (waits on stdin; Ctrl+C to quit)
```

`BLUEPRINTFORGE_URL` sets the backend address. The default is `http://localhost:8080`.

## Claude Desktop

Add the server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "blueprintforge": {
      "command": "uv",
      "args": ["--directory", "/path/to/BlueForage-AI/mcp", "run", "server.py"],
      "env": { "BLUEPRINTFORGE_URL": "http://localhost:8080" }
    }
  }
}
```

## Claude Code

```bash
claude mcp add blueprintforge -e BLUEPRINTFORGE_URL=http://localhost:8080 -- uv --directory /path/to/BlueForage-AI/mcp run server.py
```

## Tools

| Tool | Calls |
|---|---|
| `list_scenarios` | `GET /api/groups` |
| `get_blueprint` | `GET /api/blueprints/{industry}/{workflowType}` (or `/export.json` when `approved_only`), returned in a compact form |
| `check_customer_gaps` | `POST /api/blueprints/{industry}/{workflowType}/gap-check` |
| `start_implementation` | `POST /api/runs` |
| `get_implementation` | `GET /api/runs/{id}`, returned in a compact form |
| `answer_questions` | `POST /api/runs/{id}/answers` |
| `approve_implementation` | `POST /api/runs/{id}/approval` |
| `get_handover` | `GET /api/runs/{id}/handover.md` |

The server has no business logic of its own. Backend errors (`{"message": ...}`) come back as tool errors. A consultant must approve every configuration decision, and the tool descriptions tell the model not to answer questions or approve runs on the user's behalf.

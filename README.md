# CMS MCP Hub

A universal connector hub that proxies Claude.ai tool calls to any CMS that runs an MCP server (Drupal, Joomla, WordPress, etc.).

## How it works

```
Claude.ai  ──MCP──▶  cms-mcp-hub  ──SSE──▶  Drupal MCP server
                                  ──SSE──▶  Joomla MCP server
                                  ──SSE──▶  WordPress MCP server
```

Each "connector" has a name and a URL pointing to that CMS's hosted MCP server.
The hub fetches all tools from each server, registers them prefixed by connector name,
and proxies Claude's calls to the right backend.

**Tool naming:** `<connector-name>__<original-tool-name>`
Example: `drupal-site-a__get_node`

---

## Requirements

- Node.js 18+
- A Drupal site with the `mcp_server` module installed (or any CMS MCP server)

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the hub
npm start

# 3. (Optional) Custom port
PORT=4000 npm start
```

Hub starts on **http://localhost:3456** by default.

---

## Endpoints

| URL | Purpose |
|-----|---------|
| `POST /mcp` | Streamable HTTP — connect Claude.ai here |
| `GET /mcp/sse` | SSE fallback (legacy clients) |
| `GET /ui` | Web UI dashboard |
| `GET /health` | JSON status |
| `GET /api/connectors` | List connectors (API) |
| `POST /api/connectors` | Add connector (API) |
| `DELETE /api/connectors/:name` | Remove connector (API) |
| `POST /api/connectors/:name/refresh` | Re-fetch tools (API) |

---

## Adding connectors

### Web UI
Open http://localhost:3456/ui in your browser.

### CLI
```bash
# Link the CLI globally (once)
npm link

# Add a connector
cms-hub add --name drupal-site-a \
            --url https://yoursite.com/mcp/sse \
            --token YOUR_API_TOKEN \
            --description "Production Drupal site"

# List all connectors
cms-hub list

# Check hub status
cms-hub status

# Refresh tools (after adding modules to the CMS)
cms-hub refresh --name drupal-site-a

# Remove a connector
cms-hub remove --name drupal-site-a
```

### Config file (`connectors.json`)
Edit directly then restart the hub:
```json
{
  "connectors": [
    {
      "name": "drupal-site-a",
      "url": "https://yoursite.com/mcp/sse",
      "token": "YOUR_API_TOKEN",
      "description": "Production Drupal site"
    }
  ]
}
```

---

## Connect Claude.ai

1. In Claude.ai → Settings → Integrations → Add MCP Server
2. Enter: `http://localhost:3456/mcp` (or your hosted hub URL)
3. Claude will discover all tools from all connected CMS connectors

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3456` | Hub HTTP port |
| `HUB_URL` | `http://localhost:3456` | Used by CLI to reach the hub |

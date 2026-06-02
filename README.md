# Planka MCP Server

MCP server for [Planka](https://github.com/plankanban/planka) kanban boards. Originally based on `bradrisse/kanban-mcp`, forked and maintained by `bkuri-org` with Planka v2.x API fixes and additional tools.

## Changes from upstream

- **Fixed API endpoints** for Planka v2.x (comments, labels, tasks, cards)
- **Fixed card creation** (`type: "project"` required)
- **Fixed task creation** — tasks require parent task-list, auto-creates "Tasks" list
- **Rewrote comment operations** — uses `/api/cards/{id}/comments` instead of deprecated `/comment-actions`
- **Fixed label operations** — correct endpoints for add/remove card-labels

## Setup

```bash
npm install
npm run build
```

## Running via stdio

```bash
PLANKA_BASE_URL=http://localhost:3005 \
PLANKA_AGENT_EMAIL=planka@example.com \
PLANKA_AGENT_PASSWORD=secret \
node dist/index.js
```

## Running via mcproxy adapter (HTTP bridge)

```bash
python adapter.py --port 12036 -- node /opt/planka-mcp/dist/index.js
```

## Tools

| Tool | Description |
|------|-------------|
| `mcp_kanban_project_board_manager` | Projects, boards, board summaries |
| `mcp_kanban_card_manager` | CRUD cards, move between lists, set due dates |
| `mcp_kanban_list_manager` | CRUD lists on boards |
| `mcp_kanban_label_manager` | CRUD labels, add/remove from cards |
| `mcp_kanban_comment_manager` | CRUD comments on cards |
| `mcp_kanban_task_manager` | CRUD tasks/checklists on cards |
| `mcp_kanban_stopwatch` | Time tracking per card |
| `mcp_kanban_membership_manager` | Board membership management |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PLANKA_BASE_URL` | Yes | Planka instance URL (e.g. `http://localhost:3005`) |
| `PLANKA_AGENT_EMAIL` | Yes | Email for API authentication |
| `PLANKA_AGENT_PASSWORD` | Yes | Password for API authentication |

## License

MIT

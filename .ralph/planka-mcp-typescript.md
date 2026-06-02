# Planka MCP — TypeScript Reverse-Engineering & Deployment

## Goals
- Reverse-engineer deployed JS patches into proper TypeScript `src/` in the forked repo (`bkuri-org/planka-mcp`)
- Build, deploy, and replace the live MCP server on server2
- Create a dedicated Matrix chat room for planka-mcp
- Add the room to AGENTS.md mappings so agents can find it

## Checklist
- [x] Read all deployed JS files from server2 (`/opt/planka-mcp/dist/`)
- [x] Create TypeScript `src/` structure matching the deployed code with all patches applied
- [x] Fix tsconfig, add any missing type declarations
- [x] Build (`npm run build`) and verify output matches deployed behavior
- [x] Deploy compiled `dist/` to server2 at `/opt/planka-mcp/`
- [x] Restart `planka-mcp-adapter.service` on server2
- [x] Test MCP tools via the HTTP bridge (card_manager, comment_manager, label_manager, task_manager)
- [x] Create dedicated Matrix room (`!SqkTAeBjgSSpebCfjQ:bkuri.lan` — #planka-mcp)
- [x] Add Matrix room to AGENTS.md mappings
- [x] Git push all changes to `bkuri-org/planka-mcp`
- [x] Clean up: remove old committed dist/ that was committed as JS-only

## Verification
- `npm run build` — 36 files, zero errors
- comment_manager: OK (create via MCP bridge)
- label_manager: OK (14 labels)
- task_manager: OK (create with auto task-list)
- `planka-mcp-adapter.service` — active
- Matrix room `!SqkTAeBjgSSpebCfjQ:bkuri.lan` created
- AGENTS.md updated with Matrix rooms section

## Notes
- Repo: https://github.com/bkuri-org/planka-mcp
- 18 TypeScript source files with full type annotations
- All Planka v2.x API fixes preserved in TypeScript source
- Deployed to server2, service restarted, all tools verified

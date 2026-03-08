# /jarvis-agents

List and optionally spawn recommended Jarvis subagents for the current project.

## Steps

1. Call `GET /api/jarvis/agents` to list all available agent definitions and their on-disk status.

2. If a `sessionId` is known, call `POST /api/jarvis/agents/recommend` with `{ sessionId }` to get context-specific recommendations.

3. Display each agent:
   - Name and description
   - Whether the `.claude/agents/*.md` file exists on disk
   - Trigger conditions (e.g., isAuthSensitive, isReact)

4. For each recommended agent, offer to invoke it:
   - Use the Claude Code agent spawning syntax or suggest the user run it manually
   - Note which workflow recipe triggered the recommendation

5. If any agent files are missing, call `POST /api/jarvis/agents/ensure` to re-write them.

## Available Agents

| Agent | Purpose | Triggers |
|-------|---------|---------|
| security-deep | Full auth/secret/CORS audit | auth-sensitive projects |
| dependency-graph | Package tree analysis | any Node.js project |
| performance-audit | Bundle size, render patterns | React / Next.js |
| git-quality | Commit hygiene, velocity, bus factor | any git project |
| code-smell | God files, unused deps, test gaps | projects with src/ |

## Notes
- Agent files live at `.claude/agents/*.md` and are auto-written by Jarvis on startup
- Re-running `POST /agents/ensure` is idempotent — safe to call any time

# /jarvis-health

Show a health summary of all projects currently loaded in Jarvis.

## Steps

1. Call `GET /api/jarvis/briefing` (or use the `get_briefing` MCP tool if available).

2. For each session in `briefing.sessions`, display:
   - Project name
   - `healthScore` (0-100) with a color label: ≥80 = Healthy, 60-79 = Fair, <60 = Needs attention
   - `git.velocityTrend` if not null: ↑ up / → stable / ↓ down
   - Count of insights by severity (errors, warnings, info)
   - `workflow` recipe selected
   - `recommendedAgents` if any

3. Show global health direction from `briefing.trends` if present.

4. If `briefing.signalQuality` is not null, show it as: `Signal quality: N% (act-on rate)`

## Example Output

```
PROJECT HEALTH SUMMARY
──────────────────────
my-app       Score: 72/100 (Fair)     ↑ velocity  2 warnings, 1 info   workflow: team-full
api-service  Score: 45/100 (Attention) → stable    1 error, 3 warnings  workflow: security-deep
             Recommended agents: security-deep

Signal quality: 62%  |  1 trend: errors decreased by 1
```

## Notes
- healthScore is computed fresh each briefing cycle — it reflects the current filtered insight set
- A score below 60 with no action taken is a prompt to run `/jarvis-agents` to spawn specialist analysis

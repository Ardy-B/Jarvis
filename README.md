# Jarvis

Proactive project assistant module. Analyzes your projects' git status, code health, security posture, and activity to produce actionable briefings.

## Features
- **Git Analysis** — uncommitted changes, unpushed commits, working-on-main warnings, .env tracking detection
- **Code Health** — TODO/FIXME counts, missing node_modules
- **Security** — .env gitignore checks, secret pattern scanning
- **Session Recap** — last activity, stale detection
- **Content-Awareness** — reads CLAUDE.md, README.md, package.json to understand each project's tech stack

## Quick Start

### Backend
```js
const { Jarvis } = require("./jarvis");
const jarvis = new Jarvis({ contentAware: true });
jarvis.attachRoutes(app, { prefix: "/api/jarvis", authMiddleware: yourAuth });
jarvis.setProjects([{ id, name, folder, isGit, status, output }]);
```

### Frontend
```html
<script type="text/babel" src="/jarvis-ui.jsx"></script>
<script type="text/babel">
  const jarvis = JarvisUI.useJarvis({ apiBase: "", getAuthToken: () => token, sessions });
</script>
```

## API
| Route | Method | Purpose |
|---|---|---|
| `{prefix}/briefing` | GET | Cached briefing (`?force=1` to regenerate) |
| `{prefix}/dismiss` | POST | Dismiss insight by ID (24h auto-expire) |

## License
MIT

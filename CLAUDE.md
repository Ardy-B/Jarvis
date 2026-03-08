# Jarvis — Standalone Project Assistant Module

## Overview
Jarvis is a proactive project assistant that analyzes git status, code health, security, and session activity to produce briefings. It's designed to be injected into any Express-based app.

## Architecture
Two files, no build step:
- `jarvis.js` — Backend: Jarvis class with analysis functions, Express route registration
- `jarvis-ui.jsx` — Frontend: React components (JSX), loaded via `<script type="text/babel">`

## Integration Pattern
```js
const { Jarvis } = require("../Jarvis/jarvis");
const jarvis = new Jarvis({ contentAware: true });
jarvis.attachRoutes(app, { prefix: "/api/jarvis", authMiddleware: requireAuth });
jarvis.setProjects([...]); // host provides project data
```

## Key Design Decisions
- Host app owns auth (middleware injection) and WebSocket (calls getCachedBriefing)
- Projects provided via setProjects() — no direct access to host's session store
- Frontend uses host's CSS variables (--glass, --txt, --red, etc.)
- No bundled styles — host must define CSS custom properties

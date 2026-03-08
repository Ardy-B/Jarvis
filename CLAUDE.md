# Jarvis — Standalone Project Assistant Module

## Overview
Jarvis is a proactive project assistant that analyzes git status, code health, security,
and session activity to produce briefings. Designed to be injected into any Express-based app.

## Stack
Node.js (no build step) · CommonJS · React (loaded via Babel CDN) · Express (peer dep)

## Commands
- test: `node -e "const {Jarvis}=require('./jarvis');const j=new Jarvis();console.log('OK')"`
- integrate: host app requires jarvis.js and calls jarvis.attachRoutes(app, opts)

## Architecture
jarvis.js      → Jarvis class: analysis functions + Express route registration
jarvis-ui.jsx  → React components (IIFE), exported on window.JarvisUI
jarvis-mcp.mjs → Optional MCP server: exposes getBriefing() as a Claude Code native tool

## Integration Pattern
```js
const { Jarvis } = require("../Jarvis/jarvis");
const jarvis = new Jarvis({ contentAware: true });
jarvis.attachRoutes(app, { prefix: "/api/jarvis", authMiddleware: requireAuth });
jarvis.setProjects([...]); // host provides project data
```

## Code Style
- CommonJS only (require/module.exports) — no ESM
- No npm dependencies beyond Node built-ins (fs, path, child_process)
- All shell ops via execFile — never execSync
- Catch all analysis errors silently — briefing must never throw

## Rules (Hard Constraints)
- NEVER add npm dependencies — host app provides Express, React
- NEVER use a bundler or build step — two plain files, that's the contract
- DO NOT handle auth — host injects authMiddleware via attachRoutes opts
- DO NOT store session data — host provides project data via setProjects()

## Gotchas
- Frontend uses host CSS variables (--glass, --txt, --red, etc.) — undefined vars = broken UI
- jarvis-ui.jsx loads via synchronous XHR + Babel.transform, not a module bundler
- execFile timeout is 5000ms — git ops on large repos may time out silently
- Host WebSocket must call getCachedBriefing() and push result on connect
- .claude/rules/*.md files in each project are surfaced as "domain rules active" insights

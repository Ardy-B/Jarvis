/**
 * JARVIS MCP Server — optional extension
 * Exposes Jarvis briefing data as native Claude Code tools via Model Context Protocol.
 *
 * Setup:
 *   npm install @modelcontextprotocol/sdk zod
 *   claude mcp add jarvis -- node /path/to/Jarvis/jarvis-mcp.mjs
 *
 * Optional config — create jarvis-projects.json next to this file:
 *   [{ "id": "myapp", "name": "My App", "folder": "/path/to/myapp", "isGit": true }]
 * Without it, defaults to treating cwd as a single project.
 *
 * Note: This file is an optional extension. The core two-file contract
 * (jarvis.js + jarvis-ui.jsx, zero npm deps) is not changed.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Bridge: import the CommonJS Jarvis class into ESM context
const require = createRequire(import.meta.url);
const { Jarvis } = require("./jarvis.js");

// ── Project config ────────────────────────────────────────────────────────────

function loadProjects() {
  const configPath = resolve("jarvis-projects.json");
  if (existsSync(configPath)) {
    try { return JSON.parse(readFileSync(configPath, "utf8")); } catch {}
  }
  // Fallback: treat cwd as a single project
  const name = process.cwd().split("/").pop();
  return [{ id: "cwd", name, folder: process.cwd(), isGit: true }];
}

const jarvis = new Jarvis({ contentAware: true });
jarvis.setProjects(loadProjects());

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "jarvis", version: "1.0.0" });

server.tool(
  "get_briefing",
  "Get a full Jarvis briefing: git status, security issues, code health, and in-progress work across all configured projects. Use this to understand the current state of any project before making changes.",
  { force: z.boolean().optional().describe("Force a fresh scan, bypassing the 5-minute cache") },
  async ({ force = false }) => {
    const briefing = await jarvis.getBriefing(force);
    return { content: [{ type: "text", text: JSON.stringify(briefing, null, 2) }] };
  }
);

server.tool(
  "get_project_status",
  "Get detailed Jarvis status for a single project by its ID, including all insights, git state, and tech stack.",
  { project_id: z.string().describe("The project ID as configured in jarvis-projects.json, or 'cwd' if using the default") },
  async ({ project_id }) => {
    const briefing = await jarvis.getBriefing();
    const session = briefing?.sessions?.find(s => s.id === project_id);
    if (!session) return { content: [{ type: "text", text: `Project "${project_id}" not found. Available: ${briefing?.sessions?.map(s => s.id).join(", ") || "none"}` }] };
    return { content: [{ type: "text", text: JSON.stringify(session, null, 2) }] };
  }
);

server.tool(
  "dismiss_insight",
  "Dismiss a Jarvis insight by ID so it stops appearing in the briefing for 24 hours. Repeatedly dismissed insights are auto-learned as false positives.",
  { insight_id: z.string().describe("The insight ID to dismiss, e.g. 'git-uncommitted-myapp'") },
  async ({ insight_id }) => {
    jarvis.dismiss(insight_id);
    return { content: [{ type: "text", text: `Insight "${insight_id}" dismissed for 24 hours.` }] };
  }
);

server.tool(
  "get_learnings",
  "View Jarvis's learned rules and memory stats. Shows auto-suppressed false positives, unreliable action patterns, and memory size.",
  {},
  async () => {
    const rules = jarvis.getLearnings();
    const mem = jarvis.getMemory();
    const stats = {
      rules: rules.length,
      snapshots: mem.getSnapshots().length,
      dismissals: mem.getDismissals().length,
      actions: mem.getActions().length,
    };
    return { content: [{ type: "text", text: JSON.stringify({ rules, stats }, null, 2) }] };
  }
);

server.tool(
  "forget_rule",
  "Remove a learned rule by ID. Use this if Jarvis has incorrectly suppressed an insight or learned a wrong pattern.",
  { rule_id: z.string().describe("The rule ID to remove, e.g. 'auto-suppress-git-uncommitted'") },
  async ({ rule_id }) => {
    jarvis.forgetRule(rule_id);
    return { content: [{ type: "text", text: `Rule "${rule_id}" removed. Jarvis will stop suppressing this pattern.` }] };
  }
);

server.tool(
  "get_trends",
  "Get trend analysis showing how project health has changed over time — new issues, resolved issues, and error trajectory.",
  {},
  async () => {
    const briefing = await jarvis.getBriefing();
    return { content: [{ type: "text", text: JSON.stringify(briefing.trends || [], null, 2) }] };
  }
);

server.tool(
  "run_self_improvement",
  "Trigger Jarvis's self-improvement cycle immediately. Analyzes usage telemetry to auto-suppress noisy insights, update CLAUDE.md learned rules, optimize hooks, generate project rule files, and calibrate workflow recipes. Returns a list of all changes made.",
  { force: z.boolean().optional().describe("Force a fresh briefing scan before improving (default: use cached)") },
  async ({ force = false }) => {
    // Ensure we have a fresh briefing to improve against
    const briefing = await jarvis.getBriefing(force);
    // Reset throttle so improvement runs immediately
    const improver = jarvis.getImprover();
    improver._lastRun = 0;
    const changes = await improver.runCycle(
      briefing,
      jarvis._hookMgr,
      jarvis._agentMgr
    );
    const summary = changes.length > 0
      ? `${changes.length} improvement${changes.length !== 1 ? "s" : ""} applied`
      : "No improvements needed — Jarvis is already well-calibrated";
    return { content: [{ type: "text", text: JSON.stringify({ summary, changes }, null, 2) }] };
  }
);

server.tool(
  "get_improvement_log",
  "View Jarvis's self-improvement history — every autonomous change made to hooks, rules, CLAUDE.md, and project rule files, with timestamps and reasons.",
  { limit: z.number().optional().describe("Max number of log entries to return (default: 50)") },
  async ({ limit = 50 }) => {
    const log = jarvis.getImprover().getLog();
    const entries = log.slice(-limit);
    return { content: [{ type: "text", text: JSON.stringify({ total: log.length, entries }, null, 2) }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

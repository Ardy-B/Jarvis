/**
 * JARVIS — Proactive Project Assistant
 * Standalone module: content-aware briefings, git analysis, security scanning
 * All shell operations are async (non-blocking) via child_process.execFile
 */

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Helpers ──────────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/** Run a command asynchronously — returns stdout string, rejects on error */
function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "utf8", timeout: 5000, ...opts }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Analysis Functions ───────────────────────────────────────────────────────

async function analyzeGitStatus(project) {
  const insights = [];
  if (!project.folder || !project.isGit) return insights;
  const cwd = project.folder;

  // Run all git commands in parallel (non-blocking)
  const [statusResult, unpushedResult, branchResult, trackedResult] = await Promise.allSettled([
    run("git", ["status", "--porcelain"], { cwd }),
    run("git", ["log", "@{u}..HEAD", "--oneline"], { cwd }),
    run("git", ["branch", "--show-current"], { cwd }),
    run("git", ["ls-files", ".env", ".env.local", ".env.production"], { cwd }),
  ]);

  // Uncommitted changes
  if (statusResult.status === "fulfilled" && statusResult.value) {
    const lines = statusResult.value.split("\n").filter(Boolean);
    if (lines.length > 0) {
      insights.push({ id: `git-uncommitted-${project.id}`, type: "git", severity: lines.length > 5 ? "warning" : "info",
        title: `${lines.length} uncommitted change${lines.length > 1 ? "s" : ""}`,
        detail: lines.slice(0, 3).map(l => l.trim()).join(", ") + (lines.length > 3 ? ` +${lines.length - 3} more` : ""),
        action: "commit" });
    }
  }

  // Unpushed commits
  if (unpushedResult.status === "fulfilled" && unpushedResult.value) {
    const commits = unpushedResult.value.split("\n").filter(Boolean);
    if (commits.length > 0) {
      insights.push({ id: `git-unpushed-${project.id}`, type: "git", severity: "info",
        title: `${commits.length} unpushed commit${commits.length > 1 ? "s" : ""}`,
        detail: commits[0].slice(0, 60), action: "push" });
    }
  }

  // Current branch
  if (branchResult.status === "fulfilled" && branchResult.value) {
    const branch = branchResult.value;
    insights.branch = branch;
    if ((branch === "main" || branch === "master") && insights.some(i => i.action === "commit")) {
      insights.push({ id: `git-on-main-${project.id}`, type: "git", severity: "warning",
        title: "Working directly on " + branch,
        detail: "Consider creating a feature branch", action: "branch" });
    }
  }

  // .env tracked
  if (trackedResult.status === "fulfilled" && trackedResult.value) {
    insights.push({ id: `git-env-tracked-${project.id}`, type: "security", severity: "error",
      title: ".env file is tracked by git",
      detail: "Secrets may be exposed in version history" });
  }

  return insights;
}

function analyzeSessionRecap(project) {
  const insights = [];
  const output = project.output || [];
  if (output.length === 0) return { insights, lastUserMessage: null, lastAssistantMessage: null, lastActivityAt: null };

  let lastUserMessage = null, lastAssistantMessage = null, lastActivityAt = null;
  for (let i = output.length - 1; i >= 0; i--) {
    const entry = output[i];
    if (!lastActivityAt && entry.time) lastActivityAt = entry.time;
    if (!lastUserMessage && entry.role === "user" && entry.text) {
      lastUserMessage = entry.text.replace(/^\n?▶\s*/, "").trim().slice(0, 120);
    }
    if (!lastAssistantMessage && entry.role === "assistant" && entry.text) {
      lastAssistantMessage = entry.text.trim().slice(0, 200);
    }
    if (lastUserMessage && lastAssistantMessage && lastActivityAt) break;
  }

  if (lastActivityAt) {
    const hoursAgo = (Date.now() - lastActivityAt) / (1000 * 60 * 60);
    if (hoursAgo > 24) {
      insights.push({ id: `stale-${project.id}`, type: "activity", severity: "info",
        title: `Inactive for ${Math.floor(hoursAgo / 24)}d ${Math.floor(hoursAgo % 24)}h`,
        detail: lastUserMessage ? `Last: "${lastUserMessage.slice(0, 60)}"` : "No recent activity" });
    }
  }

  return { insights, lastUserMessage, lastAssistantMessage, lastActivityAt };
}

function analyzeCodeHealth(project) {
  const insights = [];
  if (!project.folder) return insights;
  const cwd = project.folder;

  // Missing node_modules (cheap fs check — no shell needed)
  try {
    const pkgJson = path.join(cwd, "package.json");
    const nodeModules = path.join(cwd, "node_modules");
    if (fs.existsSync(pkgJson) && !fs.existsSync(nodeModules)) {
      insights.push({ id: `no-modules-${project.id}`, type: "health", severity: "warning",
        title: "Missing node_modules",
        detail: "Run npm install to install dependencies", action: "install" });
    }
  } catch {}

  // Skip the expensive grep for TODOs — not worth spawning a shell for every project
  return insights;
}

function analyzeSecurityQuick(project) {
  const insights = [];
  if (!project.folder) return insights;
  const cwd = project.folder;

  if (project.isGit) {
    try {
      const gitignore = path.join(cwd, ".gitignore");
      if (fs.existsSync(gitignore)) {
        const content = fs.readFileSync(gitignore, "utf8");
        if (!content.includes(".env") && fs.existsSync(path.join(cwd, ".env"))) {
          insights.push({ id: `env-gitignore-${project.id}`, type: "security", severity: "error",
            title: ".env not in .gitignore",
            detail: "Environment file may be accidentally committed" });
        }
      } else if (fs.existsSync(path.join(cwd, ".env"))) {
        insights.push({ id: `no-gitignore-${project.id}`, type: "security", severity: "error",
          title: "No .gitignore file",
          detail: ".env file exists but no .gitignore to protect it" });
      }
    } catch {}
  }

  // Quick secret scan — only top-level non-dot files, limited to 5 files
  try {
    const topFiles = fs.readdirSync(cwd).filter(f => {
      if (f.startsWith(".") || f === "node_modules" || f === "repos") return false;
      try { return fs.statSync(path.join(cwd, f)).isFile(); } catch { return false; }
    });
    const secretPattern = /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}/i;
    for (const file of topFiles.slice(0, 5)) {
      try {
        const content = fs.readFileSync(path.join(cwd, file), "utf8").slice(0, 5000);
        if (secretPattern.test(content) && !file.match(/\.example$|\.sample$|\.template$/)) {
          insights.push({ id: `secret-${project.id}-${file}`, type: "security", severity: "warning",
            title: `Possible secret in ${file}`,
            detail: "Found pattern matching API key or password" });
          break; // One warning is enough
        }
      } catch {}
    }
  } catch {}

  return insights;
}

// ── Content-Awareness ────────────────────────────────────────────────────────

function analyzeProjectContext(project) {
  if (!project.folder) return null;
  const cwd = project.folder;
  const context = { techStack: [], framework: null, hasTests: false, hasClaude: false, description: null };
  const insights = [];

  // CLAUDE.md
  try {
    const claudeMd = path.join(cwd, "CLAUDE.md");
    if (fs.existsSync(claudeMd)) {
      context.hasClaude = true;
      const lines = fs.readFileSync(claudeMd, "utf8").slice(0, 2000).split("\n").filter(l => l.trim() && !l.startsWith("#"));
      if (lines.length > 0) context.description = lines[0].trim().slice(0, 150);
    } else {
      insights.push({ id: `no-claude-${project.id}`, type: "health", severity: "info",
        title: "No CLAUDE.md found", detail: "Add a CLAUDE.md to help Claude understand this project" });
    }
  } catch {}

  // README.md fallback
  if (!context.description) {
    try {
      const readme = path.join(cwd, "README.md");
      if (fs.existsSync(readme)) {
        const lines = fs.readFileSync(readme, "utf8").slice(0, 2000).split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("!["));
        if (lines.length > 0) context.description = lines[0].trim().slice(0, 150);
      }
    } catch {}
  }

  // package.json tech stack
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (allDeps["next"])           { context.framework = "Next.js"; context.techStack.push("Next.js"); }
      else if (allDeps["nuxt"])      { context.framework = "Nuxt"; context.techStack.push("Nuxt"); }
      else if (allDeps["react"])     { context.framework = "React"; context.techStack.push("React"); }
      else if (allDeps["vue"])       { context.framework = "Vue"; context.techStack.push("Vue"); }
      else if (allDeps["svelte"])    { context.framework = "Svelte"; context.techStack.push("Svelte"); }
      else if (allDeps["@angular/core"]) { context.framework = "Angular"; context.techStack.push("Angular"); }

      if (allDeps["express"]) context.techStack.push("Express");
      if (allDeps["fastify"]) context.techStack.push("Fastify");
      if (allDeps["typescript"]) context.techStack.push("TypeScript");
      if (allDeps["tailwindcss"]) context.techStack.push("Tailwind");
      if (allDeps["prisma"] || allDeps["@prisma/client"]) context.techStack.push("Prisma");

      context.hasTests = !!(allDeps["jest"] || allDeps["vitest"] || allDeps["mocha"] || allDeps["@testing-library/react"] || allDeps["cypress"] || allDeps["playwright"]);
      if (!context.description && pkg.description) context.description = pkg.description.slice(0, 150);

      if (context.framework && /React|Next|Vue|Svelte|Angular/.test(context.framework) && !context.hasTests) {
        insights.push({ id: `no-tests-${project.id}`, type: "health", severity: "info",
          title: `${context.framework} project with no test library`,
          detail: "Consider adding jest, vitest, or a testing framework" });
      }
    }
  } catch {}

  // Python
  try {
    if (fs.existsSync(path.join(cwd, "requirements.txt")) || fs.existsSync(path.join(cwd, "pyproject.toml"))) {
      context.techStack.push("Python");
      if (fs.existsSync(path.join(cwd, "pyproject.toml"))) {
        const content = fs.readFileSync(path.join(cwd, "pyproject.toml"), "utf8").slice(0, 3000);
        if (content.includes("fastapi")) context.techStack.push("FastAPI");
        if (content.includes("django")) context.techStack.push("Django");
        if (content.includes("flask")) context.techStack.push("Flask");
        if (content.includes("pytest")) context.hasTests = true;
      }
    }
  } catch {}

  return { context, insights };
}

// ── Jarvis Class ─────────────────────────────────────────────────────────────

class Jarvis {
  constructor(opts = {}) {
    this.contentAware = opts.contentAware !== false;
    this.cacheTTL = opts.cacheTTL || 5 * 60 * 1000;
    this.scanTimeout = opts.scanTimeout || 10000;
    this._projects = [];
    this._cache = { briefing: null, generatedAt: 0, scanning: false };
    this._dismissed = new Set();
  }

  setProjects(projects) { this._projects = projects || []; }
  invalidateCache() { this._cache.generatedAt = 0; }
  getCachedBriefing() { return this._cache.briefing; }

  async getBriefing(force = false) {
    if (!force && this._cache.briefing && (Date.now() - this._cache.generatedAt < this.cacheTTL)) {
      return this._cache.briefing;
    }
    if (this._cache.scanning) return this._cache.briefing;
    this._cache.scanning = true;

    try {
      const projects = this._projects;
      // Process projects sequentially in batches to avoid spawning too many processes
      const sessionResults = [];
      for (const p of projects) {
        try {
          const gitInsights = await withTimeout(analyzeGitStatus(p), this.scanTimeout).catch(() => []);
          const codeInsights = analyzeCodeHealth(p);
          const securityInsights = analyzeSecurityQuick(p);
          const recap = analyzeSessionRecap(p);

          let contextInsights = [];
          let projectContext = null;
          if (this.contentAware) {
            try {
              const result = analyzeProjectContext(p);
              if (result) { projectContext = result.context; contextInsights = result.insights || []; }
            } catch {}
          }

          const allInsights = [
            ...gitInsights.filter(i => i.id),
            ...recap.insights, ...codeInsights, ...securityInsights, ...contextInsights,
          ].filter(i => !this._dismissed.has(i.id));

          const branch = gitInsights.branch || null;
          const uncommittedCount = gitInsights.filter(i => i.action === "commit").reduce((n, i) => {
            const m = i.title.match(/^(\d+)/); return m ? parseInt(m[1]) : n;
          }, 0);
          const unpushedCount = gitInsights.filter(i => i.action === "push").reduce((n, i) => {
            const m = i.title.match(/^(\d+)/); return m ? parseInt(m[1]) : n;
          }, 0);

          sessionResults.push({
            id: p.id, name: p.name, status: p.status,
            lastActivityAt: recap.lastActivityAt,
            lastUserMessage: recap.lastUserMessage,
            lastAssistantMessage: recap.lastAssistantMessage,
            git: { branch, uncommittedCount, unpushedCount },
            insights: allInsights, context: projectContext,
          });
        } catch {}
      }

      // Global insights
      const globalInsights = [];
      const totalUncommitted = sessionResults.reduce((s, r) => s + r.git.uncommittedCount, 0);
      if (totalUncommitted > 10) {
        globalInsights.push({ id: "global-uncommitted", type: "git", severity: "warning",
          title: `${totalUncommitted} uncommitted changes across projects`,
          detail: "Consider committing your work" });
      }
      const criticalCount = sessionResults.reduce((s, r) => s + r.insights.filter(i => i.severity === "error").length, 0);

      // Headline
      let headline = "";
      const recentSession = sessionResults.filter(r => r.lastActivityAt).sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))[0];
      if (criticalCount > 0) {
        headline = `${criticalCount} issue${criticalCount > 1 ? "s" : ""} need${criticalCount === 1 ? "s" : ""} your attention`;
      } else if (recentSession?.lastUserMessage) {
        const timeAgo = recentSession.lastActivityAt ? formatTimeAgo(recentSession.lastActivityAt) : "";
        headline = `You were working on ${recentSession.name}${timeAgo ? " " + timeAgo : ""}`;
      } else if (sessionResults.length > 0) {
        headline = `${sessionResults.length} project${sessionResults.length > 1 ? "s" : ""} loaded and ready`;
      } else {
        headline = "No projects open yet \u2014 ready when you are";
      }

      const briefing = {
        greeting: getGreeting(), headline, generatedAt: Date.now(),
        sessions: sessionResults,
        globalInsights: globalInsights.filter(i => !this._dismissed.has(i.id)),
      };

      this._cache = { briefing, generatedAt: Date.now(), scanning: false };
      return briefing;
    } catch (err) {
      this._cache.scanning = false;
      console.error("Jarvis briefing error:", err.message);
      return this._cache.briefing;
    }
  }

  dismiss(insightId) {
    this._dismissed.add(insightId);
    setTimeout(() => this._dismissed.delete(insightId), 24 * 60 * 60 * 1000);
    this.invalidateCache();
  }

  attachRoutes(app, opts = {}) {
    const prefix = opts.prefix || "/api/jarvis";
    const auth = opts.authMiddleware;
    const middlewares = auth ? [auth] : [];

    app.get(`${prefix}/briefing`, ...middlewares, async (req, res) => {
      try {
        const force = req.query.force === "1";
        const briefing = await this.getBriefing(force);
        res.json(briefing || { greeting: getGreeting(), headline: "Scanning...", generatedAt: Date.now(), sessions: [], globalInsights: [] });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post(`${prefix}/dismiss`, ...middlewares, (req, res) => {
      const { insightId } = req.body;
      if (!insightId) return res.status(400).json({ error: "insightId required" });
      this.dismiss(insightId);
      res.json({ ok: true });
    });

    app.post(`${prefix}/action`, ...middlewares, async (req, res) => {
      const { sessionId, action } = req.body;
      if (!sessionId || !action) return res.status(400).json({ error: "sessionId and action required" });

      const project = this._projects.find(p => p.id === sessionId);
      if (!project || !project.folder) return res.status(404).json({ error: "Project not found" });

      const cwd = project.folder;
      try {
        switch (action) {
          case "commit": {
            const status = await run("git", ["status", "--porcelain"], { cwd });
            const lines = status.split("\n").filter(Boolean);
            res.json({ ok: true, message: `${lines.length} file${lines.length !== 1 ? "s" : ""} with uncommitted changes — commit from your terminal or IDE` });
            break;
          }
          case "push": {
            const unpushed = await run("git", ["log", "@{u}..HEAD", "--oneline"], { cwd });
            const commits = unpushed.split("\n").filter(Boolean);
            res.json({ ok: true, message: `${commits.length} unpushed commit${commits.length !== 1 ? "s" : ""} — push from your terminal when ready` });
            break;
          }
          case "branch": {
            const branch = await run("git", ["branch", "--show-current"], { cwd });
            res.json({ ok: true, message: `Currently on branch "${branch}" — create a feature branch before committing` });
            break;
          }
          case "install": {
            await run("npm", ["install"], { cwd, timeout: 60000 });
            this.invalidateCache();
            res.json({ ok: true, message: "npm install completed successfully" });
            break;
          }
          default:
            res.status(400).json({ error: `Unknown action: ${action}` });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  }
}

module.exports = { Jarvis };

/**
 * JARVIS — Proactive Project Assistant
 * Standalone module: content-aware briefings, git analysis, security scanning
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Helpers ──────────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
  try {
    const cwd = project.folder;
    // Uncommitted changes
    try {
      const status = execSync("git status --porcelain", { cwd, encoding: "utf8", timeout: 5000 }).trim();
      const lines = status ? status.split("\n") : [];
      if (lines.length > 0) {
        insights.push({ id: `git-uncommitted-${project.id}`, type: "git", severity: lines.length > 5 ? "warning" : "info",
          title: `${lines.length} uncommitted change${lines.length > 1 ? "s" : ""}`,
          detail: lines.slice(0, 3).map(l => l.trim()).join(", ") + (lines.length > 3 ? ` +${lines.length - 3} more` : ""),
          action: "commit" });
      }
    } catch {}
    // Unpushed commits
    try {
      const unpushed = execSync("git log @{u}..HEAD --oneline 2>/dev/null", { cwd, encoding: "utf8", timeout: 5000 }).trim();
      const commits = unpushed ? unpushed.split("\n") : [];
      if (commits.length > 0 && commits[0]) {
        insights.push({ id: `git-unpushed-${project.id}`, type: "git", severity: "info",
          title: `${commits.length} unpushed commit${commits.length > 1 ? "s" : ""}`,
          detail: commits[0].slice(0, 60), action: "push" });
      }
    } catch {}
    // Current branch
    try {
      const branch = execSync("git branch --show-current", { cwd, encoding: "utf8", timeout: 3000 }).trim();
      if (branch) insights.branch = branch;
      if ((branch === "main" || branch === "master") && insights.some(i => i.type === "git" && i.action === "commit")) {
        insights.push({ id: `git-on-main-${project.id}`, type: "git", severity: "warning",
          title: "Working directly on " + branch,
          detail: "Consider creating a feature branch", action: "branch" });
      }
    } catch {}
    // .env tracked
    try {
      const tracked = execSync("git ls-files", { cwd, encoding: "utf8", timeout: 5000 });
      if (tracked.split("\n").some(f => f.match(/^\.env($|\.)/))) {
        insights.push({ id: `git-env-tracked-${project.id}`, type: "security", severity: "error",
          title: ".env file is tracked by git",
          detail: "Secrets may be exposed in version history" });
      }
    } catch {}
  } catch {}
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

async function analyzeCodeHealth(project) {
  const insights = [];
  if (!project.folder) return insights;
  try {
    const cwd = project.folder;
    // TODO/FIXME count
    try {
      const srcDir = path.join(cwd, "src");
      const searchDir = fs.existsSync(srcDir) ? srcDir : cwd;
      const result = execSync(`grep -r "TODO\\|FIXME\\|HACK\\|XXX" --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" --include="*.py" -c ${JSON.stringify(searchDir)} 2>/dev/null || true`,
        { encoding: "utf8", timeout: 8000 });
      const total = result.trim().split("\n").filter(Boolean).reduce((sum, line) => {
        const match = line.match(/:(\d+)$/);
        return sum + (match ? parseInt(match[1]) : 0);
      }, 0);
      if (total > 0) {
        insights.push({ id: `todos-${project.id}`, type: "health", severity: total > 20 ? "warning" : "info",
          title: `${total} TODO/FIXME marker${total > 1 ? "s" : ""}`,
          detail: "Code debt markers found in source files" });
      }
    } catch {}
    // Missing node_modules
    try {
      const pkgJson = path.join(cwd, "package.json");
      const nodeModules = path.join(cwd, "node_modules");
      if (fs.existsSync(pkgJson) && !fs.existsSync(nodeModules)) {
        insights.push({ id: `no-modules-${project.id}`, type: "health", severity: "warning",
          title: "Missing node_modules",
          detail: "Run npm install to install dependencies", action: "install" });
      }
    } catch {}
  } catch {}
  return insights;
}

async function analyzeSecurityQuick(project) {
  const insights = [];
  if (!project.folder) return insights;
  try {
    const cwd = project.folder;
    if (project.isGit) {
      try {
        const gitignore = path.join(cwd, ".gitignore");
        if (fs.existsSync(gitignore)) {
          const content = fs.readFileSync(gitignore, "utf8");
          if (!content.includes(".env")) {
            const envExists = fs.existsSync(path.join(cwd, ".env"));
            if (envExists) {
              insights.push({ id: `env-gitignore-${project.id}`, type: "security", severity: "error",
                title: ".env not in .gitignore",
                detail: "Environment file may be accidentally committed" });
            }
          }
        } else {
          if (fs.existsSync(path.join(cwd, ".env"))) {
            insights.push({ id: `no-gitignore-${project.id}`, type: "security", severity: "error",
              title: "No .gitignore file",
              detail: ".env file exists but no .gitignore to protect it" });
          }
        }
      } catch {}
    }
    // Quick secret pattern check in top-level files
    try {
      const topFiles = fs.readdirSync(cwd).filter(f => {
        if (f.startsWith(".") || f === "node_modules" || f === "repos") return false;
        try { return fs.statSync(path.join(cwd, f)).isFile(); } catch { return false; }
      });
      const secretPatterns = [/(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}/i];
      for (const file of topFiles.slice(0, 10)) {
        try {
          const content = fs.readFileSync(path.join(cwd, file), "utf8").slice(0, 10000);
          for (const pat of secretPatterns) {
            if (pat.test(content) && !file.match(/\.example$|\.sample$|\.template$/)) {
              insights.push({ id: `secret-${project.id}-${file}`, type: "security", severity: "warning",
                title: `Possible secret in ${file}`,
                detail: "Found pattern matching API key or password" });
              break;
            }
          }
        } catch {}
      }
    } catch {}
  } catch {}
  return insights;
}

// ── Content-Awareness ────────────────────────────────────────────────────────

function analyzeProjectContext(project) {
  if (!project.folder) return null;
  const cwd = project.folder;
  const context = { techStack: [], framework: null, hasTests: false, hasClaude: false, description: null };
  const insights = [];

  // Read CLAUDE.md
  try {
    const claudeMd = path.join(cwd, "CLAUDE.md");
    if (fs.existsSync(claudeMd)) {
      context.hasClaude = true;
      const content = fs.readFileSync(claudeMd, "utf8").slice(0, 2000);
      // Try to extract description from first paragraph
      const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#"));
      if (lines.length > 0) context.description = lines[0].trim().slice(0, 150);
    } else {
      insights.push({ id: `no-claude-${project.id}`, type: "health", severity: "info",
        title: "No CLAUDE.md found",
        detail: "Add a CLAUDE.md to help Claude understand this project" });
    }
  } catch {}

  // Read README.md for description fallback
  if (!context.description) {
    try {
      const readme = path.join(cwd, "README.md");
      if (fs.existsSync(readme)) {
        const content = fs.readFileSync(readme, "utf8").slice(0, 2000);
        const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("!["));
        if (lines.length > 0) context.description = lines[0].trim().slice(0, 150);
      }
    } catch {}
  }

  // Read package.json for tech stack
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      // Framework detection
      if (allDeps["next"]) { context.framework = "Next.js"; context.techStack.push("Next.js"); }
      else if (allDeps["nuxt"]) { context.framework = "Nuxt"; context.techStack.push("Nuxt"); }
      else if (allDeps["react"]) { context.framework = "React"; context.techStack.push("React"); }
      else if (allDeps["vue"]) { context.framework = "Vue"; context.techStack.push("Vue"); }
      else if (allDeps["svelte"]) { context.framework = "Svelte"; context.techStack.push("Svelte"); }
      else if (allDeps["@angular/core"]) { context.framework = "Angular"; context.techStack.push("Angular"); }

      if (allDeps["express"]) context.techStack.push("Express");
      if (allDeps["fastify"]) context.techStack.push("Fastify");
      if (allDeps["typescript"]) context.techStack.push("TypeScript");
      if (allDeps["tailwindcss"]) context.techStack.push("Tailwind");
      if (allDeps["prisma"] || allDeps["@prisma/client"]) context.techStack.push("Prisma");

      // Test detection
      context.hasTests = !!(allDeps["jest"] || allDeps["vitest"] || allDeps["mocha"] || allDeps["@testing-library/react"] || allDeps["cypress"] || allDeps["playwright"]);

      if (!context.description && pkg.description) {
        context.description = pkg.description.slice(0, 150);
      }

      // Content-aware insights
      if (context.framework && context.framework.match(/React|Next|Vue|Svelte|Angular/) && !context.hasTests) {
        insights.push({ id: `no-tests-${project.id}`, type: "health", severity: "info",
          title: `${context.framework} project with no test library`,
          detail: "Consider adding jest, vitest, or a testing framework" });
      }
    }
  } catch {}

  // Check for Python projects
  try {
    if (fs.existsSync(path.join(cwd, "requirements.txt")) || fs.existsSync(path.join(cwd, "pyproject.toml"))) {
      context.techStack.push("Python");
      if (fs.existsSync(path.join(cwd, "pyproject.toml"))) {
        try {
          const content = fs.readFileSync(path.join(cwd, "pyproject.toml"), "utf8").slice(0, 3000);
          if (content.includes("fastapi")) context.techStack.push("FastAPI");
          if (content.includes("django")) context.techStack.push("Django");
          if (content.includes("flask")) context.techStack.push("Flask");
          if (content.includes("pytest")) context.hasTests = true;
        } catch {}
      }
    }
  } catch {}

  return { context, insights };
}

// ── Jarvis Class ─────────────────────────────────────────────────────────────

class Jarvis {
  constructor(opts = {}) {
    this.contentAware = opts.contentAware !== false;
    this.cacheTTL = opts.cacheTTL || 5 * 60 * 1000; // 5 min
    this.scanTimeout = opts.scanTimeout || 15000; // 15s
    this._projects = [];
    this._cache = { briefing: null, generatedAt: 0, scanning: false };
    this._dismissed = new Set();
  }

  /** Host provides project list (called on session CRUD) */
  setProjects(projects) {
    this._projects = projects || [];
  }

  /** Invalidate cached briefing (call after session changes) */
  invalidateCache() {
    this._cache.generatedAt = 0;
  }

  /** Get cached briefing without regenerating (for WS init) */
  getCachedBriefing() {
    return this._cache.briefing;
  }

  /** Generate or return cached briefing */
  async getBriefing(force = false) {
    if (!force && this._cache.briefing && (Date.now() - this._cache.generatedAt < this.cacheTTL)) {
      return this._cache.briefing;
    }
    if (this._cache.scanning) return this._cache.briefing;
    this._cache.scanning = true;

    try {
      const projects = this._projects;
      const sessionResults = await Promise.all(projects.map(async (p) => {
        const [gitInsights, codeInsights, securityInsights] = await Promise.all([
          withTimeout(analyzeGitStatus(p), this.scanTimeout).catch(() => []),
          withTimeout(analyzeCodeHealth(p), this.scanTimeout).catch(() => []),
          withTimeout(analyzeSecurityQuick(p), this.scanTimeout).catch(() => []),
        ]);
        const recap = analyzeSessionRecap(p);

        // Content-awareness
        let contextInsights = [];
        let projectContext = null;
        if (this.contentAware) {
          try {
            const result = analyzeProjectContext(p);
            if (result) {
              projectContext = result.context;
              contextInsights = result.insights || [];
            }
          } catch {}
        }

        const allInsights = [
          ...gitInsights.filter(i => i.id),
          ...recap.insights,
          ...codeInsights,
          ...securityInsights,
          ...contextInsights,
        ].filter(i => !this._dismissed.has(i.id));

        const branch = gitInsights.branch || null;
        const uncommittedCount = gitInsights.filter(i => i.action === "commit").reduce((n, i) => {
          const m = i.title.match(/^(\d+)/); return m ? parseInt(m[1]) : n;
        }, 0);
        const unpushedCount = gitInsights.filter(i => i.action === "push").reduce((n, i) => {
          const m = i.title.match(/^(\d+)/); return m ? parseInt(m[1]) : n;
        }, 0);

        return {
          id: p.id, name: p.name, status: p.status,
          lastActivityAt: recap.lastActivityAt,
          lastUserMessage: recap.lastUserMessage,
          lastAssistantMessage: recap.lastAssistantMessage,
          git: { branch, uncommittedCount, unpushedCount },
          insights: allInsights,
          context: projectContext,
        };
      }));

      // Global insights
      const globalInsights = [];
      const totalUncommitted = sessionResults.reduce((s, r) => s + r.git.uncommittedCount, 0);
      if (totalUncommitted > 10) {
        globalInsights.push({ id: "global-uncommitted", type: "git", severity: "warning",
          title: `${totalUncommitted} uncommitted changes across projects`,
          detail: "Consider committing your work" });
      }
      const criticalCount = sessionResults.reduce((s, r) => s + r.insights.filter(i => i.severity === "error").length, 0);

      // Conversational headline
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
        greeting: getGreeting(),
        headline,
        generatedAt: Date.now(),
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

  /** Dismiss an insight by ID (24h auto-expire) */
  dismiss(insightId) {
    this._dismissed.add(insightId);
    setTimeout(() => this._dismissed.delete(insightId), 24 * 60 * 60 * 1000);
    this.invalidateCache();
  }

  /** Register Express routes on the host app */
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
  }
}

module.exports = { Jarvis };

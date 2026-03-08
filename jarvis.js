/**
 * JARVIS — Autonomous Project Assistant
 * Standalone module: content-aware briefings, git analysis, security scanning,
 * persistent memory, trend detection, and self-reflection.
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
  const [statusResult, unpushedResult, branchResult, trackedResult, stashResult, branchAgeResult] = await Promise.allSettled([
    run("git", ["status", "--porcelain"], { cwd }),
    run("git", ["log", "@{u}..HEAD", "--oneline"], { cwd }),
    run("git", ["branch", "--show-current"], { cwd }),
    run("git", ["ls-files", ".env", ".env.local", ".env.production"], { cwd }),
    run("git", ["stash", "list"], { cwd }),
    // Branch age: timestamps of commits ahead of main (empty if on main itself)
    run("git", ["log", "--format=%ct", "main..HEAD"], { cwd })
      .catch(() => run("git", ["log", "--format=%ct", "master..HEAD"], { cwd })),
  ]);

  // Uncommitted changes + merge conflict detection
  if (statusResult.status === "fulfilled" && statusResult.value) {
    const lines = statusResult.value.split("\n").filter(Boolean);
    const conflicted = lines.filter(l => /^(UU|AA|DD|AU|UA|DU|UD) /.test(l));
    if (conflicted.length > 0) {
      insights.push({ id: `git-conflicts-${project.id}`, type: "git", severity: "error",
        title: `${conflicted.length} merge conflict${conflicted.length > 1 ? "s" : ""}`,
        detail: conflicted.slice(0, 2).map(l => l.slice(3).trim()).join(", ") });
    }
    const uncommitted = lines.filter(l => !/^(UU|AA|DD|AU|UA|DU|UD) /.test(l));
    if (uncommitted.length > 0) {
      insights.push({ id: `git-uncommitted-${project.id}`, type: "git", severity: uncommitted.length > 5 ? "warning" : "info",
        title: `${uncommitted.length} uncommitted change${uncommitted.length > 1 ? "s" : ""}`,
        detail: uncommitted.slice(0, 3).map(l => l.trim()).join(", ") + (uncommitted.length > 3 ? ` +${uncommitted.length - 3} more` : ""),
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

  // Current branch + long-lived branch detection
  if (branchResult.status === "fulfilled" && branchResult.value) {
    const branch = branchResult.value;
    insights.branch = branch;
    if ((branch === "main" || branch === "master") && insights.some(i => i.action === "commit")) {
      insights.push({ id: `git-on-main-${project.id}`, type: "git", severity: "warning",
        title: "Working directly on " + branch,
        detail: "Consider creating a feature branch", action: "branch" });
    }
    // Long-lived branch (non-main branches open > 7 days)
    if (branch && branch !== "main" && branch !== "master" && branchAgeResult.status === "fulfilled" && branchAgeResult.value) {
      const timestamps = branchAgeResult.value.split("\n").filter(Boolean).map(Number).filter(Boolean);
      if (timestamps.length > 0) {
        const ageDays = Math.floor((Date.now() - Math.min(...timestamps) * 1000) / (24 * 60 * 60 * 1000));
        if (ageDays >= 7) {
          insights.push({ id: `git-stale-branch-${project.id}`, type: "git", severity: "info",
            title: `Branch open for ${ageDays} day${ageDays !== 1 ? "s" : ""}`,
            detail: `"${branch}" — consider merging or rebasing` });
        }
      }
    }
  }

  // Stash entries
  if (stashResult.status === "fulfilled" && stashResult.value) {
    const entries = stashResult.value.split("\n").filter(Boolean);
    if (entries.length > 0) {
      insights.push({ id: `git-stash-${project.id}`, type: "git", severity: "info",
        title: `${entries.length} stash${entries.length > 1 ? "es" : ""} saved`,
        detail: entries[0].replace(/^stash@\{\d+\}: /, "").slice(0, 60) });
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

async function analyzeCodeHealth(project) {
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

  // Smart TODOs — only in files modified in the last 3 commits (high signal, low noise)
  if (project.isGit) {
    try {
      const recentFiles = await run("git", ["diff", "--name-only", "HEAD~3..HEAD"], { cwd }).catch(() => "");
      const files = (recentFiles || "").split("\n").filter(f => f && /\.(js|ts|jsx|tsx|py|go|rs|java|cs)$/.test(f));
      const todoRe = /\/\/\s*(TODO|FIXME|HACK|XXX)[\s:]/i;
      const found = [];
      for (const file of files.slice(0, 8)) {
        try {
          const content = fs.readFileSync(path.join(cwd, file), "utf8").slice(0, 12000);
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (todoRe.test(lines[i])) {
              found.push({ file, line: i + 1, text: lines[i].trim().slice(0, 60) });
              break; // one per file
            }
          }
        } catch {}
      }
      if (found.length > 0) {
        insights.push({ id: `todos-${project.id}`, type: "health", severity: "info",
          title: `${found.length} TODO${found.length > 1 ? "s" : ""} in recently changed files`,
          detail: `${found[0].file}:${found[0].line} — ${found[0].text}` });
      }
    } catch {}
  }

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

  // Extended secret scanning — top-level files + src/ directory
  try {
    const secretPatterns = [
      { re: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}/i, label: "API key or secret" },
      { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, label: "private key" },
      { re: /(?:mongodb|postgresql|mysql|redis):\/\/[^:@\s]+:[^@\s]+@/, label: "DB connection string" },
      { re: /(?:JWT_SECRET|SECRET_KEY|SIGNING_SECRET|AUTH_SECRET)\s*[:=]\s*["'][^"']{8,}/i, label: "JWT/signing secret" },
    ];
    const isFile = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };
    const ignoreFile = f => /\.example$|\.sample$|\.template$|\.test\.|\.spec\./.test(f);

    const topFiles = fs.readdirSync(cwd)
      .filter(f => !f.startsWith(".") && f !== "node_modules" && f !== "repos" && f !== "dist" && f !== "build")
      .filter(f => isFile(path.join(cwd, f)))
      .slice(0, 5)
      .map(f => path.join(cwd, f));

    const srcDir = path.join(cwd, "src");
    const srcFiles = fs.existsSync(srcDir)
      ? fs.readdirSync(srcDir).filter(f => isFile(path.join(srcDir, f))).slice(0, 8).map(f => path.join(srcDir, f))
      : [];

    for (const filePath of [...topFiles, ...srcFiles]) {
      if (ignoreFile(filePath)) continue;
      try {
        const content = fs.readFileSync(filePath, "utf8").slice(0, 8000);
        for (const { re, label } of secretPatterns) {
          if (re.test(content)) {
            const rel = path.relative(cwd, filePath);
            insights.push({ id: `secret-${project.id}-${rel}`, type: "security", severity: "warning",
              title: `Possible ${label} in ${rel}`,
              detail: "Matches a known secret pattern — verify this is not a real credential" });
            return insights; // One warning is enough
          }
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

  // .claude/rules/ domain-specific rule files
  try {
    const rulesDir = path.join(cwd, ".claude", "rules");
    if (fs.existsSync(rulesDir)) {
      const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith(".md"));
      if (ruleFiles.length > 0) {
        context.domainRules = ruleFiles.map(f => f.replace(/\.md$/, ""));
        insights.push({
          id: `claude-rules-${project.id}`, type: "health", severity: "info",
          title: `${ruleFiles.length} domain rule${ruleFiles.length > 1 ? "s" : ""} active`,
          detail: context.domainRules.join(", ").slice(0, 80),
        });
      }
    }
  } catch {}

  // Plan.md — surface in-progress work for multi-session continuity
  try {
    const planMd = path.join(cwd, "Plan.md");
    if (fs.existsSync(planMd)) {
      const content = fs.readFileSync(planMd, "utf8").slice(0, 3000);
      const match = content.match(/## In Progress\n([\s\S]*?)(?:\n##|$)/);
      if (match) {
        const tasks = match[1].split("\n").map(l => l.trim()).filter(l => l.startsWith("-") && !l.includes("None"));
        if (tasks.length > 0) {
          insights.push({
            id: `plan-inprogress-${project.id}`, type: "activity", severity: "info",
            title: `${tasks.length} task${tasks.length > 1 ? "s" : ""} in progress`,
            detail: tasks[0].replace(/^-\s*/, "").slice(0, 80),
          });
        }
      }
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

// ── Content-Aware Adaptation ─────────────────────────────────────────────────

/** Detect project personality from git history and folder shape */
async function detectProjectPersonality(project) {
  if (!project.folder || !project.isGit) return {};
  const cwd = project.folder;
  try {
    const [authorsRaw, lastCommitRaw] = await Promise.all([
      run("git", ["log", "--format=%ae", "-20"], { cwd }).catch(() => ""),
      run("git", ["log", "-1", "--format=%ct"], { cwd }).catch(() => ""),
    ]);
    const uniqueAuthors = new Set(authorsRaw.split("\n").filter(Boolean));
    const isSoloProject = uniqueAuthors.size <= 1;
    const daysSinceCommit = lastCommitRaw
      ? Math.floor((Date.now() - parseInt(lastCommitRaw) * 1000) / (24 * 60 * 60 * 1000))
      : 0;
    const isMaintenanceMode = daysSinceCommit > 30;
    const nameAndPath = `${project.name || ""} ${project.folder || ""}`.toLowerCase();
    const isAuthSensitive = ["auth", "security", "identity", "oauth", "login", "token"].some(k => nameAndPath.includes(k));
    return { isSoloProject, isMaintenanceMode, isAuthSensitive, daysSinceCommit, authorCount: uniqueAuthors.size };
  } catch {
    return {};
  }
}

/** TypeScript-specific health checks */
function analyzeTypeScriptHealth(project, context) {
  const insights = [];
  if (!context?.techStack?.includes("TypeScript") || !project.folder) return insights;
  const cwd = project.folder;
  try {
    const tsconfigPath = path.join(cwd, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) {
      insights.push({ id: `ts-no-config-${project.id}`, type: "health", severity: "info",
        title: "TypeScript project missing tsconfig.json",
        detail: "No TypeScript configuration found in project root" });
      return insights;
    }
    // Strip JSON comments before parsing
    const raw = fs.readFileSync(tsconfigPath, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const tsconfig = JSON.parse(raw);
    const opts = tsconfig.compilerOptions || {};
    if (!opts.strict && !opts.noImplicitAny) {
      insights.push({ id: `ts-no-strict-${project.id}`, type: "health", severity: "info",
        title: "TypeScript strict mode is off",
        detail: "Enable strict in tsconfig.json to catch implicit any and null errors" });
    }
  } catch {}
  return insights;
}

/** Python-specific health checks */
function analyzePythonHealth(project, context) {
  const insights = [];
  if (!context?.techStack?.includes("Python") || !project.folder) return insights;
  const cwd = project.folder;
  try {
    const hasVenv = fs.existsSync(path.join(cwd, ".venv")) || fs.existsSync(path.join(cwd, "venv"));
    if (!hasVenv) {
      insights.push({ id: `py-no-venv-${project.id}`, type: "health", severity: "info",
        title: "No virtual environment found",
        detail: "Create one with: python -m venv .venv" });
    }
    const hasReqs = fs.existsSync(path.join(cwd, "requirements.txt"));
    const hasPyproject = fs.existsSync(path.join(cwd, "pyproject.toml"));
    if (!hasReqs && !hasPyproject) {
      insights.push({ id: `py-no-deps-${project.id}`, type: "health", severity: "info",
        title: "No dependency file found",
        detail: "Add requirements.txt or pyproject.toml to declare dependencies" });
    }
  } catch {}
  return insights;
}

/** Next.js-specific health checks */
function analyzeNextJsHealth(project, context) {
  const insights = [];
  if (context?.framework !== "Next.js" || !project.folder) return insights;
  const cwd = project.folder;
  try {
    // Mixed router detection (App + Pages)
    const hasAppDir   = fs.existsSync(path.join(cwd, "app"))      || fs.existsSync(path.join(cwd, "src", "app"));
    const hasPagesDir = fs.existsSync(path.join(cwd, "pages"))    || fs.existsSync(path.join(cwd, "src", "pages"));
    if (hasAppDir && hasPagesDir) {
      insights.push({ id: `next-mixed-router-${project.id}`, type: "health", severity: "warning",
        title: "Mixed App Router and Pages Router detected",
        detail: "Both app/ and pages/ exist — this can cause routing confusion" });
    }
    // Missing next.config
    const hasConfig = ["next.config.js", "next.config.ts", "next.config.mjs"].some(f => fs.existsSync(path.join(cwd, f)));
    if (!hasConfig) {
      insights.push({ id: `next-no-config-${project.id}`, type: "health", severity: "info",
        title: "No next.config file found",
        detail: "Consider adding next.config.js for redirects, headers, and image domains" });
    }
  } catch {}
  return insights;
}

/** Post-process insights based on project context and personality */
function adaptInsightsForContext(insights, context, personality) {
  return insights.map(insight => {
    // Python projects: node_modules missing is irrelevant
    if (context?.techStack?.includes("Python") && insight.id.startsWith("no-modules-")) return null;

    // Solo projects: "working on main" is an expected workflow, downgrade to info
    if (personality?.isSoloProject && insight.id.startsWith("git-on-main-")) {
      return { ...insight, severity: "info", detail: "Solo project — direct main commits are common" };
    }

    // Maintenance mode: stale branch / inactive insights are noise, suppress
    if (personality?.isMaintenanceMode && insight.id.startsWith("stale-")) return null;

    // Auth-sensitive project: escalate any security warning to error
    if (personality?.isAuthSensitive && insight.type === "security" && insight.severity === "warning") {
      return { ...insight, severity: "error", detail: `Auth-sensitive project: ${insight.detail || insight.title}` };
    }

    // Long-inactive + uncommitted changes: escalate to warning
    if (insight.id.startsWith("git-uncommitted-") && personality?.daysSinceCommit > 14 && insight.severity === "info") {
      return { ...insight, severity: "warning", detail: `${insight.detail} — stale for ${personality.daysSinceCommit}d` };
    }

    return insight;
  }).filter(Boolean);
}

// ── Safety Gates ─────────────────────────────────────────────────────────────

async function assessActionRisk(project, action) {
  const cwd = project.folder;
  try {
    switch (action) {
      case "install": {
        const hasModules = fs.existsSync(path.join(cwd, "node_modules"));
        if (hasModules) {
          return { level: "medium", reason: "node_modules already exists and will be reinstalled" };
        }
        return { level: "low", reason: "" };
      }
      case "push": {
        const branch = await run("git", ["branch", "--show-current"], { cwd }).catch(() => "");
        if (branch === "main" || branch === "master") {
          return { level: "high", reason: `Pushing directly to ${branch} — consider a feature branch` };
        }
        return { level: "low", reason: "" };
      }
      default:
        return { level: "low", reason: "" };
    }
  } catch {
    return { level: "low", reason: "" };
  }
}

// ── Memory Substrate ─────────────────────────────────────────────────────────
// Persistent JSON-based memory — tracks insight history, dismissed patterns,
// action outcomes, and learned rules. No external deps required.

class JarvisMemory {
  constructor(memoryPath) {
    this._path = memoryPath;
    this._data = { snapshots: [], dismissals: [], actions: [], rules: [], version: 1 };
    this._maxSnapshots = 50;
    this._maxDismissals = 200;
    this._maxActions = 200;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._path)) {
        const raw = fs.readFileSync(this._path, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version) this._data = parsed;
      }
    } catch {}
  }

  _save() {
    try {
      const dir = path.dirname(this._path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2));
    } catch {}
  }

  // Record a briefing snapshot (compact form — just insight IDs, severities, counts)
  recordSnapshot(briefing) {
    if (!briefing || !briefing.sessions) return;
    const snapshot = {
      ts: Date.now(),
      projectCount: briefing.sessions.length,
      insights: [],
      totalErrors: 0,
      totalWarnings: 0,
    };
    for (const s of briefing.sessions) {
      for (const i of (s.insights || [])) {
        snapshot.insights.push({ id: i.id, type: i.type, severity: i.severity });
        if (i.severity === "error") snapshot.totalErrors++;
        if (i.severity === "warning") snapshot.totalWarnings++;
      }
    }
    this._data.snapshots.push(snapshot);
    if (this._data.snapshots.length > this._maxSnapshots) {
      this._data.snapshots = this._data.snapshots.slice(-this._maxSnapshots);
    }
    this._save();
  }

  // Record a dismissal — used by reflection to detect false-positive patterns
  recordDismissal(insightId) {
    this._data.dismissals.push({ id: insightId, ts: Date.now() });
    if (this._data.dismissals.length > this._maxDismissals) {
      this._data.dismissals = this._data.dismissals.slice(-this._maxDismissals);
    }
    this._save();
  }

  // Record an action outcome — used to learn which actions succeed/fail
  recordAction(projectId, action, outcome) {
    this._data.actions.push({ projectId, action, outcome, ts: Date.now() });
    if (this._data.actions.length > this._maxActions) {
      this._data.actions = this._data.actions.slice(-this._maxActions);
    }
    this._save();
  }

  // Add or update a learned rule
  addRule(rule) {
    const existing = this._data.rules.findIndex(r => r.id === rule.id);
    if (existing >= 0) {
      this._data.rules[existing] = { ...this._data.rules[existing], ...rule, updatedAt: Date.now() };
    } else {
      this._data.rules.push({ ...rule, createdAt: Date.now() });
    }
    this._save();
  }

  removeRule(ruleId) {
    this._data.rules = this._data.rules.filter(r => r.id !== ruleId);
    this._save();
  }

  getRules() { return this._data.rules || []; }
  getSnapshots() { return this._data.snapshots || []; }
  getDismissals() { return this._data.dismissals || []; }
  getActions() { return this._data.actions || []; }
}

// ── Trend Detection ──────────────────────────────────────────────────────────
// Compares current briefing state against historical snapshots to surface
// velocity and direction of project health.

function detectTrends(currentBriefing, memory) {
  const trends = [];
  const snapshots = memory.getSnapshots();
  if (snapshots.length < 2) return trends;

  // Compare against the snapshot from ~24h ago (or the oldest available)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const baseline = snapshots.find(s => s.ts <= oneDayAgo) || snapshots[0];
  const currentInsightIds = new Set();
  let currentErrors = 0, currentWarnings = 0;

  for (const s of (currentBriefing.sessions || [])) {
    for (const i of (s.insights || [])) {
      currentInsightIds.add(i.id);
      if (i.severity === "error") currentErrors++;
      if (i.severity === "warning") currentWarnings++;
    }
  }

  // New issues since baseline
  const baselineIds = new Set(baseline.insights.map(i => i.id));
  const newIssues = [...currentInsightIds].filter(id => !baselineIds.has(id));
  const resolvedIssues = [...baselineIds].filter(id => !currentInsightIds.has(id));

  if (newIssues.length > 0) {
    trends.push({
      id: "trend-new-issues", type: "trend", severity: "info",
      title: `${newIssues.length} new issue${newIssues.length > 1 ? "s" : ""} since last check`,
      detail: newIssues.slice(0, 3).join(", "),
    });
  }

  if (resolvedIssues.length > 0) {
    trends.push({
      id: "trend-resolved", type: "trend", severity: "info",
      title: `${resolvedIssues.length} issue${resolvedIssues.length > 1 ? "s" : ""} resolved`,
      detail: resolvedIssues.slice(0, 3).join(", "),
    });
  }

  // Error trend direction
  const errorDelta = currentErrors - baseline.totalErrors;
  if (errorDelta > 0) {
    trends.push({
      id: "trend-errors-up", type: "trend", severity: "warning",
      title: `Critical issues increased by ${errorDelta}`,
      detail: `Was ${baseline.totalErrors}, now ${currentErrors}`,
    });
  } else if (errorDelta < 0) {
    trends.push({
      id: "trend-errors-down", type: "trend", severity: "info",
      title: `Critical issues decreased by ${Math.abs(errorDelta)}`,
      detail: `Was ${baseline.totalErrors}, now ${currentErrors}`,
    });
  }

  return trends;
}

// ── Reflection Engine ────────────────────────────────────────────────────────
// Analyzes memory to extract patterns and generate learned rules.
// Runs after each briefing — lightweight, no external calls.

function reflect(memory) {
  const learnings = [];
  const dismissals = memory.getDismissals();
  const actions = memory.getActions();

  // Pattern: repeatedly dismissed insights → likely false positive
  if (dismissals.length >= 3) {
    const counts = {};
    for (const d of dismissals) {
      // Normalize ID — strip project-specific suffix to find the pattern
      const pattern = d.id.replace(/-[^-]+$/, "");
      counts[pattern] = (counts[pattern] || 0) + 1;
    }
    for (const [pattern, count] of Object.entries(counts)) {
      if (count >= 3) {
        const ruleId = `auto-suppress-${pattern}`;
        const existing = memory.getRules().find(r => r.id === ruleId);
        if (!existing) {
          learnings.push({
            id: ruleId,
            type: "auto-suppress",
            pattern,
            reason: `Dismissed ${count} times — likely a false positive or accepted risk`,
            confidence: Math.min(count / 5, 1),
          });
        }
      }
    }
  }

  // Pattern: actions that consistently fail → surface a warning
  if (actions.length >= 2) {
    const failCounts = {};
    const totalCounts = {};
    for (const a of actions) {
      const key = `${a.action}`;
      totalCounts[key] = (totalCounts[key] || 0) + 1;
      if (a.outcome === "error") failCounts[key] = (failCounts[key] || 0) + 1;
    }
    for (const [action, fails] of Object.entries(failCounts)) {
      const total = totalCounts[action] || 0;
      if (fails >= 2 && fails / total > 0.5) {
        learnings.push({
          id: `unreliable-action-${action}`,
          type: "unreliable-action",
          action,
          reason: `Failed ${fails}/${total} times — may need manual intervention`,
          confidence: fails / total,
        });
      }
    }
  }

  // Persist high-confidence learnings as rules
  for (const learning of learnings) {
    if (learning.confidence >= 0.6) {
      memory.addRule(learning);
    }
  }

  return learnings;
}

// Check if an insight should be auto-suppressed based on learned rules
function shouldSuppress(insightId, memory) {
  const rules = memory.getRules().filter(r => r.type === "auto-suppress");
  const pattern = insightId.replace(/-[^-]+$/, "");
  return rules.some(r => r.pattern === pattern);
}

// ── Workflow Engine ───────────────────────────────────────────────────────────
//
// Dynamically selects an analysis recipe based on project personality/context.
// Recipes are evaluated in priority order — first match wins.

const WORKFLOW_RECIPES = {
  "security-deep": {
    description: "Deep security audit for auth-sensitive projects (git + full security + context)",
    tasks: ["git", "code", "security", "context", "type-specific"],
    extras: ["security-deep-agent"],
    parallel: true,
    condition: p => p.personality && p.personality.isAuthSensitive,
  },
  "maintenance-minimal": {
    description: "Minimal scan for maintenance-mode projects (security + context only)",
    tasks: ["security", "context"],
    extras: [],
    parallel: true,
    condition: p => p.personality && p.personality.isMaintenance,
  },
  "performance-focus": {
    description: "Performance-focused scan for React/Next.js projects",
    tasks: ["git", "code", "security", "context", "type-specific"],
    extras: ["performance-audit-agent"],
    parallel: true,
    condition: p => p.context && (p.context.stack || []).some(s => s === "React" || s === "Next.js"),
  },
  "team-full": {
    description: "Full team scan — all analyzers in parallel",
    tasks: ["git", "code", "security", "context", "type-specific"],
    extras: ["dependency-graph-agent"],
    parallel: true,
    condition: p => p.personality && !p.personality.isSolo,
  },
  "solo-quick": {
    description: "Fast scan for solo developers — git + security only",
    tasks: ["git", "security"],
    extras: [],
    parallel: true,
    condition: p => p.personality && p.personality.isSolo,
  },
  "standard": {
    description: "Balanced scan — git, code, security, context",
    tasks: ["git", "code", "security", "context", "type-specific"],
    extras: [],
    parallel: true,
    condition: () => true,
  },
};

class JarvisWorkflow {
  /** Return the first matching recipe for the given project state. */
  selectRecipe(personality, context) {
    const ctx = { personality, context };
    const priority = ["security-deep", "maintenance-minimal", "performance-focus", "team-full", "solo-quick", "standard"];
    for (const name of priority) {
      const r = WORKFLOW_RECIPES[name];
      if (r.condition(ctx)) return { name, ...r };
    }
    return { name: "standard", ...WORKFLOW_RECIPES.standard };
  }

  /** Return all recipes as a plain list for the /workflows API. */
  listRecipes() {
    return Object.entries(WORKFLOW_RECIPES).map(([name, r]) => ({
      name,
      description: r.description,
      tasks: r.tasks,
      extras: r.extras,
      parallel: r.parallel,
    }));
  }
}

// ── Hook Manager ──────────────────────────────────────────────────────────────
//
// Reads/writes .claude/settings.json hooks. Can auto-optimize hooks based on
// patterns learned from memory (e.g., add pre-push warning after repeated failures).

class JarvisHookManager {
  constructor(settingsPath) {
    this._path = settingsPath;
  }

  _read() {
    try {
      if (!fs.existsSync(this._path)) return { hooks: {} };
      return JSON.parse(fs.readFileSync(this._path, "utf8"));
    } catch { return { hooks: {} }; }
  }

  _write(settings) {
    try {
      const dir = path.dirname(this._path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._path, JSON.stringify(settings, null, 2) + "\n");
      return true;
    } catch { return false; }
  }

  getHooks() { return this._read().hooks || {}; }

  /** Add a hook if one with the same _id does not already exist. Returns true if added. */
  addHook(event, matcher, command, id) {
    const settings = this._read();
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks[event]) settings.hooks[event] = [];
    if (settings.hooks[event].some(h => h._id === id)) return false;
    settings.hooks[event].push({ _id: id, matcher, hooks: [{ type: "command", command }] });
    return this._write(settings);
  }

  /** Remove a hook by its _id. Returns true if removed. */
  removeHook(event, id) {
    const settings = this._read();
    if (!settings.hooks?.[event]) return false;
    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter(h => h._id !== id);
    if (settings.hooks[event].length === before) return false;
    return this._write(settings);
  }

  /**
   * Analyze memory patterns and auto-optimize hooks.
   * Returns an array of { action, hook, reason } change records.
   */
  autoOptimize(memory) {
    const changes = [];
    const rules   = memory.getRules  ? memory.getRules()   : [];
    const actions = memory.getActions ? memory.getActions() : [];

    // If push has been unreliable (>50% fail) → add a pre-push advisory hook
    const pushActions = actions.filter(a => a.action === "push");
    const pushFails   = pushActions.filter(a => a.outcome !== "success").length;
    const unreliablePushRule = rules.find(r => r.type === "unreliable-action" && r.action === "push");
    if (unreliablePushRule && (unreliablePushRule.confidence || 0) >= 0.7) {
      const added = this.addHook(
        "PreToolUse", "Bash",
        "echo '⚠️  Jarvis: push operations have been unreliable — verify remote is accessible' >&2",
        "jarvis-unreliable-push-warning"
      );
      if (added) changes.push({ action: "added", hook: "jarvis-unreliable-push-warning", reason: "unreliable push pattern detected" });
    }

    // If commit failures have happened 3+ times → ensure syntax check hook exists
    const commitFails = actions.filter(a => a.action === "commit" && a.outcome !== "success").length;
    if (commitFails >= 3) {
      const added = this.addHook(
        "PostToolUse", "Edit|Write",
        "node -e \"require('./jarvis')\" 2>&1 | grep -q 'SyntaxError' && echo '✗ jarvis.js has a syntax error' >&2 || true",
        "jarvis-syntax-check"
      );
      if (added) changes.push({ action: "added", hook: "jarvis-syntax-check", reason: "repeated commit failures suggest syntax errors" });
    }

    // Silence push warning once push reliability recovers (≥ 80% success over last 10)
    const recentPush = pushActions.slice(-10);
    const recentOk   = recentPush.filter(a => a.outcome === "success").length;
    if (recentPush.length >= 10 && recentOk / recentPush.length >= 0.8) {
      const removed = this.removeHook("PreToolUse", "jarvis-unreliable-push-warning");
      if (removed) changes.push({ action: "removed", hook: "jarvis-unreliable-push-warning", reason: "push reliability has recovered" });
    }

    return changes;
  }
}

// ── Agent Manager ─────────────────────────────────────────────────────────────
//
// Maintains a catalogue of specialized subagent definitions and writes their
// .claude/agents/*.md files so Claude Code can spawn them on demand.
// Jarvis calls ensureAgents() at startup — idempotent (only writes missing files).

const AGENT_SPECS = {
  "security-deep": {
    name: "Jarvis Security Deep Audit Agent",
    description: "Deep security scan: exposed secrets, auth-flow review, CORS audit, env config",
    file: "security-deep.md",
    triggers: ["isAuthSensitive"],
  },
  "dependency-graph": {
    name: "Jarvis Dependency Graph Agent",
    description: "Dependency tree analysis: wrong categories, duplicate capabilities, missing scripts",
    file: "dependency-graph.md",
    triggers: ["hasPackageJson"],
  },
  "performance-audit": {
    name: "Jarvis Performance Audit Agent",
    description: "Frontend performance review: bundle size, re-render patterns, Next.js specifics",
    file: "performance-audit.md",
    triggers: ["isReact", "isNextJs"],
  },
};

class JarvisAgentManager {
  constructor(agentsDir) {
    this._dir = agentsDir;
  }

  /** Write agent definition files that don't exist yet. Idempotent. */
  ensureAgents() {
    try {
      if (!fs.existsSync(this._dir)) fs.mkdirSync(this._dir, { recursive: true });
    } catch { return; }

    const defs = {
      "security-deep.md":   this._securityDeepMd(),
      "dependency-graph.md": this._dependencyGraphMd(),
      "performance-audit.md": this._performanceAuditMd(),
    };

    for (const [filename, content] of Object.entries(defs)) {
      const p = path.join(this._dir, filename);
      try { if (!fs.existsSync(p)) fs.writeFileSync(p, content); } catch {}
    }
  }

  /** Return which agents are relevant for a project given its personality and context. */
  selectAgentsForProject(personality, context) {
    const stack = (context && context.stack) || [];
    const active = [];
    if (personality && personality.isAuthSensitive) active.push("security-deep");
    if (context && context.hasPackageJson)           active.push("dependency-graph");
    if (stack.includes("React") || stack.includes("Next.js")) active.push("performance-audit");
    return active.map(id => ({ id, ...AGENT_SPECS[id] }));
  }

  /** List all known agents with their on-disk status. */
  listAgents() {
    return Object.entries(AGENT_SPECS).map(([id, spec]) => ({
      id,
      name: spec.name,
      description: spec.description,
      triggers: spec.triggers,
      exists: fs.existsSync(path.join(this._dir, spec.file)),
    }));
  }

  _securityDeepMd() {
    return `# Jarvis Security Deep Audit Agent

You are a specialized security audit subagent deployed by Jarvis for auth-sensitive projects.

## Mission
Perform a thorough security audit and return a structured findings report.

## Steps

1. **Scan for exposed secrets**: Search all source files for API keys, JWT secrets, database URLs, private keys.
   Use patterns like \`(api[_-]?key|secret|password|token|private[_-]?key)\\s*[:=]\\s*["'][^"']{8,}\`

2. **Audit authentication flow**: Read auth-related files (auth.js, middleware/*.js, routes/auth*, etc.)
   Check for: insecure session config, missing rate limiting, plain-text password comparison, missing HTTPS enforcement.

3. **Check dependency vulnerabilities**: If npm is available, run \`npm audit --json\` and parse for high/critical issues.

4. **Review environment configuration**: Check .env.example vs .env, ensure sensitive values are not committed.

5. **Check CORS and security headers**: Look for \`Access-Control-Allow-Origin: *\` in production configs.

## Output Format

Return a JSON object:
\`\`\`json
{
  "severity": "critical|high|medium|low",
  "findings": [
    { "type": "exposed-secret|weak-auth|vulnerable-dep|config-issue|cors-issue", "file": "path", "line": 0, "detail": "..." }
  ],
  "summary": "one-sentence summary"
}
\`\`\`

## Constraints
- Never modify files — read-only audit
- Do not run npm install or any write operations
- If no issues found, return severity: "low" with empty findings
`;
  }

  _dependencyGraphMd() {
    return `# Jarvis Dependency Graph Agent

You are a specialized dependency analysis subagent deployed by Jarvis.

## Mission
Analyze the dependency tree and return actionable package management insights.

## Steps

1. **Read package.json**: Parse all dependencies and devDependencies, note version constraint styles.

2. **Check for known problematic patterns**:
   - Missing \`engines\` field (Node.js version compatibility unknown)
   - Build tools in \`dependencies\` instead of \`devDependencies\` (e.g., typescript, eslint, vite)
   - Multiple packages serving the same purpose (e.g., axios + node-fetch + got; moment + date-fns + dayjs)
   - All pinned versions = update-resistant; all flexible = instability risk

3. **Review scripts**: Check for missing lint, test, build, typecheck scripts.

4. **Flag large bundles**: Identify packages known to be large (e.g., lodash without tree-shaking, moment.js).

## Output Format

\`\`\`json
{
  "totalDeps": 0,
  "issues": [
    { "type": "wrong-category|duplicate-capability|missing-engine|missing-scripts|large-bundle", "packages": [], "recommendation": "..." }
  ],
  "summary": "one-sentence summary"
}
\`\`\`

## Constraints
- Read-only analysis from package.json and source files only
- Do not run npm install, npm audit, or any shell commands
`;
  }

  _performanceAuditMd() {
    return `# Jarvis Performance Audit Agent

You are a specialized performance audit subagent deployed by Jarvis for React/Next.js projects.

## Mission
Identify frontend performance issues and return prioritized recommendations.

## Steps

1. **Bundle size risks**: Look for large library imports without tree-shaking
   (e.g., \`import _ from 'lodash'\` instead of \`import pick from 'lodash/pick'\`)

2. **React rendering issues**:
   - Missing \`key\` props in list renders
   - Inline function/object creation in JSX props (causes unnecessary re-renders)
   - Large components that could benefit from \`React.memo\`
   - Event handlers missing \`useCallback\` when passed to child components

3. **Next.js specific** (if applicable):
   - Images not using \`next/image\`
   - Large client components that could be server components
   - Missing \`generateStaticParams\` for dynamic routes that could be static
   - Mixed App Router and Pages Router usage

4. **Data fetching patterns**:
   - N+1 query patterns (loops with await inside)
   - Missing loading / error states
   - No caching strategy for repeated fetches

## Output Format

\`\`\`json
{
  "impact": "high|medium|low",
  "issues": [
    { "type": "bundle|rendering|nextjs|data-fetching", "file": "path", "detail": "...", "fix": "..." }
  ],
  "summary": "one-sentence summary"
}
\`\`\`

## Constraints
- Read-only analysis
- Focus only on performance — security issues belong to the security-deep agent
`;
  }
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

    // Memory — stored alongside jarvis.js by default, or configurable
    const memDir = opts.memoryPath || path.join(path.dirname(__filename), ".jarvis");
    this._memory = new JarvisMemory(path.join(memDir, "memory.json"));

    // Workflow, hook, and agent systems — rootDir defaults to the jarvis.js directory
    const rootDir = opts.rootDir || path.dirname(__filename);
    this._workflow  = new JarvisWorkflow();
    this._hookMgr   = new JarvisHookManager(path.join(rootDir, ".claude", "settings.json"));
    this._agentMgr  = new JarvisAgentManager(path.join(rootDir, ".claude", "agents"));

    // Auto-write agent definition files on startup (idempotent)
    try { this._agentMgr.ensureAgents(); } catch {}
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
          const [gitInsights, codeInsights, personality] = await Promise.all([
            withTimeout(analyzeGitStatus(p), this.scanTimeout).catch(() => []),
            analyzeCodeHealth(p),
            detectProjectPersonality(p).catch(() => ({})),
          ]);
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

          // Type-specific health checks — only run when relevant stack detected
          const typeInsights = [
            ...analyzeTypeScriptHealth(p, projectContext),
            ...analyzePythonHealth(p, projectContext),
            ...analyzeNextJsHealth(p, projectContext),
          ];

          const rawInsights = [
            ...gitInsights.filter(i => i.id),
            ...recap.insights, ...codeInsights, ...securityInsights, ...contextInsights, ...typeInsights,
          ];

          // Adapt insights based on project context and personality before filtering
          const allInsights = adaptInsightsForContext(rawInsights, projectContext, personality)
            .filter(i => !this._dismissed.has(i.id) && !shouldSuppress(i.id, this._memory));

          const branch = gitInsights.branch || null;
          const uncommittedCount = gitInsights.filter(i => i.action === "commit").reduce((n, i) => {
            const m = i.title.match(/^(\d+)/); return m ? parseInt(m[1]) : n;
          }, 0);
          const unpushedCount = gitInsights.filter(i => i.action === "push").reduce((n, i) => {
            const m = i.title.match(/^(\d+)/); return m ? parseInt(m[1]) : n;
          }, 0);

          // Select the best workflow recipe for observability / UI display
          const recipe = this._workflow.selectRecipe(personality, projectContext);

          sessionResults.push({
            id: p.id, name: p.name, status: p.status,
            lastActivityAt: recap.lastActivityAt,
            lastUserMessage: recap.lastUserMessage,
            lastAssistantMessage: recap.lastAssistantMessage,
            git: { branch, uncommittedCount, unpushedCount },
            insights: allInsights, context: projectContext, personality,
            workflow: recipe.name,
            recommendedAgents: this._agentMgr.selectAgentsForProject(personality, projectContext).map(a => a.id),
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

      // Natural language summary — useful for MCP tool responses and quick reads
      const totalErrors   = sessionResults.reduce((n, s) => n + s.insights.filter(i => i.severity === "error").length, 0);
      const totalWarnings = sessionResults.reduce((n, s) => n + s.insights.filter(i => i.severity === "warning").length, 0);
      let summary = "";
      if (totalErrors > 0 || totalWarnings > 0) {
        const parts = [];
        if (totalErrors   > 0) parts.push(`${totalErrors} critical issue${totalErrors > 1 ? "s" : ""}`);
        if (totalWarnings > 0) parts.push(`${totalWarnings} warning${totalWarnings > 1 ? "s" : ""}`);
        const affected = sessionResults.filter(s => s.insights.some(i => i.severity === "error" || i.severity === "warning"))
          .slice(0, 2).map(s => s.name);
        summary = `${parts.join(" and ")} across ${affected.length > 0 ? affected.join(" and ") : "your projects"}`;
      } else if (sessionResults.length > 0) {
        summary = `${sessionResults.length} project${sessionResults.length > 1 ? "s" : ""} healthy — nothing needs attention`;
      }

      // Signal quality — % of insights acted on vs dismissed (curriculum L5.5 FASR equivalent)
      const totalDismissals = this._memory.getDismissals().length;
      const successfulActions = this._memory.getActions().filter(a => a.outcome === "success").length;
      const signalTotal = totalDismissals + successfulActions;
      const signalQuality = signalTotal >= 10 ? Math.round((successfulActions / signalTotal) * 100) : null;
      if (signalQuality !== null && signalQuality < 20) {
        globalInsights.push({ id: "signal-low", type: "health", severity: "info",
          title: `Signal quality: ${signalQuality}% — Jarvis may be too noisy`,
          detail: "Most insights are being dismissed. Consider raising thresholds or dismissing false positives." });
      }

      // Cross-project dependency correlation
      const projectsByPkgName = {};
      for (const p of this._projects) {
        try {
          const pkgPath = path.join(p.folder || "", "package.json");
          if (p.folder && fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
            if (pkg.name) projectsByPkgName[pkg.name] = p;
          }
        } catch {}
      }
      const projectsWithUncommitted = new Set(sessionResults.filter(s => s.git.uncommittedCount > 0).map(s => s.id));
      for (const result of sessionResults) {
        const proj = this._projects.find(p => p.id === result.id);
        if (!proj?.folder) continue;
        try {
          const pkgPath = path.join(proj.folder, "package.json");
          if (!fs.existsSync(pkgPath)) continue;
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          for (const depName of Object.keys(allDeps)) {
            const depProj = projectsByPkgName[depName];
            if (depProj && projectsWithUncommitted.has(depProj.id)) {
              globalInsights.push({ id: `cross-dep-${result.id}-${depProj.id}`, type: "git", severity: "warning",
                title: `${result.name} depends on ${depProj.name} (has uncommitted changes)`,
                detail: "Local dependency changes may not be reflected in this project" });
            }
          }
        } catch {}
      }

      const briefing = {
        greeting: getGreeting(), headline, summary, signalQuality, generatedAt: Date.now(),
        sessions: sessionResults,
        globalInsights: globalInsights.filter(i => !this._dismissed.has(i.id)),
        trends: [],
        learnings: [],
      };

      // Trend detection — compare against historical snapshots
      try { briefing.trends = detectTrends(briefing, this._memory); } catch {}

      // Reflection — extract patterns from memory
      try { briefing.learnings = reflect(this._memory); } catch {}

      // Record snapshot for future trend analysis
      try { this._memory.recordSnapshot(briefing); } catch {}

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
    this._memory.recordDismissal(insightId);
    this.invalidateCache();
  }

  // Expose memory for MCP and advanced integrations
  getMemory() { return this._memory; }
  getLearnings() { return this._memory.getRules(); }
  forgetRule(ruleId) { this._memory.removeRule(ruleId); }

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
      const memory = this._memory;

      // Check if this action has a learned unreliability warning
      const unreliableRule = memory.getRules().find(r => r.type === "unreliable-action" && r.action === action);

      try {
        // Risk assessment gate — block high-risk actions unless confirmed
        const risk = await assessActionRisk(project, action);
        if (risk.level === "high" && !req.body.confirmed) {
          return res.json({ ok: false, requiresConfirmation: true, riskLevel: risk.level, reason: risk.reason,
            warning: unreliableRule ? unreliableRule.reason : undefined });
        }

        switch (action) {
          case "commit": {
            const status = await run("git", ["status", "--porcelain"], { cwd });
            const lines = status.split("\n").filter(Boolean);
            memory.recordAction(sessionId, action, "success");
            res.json({ ok: true, message: `${lines.length} file${lines.length !== 1 ? "s" : ""} with uncommitted changes — commit from your terminal or IDE` });
            break;
          }
          case "push": {
            if (risk.level !== "low" && !req.body.confirmed) {
              return res.json({ ok: false, requiresConfirmation: true, riskLevel: risk.level, reason: risk.reason });
            }
            const unpushed = await run("git", ["log", "@{u}..HEAD", "--oneline"], { cwd });
            const commits = unpushed.split("\n").filter(Boolean);
            memory.recordAction(sessionId, action, "success");
            res.json({ ok: true, message: `${commits.length} unpushed commit${commits.length !== 1 ? "s" : ""} — push from your terminal when ready` });
            break;
          }
          case "branch": {
            const branch = await run("git", ["branch", "--show-current"], { cwd });
            memory.recordAction(sessionId, action, "success");
            res.json({ ok: true, message: `Currently on branch "${branch}" — create a feature branch before committing` });
            break;
          }
          case "install": {
            if (risk.level !== "low" && !req.body.confirmed) {
              return res.json({ ok: false, requiresConfirmation: true, riskLevel: risk.level, reason: risk.reason });
            }
            await run("npm", ["install"], { cwd, timeout: 60000 });
            memory.recordAction(sessionId, action, "success");
            this.invalidateCache();
            res.json({ ok: true, message: "npm install completed successfully" });
            break;
          }
          default:
            res.status(400).json({ error: `Unknown action: ${action}` });
        }
      } catch (err) {
        memory.recordAction(sessionId, action, "error");
        res.status(500).json({ error: err.message });
      }
    });

    // ── Memory & Learning routes ──

    app.get(`${prefix}/learnings`, ...middlewares, (req, res) => {
      res.json({ rules: this._memory.getRules(), stats: {
        snapshots: this._memory.getSnapshots().length,
        dismissals: this._memory.getDismissals().length,
        actions: this._memory.getActions().length,
      }});
    });

    app.post(`${prefix}/forget`, ...middlewares, (req, res) => {
      const { ruleId } = req.body;
      if (!ruleId) return res.status(400).json({ error: "ruleId required" });
      this._memory.removeRule(ruleId);
      this.invalidateCache();
      res.json({ ok: true, message: `Rule "${ruleId}" removed` });
    });

    app.get(`${prefix}/trends`, ...middlewares, (req, res) => {
      const briefing = this.getCachedBriefing();
      if (!briefing) return res.json({ trends: [] });
      try {
        res.json({ trends: detectTrends(briefing, this._memory) });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ── Workflow routes ──

    app.get(`${prefix}/workflows`, ...middlewares, (req, res) => {
      res.json({ workflows: this._workflow.listRecipes() });
    });

    // ── Hook management routes ──

    app.get(`${prefix}/hooks`, ...middlewares, (req, res) => {
      res.json({ hooks: this._hookMgr.getHooks() });
    });

    app.post(`${prefix}/hooks/optimize`, ...middlewares, (req, res) => {
      try {
        const changes = this._hookMgr.autoOptimize(this._memory);
        res.json({ ok: true, changes, message: changes.length > 0
          ? `${changes.length} hook change${changes.length !== 1 ? "s" : ""} applied`
          : "No hook changes needed" });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post(`${prefix}/hooks/add`, ...middlewares, (req, res) => {
      const { event, matcher, command, id } = req.body;
      if (!event || !command || !id) return res.status(400).json({ error: "event, command, and id required" });
      const added = this._hookMgr.addHook(event, matcher || "", command, id);
      res.json({ ok: true, added, message: added ? `Hook "${id}" added to ${event}` : `Hook "${id}" already exists` });
    });

    app.delete(`${prefix}/hooks/:id`, ...middlewares, (req, res) => {
      const { event } = req.query;
      const { id } = req.params;
      if (!event) return res.status(400).json({ error: "event query param required" });
      const removed = this._hookMgr.removeHook(event, id);
      res.json({ ok: true, removed, message: removed ? `Hook "${id}" removed` : `Hook "${id}" not found in ${event}` });
    });

    // ── Agent management routes ──

    app.get(`${prefix}/agents`, ...middlewares, (req, res) => {
      res.json({ agents: this._agentMgr.listAgents() });
    });

    app.post(`${prefix}/agents/ensure`, ...middlewares, (req, res) => {
      try {
        this._agentMgr.ensureAgents();
        res.json({ ok: true, message: "Agent definition files ensured", agents: this._agentMgr.listAgents() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post(`${prefix}/agents/recommend`, ...middlewares, (req, res) => {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: "sessionId required" });
      const session = this._cache.briefing?.sessions?.find(s => s.id === sessionId);
      if (!session) return res.status(404).json({ error: "Session not found in cached briefing" });
      const agents = this._agentMgr.selectAgentsForProject(session.personality, session.context);
      const project = this._projects.find(p => p.id === sessionId);
      res.json({
        agents,
        workflow: session.workflow,
        message: agents.length > 0
          ? `${agents.length} specialized agent${agents.length !== 1 ? "s" : ""} recommended for ${project?.name || sessionId}`
          : "Standard workflow — no specialized agents needed for this project",
      });
    });
  }
}

module.exports = { Jarvis };

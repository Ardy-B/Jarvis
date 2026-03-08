/**
 * JARVIS UI — Floating Orb Assistant with Powers Panel
 * Loaded via synchronous XHR + Babel.transform in index.html
 * Exports on window.JarvisUI
 */
(function() {
  const { useState, useEffect, useCallback, useRef, useMemo } = React;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function formatTimeAgoClient(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function authHeaders(getAuthToken) {
    const h = { "Content-Type": "application/json" };
    if (getAuthToken) h.Authorization = `Bearer ${getAuthToken()}`;
    return h;
  }

  // ── InsightCard ─────────────────────────────────────────────────────────

  function InsightCard({ insight, onDismiss, onAction }) {
    const iconMap = { git: "\u2325", security: "\uD83D\uDEE1", health: "\u2695", activity: "\u23F1" };
    const sevColor = { error: "var(--red)", warning: "var(--amb)", info: "var(--txt3)" };
    const sevBg = { error: "var(--redBg)", warning: "var(--ambBg)", info: "var(--glass2)" };
    const actionLabels = window._jarvisCapabilities?.actions
      ? Object.fromEntries(Object.entries(window._jarvisCapabilities.actions).map(([k, v]) => [k, v.label]))
      : { commit: "Commit", push: "Push", branch: "Branch", install: "Install" };
    const [actionResult, setActionResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState(null);

    const handleAction = (confirmed = false) => {
      if (!onAction || !insight.action) return;
      setLoading(true);
      onAction(insight.action, confirmed).then(r => {
        if (r?.requiresConfirmation) {
          setPendingConfirm({ reason: r.reason, riskLevel: r.riskLevel });
          setLoading(false);
        } else {
          setPendingConfirm(null);
          setActionResult(r?.message || (r?.error ? "Error: " + r.error : "Done"));
          setLoading(false);
          setTimeout(() => setActionResult(null), 5000);
        }
      }).catch(() => { setLoading(false); });
    };

    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8,
        background: sevBg[insight.severity] || sevBg.info,
        border:"1px solid color-mix(in srgb, " + (sevColor[insight.severity] || sevColor.info) + " 13%, transparent)",
        backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
        boxShadow:"var(--glass-shd)", transition:"all .2s var(--transition-smooth)",
        fontSize:12, animation:"jarvisFadeIn .25s ease" }}>
        <span style={{ fontSize:14, flexShrink:0 }}>{iconMap[insight.type] || "\u2139"}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, color: sevColor[insight.severity] || sevColor.info }}>{insight.title}</div>
          {actionResult ? (
            <div style={{ color:"var(--grn)", fontSize:11, marginTop:1 }}>{actionResult}</div>
          ) : pendingConfirm ? (
            <div style={{ color:"var(--amb)", fontSize:11, marginTop:1 }}>\u26A0 {pendingConfirm.reason}</div>
          ) : insight.detail && (
            <div style={{ color:"var(--txt3)", fontSize:11, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{insight.detail}</div>
          )}
        </div>
        {insight.action && onAction && !pendingConfirm && (
          <button onClick={() => handleAction(false)} disabled={loading}
            style={{ background:"var(--accBg)", border:"1px solid var(--acc)", color:"var(--acc)",
              cursor: loading ? "wait" : "pointer", padding:"2px 8px", fontSize:10, fontWeight:600, borderRadius:5, flexShrink:0,
              opacity: loading ? 0.5 : 1, boxShadow:"var(--glass-edge)", transition:"all .15s var(--transition-smooth)" }}>
            {loading ? "..." : actionLabels[insight.action] || insight.action}
          </button>
        )}
        {pendingConfirm && (
          <div style={{ display:"flex", gap:4, flexShrink:0 }}>
            <button onClick={() => handleAction(true)} disabled={loading}
              style={{ background:"var(--ambBg)", border:"1px solid var(--amb)", color:"var(--amb)",
                cursor:"pointer", padding:"2px 8px", fontSize:10, fontWeight:600, borderRadius:5,
                boxShadow:"var(--glass-edge)", transition:"all .15s var(--transition-smooth)" }}>
              {loading ? "..." : "Confirm"}
            </button>
            <button onClick={() => setPendingConfirm(null)}
              style={{ background:"transparent", border:"1px solid var(--glass-border)", color:"var(--txt4)",
                cursor:"pointer", padding:"2px 8px", fontSize:10, fontWeight:600, borderRadius:5 }}>
              Cancel
            </button>
          </div>
        )}
        {onDismiss && <button onClick={() => onDismiss(insight.id)} style={{ background:"transparent", border:"none", color:"var(--txt4)",
          cursor:"pointer", padding:2, fontSize:14, lineHeight:1, flexShrink:0 }} title="Dismiss">{"\u00D7"}</button>}
      </div>
    );
  }

  // ── SessionCard ─────────────────────────────────────────────────────────

  function SessionCard({ session, onResume }) {
    const st = { idle: { color: "var(--txt4)", label: "Idle" }, busy: { color: "var(--grnDot)", label: "Running" }, error: { color: "var(--redDot)", label: "Error" } };
    const s = st[session.status] || st.idle;
    const timeAgo = session.lastActivityAt ? formatTimeAgoClient(session.lastActivityAt) : "No activity";
    return (
      <div style={{ minWidth:160, maxWidth:200, padding:10, borderRadius:10,
        background:"var(--glass2)", border:"1px solid var(--glass-border)", flexShrink:0,
        backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)", boxShadow:"var(--glass-shd)",
        display:"flex", flexDirection:"column", gap:5, cursor:"pointer", transition:"all .25s var(--transition-smooth)" }}
        onClick={() => onResume && onResume(session.id)}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--glass-hover)"; e.currentTarget.style.boxShadow = "var(--glass-shd2)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "var(--glass2)"; e.currentTarget.style.boxShadow = "var(--glass-shd)"; e.currentTarget.style.transform = "translateY(0)"; }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:s.color, flexShrink:0,
            animation: session.status === "busy" ? "pulse 2s infinite" : "none" }}/>
          <span style={{ fontWeight:600, fontSize:12, color:"var(--txt)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{session.name}</span>
        </div>
        <div style={{ fontSize:10, color:"var(--txt3)" }}>{timeAgo}</div>
        {session.lastAssistantMessage && (
          <div style={{ fontSize:10, color:"var(--txt4)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
            fontStyle:"italic", borderTop:"1px solid var(--glass-border2)", paddingTop:3, marginTop:1 }}>
            {session.lastAssistantMessage.slice(0, 60)}
          </div>
        )}
        {session.context?.techStack?.length > 0 && (
          <div style={{ fontSize:9, color:"var(--txt4)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {session.context.techStack.slice(0, 4).join(" \u00B7 ")}
          </div>
        )}
        <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginTop:1 }}>
          {session.git?.branch && session.git.branch !== "main" && session.git.branch !== "master" && (
            <span style={{ fontSize:9, fontWeight:600, padding:"1px 4px", borderRadius:3, background:"var(--glass3)", color:"var(--txt3)" }}>
              {session.git.branch.length > 20 ? session.git.branch.slice(0, 18) + "\u2026" : session.git.branch}
            </span>
          )}
          {session.git?.uncommittedCount > 0 && (
            <span style={{ fontSize:9, fontWeight:600, padding:"1px 4px", borderRadius:3, background:"var(--ambBg)", color:"var(--amb)" }}>
              {session.git.uncommittedCount} uncommitted
            </span>
          )}
          {session.git?.unpushedCount > 0 && (
            <span style={{ fontSize:9, fontWeight:600, padding:"1px 4px", borderRadius:3, background:"var(--accBg)", color:"var(--acc)" }}>
              {session.git.unpushedCount} unpushed
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── SiriOrb — futuristic arc-reactor / holographic core ─────────────

  function SiriOrb({ isActive, hasCritical, isHovered }) {
    const canvasRef = useRef(null);
    const animRef = useRef(null);
    const startTime = useRef(Date.now());
    const stateRef = useRef({ isActive, hasCritical, isHovered });
    stateRef.current = { isActive, hasCritical, isHovered };
    const particles = useRef(null);
    if (!particles.current) {
      particles.current = Array.from({ length: 18 }, (_, i) => ({
        angle: (Math.PI * 2 * i) / 18 + Math.random() * 0.3,
        radius: 0.25 + Math.random() * 0.55,
        speed: 0.2 + Math.random() * 0.6,
        size: 0.5 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.4,
      }));
    }

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const S = 160;
      canvas.width = S; canvas.height = S;
      const cx = S / 2, cy = S / 2, R = S / 2 - 6;
      const PI2 = Math.PI * 2;
      let running = true, paused = false;

      function draw() {
        if (!running) return;
        if (paused) { animRef.current = requestAnimationFrame(draw); return; }
        const { isActive: active, hasCritical: crit, isHovered: hov } = stateRef.current;
        const t = (Date.now() - startTime.current) / 1000;
        const speed = crit ? 2.0 : active ? 1.3 : 0.7;
        const st = t * speed;
        ctx.clearRect(0, 0, S, S);

        const hue1 = crit ? 0 : active ? 160 : 210;
        const hue2 = crit ? 30 : active ? 220 : 270;
        const hue3 = crit ? 340 : active ? 280 : 310;
        const sat = crit ? 90 : 80;
        const lum = crit ? 55 : active ? 60 : 65;

        // 1. Background
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        bgGrad.addColorStop(0, `hsla(${hue1}, 40%, 8%, 0.95)`);
        bgGrad.addColorStop(0.6, `hsla(${hue2}, 30%, 4%, 0.8)`);
        bgGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, PI2); ctx.fillStyle = bgGrad; ctx.fill();

        // 2. Hex grid
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(st * 0.08);
        ctx.globalAlpha = hov ? 0.18 : 0.09;
        const hexR = 9;
        const hexH = hexR * Math.sqrt(3);
        for (let row = -5; row <= 5; row++) {
          for (let col = -5; col <= 5; col++) {
            const hx = col * hexR * 1.5;
            const hy = row * hexH + (col % 2 ? hexH / 2 : 0);
            if (hx * hx + hy * hy > (R * 0.85) * (R * 0.85)) continue;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const a = PI2 / 6 * i - Math.PI / 6;
              const px = hx + Math.cos(a) * hexR * 0.48;
              const py = hy + Math.sin(a) * hexR * 0.48;
              i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.strokeStyle = `hsla(${hue1 + 30}, ${sat}%, ${lum + 15}%, 1)`;
            ctx.lineWidth = 0.4;
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // 3. Scanning rings
        for (let ri = 0; ri < 2; ri++) {
          const ringR = R * (0.55 + ri * 0.22);
          const rot = st * (ri === 0 ? 0.5 : -0.35) + ri * 1.5;
          const tilt = 0.55 + Math.sin(st * 0.3 + ri) * 0.15;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.scale(1, tilt);
          const arcLen = Math.PI * (1.2 + Math.sin(st * 0.4 + ri) * 0.3);
          const arcStart = st * (ri === 0 ? 0.7 : -0.5);
          ctx.beginPath();
          ctx.arc(0, 0, ringR, arcStart, arcStart + arcLen);
          ctx.strokeStyle = `hsla(${hue1 + ri * 40}, ${sat}%, ${lum + 10}%, ${hov ? 0.6 : 0.35})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          const tickCount = 12;
          for (let ti = 0; ti < tickCount; ti++) {
            const ta = arcStart + (arcLen / tickCount) * ti;
            const inner = ringR - 2;
            const outer = ringR + 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ta) * inner, Math.sin(ta) * inner);
            ctx.lineTo(Math.cos(ta) * outer, Math.sin(ta) * outer);
            ctx.strokeStyle = `hsla(${hue1 + ri * 40}, ${sat}%, ${lum}%, 0.25)`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
          const tipA = arcStart + arcLen;
          ctx.beginPath();
          ctx.arc(Math.cos(tipA) * ringR, Math.sin(tipA) * ringR, 2, 0, PI2);
          ctx.fillStyle = `hsla(${hue1 + ri * 40}, ${sat}%, ${lum + 20}%, 0.9)`;
          ctx.fill();
          ctx.restore();
        }

        // 4. Reactor core
        const coreR = R * (0.22 + Math.sin(st * 1.5) * 0.03);
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.5);
        coreGrad.addColorStop(0, `hsla(${hue1}, ${sat}%, 92%, 0.95)`);
        coreGrad.addColorStop(0.15, `hsla(${hue1}, ${sat}%, ${lum + 20}%, 0.8)`);
        coreGrad.addColorStop(0.4, `hsla(${hue2}, ${sat - 10}%, ${lum}%, 0.3)`);
        coreGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.5, 0, PI2);
        ctx.fillStyle = coreGrad; ctx.fill();

        const hotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        hotGrad.addColorStop(0, "rgba(255,255,255,0.95)");
        hotGrad.addColorStop(0.5, `hsla(${hue1}, 60%, 85%, 0.7)`);
        hotGrad.addColorStop(1, `hsla(${hue1}, ${sat}%, ${lum}%, 0)`);
        ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, PI2);
        ctx.fillStyle = hotGrad; ctx.fill();

        // 5. Data particles
        const pts = particles.current;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const pa = p.angle + st * p.speed + Math.sin(st * 0.3 + p.phase) * p.drift;
          const pr = R * p.radius + Math.sin(st * 0.8 + p.phase) * 4;
          const px = cx + Math.cos(pa) * pr;
          const py = cy + Math.sin(pa) * pr;
          const alpha = 0.3 + Math.sin(st * 2 + p.phase) * 0.3;
          const pHue = hue1 + (i % 3) * 30;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, PI2);
          ctx.fillStyle = `hsla(${pHue}, ${sat}%, ${lum + 15}%, ${alpha})`;
          ctx.fill();
          const trailA = pa - p.speed * 0.15;
          const tx = cx + Math.cos(trailA) * pr;
          const ty = cy + Math.sin(trailA) * pr;
          ctx.beginPath();
          ctx.moveTo(px, py); ctx.lineTo(tx, ty);
          ctx.strokeStyle = `hsla(${pHue}, ${sat}%, ${lum + 15}%, ${alpha * 0.3})`;
          ctx.lineWidth = p.size * 0.5;
          ctx.stroke();
        }

        // 6. Electric arcs
        if (active || crit || hov) {
          const arcCount = crit ? 3 : hov ? 2 : 1;
          for (let ai = 0; ai < arcCount; ai++) {
            const arcAngle = st * 1.2 + ai * (PI2 / arcCount) + Math.sin(st * 3 + ai) * 0.5;
            const segments = 6;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (let si = 1; si <= segments; si++) {
              const frac = si / segments;
              const baseX = cx + Math.cos(arcAngle) * R * 0.75 * frac;
              const baseY = cy + Math.sin(arcAngle) * R * 0.75 * frac;
              const jitter = (1 - frac) * 8;
              const jx = baseX + (Math.sin(st * 12 + si * 3 + ai) * jitter);
              const jy = baseY + (Math.cos(st * 14 + si * 5 + ai) * jitter);
              ctx.lineTo(jx, jy);
            }
            ctx.strokeStyle = `hsla(${hue1}, ${sat}%, ${lum + 25}%, ${0.15 + Math.sin(st * 5 + ai) * 0.1})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // 7. Edge fade
        const edgeGrad = ctx.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
        edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
        edgeGrad.addColorStop(0.6, "rgba(0,0,0,0)");
        edgeGrad.addColorStop(1, `hsla(${hue1}, ${sat}%, ${lum + 20}%, ${hov ? 0.08 : 0.03})`);
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, PI2);
        ctx.fillStyle = edgeGrad; ctx.fill();

        // Clip
        ctx.globalCompositeOperation = "destination-in";
        ctx.beginPath(); ctx.arc(cx, cy, R + 2, 0, PI2); ctx.fillStyle = "#fff"; ctx.fill();
        ctx.globalCompositeOperation = "source-over";

        animRef.current = requestAnimationFrame(draw);
      }

      function onVisChange() { paused = document.hidden; }
      document.addEventListener("visibilitychange", onVisChange);
      draw();
      return () => { running = false; cancelAnimationFrame(animRef.current); document.removeEventListener("visibilitychange", onVisChange); };
    }, []);

    return (
      <div style={{
        width: 64, height: 64, position: "relative", cursor: "pointer",
        animation: hasCritical ? "jarvisOrbPulse 1.8s ease-in-out infinite" : "jarvisOrbBreathe 5s ease-in-out infinite",
      }}>
        <div style={{
          position: "absolute", inset: -28, borderRadius: "50%", pointerEvents: "none",
          background: hasCritical
            ? "radial-gradient(circle, color-mix(in srgb, var(--red) 35%, transparent) 0%, color-mix(in srgb, var(--red) 15%, transparent) 25%, color-mix(in srgb, var(--red) 6%, transparent) 50%, transparent 72%)"
            : isActive
              ? "radial-gradient(circle, color-mix(in srgb, var(--grn) 25%, transparent) 0%, color-mix(in srgb, var(--acc) 12%, transparent) 25%, color-mix(in srgb, var(--acc) 5%, transparent) 50%, transparent 72%)"
              : "radial-gradient(circle, color-mix(in srgb, var(--acc) 22%, transparent) 0%, color-mix(in srgb, var(--acc) 10%, transparent) 25%, color-mix(in srgb, var(--acc) 4%, transparent) 50%, transparent 72%)",
          animation: "jarvisGlowPulse 3s ease-in-out infinite",
          filter: "blur(12px)",
        }}/>
        <div style={{
          position: "absolute", inset: -14, borderRadius: "50%", pointerEvents: "none",
          background: hasCritical
            ? "radial-gradient(circle, color-mix(in srgb, var(--red) 20%, transparent) 0%, transparent 65%)"
            : isActive
              ? "radial-gradient(circle, color-mix(in srgb, var(--grn) 15%, transparent) 0%, transparent 65%)"
              : "radial-gradient(circle, color-mix(in srgb, var(--acc) 15%, transparent) 0%, transparent 65%)",
          filter: "blur(4px)",
          opacity: isHovered ? 1 : 0.6, transition: "opacity .4s",
        }}/>
        <canvas ref={canvasRef} style={{
          position: "absolute", inset: 0, width: 64, height: 64, borderRadius: "50%", pointerEvents: "none",
        }}/>
      </div>
    );
  }

  // ── PowersPanel — Jarvis capabilities dashboard ─────────────────────

  function PowersPanel({ powers, onRunImprove, onForgetRule, onOptimizeHooks, onEnsureAgents, onRecommendAgents, onBack, sessions }) {
    const [activeTab, setActiveTab] = useState("agents");
    const [improving, setImproving] = useState(false);
    const [improveResult, setImproveResult] = useState(null);
    const [optimizingHooks, setOptimizingHooks] = useState(false);
    const [hookResult, setHookResult] = useState(null);
    const [ensuringAgents, setEnsuringAgents] = useState(false);
    const [agentResult, setAgentResult] = useState(null);
    const [recommendResult, setRecommendResult] = useState(null);
    const [selectedSession, setSelectedSession] = useState(null);

    const tabs = [
      { id: "agents", label: "\🤖 Agents" },
      { id: "workflows", label: "\🔄 Workflows" },
      { id: "improve", label: "\🧠 Improve" },
      { id: "learnings", label: "\📚 Rules" },
      { id: "hooks", label: "\🔗 Hooks" },
    ];

    const handleImprove = async () => {
      setImproving(true);
      setImproveResult(null);
      try {
        const r = await onRunImprove();
        setImproveResult(r);
      } catch (e) {
        setImproveResult({ error: e.message });
      }
      setImproving(false);
    };

    const handleOptimizeHooks = async () => {
      setOptimizingHooks(true);
      setHookResult(null);
      try {
        const r = await onOptimizeHooks();
        setHookResult(r);
      } catch (e) {
        setHookResult({ error: e.message });
      }
      setOptimizingHooks(false);
    };

    const handleEnsureAgents = async () => {
      setEnsuringAgents(true);
      setAgentResult(null);
      try {
        const r = await onEnsureAgents();
        setAgentResult(r);
      } catch (e) {
        setAgentResult({ error: e.message });
      }
      setEnsuringAgents(false);
    };

    const handleRecommend = async (sessionId) => {
      setSelectedSession(sessionId);
      setRecommendResult(null);
      try {
        const r = await onRecommendAgents(sessionId);
        setRecommendResult(r);
      } catch (e) {
        setRecommendResult({ error: e.message });
      }
    };

    const tabBtnStyle = (active) => ({
      background: active ? "var(--accBg)" : "var(--glass2)",
      border: active ? "1px solid var(--acc)" : "1px solid transparent",
      color: active ? "var(--acc)" : "var(--txt4)",
      cursor: "pointer", padding: "3px 8px", fontSize: 10, fontWeight: 600,
      borderRadius: 6, transition: "all .15s var(--transition-smooth)", whiteSpace: "nowrap",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      boxShadow: active ? "var(--glass-edge)" : "none",
    });

    const sectionLabel = { fontSize: 10, fontWeight: 700, color: "var(--txt4)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 };
    const cardStyle = { padding: "8px 10px", borderRadius: 8, background: "var(--glass2)", border: "1px solid var(--glass-border)", fontSize: 11,
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "var(--glass-shd)" };
    const smallBtn = (color = "var(--acc)") => ({
      background: "transparent", border: `1px solid ${color}`, color,
      cursor: "pointer", padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 5,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", transition: "all .15s var(--transition-smooth)",
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Back button + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--txt3)", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>\u2190</button>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--txt)", letterSpacing: .5, fontFamily: "'Rajdhani',sans-serif" }}>POWERS</div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={tabBtnStyle(activeTab === t.id)}>{t.label}</button>
          ))}
        </div>

        {/* ── Agents Tab ── */}
        {activeTab === "agents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={sectionLabel}>Specialized Agents</div>
            {(powers.agents || []).map(a => (
              <div key={a.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--glass3)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                  {a.id === "security-deep" ? "\🛡" : a.id === "dependency-graph" ? "\📦" : "\u26A1"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--txt)", fontSize: 11 }}>{a.name.replace("Jarvis ", "")}</div>
                  <div style={{ fontSize: 10, color: "var(--txt4)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</div>
                </div>
                {a.exists && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "var(--grnBg, var(--glass3))", color: "var(--grn)", fontWeight: 700 }}>READY</span>}
              </div>
            ))}
            <button onClick={handleEnsureAgents} disabled={ensuringAgents}
              style={{ ...smallBtn(), opacity: ensuringAgents ? 0.5 : 1, alignSelf: "flex-start", marginTop: 2 }}>
              {ensuringAgents ? "Setting up..." : "\🔧 Ensure All Agents"}
            </button>
            {agentResult && (
              <div style={{ fontSize: 10, color: agentResult.error ? "var(--red)" : "var(--grn)", padding: "4px 8px", borderRadius: 6, background: "var(--glass2)" }}>
                {agentResult.error || agentResult.message}
              </div>
            )}

            {/* Recommend for session */}
            {sessions?.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={sectionLabel}>Recommend for Session</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {sessions.slice(0, 6).map(s => (
                    <button key={s.id} onClick={() => handleRecommend(s.id)}
                      style={{ ...smallBtn(selectedSession === s.id ? "var(--acc)" : "var(--txt4)"),
                        background: selectedSession === s.id ? "var(--accBg)" : "transparent",
                        fontSize: 9 }}>
                      {s.name.slice(0, 15)}
                    </button>
                  ))}
                </div>
                {recommendResult && (
                  <div style={{ fontSize: 10, color: "var(--txt3)", padding: "6px 8px", borderRadius: 6, background: "var(--glass2)", marginTop: 4 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{recommendResult.message}</div>
                    {recommendResult.workflow && <div style={{ fontSize: 9, color: "var(--txt4)" }}>Workflow: {recommendResult.workflow}</div>}
                    {recommendResult.agents?.length > 0 && (
                      <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
                        {recommendResult.agents.map(a => (
                          <span key={a.id} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "var(--accBg)", color: "var(--acc)", fontWeight: 600 }}>{a.name.replace("Jarvis ","")}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Workflows Tab ── */}
        {activeTab === "workflows" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={sectionLabel}>Scan Recipes</div>
            {(powers.workflows || []).map(w => {
              const icons = { "security-deep": "\🛡", "maintenance-minimal": "\🔧", "performance-focus": "\u26A1",
                "team-full": "\👥", "solo-quick": "\🏃", "standard": "\📋" };
              return (
                <div key={w.name} style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icons[w.name] || "\📋"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "var(--txt)", fontSize: 11 }}>{w.name}</div>
                    <div style={{ fontSize: 10, color: "var(--txt4)", marginTop: 1 }}>{w.description}</div>
                    <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                      {w.tasks.map(t => (
                        <span key={t} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "var(--glass3)", color: "var(--txt3)" }}>{t}</span>
                      ))}
                      {w.extras?.map(e => (
                        <span key={e} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "var(--accBg)", color: "var(--acc)" }}>{e}</span>
                      ))}
                    </div>
                  </div>
                  {w.parallel && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "var(--glass3)", color: "var(--txt4)" }}>\u2225</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Improve Tab ── */}
        {activeTab === "improve" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={sectionLabel}>Self-Improvement</div>
            <div style={{ fontSize: 11, color: "var(--txt3)", lineHeight: 1.4 }}>
              Jarvis analyzes usage patterns, suppresses noisy insights, and generates project-specific rules to improve signal quality.
            </div>
            <button onClick={handleImprove} disabled={improving}
              style={{ ...smallBtn(), opacity: improving ? 0.5 : 1, alignSelf: "flex-start" }}>
              {improving ? "\🧠 Running improvement cycle..." : "\🧠 Run Improvement Cycle"}
            </button>
            {improveResult && (
              <div style={{ fontSize: 10, color: improveResult.error ? "var(--red)" : "var(--grn)",
                padding: "6px 8px", borderRadius: 6, background: "var(--glass2)" }}>
                {improveResult.error || improveResult.message}
                {improveResult.changes?.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                    {improveResult.changes.map((c, i) => (
                      <div key={i} style={{ fontSize: 9, color: "var(--txt4)" }}>\u2022 {typeof c === "string" ? c : JSON.stringify(c)}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Improvement log */}
            {powers.improveLog?.length > 0 && (
              <div>
                <div style={{ ...sectionLabel, marginTop: 4 }}>Recent Improvements ({powers.improveLog.length})</div>
                {powers.improveLog.slice(-5).reverse().map((entry, i) => (
                  <div key={i} style={{ ...cardStyle, marginBottom: 4 }}>
                    <div style={{ fontSize: 9, color: "var(--txt4)" }}>{entry.ts ? formatTimeAgoClient(entry.ts) : "Unknown time"}</div>
                    <div style={{ fontSize: 10, color: "var(--txt3)", marginTop: 2 }}>{entry.description || entry.type || JSON.stringify(entry).slice(0, 80)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Stats */}
            {powers.learningStats && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["Snapshots", powers.learningStats.snapshots], ["Dismissals", powers.learningStats.dismissals], ["Actions", powers.learningStats.actions]].map(([label, val]) => (
                  <div key={label} style={{ ...cardStyle, textAlign: "center", flex: "1 1 60px", minWidth: 60 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--txt)" }}>{val}</div>
                    <div style={{ fontSize: 9, color: "var(--txt4)" }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Learnings Tab ── */}
        {activeTab === "learnings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={sectionLabel}>Learned Rules</div>
            {(!powers.learnings || powers.learnings.length === 0) ? (
              <div style={{ ...cardStyle, color: "var(--txt4)", fontStyle: "italic", textAlign: "center" }}>
                No rules learned yet \u2014 dismiss insights to teach Jarvis
              </div>
            ) : (
              powers.learnings.map(rule => (
                <div key={rule.id || rule.ruleId} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--txt)", fontSize: 11 }}>{rule.type || rule.id}</div>
                    {rule.reason && <div style={{ fontSize: 10, color: "var(--txt4)", marginTop: 1 }}>{rule.reason}</div>}
                  </div>
                  <button onClick={() => onForgetRule(rule.id || rule.ruleId)}
                    style={smallBtn("var(--red)")}>Forget</button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Hooks Tab ── */}
        {activeTab === "hooks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={sectionLabel}>Claude Code Hooks</div>
            {powers.hooks && Object.entries(powers.hooks).map(([event, entries]) => (
              <div key={event}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--acc)", marginBottom: 4 }}>{event}</div>
                {entries.map((entry, ei) => (
                  <div key={ei} style={{ ...cardStyle, marginBottom: 3, fontSize: 10 }}>
                    {entry.matcher && <span style={{ fontWeight: 600, color: "var(--txt3)" }}>[{entry.matcher}] </span>}
                    {entry.hooks?.map((h, hi) => (
                      <div key={hi} style={{ color: "var(--txt4)", fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 9,
                        marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.command}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {(!powers.hooks || Object.keys(powers.hooks).length === 0) && (
              <div style={{ ...cardStyle, color: "var(--txt4)", fontStyle: "italic", textAlign: "center" }}>No hooks configured</div>
            )}
            <button onClick={handleOptimizeHooks} disabled={optimizingHooks}
              style={{ ...smallBtn(), opacity: optimizingHooks ? 0.5 : 1, alignSelf: "flex-start", marginTop: 2 }}>
              {optimizingHooks ? "Optimizing..." : "\u26A1 Auto-Optimize Hooks"}
            </button>
            {hookResult && (
              <div style={{ fontSize: 10, color: hookResult.error ? "var(--red)" : "var(--grn)", padding: "4px 8px", borderRadius: 6, background: "var(--glass2)" }}>
                {hookResult.error || hookResult.message}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── FloatingBubble — orb + expanded panel ─────────────────────────────

  function FloatingBubble({ briefing, isExpanded, onToggle, onResume, onDismissInsight, onAction, onRefresh, isDesktop,
    powersOpen, onTogglePowers, onToggleDeepDive, powers, onRunImprove, onForgetRule, onOptimizeHooks, onEnsureAgents, onRecommendAgents, sessions }) {
    const [isHovered, setIsHovered] = useState(false);
    const [position, setPosition] = useState(() => {
      try {
        const saved = localStorage.getItem("mc-jarvis-pos");
        if (saved) return JSON.parse(saved);
      } catch {}
      return { bottom: isDesktop ? 24 : 90, right: isDesktop ? 24 : 16 };
    });
    const posRef = useRef(position);
    posRef.current = position;
    const dragState = useRef({ startX:0, startY:0, startBottom:0, startRight:0, moved:false, dragging:false });

    const handleClick = useCallback((e) => {
      if (dragState.current.moved) return;
      e.stopPropagation();
      onToggle();
    }, [onToggle]);

    const onPointerDown = useCallback((e) => {
      if (isExpanded) return;
      dragState.current = { startX: e.clientX, startY: e.clientY, startBottom: posRef.current.bottom, startRight: posRef.current.right, moved: false, dragging: true };
      e.currentTarget.setPointerCapture(e.pointerId);
    }, [isExpanded]);

    const onPointerMove = useCallback((e) => {
      if (!dragState.current.dragging) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.current.moved = true;
      if (dragState.current.moved) {
        const newPos = {
          bottom: Math.max(8, Math.min(window.innerHeight - 72, dragState.current.startBottom - dy)),
          right:  Math.max(8, Math.min(window.innerWidth  - 72, dragState.current.startRight  - dx)),
        };
        setPosition(newPos);
      }
    }, []);

    const onPointerUp = useCallback((e) => {
      if (!dragState.current.dragging) return;
      dragState.current.dragging = false;
      if (dragState.current.moved) {
        try { localStorage.setItem("mc-jarvis-pos", JSON.stringify(posRef.current)); } catch {}
        setTimeout(() => { dragState.current.moved = false; }, 0);
      }
    }, []);

    const critCount = useMemo(() => {
      if (!briefing) return 0;
      return (briefing.sessions || []).reduce((n, s) => n + (s.insights || []).filter(i => i.severity === "error").length, 0)
        + (briefing.globalInsights || []).filter(i => i.severity === "error").length;
    }, [briefing]);

    const activeCount = useMemo(() => {
      if (!briefing) return 0;
      return (briefing.sessions || []).filter(s => s.status === "busy").length;
    }, [briefing]);

    const { criticalInsights, otherInsights } = useMemo(() => {
      const critical = [];
      const other = [];
      if (!briefing) return { criticalInsights: critical, otherInsights: other };
      (briefing.sessions || []).forEach(s => {
        (s.insights || []).forEach(i => {
          if (i.severity === "error") critical.push({ ...i, sessionId: s.id, sessionName: s.name });
          else other.push({ ...i, sessionId: s.id, sessionName: s.name });
        });
      });
      (briefing.globalInsights || []).forEach(i => {
        if (i.severity === "error") critical.push(i);
        else other.push(i);
      });
      return { criticalInsights: critical, otherInsights: other };
    }, [briefing]);

    return (
      <div style={{ position:"fixed", bottom: position.bottom, right: position.right, zIndex:9990, pointerEvents:"auto" }}>

        {/* ── Mobile backdrop overlay ── */}
        {!isDesktop && isExpanded && briefing && (
          <div onClick={onToggle} style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,.4)", backdropFilter:"blur(6px)",
            WebkitBackdropFilter:"blur(6px)", zIndex:9991,
          }}/>
        )}

        {/* ── Expanded Panel ── */}
        {isExpanded && briefing && (
          <div style={{
            position: isDesktop ? "absolute" : "fixed",
            bottom: isDesktop ? 70 : 0,
            right: isDesktop ? -8 : 0,
            left: isDesktop ? "auto" : 0,
            width: isDesktop ? 380 : "100%",
            maxHeight: isDesktop ? "min(580px, calc(100vh - 120px))" : "85dvh",
            borderRadius: isDesktop ? 18 : "18px 18px 0 0",
            zIndex: isDesktop ? "auto" : 9992,
            background: "var(--glass)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
            border: "1px solid var(--glass-border)",
            boxShadow: "var(--glass-shd2), var(--glass-glow)",
            animation: "jarvisPanelIn .35s cubic-bezier(.34,1.56,.64,1) forwards",
            overflowY: "auto", overflowX: "hidden", scrollbarWidth: "thin",
            WebkitOverflowScrolling: "touch",
          }}>
            {/* Mobile handle bar */}
            {!isDesktop && (
              <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 4px", position:"sticky", top:0,
                background:"var(--glass)", zIndex:2, borderRadius:"18px 18px 0 0" }}>
                <div style={{ width:36, height:5, borderRadius:3, background:"var(--glass-border)" }}/>
              </div>
            )}
            {/* Header */}
            <div style={{ position:"sticky", top: isDesktop ? 0 : 19, zIndex:1, padding:"14px 16px 10px",
              background:"var(--glass)", backdropFilter:"blur(28px)", WebkitBackdropFilter:"blur(28px)",
              borderBottom:"1px solid var(--glass-border)",
              display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{
                  width:30, height:30, borderRadius:"50%", flexShrink:0,
                  background: critCount > 0
                    ? "conic-gradient(from 45deg, var(--red), color-mix(in srgb, var(--red) 60%, var(--acc)), color-mix(in srgb, var(--red) 50%, var(--acc) 50%), var(--red))"
                    : activeCount > 0
                      ? "conic-gradient(from 45deg, var(--grn), var(--acc), color-mix(in srgb, var(--acc) 50%, var(--grn)), var(--grn))"
                      : "conic-gradient(from 45deg, var(--acc), color-mix(in srgb, var(--acc) 50%, var(--grn)), color-mix(in srgb, var(--red) 30%, var(--acc)), var(--acc))",
                  animation: "spin 4s linear infinite",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:"var(--glass3)",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>J</div>
                </div>
                <div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:15, fontWeight:700, color:"var(--txt)", lineHeight:1.2 }}>
                    {powersOpen ? "J.A.R.V.I.S Powers" : (briefing.greeting || "Jarvis")}
                  </div>
                  {!powersOpen && <div style={{ fontSize:11, color:"var(--txt3)", lineHeight:1.2 }}>{briefing.headline}</div>}
                  {!powersOpen && briefing.summary && briefing.summary !== briefing.headline && (
                    <div style={{ fontSize:10, color:"var(--txt4)", lineHeight:1.3, marginTop:2, fontStyle:"italic" }}>{briefing.summary}</div>
                  )}
                  {powersOpen && <div style={{ fontSize:10, color:"var(--txt4)", lineHeight:1.2 }}>Activate and configure capabilities</div>}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                {/* Powers toggle */}
                <button onClick={(e) => { e.stopPropagation(); onTogglePowers(); }}
                  title={powersOpen ? "Back to briefing" : "Powers"}
                  style={{ background: powersOpen ? "var(--accBg)" : "transparent",
                    border: powersOpen ? "1px solid var(--acc)" : "none",
                    color: powersOpen ? "var(--acc)" : "var(--txt4)", cursor:"pointer", padding:4, fontSize:13,
                    transition:"all .15s", borderRadius:6 }}
                  onMouseEnter={e => { if (!powersOpen) e.currentTarget.style.color = "var(--acc)"; }}
                  onMouseLeave={e => { if (!powersOpen) e.currentTarget.style.color = "var(--txt4)"; }}>\u26A1</button>
                {!powersOpen && onToggleDeepDive && (
                  <button onClick={(e) => { e.stopPropagation(); onToggleDeepDive(); }} title="Deep Dive — Full Screen Analysis"
                    style={{ background:"transparent", border:"1px solid var(--glass-border)", color:"var(--txt4)", cursor:"pointer", padding:"2px 8px", fontSize:10,
                      fontWeight:600, transition:"all .15s", borderRadius:6, display:"flex", alignItems:"center", gap:3 }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--acc)"; e.currentTarget.style.borderColor = "var(--acc)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--txt4)"; e.currentTarget.style.borderColor = "var(--glass-border)"; }}>
                    {"\u26A1"} Deep Dive
                  </button>
                )}
                {!powersOpen && (
                  <button onClick={(e) => { e.stopPropagation(); onRefresh(); }} title="Refresh"
                    style={{ background:"transparent", border:"none", color:"var(--txt4)", cursor:"pointer", padding:4, fontSize:14,
                      transition:"color .15s", borderRadius:6 }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--txt)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--txt4)"}>{"\u21BB"}</button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onToggle(); }} title="Close"
                  style={{ background:"transparent", border:"none", color:"var(--txt4)", cursor:"pointer", padding:4, fontSize:14,
                    transition:"color .15s", borderRadius:6 }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--txt)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--txt4)"}>{"\u2715"}</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding:"10px 14px 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {powersOpen ? (
                <PowersPanel
                  powers={powers}
                  onRunImprove={onRunImprove}
                  onForgetRule={onForgetRule}
                  onOptimizeHooks={onOptimizeHooks}
                  onEnsureAgents={onEnsureAgents}
                  onRecommendAgents={onRecommendAgents}
                  onBack={onTogglePowers}
                  sessions={briefing.sessions}
                />
              ) : (
                <>
                  {criticalInsights.length > 0 && (
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--red)", textTransform:"uppercase", letterSpacing:.5 }}>
                        Needs Attention
                      </div>
                      {criticalInsights.map(i => <InsightCard key={i.id} insight={i} onDismiss={onDismissInsight}
                        onAction={i.action && i.sessionId && onAction ? (action, confirmed) => onAction(i.sessionId, action, confirmed) : null}/>)}
                    </div>
                  )}

                  {briefing.sessions?.length > 0 && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--txt4)", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>
                        Sessions ({briefing.sessions.length})
                      </div>
                      <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, scrollbarWidth:"thin", WebkitOverflowScrolling:"touch" }}>
                        {briefing.sessions.map(s => <SessionCard key={s.id} session={s} onResume={onResume}/>)}
                      </div>
                    </div>
                  )}

                  {otherInsights.length > 0 && (
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--txt4)", textTransform:"uppercase", letterSpacing:.5 }}>
                        Insights ({otherInsights.length})
                      </div>
                      {otherInsights.slice(0, 4).map(i => <InsightCard key={i.id} insight={i} onDismiss={onDismissInsight}
                        onAction={i.action && i.sessionId && onAction ? (action, confirmed) => onAction(i.sessionId, action, confirmed) : null}/>)}
                      {otherInsights.length > 4 && (
                        <div style={{ fontSize:11, color:"var(--txt4)", paddingLeft:4 }}>+{otherInsights.length - 4} more</div>
                      )}
                    </div>
                  )}

                  {briefing.trends?.length > 0 && (
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--txt4)", textTransform:"uppercase", letterSpacing:.5 }}>
                        Trends
                      </div>
                      {briefing.trends.map(t => (
                        <div key={t.id} style={{ fontSize:11, padding:"4px 8px", borderRadius:6,
                          background:"var(--glass2)", border:"1px solid var(--glass-border)",
                          backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
                          color: t.severity === "warning" ? "var(--amb)" : "var(--txt3)" }}>
                          <span style={{ fontWeight:600 }}>{t.title}</span>
                          {t.detail && <span style={{ color:"var(--txt4)" }}> \u2014 {t.detail}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize:10, color:"var(--txt4)", textAlign:"center", paddingTop:4,
                    paddingBottom: isDesktop ? 0 : "max(4px, env(safe-area-inset-bottom))",
                    borderTop:"1px solid var(--glass-border)",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    <span>{isDesktop ? "Ctrl+J toggle \u00B7 Ctrl+Shift+J deep dive" : "Tap orb to toggle"}</span>
                    {briefing.signalQuality !== null && briefing.signalQuality !== undefined && (
                      <span style={{ padding:"1px 6px", borderRadius:4,
                        background: briefing.signalQuality >= 40 ? "var(--glass2)" : "var(--ambBg)",
                        color: briefing.signalQuality >= 40 ? "var(--txt4)" : "var(--amb)",
                        fontWeight:600 }}>
                        signal {briefing.signalQuality}%
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── The Orb ── */}
        <div
          onClick={handleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{ position:"relative", userSelect:"none", touchAction:"none" }}
        >
          <SiriOrb
            isActive={activeCount > 0}
            hasCritical={critCount > 0}
            isHovered={isHovered}
          />

          {/* Badge */}
          {critCount > 0 && (
            <div style={{
              position:"absolute", top:-4, right:-4,
              minWidth:18, height:18, borderRadius:9, padding:"0 5px",
              background:"linear-gradient(135deg, var(--red), var(--ambDot))",
              color:"var(--bg)", fontSize:10, fontWeight:700,
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 2px 8px color-mix(in srgb, var(--red) 50%, transparent)",
              animation:"jarvisBadgePop .3s cubic-bezier(.34,1.56,.64,1)",
              border:"2px solid var(--bg)", zIndex:1, pointerEvents:"none",
            }}>
              {critCount}
            </div>
          )}

          {/* Hover label */}
          {!isExpanded && isHovered && (
            <div style={{
              position:"absolute", left:"50%", top:-32, transform:"translateX(-50%)",
              padding:"3px 10px", borderRadius:4,
              background:"var(--glass)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
              border:"1px solid var(--glass-border)",
              boxShadow:"var(--glass-shd)",
              fontSize:9, fontWeight:700, color:"var(--acc)",
              letterSpacing:2, textTransform:"uppercase",
              whiteSpace:"nowrap", pointerEvents:"none",
              animation:"jarvisFadeIn .15s ease",
              fontFamily:"'SF Mono','Fira Code',monospace",
            }}>
              {">"} J.A.R.V.I.S
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── JarvisOrb — single entry point ────────────────────────────────────

  function JarvisOrb({ briefing, isMinimized, onToggle, onResume, onDismissInsight, onAction, onRefresh, isDesktop,
    powersOpen, onTogglePowers, onToggleDeepDive, powers, onRunImprove, onForgetRule, onOptimizeHooks, onEnsureAgents, onRecommendAgents, sessions }) {
    if (!briefing) return null;
    return (
      <FloatingBubble
        briefing={briefing}
        isExpanded={!isMinimized}
        onToggle={onToggle}
        onResume={onResume}
        onDismissInsight={onDismissInsight}
        onAction={onAction}
        onRefresh={onRefresh}
        isDesktop={isDesktop}
        powersOpen={powersOpen}
        onTogglePowers={onTogglePowers}
        onToggleDeepDive={onToggleDeepDive}
        powers={powers}
        onRunImprove={onRunImprove}
        onForgetRule={onForgetRule}
        onOptimizeHooks={onOptimizeHooks}
        onEnsureAgents={onEnsureAgents}
        onRecommendAgents={onRecommendAgents}
        sessions={sessions}
      />
    );
  }

  // ── useJarvis Hook ──────────────────────────────────────────────────────

  function useJarvis(opts = {}) {
    const { apiBase = "", getAuthToken, isDesktop } = opts;
    const [briefing, setBriefing] = useState(null);
    const [isMinimized, setIsMinimized] = useState(() => {
      try { return localStorage.getItem("mc-jarvis-minimized") !== "0"; } catch { return true; }
    });
    const [powersOpen, setPowersOpen] = useState(false);
    const [deepDiveOpen, setDeepDiveOpen] = useState(false);
    const mobileAutoOpenedRef = useRef(false);
    const [powers, setPowers] = useState({ workflows: [], agents: [], hooks: {}, learnings: [], improveLog: [], learningStats: null });

    const headers = useCallback(() => authHeaders(getAuthToken), [getAuthToken]);

    const fetchBriefing = useCallback((force) => {
      const url = force ? `${apiBase}/api/jarvis/briefing?force=1` : `${apiBase}/api/jarvis/briefing`;
      fetch(url, { headers: headers() })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setBriefing(d); })
        .catch(() => {});
    }, [apiBase, headers]);

    useEffect(() => { fetchBriefing(); }, [fetchBriefing]);

    // Auto-open Deep Dive on mobile when briefing first arrives with sessions
    useEffect(() => {
      if (!isDesktop && briefing && briefing.sessions?.length > 0 && !mobileAutoOpenedRef.current) {
        mobileAutoOpenedRef.current = true;
        setDeepDiveOpen(true);
        setIsMinimized(true);
      }
    }, [isDesktop, briefing]);

    // Fetch powers data when powers panel opens
    const fetchPowers = useCallback(() => {
      const h = headers();
      Promise.all([
        fetch(`${apiBase}/api/jarvis/workflows`, { headers: h }).then(r => r.ok ? r.json() : { workflows: [] }).catch(() => ({ workflows: [] })),
        fetch(`${apiBase}/api/jarvis/agents`, { headers: h }).then(r => r.ok ? r.json() : { agents: [] }).catch(() => ({ agents: [] })),
        fetch(`${apiBase}/api/jarvis/hooks`, { headers: h }).then(r => r.ok ? r.json() : { hooks: {} }).catch(() => ({ hooks: {} })),
        fetch(`${apiBase}/api/jarvis/learnings`, { headers: h }).then(r => r.ok ? r.json() : { rules: [], stats: {} }).catch(() => ({ rules: [], stats: {} })),
        fetch(`${apiBase}/api/jarvis/improve/log`, { headers: h }).then(r => r.ok ? r.json() : { improvements: [] }).catch(() => ({ improvements: [] })),
      ]).then(([wf, ag, hk, lr, il]) => {
        setPowers({
          workflows: wf.workflows || [],
          agents: ag.agents || [],
          hooks: hk.hooks || {},
          learnings: lr.rules || [],
          improveLog: il.improvements || [],
          learningStats: lr.stats || null,
        });
      });
    }, [apiBase, headers]);

    const togglePowers = useCallback(() => {
      setPowersOpen(p => {
        if (!p) fetchPowers(); // fetch when opening
        return !p;
      });
    }, [fetchPowers]);

    const dismissInsight = useCallback((insightId) => {
      fetch(`${apiBase}/api/jarvis/dismiss`, { method: "POST", headers: headers(), body: JSON.stringify({ insightId }) }).catch(() => {});
      setBriefing(prev => {
        if (!prev) return prev;
        const filter = arr => arr.map(s => ({ ...s, insights: (s.insights || []).filter(i => i.id !== insightId) }));
        return { ...prev, sessions: filter(prev.sessions || []),
          globalInsights: (prev.globalInsights || []).filter(i => i.id !== insightId) };
      });
    }, [apiBase, headers]);

    const toggleMinimize = useCallback(() => {
      setIsMinimized(p => {
        const v = !p;
        try { localStorage.setItem("mc-jarvis-minimized", v ? "1" : "0"); } catch {}
        if (v) { setPowersOpen(false); setDeepDiveOpen(false); }
        return v;
      });
    }, []);

    const toggleDeepDive = useCallback(() => {
      setDeepDiveOpen(p => {
        if (!p) { setIsMinimized(true); setPowersOpen(false); } // minimize bubble when entering deep dive
        return !p;
      });
    }, []);

    const handleInit = useCallback((msg) => {
      if (msg.jarvisBriefing) setBriefing(msg.jarvisBriefing);
    }, []);

    const handleWsMessage = useCallback((msg) => {
      if (msg.briefing) setBriefing(msg.briefing);
    }, []);

    const executeAction = useCallback((sessionId, action, confirmed = false) => {
      return fetch(`${apiBase}/api/jarvis/action`, { method: "POST", headers: headers(), body: JSON.stringify({ sessionId, action, confirmed }) })
        .then(r => r.json())
        .then(d => {
          if (d.ok) fetchBriefing(true);
          return d;
        });
    }, [apiBase, headers, fetchBriefing]);

    // Powers actions
    const runImprove = useCallback(() => {
      return fetch(`${apiBase}/api/jarvis/improve`, { method: "POST", headers: headers() })
        .then(r => r.json())
        .then(d => { fetchPowers(); fetchBriefing(true); return d; });
    }, [apiBase, headers, fetchPowers, fetchBriefing]);

    const forgetRule = useCallback((ruleId) => {
      return fetch(`${apiBase}/api/jarvis/forget`, { method: "POST", headers: headers(), body: JSON.stringify({ ruleId }) })
        .then(r => r.json())
        .then(d => { fetchPowers(); fetchBriefing(true); return d; });
    }, [apiBase, headers, fetchPowers, fetchBriefing]);

    const optimizeHooks = useCallback(() => {
      return fetch(`${apiBase}/api/jarvis/hooks/optimize`, { method: "POST", headers: headers() })
        .then(r => r.json())
        .then(d => { fetchPowers(); return d; });
    }, [apiBase, headers, fetchPowers]);

    const ensureAgents = useCallback(() => {
      return fetch(`${apiBase}/api/jarvis/agents/ensure`, { method: "POST", headers: headers() })
        .then(r => r.json())
        .then(d => { fetchPowers(); return d; });
    }, [apiBase, headers, fetchPowers]);

    const recommendAgents = useCallback((sessionId) => {
      return fetch(`${apiBase}/api/jarvis/agents/recommend`, { method: "POST", headers: headers(), body: JSON.stringify({ sessionId }) })
        .then(r => r.json());
    }, [apiBase, headers]);

    return {
      briefing, isMinimized, showPanel: !!briefing, toggleMinimize, refresh: fetchBriefing,
      dismissInsight, executeAction, handleInit, handleWsMessage,
      // Powers
      powersOpen, togglePowers, powers,
      runImprove, forgetRule, optimizeHooks, ensureAgents, recommendAgents,
      // Deep Dive
      deepDiveOpen, toggleDeepDive,
    };
  }

  // ── DeepDiveInsightCard — expanded insight with impact & steps ──────────

  function DeepDiveInsightCard({ insight, onDismiss, onAction }) {
    const iconMap = { git: "\u2325", security: "\uD83D\uDEE1", health: "\u2695", activity: "\u23F1" };
    const sevColor = { error: "var(--red)", warning: "var(--amb)", info: "var(--txt3)" };
    const sevBg = { error: "var(--redBg)", warning: "var(--ambBg)", info: "var(--glass2)" };
    const sevLabel = { error: "Critical", warning: "Warning", info: "Info" };
    const actionLabels = window._jarvisCapabilities?.actions
      ? Object.fromEntries(Object.entries(window._jarvisCapabilities.actions).map(([k, v]) => [k, v.description || v.label]))
      : { commit: "Commit Changes", push: "Push to Remote", branch: "Create Branch", install: "Install Dependencies" };
    const [expanded, setExpanded] = useState(false);
    const [actionResult, setActionResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState(null);

    const handleAction = (confirmed = false) => {
      if (!onAction || !insight.action) return;
      setLoading(true);
      onAction(insight.action, confirmed).then(r => {
        if (r?.requiresConfirmation) {
          setPendingConfirm({ reason: r.reason, riskLevel: r.riskLevel });
          setLoading(false);
        } else {
          setPendingConfirm(null);
          setActionResult(r?.message || (r?.error ? "Error: " + r.error : "Done"));
          setLoading(false);
          setTimeout(() => setActionResult(null), 5000);
        }
      }).catch(() => { setLoading(false); });
    };

    return (
      <div style={{
        borderRadius: 12, overflow: "hidden",
        background: sevBg[insight.severity] || sevBg.info,
        border: "1px solid color-mix(in srgb, " + (sevColor[insight.severity] || sevColor.info) + " 20%, transparent)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        boxShadow: "var(--glass-shd)",
        animation: "jarvisFadeIn .25s ease", transition: "all .2s var(--transition-smooth)",
      }}>
        {/* Header row — always visible */}
        <div onClick={() => setExpanded(p => !p)} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer",
          transition: "background .15s",
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{iconMap[insight.type] || "\u2139"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                padding: "1px 6px", borderRadius: 4,
                background: "color-mix(in srgb, " + (sevColor[insight.severity] || sevColor.info) + " 13%, transparent)",
                color: sevColor[insight.severity] || sevColor.info,
              }}>{sevLabel[insight.severity] || "Info"}</span>
              <span style={{ fontSize: 9, color: "var(--txt4)", textTransform: "uppercase", letterSpacing: 0.5 }}>{insight.type}</span>
            </div>
            <div style={{ fontWeight: 600, color: "var(--txt)", fontSize: 13, marginTop: 3, lineHeight: 1.3 }}>{insight.title}</div>
            {insight.detail && !expanded && (
              <div style={{ color: "var(--txt3)", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{insight.detail}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {actionResult && !expanded && (
              <span style={{ fontSize: 10, color: "var(--grn)", fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{"\u2713"} {actionResult}</span>
            )}
            {pendingConfirm && !expanded && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: "var(--amb)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{"\u26A0"}</span>
                <button onClick={(e) => { e.stopPropagation(); handleAction(true); }} disabled={loading}
                  style={{ background: "var(--amb)", border: "none", color: "var(--bg)", cursor: "pointer", padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 4 }}>
                  {loading ? "..." : "Confirm"}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setPendingConfirm(null); }}
                  style={{ background: "var(--glass2)", border: "1px solid var(--glass-border)", color: "var(--txt4)", cursor: "pointer", padding: "2px 6px", fontSize: 10, borderRadius: 4 }}>
                  {"\u2715"}
                </button>
              </span>
            )}
            {insight.action && onAction && !expanded && !actionResult && !pendingConfirm && (
              <button onClick={(e) => { e.stopPropagation(); handleAction(false); }} disabled={loading}
                style={{ background: "var(--accBg)", border: "1px solid var(--acc)", color: "var(--acc)",
                  cursor: loading ? "wait" : "pointer", padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6,
                  opacity: loading ? 0.5 : 1, transition: "all .15s" }}>
                {loading ? "..." : actionLabels[insight.action] || insight.action}
              </button>
            )}
            <span style={{ fontSize: 12, color: "var(--txt4)", transition: "transform .2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>{"\u25BC"}</span>
          </div>
        </div>

        {/* Expanded detail — impact, steps, actions */}
        {expanded && (
          <div style={{ padding: "0 14px 14px", borderTop: "1px solid color-mix(in srgb, " + (sevColor[insight.severity] || sevColor.info) + " 8%, transparent)" }}>
            {/* Detail */}
            {insight.detail && (
              <div style={{ fontSize: 12, color: "var(--txt3)", marginTop: 10, lineHeight: 1.5 }}>{insight.detail}</div>
            )}

            {/* Impact */}
            {insight.impact && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--txt4)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Why this matters</div>
                <div style={{ fontSize: 12, color: "var(--txt2)", lineHeight: 1.5, padding: "8px 10px", borderRadius: 8,
                  background: "var(--glass)", border: "1px solid var(--glass-border)",
                  backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "var(--glass-edge)" }}>{insight.impact}</div>
              </div>
            )}

            {/* Steps */}
            {insight.steps && insight.steps.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--txt4)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>How to fix</div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--txt2)", lineHeight: 1.8 }}>
                  {insight.steps.map((step, idx) => <li key={idx} style={{ paddingLeft: 4 }}>{step}</li>)}
                </ol>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              {insight.action && onAction && !pendingConfirm && (
                <button onClick={() => handleAction(false)} disabled={loading}
                  style={{ background: "var(--acc)", border: "none", color: "var(--bg)",
                    cursor: loading ? "wait" : "pointer", padding: "6px 16px", fontSize: 12, fontWeight: 600, borderRadius: 8,
                    opacity: loading ? 0.5 : 1, transition: "all .15s var(--transition-smooth)",
                    boxShadow: "0 2px 12px color-mix(in srgb, var(--acc) 40%, transparent)" }}>
                  {loading ? "Running..." : actionLabels[insight.action] || insight.action}
                </button>
              )}
              {pendingConfirm && (
                <>
                  <div style={{ fontSize: 11, color: "var(--amb)", flex: 1 }}>{"\u26A0"} {pendingConfirm.reason}</div>
                  <button onClick={() => handleAction(true)} disabled={loading}
                    style={{ background: "var(--amb)", border: "none", color: "var(--bg)",
                      cursor: "pointer", padding: "6px 16px", fontSize: 12, fontWeight: 600, borderRadius: 8,
                      transition: "all .15s var(--transition-smooth)",
                      boxShadow: "0 2px 12px color-mix(in srgb, var(--amb) 40%, transparent)" }}>
                    {loading ? "..." : "Confirm"}
                  </button>
                  <button onClick={() => setPendingConfirm(null)}
                    style={{ background: "var(--glass2)", border: "1px solid var(--glass-border)", color: "var(--txt3)",
                      cursor: "pointer", padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8 }}>
                    Cancel
                  </button>
                </>
              )}
              {actionResult && (
                <div style={{ fontSize: 11, color: "var(--grn)", fontWeight: 600 }}>{"\u2713"} {actionResult}</div>
              )}
              {onDismiss && (
                <button onClick={() => onDismiss(insight.id)}
                  style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--glass-border)", color: "var(--txt4)",
                    cursor: "pointer", padding: "4px 10px", fontSize: 11, borderRadius: 6 }}>Dismiss</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── SessionHealthRing — circular health score indicator ──────────────────

  function SessionHealthRing({ score, size }) {
    const sz = size || 48;
    const r = (sz - 6) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (circ * Math.max(0, Math.min(100, score)) / 100);
    const color = score >= 80 ? "var(--grn)" : score >= 50 ? "var(--amb)" : "var(--red)";
    return (
      <svg width={sz} height={sz} style={{ flexShrink: 0 }}>
        <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="var(--glass-border)" strokeWidth={3}/>
        <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${sz/2} ${sz/2})`}
          style={{ transition: "stroke-dashoffset .6s ease" }}/>
        <text x={sz/2} y={sz/2} textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: sz * 0.3, fontWeight: 700, fill: color, fontFamily: "'Rajdhani',sans-serif" }}>{score}</text>
      </svg>
    );
  }

  // ── JarvisDeepDive — full-screen comprehensive insight view ─────────────

  function JarvisDeepDive({ briefing, onClose, onDismissInsight, onAction, onRefresh }) {
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [filterSeverity, setFilterSeverity] = useState("all");
    const [filterCategory, setFilterCategory] = useState("all");
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    if (!briefing) return null;

    const allSessions = briefing.sessions || [];
    const selectedSession = selectedSessionId ? allSessions.find(s => s.id === selectedSessionId) : null;

    // Collect all insights across all sessions for overview mode
    const allInsights = useMemo(() => {
      const insights = [];
      allSessions.forEach(s => {
        (s.insights || []).forEach(i => insights.push({ ...i, sessionId: s.id, sessionName: s.name }));
      });
      (briefing.globalInsights || []).forEach(i => insights.push({ ...i, sessionId: null, sessionName: "Global" }));
      return insights;
    }, [briefing]);

    // Get unique categories
    const categories = useMemo(() => {
      const cats = new Set();
      allInsights.forEach(i => { if (i.category) cats.add(i.category); });
      return ["all", ...Array.from(cats)];
    }, [allInsights]);

    // Filter insights
    const filteredInsights = useMemo(() => {
      let list = selectedSession ? (selectedSession.insights || []).map(i => ({ ...i, sessionId: selectedSession.id, sessionName: selectedSession.name })) : allInsights;
      if (filterSeverity !== "all") list = list.filter(i => i.severity === filterSeverity);
      if (filterCategory !== "all") list = list.filter(i => i.category === filterCategory);
      return list;
    }, [selectedSession, allInsights, filterSeverity, filterCategory]);

    // Group filtered insights by category
    const groupedInsights = useMemo(() => {
      const groups = {};
      const categoryOrder = ["blockers", "git-hygiene", "code-quality", "cleanup", "developer-experience", "trends", "general"];
      const categoryLabels = {
        blockers: "Blockers", "git-hygiene": "Git Hygiene", "code-quality": "Code Quality",
        cleanup: "Cleanup", "developer-experience": "Developer Experience", trends: "Trends", general: "General"
      };
      filteredInsights.forEach(i => {
        const cat = i.category || "general";
        if (!groups[cat]) groups[cat] = { category: cat, label: categoryLabels[cat] || cat, insights: [] };
        groups[cat].insights.push(i);
      });
      return categoryOrder.filter(c => groups[c]).map(c => groups[c])
        .concat(Object.keys(groups).filter(c => !categoryOrder.includes(c)).map(c => groups[c]));
    }, [filteredInsights]);

    // Stats
    const errorCount = allInsights.filter(i => i.severity === "error").length;
    const warningCount = allInsights.filter(i => i.severity === "warning").length;
    const infoCount = allInsights.filter(i => i.severity === "info").length;

    const categoryLabel = {
      blockers: "\uD83D\uDED1", "git-hygiene": "\u2325", "code-quality": "\u2695",
      cleanup: "\uD83E\uDDF9", "developer-experience": "\uD83D\uDEE0", trends: "\uD83D\uDCC8", general: "\u2139"
    };

    return ReactDOM.createPortal(
      <div style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "var(--bg)", overflow: "hidden",
        display: "flex", flexDirection: "column",
        animation: "jarvisPanelIn .3s cubic-bezier(.34,1.56,.64,1) forwards",
      }}>
        {/* ── Top Bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, padding: isMobile ? "10px 12px" : "12px 20px",
          paddingTop: isMobile ? "max(10px, env(safe-area-inset-top))" : 12,
          background: "var(--glass)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
          borderBottom: "1px solid var(--glass-border)", flexShrink: 0, flexWrap: isMobile ? "wrap" : "nowrap",
        }}>
          {/* Session selector button (mobile only) */}
          {isMobile && allSessions.length > 0 && (
            <button onClick={() => setShowMobileSidebar(p => !p)}
              style={{ background: showMobileSidebar ? "var(--accBg)" : "var(--glass2)", border: "1px solid " + (showMobileSidebar ? "var(--acc)" : "var(--glass-border)"),
                color: showMobileSidebar ? "var(--acc)" : "var(--txt3)", cursor: "pointer", padding: "4px 8px", fontSize: 14, borderRadius: 8, flexShrink: 0 }}>
              {"\u2630"}
            </button>
          )}
          <div style={{
            width: isMobile ? 28 : 36, height: isMobile ? 28 : 36, borderRadius: "50%", flexShrink: 0,
            background: errorCount > 0
              ? "conic-gradient(from 45deg, var(--red), color-mix(in srgb, var(--red) 60%, var(--acc)), color-mix(in srgb, var(--red) 50%, var(--acc) 50%), var(--red))"
              : "conic-gradient(from 45deg, var(--acc), color-mix(in srgb, var(--acc) 50%, var(--grn)), color-mix(in srgb, var(--red) 30%, var(--acc)), var(--acc))",
            animation: "spin 4s linear infinite",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: isMobile ? 22 : 28, height: isMobile ? 22 : 28, borderRadius: "50%", background: "var(--glass3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 12 : 15, fontWeight: 700, color: "var(--txt)" }}>J</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: isMobile ? 15 : 18, fontWeight: 700, color: "var(--txt)", lineHeight: 1.2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isMobile ? (selectedSession ? selectedSession.name : "Deep Dive") : "J.A.R.V.I.S Deep Dive"}
            </div>
            {!isMobile && <div style={{ fontSize: 11, color: "var(--txt3)" }}>{briefing.headline}</div>}
          </div>
          {/* Severity filter pills — compact on mobile */}
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 8, overflow: "hidden", ...(isMobile ? { order: 10, width: "100%", paddingTop: 6 } : {}) }}>
            {[
              { key: "all", label: isMobile ? `${allInsights.length}` : `All (${allInsights.length})` },
              { key: "error", label: `${errorCount}`, color: "var(--red)" },
              { key: "warning", label: `${warningCount}`, color: "var(--amb)" },
              { key: "info", label: `${infoCount}`, color: "var(--txt4)" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilterSeverity(f.key)}
                style={{
                  background: filterSeverity === f.key ? "color-mix(in srgb, " + (f.color || "var(--acc)") + " 13%, transparent)" : "transparent",
                  border: "1px solid " + (filterSeverity === f.key ? (f.color || "var(--acc)") : "var(--glass-border)"),
                  color: filterSeverity === f.key ? (f.color || "var(--acc)") : "var(--txt4)",
                  padding: isMobile ? "3px 8px" : "3px 10px", fontSize: isMobile ? 10 : 11, fontWeight: 600, borderRadius: 6,
                  cursor: "pointer", transition: "all .15s", flex: isMobile ? 1 : "none",
                }}>{f.key === "all" && !isMobile ? "All " : ""}{f.label}</button>
            ))}
          </div>
          <button onClick={onRefresh} title="Refresh"
            style={{ background: "transparent", border: "none", color: "var(--txt4)", cursor: "pointer", padding: 6, fontSize: 16,
              transition: "color .15s var(--transition-smooth)" }}>{"\u21BB"}</button>
          <button onClick={onClose} title="Close Deep Dive (Esc)"
            style={{ background: "var(--glass2)", border: "1px solid var(--glass-border)", color: "var(--txt)",
              cursor: "pointer", padding: isMobile ? "6px 10px" : "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8,
              transition: "all .15s var(--transition-smooth)" }}>
            {isMobile ? "\u2715" : "Close"}
          </button>
        </div>

        {/* ── Main content ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>

          {/* Mobile sidebar backdrop */}
          {isMobile && showMobileSidebar && (
            <div onClick={() => setShowMobileSidebar(false)} style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 2,
              backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            }}/>
          )}

          {/* ── Left sidebar — session list ── */}
          <div style={{
            width: isMobile ? "80%" : 260, maxWidth: isMobile ? 300 : "none", flexShrink: 0,
            borderRight: "1px solid var(--glass-border)",
            overflowY: "auto", scrollbarWidth: "thin", background: "var(--glass)",
            backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
            ...(isMobile ? {
              position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 3,
              transform: showMobileSidebar ? "translateX(0)" : "translateX(-100%)",
              transition: "transform .25s ease", boxShadow: showMobileSidebar ? "4px 0 20px rgba(0,0,0,.2)" : "none",
            } : {}),
          }}>
            {/* Overview button */}
            <div onClick={() => { setSelectedSessionId(null); setFilterCategory("all"); if (isMobile) setShowMobileSidebar(false); }}
              style={{
                padding: "12px 16px", cursor: "pointer", transition: "background .15s",
                background: !selectedSessionId ? "var(--accBg)" : "transparent",
                borderBottom: "1px solid var(--glass-border)",
                borderLeft: !selectedSessionId ? "3px solid var(--acc)" : "3px solid transparent",
              }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: !selectedSessionId ? "var(--acc)" : "var(--txt)" }}>
                Overview
              </div>
              <div style={{ fontSize: 11, color: "var(--txt3)", marginTop: 2 }}>
                {allInsights.length} insight{allInsights.length !== 1 ? "s" : ""} across {allSessions.length} session{allSessions.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Session list */}
            {allSessions.map(s => {
              const isSelected = selectedSessionId === s.id;
              const sessErrors = (s.insights || []).filter(i => i.severity === "error").length;
              const sessWarnings = (s.insights || []).filter(i => i.severity === "warning").length;
              return (
                <div key={s.id} onClick={() => { setSelectedSessionId(s.id); setFilterCategory("all"); if (isMobile) setShowMobileSidebar(false); }}
                  style={{
                    padding: "10px 16px", cursor: "pointer", transition: "background .15s",
                    background: isSelected ? "var(--accBg)" : "transparent",
                    borderBottom: "1px solid var(--glass-border)",
                    borderLeft: isSelected ? "3px solid var(--acc)" : "3px solid transparent",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <SessionHealthRing score={s.healthScore ?? 100} size={32}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? "var(--acc)" : "var(--txt)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: "var(--txt4)", marginTop: 1 }}>
                        {s.git?.branch && <span style={{ marginRight: 6 }}>{"\u2325"} {s.git.branch}</span>}
                        {s.status === "busy" ? <span style={{ color: "var(--grn)" }}>{"\u25CF"} Running</span> : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {sessErrors > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", background: "var(--redBg)", padding: "1px 5px", borderRadius: 4 }}>{sessErrors}</span>}
                      {sessWarnings > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--amb)", background: "var(--ambBg)", padding: "1px 5px", borderRadius: 4 }}>{sessWarnings}</span>}
                    </div>
                  </div>
                  {/* Context badges */}
                  {s.context?.techStack?.length > 0 && (
                    <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                      {s.context.techStack.slice(0, 4).map(t => (
                        <span key={t} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3,
                          background: "var(--glass2)", color: "var(--txt4)" }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Right main area — insights ── */}
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", WebkitOverflowScrolling: "touch",
            padding: isMobile ? "14px 12px" : "20px 24px",
            paddingBottom: isMobile ? "max(14px, env(safe-area-inset-bottom))" : 20 }}>

            {/* Session header (when session selected) */}
            {selectedSession && (
              <div style={{
                display: "flex", alignItems: "center", gap: 16, marginBottom: 20,
                padding: "16px 20px", borderRadius: 14, background: "var(--glass)", border: "1px solid var(--glass-border)",
                backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "var(--glass-shd)",
              }}>
                <SessionHealthRing score={selectedSession.healthScore ?? 100} size={64}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--txt)", fontFamily: "'Rajdhani',sans-serif" }}>{selectedSession.name}</div>
                  <div style={{ fontSize: 12, color: "var(--txt3)", marginTop: 2 }}>
                    {selectedSession.git?.branch && <span>{"\u2325"} {selectedSession.git.branch}</span>}
                    {selectedSession.git?.uncommittedCount > 0 && <span style={{ marginLeft: 10 }}>{selectedSession.git.uncommittedCount} uncommitted</span>}
                    {selectedSession.git?.unpushedCount > 0 && <span style={{ marginLeft: 10 }}>{selectedSession.git.unpushedCount} unpushed</span>}
                    {selectedSession.git?.velocityTrend && <span style={{ marginLeft: 10 }}>Velocity: {selectedSession.git.velocityTrend}</span>}
                  </div>
                  {selectedSession.context?.description && (
                    <div style={{ fontSize: 11, color: "var(--txt4)", marginTop: 4, fontStyle: "italic" }}>{selectedSession.context.description}</div>
                  )}
                  {selectedSession.context?.techStack?.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                      {selectedSession.context.techStack.map(t => (
                        <span key={t} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4,
                          background: "var(--accBg)", color: "var(--acc)", fontWeight: 600 }}>{t}</span>
                      ))}
                    </div>
                  )}
                  {selectedSession.workflow && (
                    <div style={{ fontSize: 10, color: "var(--txt4)", marginTop: 4 }}>Workflow: {selectedSession.workflow}</div>
                  )}
                </div>
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--txt4)", marginBottom: 2 }}>Insights</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--txt)", fontFamily: "'Rajdhani',sans-serif" }}>
                    {(selectedSession.insights || []).length}
                  </div>
                </div>
              </div>
            )}

            {/* Overview header (when no session selected) */}
            {!selectedSession && (
              <div style={{
                display: "flex", alignItems: "center", gap: 20, marginBottom: 20,
                padding: "16px 20px", borderRadius: 14, background: "var(--glass)", border: "1px solid var(--glass-border)",
                backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "var(--glass-shd)",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--txt)", fontFamily: "'Rajdhani',sans-serif" }}>
                    {briefing.greeting}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--txt3)", marginTop: 2 }}>{briefing.summary || briefing.headline}</div>
                </div>
                <div style={{ display: "flex", gap: 16, flexShrink: 0, textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: errorCount > 0 ? "var(--red)" : "var(--txt)", fontFamily: "'Rajdhani',sans-serif" }}>{errorCount}</div>
                    <div style={{ fontSize: 10, color: "var(--txt4)" }}>Critical</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: warningCount > 0 ? "var(--amb)" : "var(--txt)", fontFamily: "'Rajdhani',sans-serif" }}>{warningCount}</div>
                    <div style={{ fontSize: 10, color: "var(--txt4)" }}>Warnings</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--txt3)", fontFamily: "'Rajdhani',sans-serif" }}>{infoCount}</div>
                    <div style={{ fontSize: 10, color: "var(--txt4)" }}>Info</div>
                  </div>
                </div>
              </div>
            )}

            {/* Category filter bar */}
            {categories.length > 2 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
                {categories.map(c => {
                  const label = c === "all" ? "All Categories" : (c.charAt(0).toUpperCase() + c.slice(1)).replace(/-/g, " ");
                  const icon = categoryLabel[c] || "";
                  return (
                    <button key={c} onClick={() => setFilterCategory(c)}
                      style={{
                        background: filterCategory === c ? "var(--accBg)" : "var(--glass)",
                        border: "1px solid " + (filterCategory === c ? "var(--acc)" : "var(--glass-border)"),
                        color: filterCategory === c ? "var(--acc)" : "var(--txt3)",
                        padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", transition: "all .15s var(--transition-smooth)",
                      }}>{icon ? icon + " " : ""}{label}</button>
                  );
                })}
              </div>
            )}

            {/* Insight groups */}
            {groupedInsights.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--txt4)",
                background: "var(--glass)", border: "1px solid var(--glass-border)", borderRadius: 14,
                backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "var(--glass-shd)" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{"\u2713"}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>All clear</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>No insights match your current filters.</div>
              </div>
            )}

            {groupedInsights.map(group => (
              <div key={group.category} style={{ marginBottom: 24 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                  paddingBottom: 6, borderBottom: "1px solid var(--glass-border)",
                }}>
                  <span style={{ fontSize: 16 }}>{categoryLabel[group.category] || "\u2139"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--txt)", fontFamily: "'Rajdhani',sans-serif" }}>
                    {group.label}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--txt4)" }}>({group.insights.length})</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.insights.map(insight => (
                    <DeepDiveInsightCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={onDismissInsight}
                      onAction={insight.action && insight.sessionId && onAction
                        ? (action, confirmed) => onAction(insight.sessionId, action, confirmed)
                        : null}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // ── Inject Styles ────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById("jarvis-styles")) return;
    const style = document.createElement("style");
    style.id = "jarvis-styles";
    style.textContent = `
@keyframes jarvisOrbBreathe {
  0%, 100% { transform: scale(1) translateY(0); filter: brightness(1); }
  30% { transform: scale(1.03) translateY(-3px); filter: brightness(1.05); }
  60% { transform: scale(0.98) translateY(1px); filter: brightness(0.98); }
}
@keyframes jarvisOrbPulse {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.08); filter: brightness(1.15); }
}
@keyframes jarvisGlowPulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}
@keyframes jarvisPanelIn {
  from { opacity: 0; transform: translateY(16px) scale(.92); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes jarvisBadgePop {
  from { transform: scale(0); }
  to   { transform: scale(1); }
}
@keyframes jarvisFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
    `.trim();
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectStyles);
  } else {
    injectStyles();
  }

  // ── Export ──────────────────────────────────────────────────────────────

  window.JarvisUI = {
    InsightCard, SessionCard, JarvisOrb, FloatingBubble, SiriOrb, PowersPanel,
    JarvisDeepDive, DeepDiveInsightCard, SessionHealthRing,
    useJarvis, injectStyles,
  };
})();

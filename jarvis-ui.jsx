/**
 * JARVIS UI — Floating Orb Assistant
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

  // ── InsightCard ─────────────────────────────────────────────────────────

  function InsightCard({ insight, onDismiss, onAction }) {
    const iconMap = { git: "\u2325", security: "\uD83D\uDEE1", health: "\u2695", activity: "\u23F1" };
    const sevColor = { error: "var(--red)", warning: "var(--amb)", info: "var(--txt3)" };
    const sevBg = { error: "var(--redBg)", warning: "var(--ambBg)", info: "var(--glass2)" };
    const actionLabels = { commit: "View", push: "Push", branch: "Info", install: "Install" };
    const [actionResult, setActionResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleAction = () => {
      if (!onAction || !insight.action) return;
      setLoading(true);
      onAction(insight.action).then(r => {
        setActionResult(r?.message || (r?.error ? "Error: " + r.error : "Done"));
        setLoading(false);
        setTimeout(() => setActionResult(null), 5000);
      }).catch(() => { setLoading(false); });
    };

    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8,
        background: sevBg[insight.severity] || sevBg.info, border:"1px solid " + (sevColor[insight.severity] || sevColor.info) + "22",
        fontSize:12, animation:"jarvisFadeIn .25s ease" }}>
        <span style={{ fontSize:14, flexShrink:0 }}>{iconMap[insight.type] || "\u2139"}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, color: sevColor[insight.severity] || sevColor.info }}>{insight.title}</div>
          {actionResult ? (
            <div style={{ color:"var(--grn, #4ade80)", fontSize:11, marginTop:1 }}>{actionResult}</div>
          ) : insight.detail && (
            <div style={{ color:"var(--txt3)", fontSize:11, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{insight.detail}</div>
          )}
        </div>
        {insight.action && onAction && (
          <button onClick={handleAction} disabled={loading}
            style={{ background:"var(--accBg)", border:"1px solid var(--acc)", color:"var(--acc)",
              cursor: loading ? "wait" : "pointer", padding:"2px 8px", fontSize:10, fontWeight:600, borderRadius:5, flexShrink:0,
              opacity: loading ? 0.5 : 1, transition:"all .15s" }}>
            {loading ? "..." : actionLabels[insight.action] || insight.action}
          </button>
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
        display:"flex", flexDirection:"column", gap:5, cursor:"pointer", transition:"all .15s" }}
        onClick={() => onResume && onResume(session.id)}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--glass3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "var(--glass2)"; e.currentTarget.style.transform = "translateY(0)"; }}>
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
    // Persistent particle pool (seeded once)
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
      const S = 160; // higher res for detail
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

        // Color palette
        const hue1 = crit ? 0 : active ? 160 : 210;
        const hue2 = crit ? 30 : active ? 220 : 270;
        const hue3 = crit ? 340 : active ? 280 : 310;
        const sat = crit ? 90 : 80;
        const lum = crit ? 55 : active ? 60 : 65;

        // ── 1. Deep background — dark void with faint radial tint ──
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        bgGrad.addColorStop(0, `hsla(${hue1}, 40%, 8%, 0.95)`);
        bgGrad.addColorStop(0.6, `hsla(${hue2}, 30%, 4%, 0.8)`);
        bgGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, PI2); ctx.fillStyle = bgGrad; ctx.fill();

        // ── 2. Hexagonal grid overlay (faint, rotating) ──
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

        // ── 3. Scanning rings (2 counter-rotating, tilted in perspective) ──
        for (let ri = 0; ri < 2; ri++) {
          const ringR = R * (0.55 + ri * 0.22);
          const rot = st * (ri === 0 ? 0.5 : -0.35) + ri * 1.5;
          const tilt = 0.55 + Math.sin(st * 0.3 + ri) * 0.15;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.scale(1, tilt);
          // Ring arc (not full circle — techy broken arc)
          const arcLen = Math.PI * (1.2 + Math.sin(st * 0.4 + ri) * 0.3);
          const arcStart = st * (ri === 0 ? 0.7 : -0.5);
          ctx.beginPath();
          ctx.arc(0, 0, ringR, arcStart, arcStart + arcLen);
          ctx.strokeStyle = `hsla(${hue1 + ri * 40}, ${sat}%, ${lum + 10}%, ${hov ? 0.6 : 0.35})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          // Tick marks on ring
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
          // Bright dot at arc tip
          const tipA = arcStart + arcLen;
          ctx.beginPath();
          ctx.arc(Math.cos(tipA) * ringR, Math.sin(tipA) * ringR, 2, 0, PI2);
          ctx.fillStyle = `hsla(${hue1 + ri * 40}, ${sat}%, ${lum + 20}%, 0.9)`;
          ctx.fill();
          ctx.restore();
        }

        // ── 4. Reactor core — pulsing energy center ──
        const coreR = R * (0.22 + Math.sin(st * 1.5) * 0.03);
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.5);
        coreGrad.addColorStop(0, `hsla(${hue1}, ${sat}%, 92%, 0.95)`);
        coreGrad.addColorStop(0.15, `hsla(${hue1}, ${sat}%, ${lum + 20}%, 0.8)`);
        coreGrad.addColorStop(0.4, `hsla(${hue2}, ${sat - 10}%, ${lum}%, 0.3)`);
        coreGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.5, 0, PI2);
        ctx.fillStyle = coreGrad; ctx.fill();

        // Inner white-hot core
        const hotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        hotGrad.addColorStop(0, "rgba(255,255,255,0.95)");
        hotGrad.addColorStop(0.5, `hsla(${hue1}, 60%, 85%, 0.7)`);
        hotGrad.addColorStop(1, `hsla(${hue1}, ${sat}%, ${lum}%, 0)`);
        ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, PI2);
        ctx.fillStyle = hotGrad; ctx.fill();

        // ── 5. Data particles — orbiting energy motes ──
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
          // Tiny trail
          const trailA = pa - p.speed * 0.15;
          const tx = cx + Math.cos(trailA) * pr;
          const ty = cy + Math.sin(trailA) * pr;
          ctx.beginPath();
          ctx.moveTo(px, py); ctx.lineTo(tx, ty);
          ctx.strokeStyle = `hsla(${pHue}, ${sat}%, ${lum + 15}%, ${alpha * 0.3})`;
          ctx.lineWidth = p.size * 0.5;
          ctx.stroke();
        }

        // ── 6. Electric arcs (2-3 faint lightning bolts from core to edge) ──
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

        // ── 7. Outer boundary ring — thin tech border ──
        ctx.beginPath();
        ctx.arc(cx, cy, R - 1, 0, PI2);
        ctx.strokeStyle = `hsla(${hue1}, ${sat - 20}%, ${lum}%, ${hov ? 0.3 : 0.12})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Segmented outer markers (like a compass/clock)
        for (let i = 0; i < 8; i++) {
          const ma = (PI2 / 8) * i + st * 0.05;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ma) * (R - 4), cy + Math.sin(ma) * (R - 4));
          ctx.lineTo(cx + Math.cos(ma) * (R + 1), cy + Math.sin(ma) * (R + 1));
          ctx.strokeStyle = `hsla(${hue1}, ${sat}%, ${lum}%, 0.2)`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // ── Circular clip ──
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
        width: 60, height: 60, position: "relative", cursor: "pointer",
        animation: hasCritical ? "jarvisOrbPulse 1.8s ease-in-out infinite" : "jarvisOrbBreathe 5s ease-in-out infinite",
      }}>
        {/* Outer ambient glow — cyberpunk halo */}
        <div style={{
          position: "absolute", inset: -16, borderRadius: "50%", pointerEvents: "none",
          background: hasCritical
            ? "radial-gradient(circle, rgba(255,50,50,.3) 0%, rgba(255,100,30,.12) 35%, transparent 70%)"
            : isActive
              ? "radial-gradient(circle, rgba(0,255,200,.2) 0%, rgba(50,120,255,.1) 35%, transparent 70%)"
              : "radial-gradient(circle, rgba(80,100,255,.18) 0%, rgba(160,60,255,.08) 35%, transparent 70%)",
          animation: "jarvisGlowPulse 3s ease-in-out infinite",
          filter: "blur(6px)",
        }}/>
        {/* Spinning segmented border ring */}
        <div style={{
          position: "absolute", inset: -3, borderRadius: "50%",
          background: hasCritical
            ? "conic-gradient(from 0deg, #ff2244 0%, transparent 15%, #ff6633 30%, transparent 45%, #ff2244 60%, transparent 75%, #cc22aa 90%, #ff2244 100%)"
            : isActive
              ? "conic-gradient(from 0deg, #00ffc8 0%, transparent 15%, #3388ff 30%, transparent 45%, #00ffc8 60%, transparent 75%, #aa44ff 90%, #00ffc8 100%)"
              : "conic-gradient(from 0deg, #4466ff 0%, transparent 15%, #8844ff 30%, transparent 45%, #4466ff 60%, transparent 75%, #cc44aa 90%, #4466ff 100%)",
          animation: "spin 3s linear infinite",
          opacity: isHovered ? 0.9 : 0.45, transition: "opacity .3s",
        }}>
          <div style={{ position: "absolute", inset: 2, borderRadius: "50%", background: "var(--bg, #0a0a0f)" }}/>
        </div>
        {/* Canvas reactor core */}
        <canvas ref={canvasRef} style={{
          position: "absolute", inset: 0, width: 60, height: 60, borderRadius: "50%", pointerEvents: "none",
        }}/>
      </div>
    );
  }

  // ── FloatingBubble — orb + expanded panel ─────────────────────────────

  function FloatingBubble({ briefing, isExpanded, onToggle, onResume, onDismissInsight, onAction, onRefresh, isDesktop }) {
    const [isHovered, setIsHovered] = useState(false);
    const [position, setPosition] = useState(() => {
      try {
        const saved = localStorage.getItem("mc-jarvis-pos");
        if (saved) return JSON.parse(saved);
      } catch {}
      // Higher default on mobile to avoid overlapping bottom bar/safe area
      return { bottom: isDesktop ? 24 : 90, right: isDesktop ? 24 : 16 };
    });
    const posRef = useRef(position);
    posRef.current = position;
    const dragState = useRef({ startX:0, startY:0, startBottom:0, startRight:0, moved:false, dragging:false });

    // Single click handler — simple and reliable
    const handleClick = useCallback((e) => {
      // If we just finished a drag, ignore the click
      if (dragState.current.moved) return;
      e.stopPropagation();
      onToggle();
    }, [onToggle]);

    const onPointerDown = useCallback((e) => {
      if (isExpanded) return; // When expanded, just use onClick
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
        // Reset moved after a tick so the click handler can check it
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
            maxHeight: isDesktop ? "min(520px, calc(100vh - 120px))" : "85dvh",
            borderRadius: isDesktop ? 18 : "18px 18px 0 0",
            zIndex: isDesktop ? "auto" : 9992,
            background: "var(--glass)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
            border: "1px solid var(--glass-border)",
            boxShadow: "0 12px 48px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.05), 0 0 30px rgba(120,100,255,.08)",
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
                    ? "conic-gradient(from 45deg, #ff4466, #ff8844, #cc33aa, #ff4466)"
                    : activeCount > 0
                      ? "conic-gradient(from 45deg, #44ddaa, #4488ff, #aa55ff, #44ddaa)"
                      : "conic-gradient(from 45deg, #6677ee, #aa55ff, #ee55aa, #6677ee)",
                  animation: "spin 4s linear infinite",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:"var(--glass3)",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>J</div>
                </div>
                <div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:15, fontWeight:700, color:"var(--txt)", lineHeight:1.2 }}>
                    {briefing.greeting || "Jarvis"}
                  </div>
                  <div style={{ fontSize:11, color:"var(--txt3)", lineHeight:1.2 }}>{briefing.headline}</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                <button onClick={(e) => { e.stopPropagation(); onRefresh(); }} title="Refresh"
                  style={{ background:"transparent", border:"none", color:"var(--txt4)", cursor:"pointer", padding:4, fontSize:14,
                    transition:"color .15s", borderRadius:6 }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--txt)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--txt4)"}>{"\u21BB"}</button>
                <button onClick={(e) => { e.stopPropagation(); onToggle(); }} title="Close"
                  style={{ background:"transparent", border:"none", color:"var(--txt4)", cursor:"pointer", padding:4, fontSize:14,
                    transition:"color .15s", borderRadius:6 }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--txt)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--txt4)"}>{"\u2715"}</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding:"10px 14px 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {criticalInsights.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--red)", textTransform:"uppercase", letterSpacing:.5 }}>
                    Needs Attention
                  </div>
                  {criticalInsights.map(i => <InsightCard key={i.id} insight={i} onDismiss={onDismissInsight}
                    onAction={i.action && i.sessionId && onAction ? (action) => onAction(i.sessionId, action) : null}/>)}
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
                    onAction={i.action && i.sessionId && onAction ? (action) => onAction(i.sessionId, action) : null}/>)}
                  {otherInsights.length > 4 && (
                    <div style={{ fontSize:11, color:"var(--txt4)", paddingLeft:4 }}>+{otherInsights.length - 4} more</div>
                  )}
                </div>
              )}

              <div style={{ fontSize:10, color:"var(--txt4)", textAlign:"center", paddingTop:4,
                paddingBottom: isDesktop ? 0 : "max(4px, env(safe-area-inset-bottom))",
                borderTop:"1px solid var(--glass-border)" }}>
                {isDesktop ? "Ctrl+J to toggle" : "Tap orb to toggle"} {"\u00B7"} Drag orb to reposition
              </div>
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
              background:"linear-gradient(135deg, #ff4466, #ff6644)",
              color:"#fff", fontSize:10, fontWeight:700,
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 2px 8px rgba(255,68,102,.5)",
              animation:"jarvisBadgePop .3s cubic-bezier(.34,1.56,.64,1)",
              border:"2px solid var(--bg)", zIndex:1, pointerEvents:"none",
            }}>
              {critCount}
            </div>
          )}

          {/* Hover label — techy HUD style */}
          {!isExpanded && isHovered && (
            <div style={{
              position:"absolute", left:"50%", top:-32, transform:"translateX(-50%)",
              padding:"3px 10px", borderRadius:4,
              background:"rgba(0,0,0,0.75)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
              border:"1px solid rgba(100,140,255,0.25)",
              boxShadow:"0 0 12px rgba(80,120,255,0.15), inset 0 0 8px rgba(80,120,255,0.05)",
              fontSize:9, fontWeight:700, color:"rgba(140,180,255,0.9)",
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

  function JarvisOrb({ briefing, isMinimized, onToggle, onResume, onDismissInsight, onAction, onRefresh, isDesktop }) {
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
      />
    );
  }

  // ── useJarvis Hook ──────────────────────────────────────────────────────

  function useJarvis(opts = {}) {
    const { apiBase = "", getAuthToken } = opts;
    const [briefing, setBriefing] = useState(null);
    const [isMinimized, setIsMinimized] = useState(() => {
      try { return localStorage.getItem("mc-jarvis-minimized") !== "0"; } catch { return true; }
    });

    const fetchBriefing = useCallback((force) => {
      const url = force ? `${apiBase}/api/jarvis/briefing?force=1` : `${apiBase}/api/jarvis/briefing`;
      const headers = {};
      if (getAuthToken) headers.Authorization = `Bearer ${getAuthToken()}`;
      fetch(url, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setBriefing(d); })
        .catch(() => {});
    }, [apiBase, getAuthToken]);

    // Fetch once on mount — WS handles real-time updates, no polling needed
    useEffect(() => { fetchBriefing(); }, [fetchBriefing]);

    const dismissInsight = useCallback((insightId) => {
      const headers = { "Content-Type": "application/json" };
      if (getAuthToken) headers.Authorization = `Bearer ${getAuthToken()}`;
      fetch(`${apiBase}/api/jarvis/dismiss`, { method: "POST", headers, body: JSON.stringify({ insightId }) }).catch(() => {});
      setBriefing(prev => {
        if (!prev) return prev;
        const filter = arr => arr.map(s => ({ ...s, insights: (s.insights || []).filter(i => i.id !== insightId) }));
        return { ...prev, sessions: filter(prev.sessions || []),
          globalInsights: (prev.globalInsights || []).filter(i => i.id !== insightId) };
      });
    }, [apiBase, getAuthToken]);

    const toggleMinimize = useCallback(() => {
      setIsMinimized(p => {
        const v = !p;
        try { localStorage.setItem("mc-jarvis-minimized", v ? "1" : "0"); } catch {}
        return v;
      });
    }, []);

    const handleInit = useCallback((msg) => {
      if (msg.jarvisBriefing) setBriefing(msg.jarvisBriefing);
    }, []);

    const handleWsMessage = useCallback((msg) => {
      if (msg.briefing) setBriefing(msg.briefing);
    }, []);

    const executeAction = useCallback((sessionId, action) => {
      const headers = { "Content-Type": "application/json" };
      if (getAuthToken) headers.Authorization = `Bearer ${getAuthToken()}`;
      return fetch(`${apiBase}/api/jarvis/action`, { method: "POST", headers, body: JSON.stringify({ sessionId, action }) })
        .then(r => r.json())
        .then(d => {
          if (d.ok) fetchBriefing(true);
          return d;
        });
    }, [apiBase, getAuthToken, fetchBriefing]);

    return { briefing, isMinimized, showPanel: !!briefing, toggleMinimize, refresh: fetchBriefing, dismissInsight, executeAction, handleInit, handleWsMessage };
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
    InsightCard, SessionCard, JarvisOrb, FloatingBubble, SiriOrb,
    useJarvis, injectStyles,
  };
})();

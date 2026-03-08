/**
 * JARVIS UI — Frontend Components
 * Loaded via <script type="text/babel" src="/jarvis-ui.jsx"></script>
 * Exports on window.JarvisUI
 */
(function() {
  const { useState, useEffect, useCallback, useRef } = React;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function formatTimeAgoClient(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // ── InsightCard ─────────────────────────────────────────────────────────

  function InsightCard({ insight, onDismiss }) {
    const iconMap = { git: "\u2325", security: "\uD83D\uDEE1", health: "\u2695", activity: "\u23F1" };
    const sevColor = { error: "var(--red)", warning: "var(--amb)", info: "var(--txt3)" };
    const sevBg = { error: "var(--redBg)", warning: "var(--ambBg)", info: "var(--glass2)" };
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8,
        background: sevBg[insight.severity] || sevBg.info, border:"1px solid " + (sevColor[insight.severity] || sevColor.info) + "22",
        fontSize:12, animation:"fadeIn .2s ease" }}>
        <span style={{ fontSize:14, flexShrink:0 }}>{iconMap[insight.type] || "\u2139"}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, color: sevColor[insight.severity] || sevColor.info }}>{insight.title}</div>
          {insight.detail && <div style={{ color:"var(--txt3)", fontSize:11, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{insight.detail}</div>}
        </div>
        {onDismiss && <button onClick={() => onDismiss(insight.id)} style={{ background:"transparent", border:"none", color:"var(--txt4)",
          cursor:"pointer", padding:2, fontSize:14, lineHeight:1, flexShrink:0 }} title="Dismiss">\u00D7</button>}
      </div>
    );
  }

  // ── SessionCard ─────────────────────────────────────────────────────────

  function SessionCard({ session, onResume }) {
    const st = { idle: { color: "var(--txt4)", label: "Idle" }, busy: { color: "var(--grnDot)", label: "Running" }, error: { color: "var(--redDot)", label: "Error" } };
    const s = st[session.status] || st.idle;
    const timeAgo = session.lastActivityAt ? formatTimeAgoClient(session.lastActivityAt) : "No activity";
    return (
      <div style={{ minWidth:180, maxWidth:220, padding:12, borderRadius:12,
        background:"var(--glass)", backdropFilter:"blur(var(--glass-blur))", WebkitBackdropFilter:"blur(var(--glass-blur))",
        border:"1px solid var(--glass-border)", boxShadow:"var(--glass-shd)", flexShrink:0,
        display:"flex", flexDirection:"column", gap:6, cursor:"pointer", transition:"all .15s" }}
        onClick={() => onResume && onResume(session.id)}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--glass-shd2)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--glass-shd)"; e.currentTarget.style.transform = "translateY(0)"; }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:s.color, flexShrink:0,
            animation: session.status === "busy" ? "pulse 2s infinite" : "none" }}/>
          <span style={{ fontWeight:600, fontSize:13, color:"var(--txt)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{session.name}</span>
        </div>
        <div style={{ fontSize:11, color:"var(--txt3)" }}>{timeAgo}</div>
        {session.lastAssistantMessage && (
          <div style={{ fontSize:11, color:"var(--txt4)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
            fontStyle:"italic", borderTop:"1px solid var(--glass-border2)", paddingTop:4, marginTop:2 }}>
            {session.lastAssistantMessage.slice(0, 80)}
          </div>
        )}
        <div style={{ display:"flex", gap:4, marginTop:2 }}>
          {session.git?.uncommittedCount > 0 && (
            <span style={{ fontSize:10, fontWeight:600, padding:"1px 5px", borderRadius:4, background:"var(--ambBg)", color:"var(--amb)" }}>
              {session.git.uncommittedCount} uncommitted
            </span>
          )}
          {session.git?.unpushedCount > 0 && (
            <span style={{ fontSize:10, fontWeight:600, padding:"1px 5px", borderRadius:4, background:"var(--accBg)", color:"var(--acc)" }}>
              {session.git.unpushedCount} unpushed
            </span>
          )}
          {session.insights?.some(i => i.severity === "error") && (
            <span style={{ fontSize:10, fontWeight:600, padding:"1px 5px", borderRadius:4, background:"var(--redBg)", color:"var(--red)" }}>
              \u26A0
            </span>
          )}
        </div>
        {session.context && session.context.techStack?.length > 0 && (
          <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginTop:2 }}>
            {session.context.techStack.slice(0, 4).map(t => (
              <span key={t} style={{ fontSize:9, padding:"1px 4px", borderRadius:3, background:"var(--glass2)", color:"var(--txt3)" }}>{t}</span>
            ))}
          </div>
        )}
        <button onClick={(e) => { e.stopPropagation(); onResume && onResume(session.id); }}
          style={{ marginTop:4, padding:"4px 8px", borderRadius:6, background:"var(--accBg)", color:"var(--acc)",
            border:"none", fontSize:11, fontWeight:600, cursor:"pointer", transition:"all .15s" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--acc)"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--accBg)"}
          onMouseDown={e => { if (e.currentTarget.style.background === "var(--acc)") e.currentTarget.style.color = "#fff"; }}
          onMouseUp={e => e.currentTarget.style.color = "var(--acc)"}>
          Resume \u2192
        </button>
      </div>
    );
  }

  // ── BriefingPanel ───────────────────────────────────────────────────────

  function BriefingPanel({ briefing, onMinimize, onResume, onDismissInsight, onRefresh, isDesktop }) {
    if (!briefing) return null;
    const criticalInsights = [];
    const otherInsights = [];
    (briefing.sessions || []).forEach(s => {
      (s.insights || []).forEach(i => {
        if (i.severity === "error") criticalInsights.push({ ...i, sessionName: s.name });
        else otherInsights.push({ ...i, sessionName: s.name });
      });
    });
    (briefing.globalInsights || []).forEach(i => {
      if (i.severity === "error") criticalInsights.push(i);
      else otherInsights.push(i);
    });

    return (
      <div style={{ margin: isDesktop ? "0 14px" : "0 4px", padding:"16px 18px", borderRadius:14,
        background:"var(--glass)", backdropFilter:"blur(var(--glass-blur))", WebkitBackdropFilter:"blur(var(--glass-blur))",
        border:"1px solid var(--glass-border)", boxShadow:"var(--glass-shd)",
        animation:"jarvisSlideDown .3s ease forwards", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:18 }}>{"\uD83E\uDD16"}</span>
            <div>
              <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:16, fontWeight:700, color:"var(--txt)" }}>
                {briefing.greeting}
              </span>
              <div style={{ fontSize:12, color:"var(--txt2)", marginTop:1 }}>{briefing.headline}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
            <button onClick={onRefresh} title="Refresh scan" style={{ background:"transparent", border:"none", color:"var(--txt4)",
              cursor:"pointer", padding:4, fontSize:14, transition:"color .15s" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--txt)"} onMouseLeave={e => e.currentTarget.style.color = "var(--txt4)"}>{"\u21BB"}</button>
            <button onClick={onMinimize} title="Minimize Jarvis" style={{ background:"transparent", border:"none", color:"var(--txt4)",
              cursor:"pointer", padding:4, fontSize:14, transition:"color .15s" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--txt)"} onMouseLeave={e => e.currentTarget.style.color = "var(--txt4)"}>{"\u2212"}</button>
          </div>
        </div>

        {/* Critical insights */}
        {criticalInsights.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:10 }}>
            {criticalInsights.map(i => <InsightCard key={i.id} insight={i} onDismiss={onDismissInsight}/>)}
          </div>
        )}

        {/* Session cards */}
        {briefing.sessions?.length > 0 && (
          <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:6, marginBottom: otherInsights.length > 0 ? 10 : 0,
            scrollbarWidth:"thin", WebkitOverflowScrolling:"touch" }}>
            {briefing.sessions.map(s => <SessionCard key={s.id} session={s} onResume={onResume}/>)}
          </div>
        )}

        {/* Other insights */}
        {otherInsights.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            <div style={{ fontSize:10, fontWeight:600, color:"var(--txt4)", textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>
              Insights ({otherInsights.length})
            </div>
            {otherInsights.slice(0, 3).map(i => <InsightCard key={i.id} insight={i} onDismiss={onDismissInsight}/>)}
            {otherInsights.length > 3 && (
              <div style={{ fontSize:11, color:"var(--txt4)", paddingLeft:4 }}>+{otherInsights.length - 3} more</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── MinimizedPill ───────────────────────────────────────────────────────

  function MinimizedPill({ briefing, onClick, isDesktop }) {
    if (!briefing) return null;
    const critCount = (briefing.sessions || []).reduce((n, s) => n + (s.insights || []).filter(i => i.severity === "error").length, 0)
      + (briefing.globalInsights || []).filter(i => i.severity === "error").length;
    return (
      <div onClick={onClick}
        style={{ margin: isDesktop ? "0 14px 4px" : "0 4px 2px", padding:"6px 14px", borderRadius:20,
          background:"var(--glass)", backdropFilter:"blur(var(--glass-blur))", WebkitBackdropFilter:"blur(var(--glass-blur))",
          border:"1px solid var(--glass-border)", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6,
          transition:"all .15s", boxShadow:"var(--glass-shd)" }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--glass-shd2)"}
        onMouseLeave={e => e.currentTarget.style.boxShadow = "var(--glass-shd)"}>
        <span style={{ fontSize:14 }}>{"\uD83E\uDD16"}</span>
        <span style={{ fontSize:12, fontWeight:600, color:"var(--txt2)" }}>Jarvis</span>
        {critCount > 0 && <span style={{ width:16, height:16, borderRadius:"50%", background:"var(--red)", color:"#fff",
          fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{critCount}</span>}
        <span style={{ fontSize:10, color:"var(--txt4)" }}>Ctrl+J</span>
      </div>
    );
  }

  // ── useJarvis Hook ──────────────────────────────────────────────────────

  function useJarvis(opts = {}) {
    const { apiBase = "", getAuthToken, sessions = [], isDesktop } = opts;
    const [briefing, setBriefing] = useState(null);
    const [isMinimized, setIsMinimized] = useState(() => {
      try { return localStorage.getItem("mc-jarvis-minimized") === "1"; } catch { return false; }
    });
    const [autoMinimized, setAutoMinimized] = useState(false);

    const showPanel = briefing && !isMinimized && !autoMinimized;

    const fetchBriefing = useCallback((force) => {
      const url = force ? `${apiBase}/api/jarvis/briefing?force=1` : `${apiBase}/api/jarvis/briefing`;
      const headers = {};
      if (getAuthToken) headers.Authorization = `Bearer ${getAuthToken()}`;
      fetch(url, { headers }).then(r => r.ok ? r.json() : null).then(d => { if (d) setBriefing(d); }).catch(() => {});
    }, [apiBase, getAuthToken]);

    // Fetch on mount
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
      setAutoMinimized(false);
    }, []);

    // Auto-minimize when any session becomes busy
    useEffect(() => {
      if (autoMinimized) return;
      const hasBusy = sessions.some(s => s.status === "busy");
      if (hasBusy && briefing && !isMinimized) {
        setAutoMinimized(true);
      }
    }, [sessions, briefing, isMinimized, autoMinimized]);

    /** Call from WS init handler to set initial briefing */
    const handleInit = useCallback((msg) => {
      if (msg.jarvisBriefing) setBriefing(msg.jarvisBriefing);
    }, []);

    /** Call from WS message handler (future: live briefing updates) */
    const handleWsMessage = useCallback((msg) => {
      if (msg.type === "jarvis_briefing") setBriefing(msg.briefing);
    }, []);

    return {
      briefing,
      isMinimized,
      showPanel,
      toggleMinimize,
      refresh: fetchBriefing,
      dismissInsight,
      handleInit,
      handleWsMessage,
    };
  }

  // ── Inject Keyframe Styles ──────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById("jarvis-styles")) return;
    const style = document.createElement("style");
    style.id = "jarvis-styles";
    style.textContent = `
@keyframes jarvisSlideDown{from{opacity:0;transform:translateY(-20px);max-height:0}to{opacity:1;transform:translateY(0);max-height:600px}}
@keyframes jarvisSlideUp{from{opacity:1;transform:translateY(0);max-height:600px}to{opacity:0;transform:translateY(-20px);max-height:0}}
    `.trim();
    document.head.appendChild(style);
  }

  // ── Export ──────────────────────────────────────────────────────────────

  window.JarvisUI = {
    BriefingPanel,
    SessionCard,
    InsightCard,
    MinimizedPill,
    useJarvis,
    injectStyles,
  };
})();

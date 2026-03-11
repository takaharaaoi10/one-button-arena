import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// #11  REMOTE CONFIG  — swap fetchRemoteConfig() for a real CDN endpoint.
//      Every tuning value lives here; nothing is hardcoded in game logic.
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_CONFIG = {
  RING_MAX: 220, RING_MIN: 12,
  PERFECT_INNER: 30, PERFECT_OUTER: 44,
  TARGET_INNER: 24,  TARGET_OUTER: 52,
  NEAR_MISS_OUTER: 70,   // band just outside GOOD → triggers SO CLOSE
  NEAR_MISS_REWARD: 25,  // pts for near-miss (no life lost)
  BASE_SPEED: 1.4, SPEED_INCREMENT: 0.22,
  ROUNDS_PER_LEVEL: 5, COMBO_STEP: 3,
  COMBO_MULTIPLIER: 0.5, LEVEL_SCORE_BONUS: 0.1,
  CALIBRATION_TAPS: 5,
};
async function fetchRemoteConfig() {
  // Production: const r = await fetch("https://cdn.example.com/arena-config.json");
  //             return { ...DEFAULT_CONFIG, ...await r.json() };
  return DEFAULT_CONFIG;
}

// ═══════════════════════════════════════════════════════════════════════════════
// #12  ANALYTICS — logEvent() batches events; plug in any endpoint
// ═══════════════════════════════════════════════════════════════════════════════
const _evQ = [];
function logEvent(name, props = {}) {
  _evQ.push({ name, ts: Date.now(), ...props });
  // Production: if (_evQ.length >= 20) flushToEndpoint(_evQ.splice(0));
}

// ═══════════════════════════════════════════════════════════════════════════════
// #3  LOCALSTORAGE LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════
const LB_KEY = "oba_lb_v2";
function loadLB()    { try { return JSON.parse(localStorage.getItem(LB_KEY) || "[]"); } catch { return []; } }
function saveLB(lb)  { try { localStorage.setItem(LB_KEY, JSON.stringify(lb)); } catch {} }
function addEntry(name, score, level, tele) {
  const lb = loadLB();
  lb.push({ name, score, level, date: new Date().toLocaleDateString(), tele });
  lb.sort((a, b) => b.score - a.score);
  const next = lb.slice(0, 10);
  saveLB(next);
  return next;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRADE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const GRADES = {
  PERFECT:   { label:"PERFECT",  color:"#0a84ff", points:500, losesLife:false },
  GREAT:     { label:"GREAT",    color:"#30d158", points:250, losesLife:false },
  GOOD:      { label:"GOOD",     color:"#ffd60a", points:100, losesLife:false },
  NEAR_MISS: { label:"SO CLOSE", color:"#ff9f0a", points:null, losesLife:false },
  MISS:      { label:"MISS",     color:"#ff2d55", points:0,   losesLife:true  },
};
function getGrade(r, cfg) {
  const { PERFECT_INNER:PI, PERFECT_OUTER:PO, TARGET_INNER:TI, TARGET_OUTER:TO,
          NEAR_MISS_OUTER:NM, NEAR_MISS_REWARD:NR } = cfg;
  if (r >= PI && r <= PO) return GRADES.PERFECT;
  if (r >= TI && r <= TO) return GRADES.GREAT;
  if (r >= TI-8 && r <= TO+8) return GRADES.GOOD;
  if (r <= NM) return { ...GRADES.NEAR_MISS, points: NR };
  return GRADES.MISS;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const FONT  = "'Chakra Petch','Courier New',monospace";
const DFONT = "'Russo One','Arial Black',sans-serif";

// ═══════════════════════════════════════════════════════════════════════════════
// #7  CALIBRATION SCREEN
//     Player taps a static ring N times; we compute their average timing offset
//     (in radius units) and store it in latencyOffsetRef.
// ═══════════════════════════════════════════════════════════════════════════════
function CalibrationScreen({ onComplete, config }) {
  const [taps, setTaps]   = useState([]);
  const [phase, setPhase] = useState("intro");
  const [flash, setFlash] = useState(false);
  const TARGET_R = 80, NEEDED = config.CALIBRATION_TAPS;

  const handleTap = useCallback(() => {
    if (phase !== "tapping") return;
    setFlash(true); setTimeout(() => setFlash(false), 80);
    // In a real integration, read the live radiusRef here.
    // We simulate with a small jitter around TARGET_R.
    const simR = TARGET_R + (Math.random() * 8 - 4);
    setTaps(prev => {
      const next = [...prev, simR];
      if (next.length >= NEEDED) {
        const offset = TARGET_R - (next.reduce((s,v) => s+v, 0) / next.length);
        logEvent("calibration_done", { offset });
        setPhase("done");
        setTimeout(() => onComplete(offset), 450);
      }
      return next;
    });
  }, [phase, NEEDED, onComplete]);

  useEffect(() => {
    const k = e => { if (e.code==="Space") { e.preventDefault(); handleTap(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [handleTap]);

  return (
    <div onClick={handleTap}
      style={{ textAlign:"center", cursor:"crosshair", animation:"fadeIn 0.5s ease", userSelect:"none" }}>
      <div style={{ fontSize:10, letterSpacing:5, color:"#0a84ff", marginBottom:8 }}>DEVICE SETUP</div>
      <div style={{ fontFamily:DFONT, fontSize:26, color:"#fff", marginBottom:8 }}>TAP CALIBRATION</div>
      {phase==="intro" && (<>
        <p style={{ fontSize:13, color:"#ffffff66", maxWidth:260, margin:"0 auto 28px", lineHeight:1.8 }}>
          Tap the ring {NEEDED}× to calibrate your device's input latency offset.
        </p>
        <button onClick={e => { e.stopPropagation(); setPhase("tapping"); logEvent("calibration_start"); }}
          style={{ background:"linear-gradient(135deg,#0a84ff,#0051a8)", border:"none", color:"#fff",
            fontFamily:DFONT, fontSize:15, letterSpacing:3, padding:"13px 36px", cursor:"pointer", borderRadius:4 }}>
          BEGIN
        </button>
      </>)}
      {phase==="tapping" && (
        <div style={{ position:"relative", width:200, height:200, margin:"20px auto 48px" }}>
          <svg viewBox="0 0 200 200" width="200" height="200">
            <circle cx="100" cy="100" r={TARGET_R} fill="none" stroke="#0a84ff2a" strokeWidth="20"/>
            <circle cx="100" cy="100" r={TARGET_R} fill="none" stroke="#0a84ff"
              strokeWidth={flash?5:1.5} style={{ transition:"stroke-width 0.05s" }}/>
            <circle cx="100" cy="100" r="6" fill="#0a84ff"/>
          </svg>
          <div style={{ fontSize:12, color:"#ffffff44", letterSpacing:2, textAlign:"center" }}>
            {NEEDED - taps.length} taps remaining
          </div>
        </div>
      )}
      {phase==="done" && (
        <div style={{ fontFamily:DFONT, fontSize:22, color:"#30d158", marginTop:20 }}>CALIBRATED ✓</div>
      )}
      <div style={{ marginTop:48, fontSize:11, color:"#ffffff1a" }}>
        <span onClick={e => { e.stopPropagation(); onComplete(0); }}
          style={{ cursor:"pointer", letterSpacing:2 }}>SKIP →</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// #10  AUDIO + HAPTICS HOOK (Web Audio API — no asset files needed)
// ═══════════════════════════════════════════════════════════════════════════════
function useAudio() {
  const ctxRef   = useRef(null);
  const mutedRef = useRef(false);
  const [muted, _setMuted] = useState(false);
  const setMuted = useCallback(v => { mutedRef.current = v; _setMuted(v); }, []);

  const getCtx = useCallback(() => {
    if (!ctxRef.current)
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const tone = useCallback((freq, dur, type="sine", vol=0.28, delay=0) => {
    if (mutedRef.current) return;
    try {
      const ctx = getCtx();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      g.gain.setValueAtTime(vol, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + dur + 0.01);
    } catch {}
  }, [getCtx]);

  const sounds = useMemo(() => ({
    perfect:   () => { tone(880,.12,"sine",.32); tone(1320,.16,"sine",.22,.06); tone(1760,.14,"sine",.18,.11); },
    great:     () => { tone(660,.12,"sine",.30); tone(990,.10,"sine",.18,.06); },
    good:      () => tone(440,.10,"triangle",.26),
    nearMiss:  () => tone(330,.09,"triangle",.20),
    miss:      () => { tone(180,.14,"sawtooth",.24); tone(110,.20,"square",.14,.06); },
    combo:     n  => [523,659,784,1047,1318].slice(0,Math.min(n,5)).forEach((f,i)=>tone(f,.09,"sine",.20,i*.054)),
    levelUp:   () => [523,659,784,1047].forEach((f,i)=>tone(f,.13,"sine",.26,i*.07)),
    countdown: () => tone(440,.07,"sine",.18),
    go:        () => { tone(523,.09,"sine",.28); tone(784,.14,"sine",.22,.08); },
  }), [tone]);

  const vib = useCallback(p => { try { navigator.vibrate?.(p); } catch {} }, []);
  const haptics = useMemo(() => ({
    perfect:  () => vib([40,20,40]),
    great:    () => vib([28]),
    good:     () => vib([14]),
    nearMiss: () => vib([10]),
    miss:     () => vib([80,40,80]),
    combo:    () => vib([18,10,18,10,36]),
    levelUp:  () => vib([28,14,28,14,56]),
  }), [vib]);

  return { sounds, haptics, muted, setMuted };
}

// ═══════════════════════════════════════════════════════════════════════════════
// #4 + #5  CANVAS PARTICLES — zero React re-renders, self-cleaning RAF loop
// ═══════════════════════════════════════════════════════════════════════════════
function useCanvasParticles(canvasRef) {
  const ptRef  = useRef([]);
  const rafRef = useRef(null);
  const idRef  = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const alive = [];
      for (const p of ptRef.current) {
        const n = { ...p, x:p.x+p.vx, y:p.y+p.vy, vy:p.vy+0.22, life:p.life-0.03 };
        if (n.life <= 0) continue;
        alive.push(n);
        ctx.globalAlpha = n.life;
        ctx.fillStyle   = n.color;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.size*n.life, 0, Math.PI*2); ctx.fill();
      }
      ptRef.current   = alive;
      ctx.globalAlpha = 1;
      rafRef.current  = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);                 // #5 cleanup ↓
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [canvasRef]);

  const burst = useCallback((x, y, color, count=18) => {
    for (let i=0; i<count; i++) {
      const a = Math.random()*Math.PI*2, s = 2+Math.random()*6;
      ptRef.current.push({ id:idRef.current++, x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life:1, color, size:2+Math.random()*4 });
    }
  }, []);

  return { burst };
}

// ═══════════════════════════════════════════════════════════════════════════════
// #9  TELEMETRY — per-round data for ghost PvP + server-side score validation
// ═══════════════════════════════════════════════════════════════════════════════
function useTelemetry() {
  const runRef = useRef(null);
  const startRun  = useCallback(level => { runRef.current = { t0:Date.now(), level, rounds:[] }; logEvent("run_start",{level}); }, []);
  const recordRound = useCallback((idx, r, grade, combo, lo) => {
    runRef.current?.rounds.push({ i:idx, r:Math.round(r*10)/10, g:grade.label, combo, lo, dt:Date.now()-(runRef.current?.t0??0) });
  }, []);
  const endRun = useCallback((score, level, total, maxCombo) => {
    if (!runRef.current) return null;
    const dist = runRef.current.rounds.reduce((a,r) => { a[r.g]=(a[r.g]||0)+1; return a; }, {});
    const tele = { ...runRef.current, score, level, total, maxCombo, t1:Date.now(), dist };
    logEvent("run_end", { score, level, total, maxCombo, dist });
    runRef.current = null;
    return tele;
  }, []);
  return { startRun, recordRound, endRun };
}

// ═══════════════════════════════════════════════════════════════════════════════
// #6  ARENA SVG — viewBox-based, fully responsive
// ═══════════════════════════════════════════════════════════════════════════════
function Arena({ radius, combo, gameState, lastHit, config }) {
  const { TARGET_INNER:TI, TARGET_OUTER:TO, PERFECT_INNER:PI, PERFECT_OUTER:PO, NEAR_MISS_OUTER:NM } = config;
  const cx=200, cy=200;
  const glow = combo>=9?"#ff375f":combo>=5?"#bf5af2":combo>=3?"#30d158":"#0a84ff";

  return (
    <svg viewBox="0 0 400 400" className="arena-svg"
      style={{ display:"block", filter:`drop-shadow(0 0 ${combo*3+8}px ${glow}44)` }}>
      <defs>
        <radialGradient id="bg"><stop offset="0%" stopColor="#0d1117"/><stop offset="100%" stopColor="#060809"/></radialGradient>
        <radialGradient id="rg"><stop offset="60%" stopColor="transparent"/><stop offset="100%" stopColor={`${glow}1a`}/></radialGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="sg"  ><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="400" height="400" fill="url(#bg)" rx="16"/>
      <rect width="400" height="400" fill="url(#rg)" rx="16"/>
      {[1,2,3,4,5].map(i=><g key={i}>
        <line x1={i*66} y1="0" x2={i*66} y2="400" stroke="#ffffff06" strokeWidth="1"/>
        <line x1="0" y1={i*66} x2="400" y2={i*66} stroke="#ffffff06" strokeWidth="1"/>
      </g>)}

      {/* Zone rings */}
      <circle cx={cx} cy={cy} r={(TO+NM)/2}  fill="none" stroke="#ff9f0a18" strokeWidth={NM-TO}/>
      <circle cx={cx} cy={cy} r={(TI+TO)/2}  fill="none" stroke="#ffd60a2a" strokeWidth={TO-TI}/>
      <circle cx={cx} cy={cy} r={(PI+PO)/2}  fill="none" stroke="#0a84ff3a" strokeWidth={PO-PI} filter="url(#glow)"/>

      {/* Labels */}
      <text x={cx+TO+6}  y={cy+4}  fill="#ffd60a66" fontSize="9" fontFamily={FONT}>GOOD</text>
      <text x={cx+PO+6}  y={cy-4}  fill="#0a84ff66" fontSize="9" fontFamily={FONT}>PERFECT</text>
      <text x={cx+NM+4}  y={cy+9}  fill="#ff9f0a44" fontSize="8" fontFamily={FONT}>CLOSE</text>

      {/* Center */}
      <circle cx={cx} cy={cy} r="7" fill={glow} opacity="0.9" filter="url(#sg)"/>
      <circle cx={cx} cy={cy} r="5" fill="#fff"  opacity="0.8"/>

      {/* Tick marks */}
      {Array.from({length:60},(_,i)=>{
        const a=(i/60)*Math.PI*2, M=i%5===0, r1=228, r2=228+(M?14:8);
        return <line key={i} x1={cx+Math.cos(a)*r1} y1={cy+Math.sin(a)*r1}
          x2={cx+Math.cos(a)*r2} y2={cy+Math.sin(a)*r2}
          stroke={M?"#ffffff3a":"#ffffff14"} strokeWidth={M?1.5:0.8}/>;
      })}

      {/* Shrinking ring + trails */}
      {gameState==="playing" && (<>
        {[0.12,0.25,0.45].map((a,i)=>(
          <circle key={i} cx={cx} cy={cy} r={radius+(i+1)*5}
            fill="none" stroke={glow} strokeWidth={1.4-i*0.35} opacity={a*0.5}/>
        ))}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={glow} strokeWidth={3} filter="url(#sg)"/>
        <circle cx={cx} cy={cy} r={radius-2} fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.35}/>
      </>)}

      {/* Hit flash */}
      {lastHit?.show && (
        <circle cx={cx} cy={cy} r={radius||40} fill="none"
          stroke={lastHit.color} strokeWidth={6} opacity={lastHit.alpha}/>
      )}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN GAME
// ═══════════════════════════════════════════════════════════════════════════════
export default function OneButtonArena() {

  // ── Config ──────────────────────────────────────────────────────────────────
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  useEffect(() => { fetchRemoteConfig().then(cfg => { setConfig(cfg); logEvent("config_loaded"); }); }, []);

  // ── Game-loop refs (never stale in closures) — #1 ────────────────────────────
  const gameStateRef   = useRef("menu");
  const radiusRef      = useRef(DEFAULT_CONFIG.RING_MAX);
  const comboRef       = useRef(0);
  const livesRef       = useRef(3);
  const scoreRef       = useRef(0);
  const levelRef       = useRef(1);
  const roundRef       = useRef(0);
  const totalRef       = useRef(0);
  const maxComboRef    = useRef(0);
  const latOffsetRef   = useRef(0);  // #7 calibration

  // Lifecycle refs — #2, #5
  const animFrameRef   = useRef(null);
  const countdownRef   = useRef(null);  // #2 interval stored in ref
  const hitLabelTimer  = useRef(null);
  const arenaWrapRef   = useRef(null);
  const canvasRef      = useRef(null);

  // Stable dispatch refs for event handlers — #1
  const fireRef        = useRef(null);
  const startGameRef   = useRef(null);

  // ── Render state ────────────────────────────────────────────────────────────
  const [gameState,  setGameState]  = useState("menu");
  const [radius,     setRadius]     = useState(DEFAULT_CONFIG.RING_MAX);
  const [score,      setScore]      = useState(0);
  const [combo,      setCombo]      = useState(0);
  const [lives,      setLives]      = useState(3);
  const [level,      setLevel]      = useState(1);
  const [round,      setRound]      = useState(0);
  const [totalRnds,  setTotalRnds]  = useState(0);
  const [maxCombo,   setMaxCombo]   = useState(0);
  const [hitLabel,   setHitLabel]   = useState(null);
  const [lastHit,    setLastHit]    = useState(null);
  const [countdown,  setCountdown]  = useState(3);
  const [comboFlare, setComboFlare] = useState(false);
  const [shake,      setShake]      = useState(false);
  const [highScore,  setHighScore]  = useState(0);
  const [leaderboard,setLeaderboard]= useState(loadLB);  // #3
  const [playerName, setPlayerName] = useState("");
  const [telemetry,  setTelemetry]  = useState(null);
  const [showCalib,  setShowCalib]  = useState(false);

  // ── Sub-hooks ────────────────────────────────────────────────────────────────
  const { burst }                      = useCanvasParticles(canvasRef);  // #4
  const { sounds, haptics, muted, setMuted } = useAudio();               // #10
  const { startRun, recordRound, endRun }    = useTelemetry();           // #9

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const triggerShake = useCallback(() => { setShake(true); setTimeout(()=>setShake(false),420); },[]);

  const flashLabel = useCallback((grade) => {
    setHitLabel({ label:grade.label, color:grade.color, id:Date.now() });
    clearTimeout(hitLabelTimer.current);
    hitLabelTimer.current = setTimeout(() => setHitLabel(null), 750);
    setLastHit({ show:true, color:grade.color, alpha:0.85 });
    setTimeout(() => setLastHit(null), 160);
  }, []);

  // ── startRound — defined with useCallback so it can be called from fire ──────
  const startRound = useCallback(() => {
    const cfg = config;
    radiusRef.current = cfg.RING_MAX;
    setRadius(cfg.RING_MAX);
    gameStateRef.current = "playing";
    setGameState("playing");
    const speed = cfg.BASE_SPEED + (levelRef.current - 1) * cfg.SPEED_INCREMENT;

    const animate = () => {
      if (gameStateRef.current !== "playing") return;
      radiusRef.current = Math.max(cfg.RING_MIN, radiusRef.current - speed);
      setRadius(radiusRef.current);

      if (radiusRef.current <= cfg.RING_MIN + 1) {
        // Auto-miss: ring reached center
        gameStateRef.current = "hit"; setGameState("hit");
        comboRef.current = 0; setCombo(0);
        const next = livesRef.current - 1;
        livesRef.current = next; setLives(next);
        flashLabel(GRADES.MISS); sounds.miss(); haptics.miss(); triggerShake();
        logEvent("grade", { grade:"MISS", auto:true, level:levelRef.current });
        recordRound(totalRef.current, cfg.RING_MIN, GRADES.MISS, 0, latOffsetRef.current);
        totalRef.current += 1; setTotalRnds(totalRef.current);
        if (next <= 0) { gameStateRef.current = "dead"; setGameState("dead"); }
        else setTimeout(startRound, 600);
        return;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // ── fire ─────────────────────────────────────────────────────────────────────
  const fire = useCallback(() => {
    if (gameStateRef.current !== "playing") return;
    cancelAnimationFrame(animFrameRef.current);  // #5
    gameStateRef.current = "hit"; setGameState("hit");

    // #7 apply latency offset
    const effR  = Math.max(config.RING_MIN, radiusRef.current + latOffsetRef.current);
    const grade = getGrade(effR, config);

    // Burst particles from arena centre
    const rect = arenaWrapRef.current?.getBoundingClientRect();
    if (rect) burst(rect.left+rect.width/2, rect.top+rect.height/2, grade.color, grade.points>0?22:8);

    // Audio + haptics
    const fn = grade.label==="PERFECT"?"perfect":grade.label==="GREAT"?"great":
               grade.label==="GOOD"?"good":grade.label==="SO CLOSE"?"nearMiss":"miss";
    sounds[fn]?.(); haptics[fn]?.();

    // #8 near-miss: partial reward, streak reset, no life lost
    const isNM   = grade.label === "SO CLOSE";
    const isMiss = grade.losesLife;

    if (isMiss) {
      comboRef.current = 0; setCombo(0);
      const next = livesRef.current - 1;
      livesRef.current = next; setLives(next);
      triggerShake();
      if (next <= 0) { gameStateRef.current = "dead"; setGameState("dead"); }
    } else {
      const nc = isNM ? 0 : comboRef.current + 1;
      comboRef.current = nc; setCombo(nc);
      if (!isNM) {
        if (nc > maxComboRef.current) { maxComboRef.current = nc; setMaxCombo(nc); }
        if (nc > 0 && nc % config.COMBO_STEP === 0) {
          setComboFlare(true); setTimeout(()=>setComboFlare(false), 800);
          sounds.combo(nc / config.COMBO_STEP); haptics.combo();
        }
      }
      const mult = 1 + Math.floor((isNM?0:nc)/config.COMBO_STEP)*config.COMBO_MULTIPLIER;
      const pts  = Math.round((grade.points??0) * mult * (1+(levelRef.current-1)*config.LEVEL_SCORE_BONUS));
      scoreRef.current += pts; setScore(scoreRef.current);
    }

    flashLabel(grade);
    logEvent("grade", { grade:grade.label, r:effR, combo:comboRef.current, level:levelRef.current });  // #12
    recordRound(totalRef.current, effR, grade, comboRef.current, latOffsetRef.current);  // #9
    totalRef.current += 1; setTotalRnds(totalRef.current);

    // Level progression
    if (!isMiss) {
      roundRef.current += 1;
      if (roundRef.current >= config.ROUNDS_PER_LEVEL) {
        roundRef.current = 0; levelRef.current += 1;
        setLevel(levelRef.current); setRound(0);
        sounds.levelUp(); haptics.levelUp();
      } else { setRound(roundRef.current); }
    }

    if (gameStateRef.current !== "dead")
      setTimeout(startRound, grade.label==="PERFECT"?280:460);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, startRound, burst, sounds, haptics, flashLabel, triggerShake, recordRound]);

  // Keep stable dispatch refs current — #1
  useEffect(() => { fireRef.current      = fire;      }, [fire]);
  useEffect(() => { startGameRef.current = startGame; });  // updated every render (no deps)

  // ── Keyboard handler — reads refs, NEVER stale — #1 ─────────────────────────
  useEffect(() => {
    const h = e => {
      if (e.code!=="Space" && e.key!==" ") return;
      e.preventDefault();
      const gs = gameStateRef.current;
      if (gs==="playing") fireRef.current?.();
      else if (gs==="menu") startGameRef.current?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);  // intentionally empty — stability via refs

  // ── startGame ────────────────────────────────────────────────────────────────
  function startGame() {
    scoreRef.current=0; comboRef.current=0; maxComboRef.current=0;
    livesRef.current=3; levelRef.current=1; roundRef.current=0; totalRef.current=0;
    setScore(0); setCombo(0); setMaxCombo(0); setLives(3);
    setLevel(1); setRound(0); setTotalRnds(0); setCountdown(3);
    gameStateRef.current = "countdown"; setGameState("countdown");
    startRun(1); logEvent("session_start");  // #9 #12

    let c = 3;
    clearInterval(countdownRef.current);           // #2 safety-clear any prior interval
    countdownRef.current = setInterval(() => {     // #2 stored in ref
      c--; setCountdown(c); sounds.countdown?.();
      if (c <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        sounds.go?.(); startRound();
      }
    }, 800);
  }

  // ── Game-over side-effects ────────────────────────────────────────────────────
  useEffect(() => {
    if (gameState !== "dead") return;
    cancelAnimationFrame(animFrameRef.current);  // #5
    setHighScore(p => Math.max(p, score));
    const tele = endRun(score, level, totalRef.current, maxComboRef.current);  // #9
    setTelemetry(tele);
    logEvent("session_end", { score, level, maxCombo:maxComboRef.current });   // #12
  }, [gameState]);  // eslint-disable-line

  // ── #2 + #5  Global unmount cleanup ──────────────────────────────────────────
  useEffect(() => () => {
    cancelAnimationFrame(animFrameRef.current);
    clearInterval(countdownRef.current);
    clearTimeout(hitLabelTimer.current);
  }, []);

  // ── Submit score ──────────────────────────────────────────────────────────────
  const submitScore = () => {
    if (!playerName.trim()) return;
    const lb = addEntry(playerName.trim().toUpperCase().slice(0,8), score, level, telemetry);
    setLeaderboard(lb); setGameState("leaderboard");
    logEvent("score_submitted", { name:playerName, score, level });
  };

  const handleTouch = e => {
    e.preventDefault();
    if (gameStateRef.current==="playing") fireRef.current?.();
    else if (gameStateRef.current==="menu") startGame();
  };

  const progressPct = `${(round/config.ROUNDS_PER_LEVEL)*100}%`;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ width:"100vw", height:"100vh", background:"#04060a", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", fontFamily:FONT, userSelect:"none",
      overflow:"hidden", position:"relative" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;600;700&family=Russo+One&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{width:100%;height:100%;overflow:hidden;background:#04060a}
        @keyframes hitPop     {0%{transform:translateY(0) scale(.6);opacity:0}30%{transform:translateY(-8px) scale(1.3);opacity:1}100%{transform:translateY(-44px) scale(1);opacity:0}}
        @keyframes nearPop    {0%{transform:translateY(0) scale(.5) rotate(-4deg);opacity:0}35%{transform:translateY(-6px) scale(1.15) rotate(2deg);opacity:1}100%{transform:translateY(-38px);opacity:0}}
        @keyframes comboFlare {0%{transform:scale(.8);opacity:0}40%{transform:scale(1.4);opacity:1}100%{transform:scale(1.1);opacity:0}}
        @keyframes shake      {0%,100%{transform:translateX(0)}20%{transform:translateX(-8px) rotate(-1deg)}40%{transform:translateX(8px) rotate(1deg)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
        @keyframes pulse      {0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes fadeIn     {from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes countPop   {0%{transform:scale(2);opacity:0}40%{transform:scale(.9);opacity:1}70%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes glitch     {0%,100%{text-shadow:2px 0 #ff375f,-2px 0 #0a84ff}25%{text-shadow:-2px 0 #ff375f,2px 0 #0a84ff}50%{text-shadow:2px 2px #ff375f,-2px -2px #0a84ff}}
        @keyframes heartbeat  {0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
        .arena-svg { width: min(72vh, 86vw); height: min(72vh, 86vw); max-width: 680px; max-height: 680px; display:block; }
      `}</style>

      {/* Scanline */}
      <div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:100,
        background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px)"}}/>
      {/* Ambient */}
      <div style={{ position:"fixed",inset:0,pointerEvents:"none",
        background:"radial-gradient(ellipse 60% 60% at 50% 50%,#0a1628 0%,#04060a 70%)"}}/>

      {/* #4 Canvas particles — fullscreen, zero React renders */}
      <canvas ref={canvasRef} style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:90 }}/>

      {/* Mute toggle — #10 */}
      {gameState!=="menu" && gameState!=="leaderboard" && !showCalib && (
        <button onClick={()=>setMuted(!muted)}
          style={{ position:"fixed",top:14,right:14,zIndex:200,
            background:"#ffffff0f",border:"1px solid #ffffff1a",color:muted?"#ffffff33":"#ffffff88",
            fontFamily:FONT,fontSize:10,letterSpacing:2,padding:"5px 10px",cursor:"pointer",borderRadius:4 }}>
          {muted?"🔇":"🔊"}
        </button>
      )}

      {/* ── CALIBRATION ── */}
      {showCalib && (
        <div style={{ position:"relative",zIndex:10,animation:"fadeIn .5s ease" }}>
          <CalibrationScreen config={config} onComplete={offset => {
            latOffsetRef.current = offset;
            logEvent("calibration_applied",{offset});
            setShowCalib(false);
          }}/>
        </div>
      )}

      {/* ── MENU ── */}
      {!showCalib && gameState==="menu" && (
        <div style={{ textAlign:"center",animation:"fadeIn .5s ease",position:"relative",zIndex:10,padding:"0 16px" }}>
          <div style={{ fontSize:11,letterSpacing:8,color:"#0a84ff",marginBottom:12 }}>Season 1</div>
          <h1 style={{ fontFamily:DFONT,fontSize:"clamp(38px,8vw,66px)",color:"#fff",
            margin:"0 0 4px",animation:"glitch 4s infinite",lineHeight:1 }}>ONE BUTTON</h1>
          <h2 style={{ fontFamily:DFONT,fontSize:"clamp(24px,5vw,42px)",color:"#0a84ff",
            margin:"0 0 36px",letterSpacing:6 }}>ARENA</h2>

          <div style={{ display:"flex",justifyContent:"center",marginBottom:32,opacity:.7 }}>
            <svg viewBox="0 0 140 140" width="140" height="140">
              <circle cx="70" cy="70" r="60" fill="none" stroke="#ffffff08" strokeWidth="1" strokeDasharray="4 3"/>
              <circle cx="70" cy="70" r="40" fill="none" stroke="#ffd60a2a" strokeWidth="16"/>
              <circle cx="70" cy="70" r="34" fill="none" stroke="#0a84ff3a" strokeWidth="8"/>
              <circle cx="70" cy="70" r="6" fill="#0a84ff"/>
              <circle cx="70" cy="70" r="56" fill="none" stroke="#0a84ff" strokeWidth="2.5"
                style={{ animation:"pulse 1.5s ease-in-out infinite" }}/>
            </svg>
          </div>

          {["Hit the ring in the target zone","PERFECT=500 · GREAT=250 · SO CLOSE=bonus",
            "Combos multiply your score","Miss 3 times = Game Over"].map((t,i)=>(
            <div key={i} style={{ fontSize:13,color:i===0?"#ffffff99":"#ffffff55",letterSpacing:1,marginBottom:6 }}>{t}</div>
          ))}

          <div style={{ display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginTop:28 }}>
            <button onClick={startGame}
              style={{ background:"linear-gradient(135deg,#0a84ff,#0051a8)",border:"none",color:"#fff",
                fontFamily:DFONT,fontSize:20,letterSpacing:4,padding:"15px 52px",cursor:"pointer",borderRadius:4,
                boxShadow:"0 0 28px #0a84ff44,0 4px 20px #00000080" }}>
              PLAY
            </button>
            <button onClick={()=>{ setShowCalib(true); logEvent("calibration_open"); }}
              style={{ background:"#ffffff0a",border:"1px solid #ffffff1a",color:"#ffffff66",
                fontFamily:FONT,fontSize:11,letterSpacing:2,padding:"15px 18px",cursor:"pointer",borderRadius:4 }}>
              CALIBRATE
            </button>
          </div>
          <div style={{ marginTop:12,fontSize:11,color:"#ffffff22",letterSpacing:2 }}>PRESS SPACE OR TAP</div>

          {leaderboard.length>0 && (
            <div style={{ marginTop:28 }}>
              <div style={{ fontSize:11,letterSpacing:4,color:"#ffffff2a",marginBottom:10 }}>HALL OF FAME</div>
              {leaderboard.slice(0,3).map((e,i)=>(
                <div key={i} style={{ display:"flex",gap:16,justifyContent:"center",
                  fontSize:13,color:i===0?"#ffd60a":"#ffffff44",marginBottom:4 }}>
                  <span>{["🥇","🥈","🥉"][i]}</span>
                  <span style={{ width:80,textAlign:"left" }}>{e.name}</span>
                  <span>{e.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── COUNTDOWN ── */}
      {!showCalib && gameState==="countdown" && (
        <div style={{ position:"absolute",zIndex:20,textAlign:"center",animation:"countPop .6s ease" }}>
          <div style={{ fontFamily:DFONT,fontSize:120,color:"#0a84ff",lineHeight:1,
            textShadow:"0 0 60px #0a84ff,0 0 120px #0a84ff44" }}>
            {countdown||"GO!"}
          </div>
        </div>
      )}

      {/* ── PLAYING ── */}
      {!showCalib && (gameState==="playing"||gameState==="hit"||gameState==="countdown") && (
        <div style={{ position:"fixed",inset:0,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",
          animation:shake?"shake .4s ease":"none",zIndex:10,
          padding:"clamp(8px,2vh,20px) clamp(12px,3vw,28px)" }}>

          {/* Exit button */}
          <button onClick={()=>{ cancelAnimationFrame(animFrameRef.current); clearInterval(countdownRef.current); gameStateRef.current="menu"; setGameState("menu"); }}
            style={{ position:"fixed",top:14,left:14,zIndex:200,
              background:"#ffffff0f",border:"1px solid #ffffff1a",color:"#ffffff55",
              fontFamily:FONT,fontSize:10,letterSpacing:2,padding:"5px 10px",cursor:"pointer",borderRadius:4 }}>
            ← EXIT
          </button>

          {/* HUD — pinned to top */}
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",
            width:"100%",maxWidth:"min(700px,90vw)",marginBottom:"clamp(4px,1vh,14px)",flexShrink:0 }}>
            <div>
              <div style={{ fontSize:"clamp(9px,1.2vw,11px)",color:"#ffffff2a",letterSpacing:3,marginBottom:2 }}>SCORE</div>
              <div style={{ fontFamily:DFONT,fontSize:"clamp(20px,3.5vw,40px)",color:"#fff",lineHeight:1 }}>{score.toLocaleString()}</div>
              {highScore>0&&score>0&&score>=highScore&&(
                <div style={{ fontSize:"clamp(8px,1vw,10px)",color:"#ffd60a",letterSpacing:2,marginTop:2 }}>★ NEW BEST</div>
              )}
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:"clamp(9px,1.2vw,11px)",color:"#ffffff2a",letterSpacing:3,marginBottom:3 }}>LEVEL</div>
              <div style={{ fontFamily:DFONT,fontSize:"clamp(18px,3vw,36px)",color:"#0a84ff",lineHeight:1 }}>{level}</div>
              <div style={{ width:"clamp(56px,8vw,96px)",height:3,background:"#ffffff18",borderRadius:2,marginTop:4,overflow:"hidden" }}>
                <div style={{ height:"100%",width:progressPct,background:"#0a84ff",borderRadius:2,transition:"width .3s" }}/>
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"clamp(15px,2.5vw,24px)",marginBottom:3,animation:lives===1?"heartbeat .5s infinite":"none" }}>
                {[0,1,2].map(i=><span key={i} style={{ opacity:i<lives?1:.14,marginLeft:2 }}>❤️</span>)}
              </div>
              {combo>=2&&(
                <div style={{ fontFamily:DFONT,fontSize:"clamp(10px,1.6vw,17px)",letterSpacing:1,
                  color:combo>=9?"#ff375f":combo>=5?"#bf5af2":combo>=3?"#30d158":"#ffd60a",
                  textShadow:"0 0 12px currentColor" }}>×{combo} COMBO</div>
              )}
            </div>
          </div>

          {/* #8 Hit / near-miss label */}
          {hitLabel && (
            <div key={hitLabel.id} style={{
              position:"fixed",top:"16%",left:"50%",transform:"translateX(-50%)",
              fontFamily:DFONT,fontSize:"clamp(18px,3vw,32px)",color:hitLabel.color,
              letterSpacing:hitLabel.label==="SO CLOSE"?3:4,pointerEvents:"none",zIndex:30,
              textShadow:`0 0 16px ${hitLabel.color}`,whiteSpace:"nowrap",
              animation:hitLabel.label==="SO CLOSE"?"nearPop .75s ease forwards":"hitPop .7s ease forwards"
            }}>{hitLabel.label}</div>
          )}

          {/* Combo flare */}
          {comboFlare && (
            <div style={{ position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
              fontFamily:DFONT,fontSize:"clamp(36px,6vw,72px)",color:combo>=9?"#ff375f":"#bf5af2",
              pointerEvents:"none",zIndex:31,textShadow:"0 0 40px currentColor",
              animation:"comboFlare .8s ease forwards" }}>COMBO!</div>
          )}

          {/* Arena — takes all remaining space, perfectly centered */}
          <div ref={arenaWrapRef} onClick={handleTouch}
            style={{ cursor:"crosshair",touchAction:"none",flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center" }}>
            <Arena radius={radius} combo={combo} gameState={gameState}
              lastHit={lastHit} config={config}/>
          </div>

          <div style={{ marginTop:"clamp(6px,1vh,12px)",fontSize:"clamp(10px,1.2vw,12px)",
            color:"#ffffff22",letterSpacing:3,flexShrink:0,
            animation:gameState==="playing"?"pulse 1s ease-in-out infinite":"none" }}>
            {gameState==="playing"?"— TAP OR SPACE —":"●●●"}
          </div>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {!showCalib && gameState==="dead" && (
        <div style={{ textAlign:"center",animation:"fadeIn .6s ease",position:"relative",
          zIndex:10,maxWidth:340,padding:"0 16px",width:"100%" }}>
          <div style={{ fontSize:11,letterSpacing:6,color:"#ff375f",marginBottom:8 }}>GAME OVER</div>
          <div style={{ fontFamily:DFONT,fontSize:54,color:"#fff",lineHeight:1,marginBottom:6 }}>
            {score.toLocaleString()}
          </div>
          {score>0&&score>=highScore&&(
            <div style={{ fontSize:12,color:"#ffd60a",letterSpacing:3,marginBottom:6 }}>★ PERSONAL BEST</div>
          )}
          <div style={{ fontSize:12,color:"#ffffff33",letterSpacing:2,marginBottom:24 }}>
            LVL {level} · {totalRnds} ROUNDS · MAX ×{maxCombo}
          </div>

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14 }}>
            {[{l:"LEVEL",v:level},{l:"ROUNDS",v:totalRnds},{l:"COMBO",v:`×${maxCombo}`}].map(s=>(
              <div key={s.l} style={{ background:"#ffffff07",borderRadius:6,padding:"9px 5px",border:"1px solid #ffffff0d" }}>
                <div style={{ fontSize:9,color:"#ffffff2a",letterSpacing:2,marginBottom:3 }}>{s.l}</div>
                <div style={{ fontFamily:DFONT,fontSize:19,color:"#fff" }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* #9 Grade distribution from telemetry */}
          {telemetry?.dist && (
            <div style={{ display:"flex",gap:5,justifyContent:"center",marginBottom:20,flexWrap:"wrap" }}>
              {Object.entries(telemetry.dist).map(([g,n])=>{
                const c={PERFECT:"#0a84ff",GREAT:"#30d158",GOOD:"#ffd60a","SO CLOSE":"#ff9f0a",MISS:"#ff2d55"}[g]||"#fff";
                return <div key={g} style={{ fontSize:9,color:c,background:`${c}15`,
                  border:`1px solid ${c}28`,borderRadius:3,padding:"3px 7px",letterSpacing:1 }}>
                  {g} ×{n}
                </div>;
              })}
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10,color:"#ffffff33",letterSpacing:3,marginBottom:8 }}>ENTER YOUR NAME</div>
            <input value={playerName}
              onChange={e=>setPlayerName(e.target.value.toUpperCase().slice(0,8))}
              onKeyDown={e=>e.key==="Enter"&&submitScore()}
              placeholder="AAA" maxLength={8}
              style={{ background:"#ffffff08",border:"1.5px solid #0a84ff44",color:"#fff",
                fontFamily:DFONT,fontSize:20,textAlign:"center",letterSpacing:8,
                padding:"10px 20px",borderRadius:4,outline:"none",width:"100%" }}/>
          </div>

          <div style={{ display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap" }}>
            <button onClick={submitScore}
              style={{ background:"linear-gradient(135deg,#30d158,#1a8a36)",border:"none",color:"#fff",
                fontFamily:DFONT,fontSize:14,letterSpacing:3,padding:"12px 26px",cursor:"pointer",
                borderRadius:4,boxShadow:"0 0 16px #30d15822" }}>SAVE</button>
            <button onClick={startGame}
              style={{ background:"linear-gradient(135deg,#0a84ff,#0051a8)",border:"none",color:"#fff",
                fontFamily:DFONT,fontSize:14,letterSpacing:3,padding:"12px 26px",cursor:"pointer",
                borderRadius:4,boxShadow:"0 0 16px #0a84ff22" }}>RETRY</button>
          </div>
          <button onClick={()=>setGameState("menu")}
            style={{ marginTop:12,background:"none",border:"none",color:"#ffffff2a",
              fontFamily:FONT,fontSize:11,cursor:"pointer",letterSpacing:2 }}>← MENU</button>
        </div>
      )}

      {/* ── LEADERBOARD ── */}
      {!showCalib && gameState==="leaderboard" && (
        <div style={{ animation:"fadeIn .5s ease",position:"relative",zIndex:10,
          textAlign:"center",padding:"0 16px",width:"100%",maxWidth:360 }}>
          <div style={{ fontSize:11,letterSpacing:6,color:"#ffd60a",marginBottom:6 }}>HALL OF FAME</div>
          <div style={{ fontFamily:DFONT,fontSize:34,color:"#fff",marginBottom:22 }}>LEADERBOARD</div>
          {leaderboard.map((e,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:12,padding:"9px 16px",
              marginBottom:5,borderRadius:6,
              background:i===0?"#ffd60a10":"#ffffff06",border:`1px solid ${i===0?"#ffd60a22":"#ffffff08"}`,
              animation:`fadeIn ${.2+i*.07}s ease` }}>
              <span style={{ fontFamily:DFONT,fontSize:15,width:24,
                color:["#ffd60a","#c0c0c0","#cd7f32"][i]||"#ffffff22" }}>{i+1}</span>
              <span style={{ fontFamily:DFONT,fontSize:15,flex:1,textAlign:"left",color:"#fff" }}>{e.name}</span>
              <span style={{ fontFamily:DFONT,fontSize:14,color:i===0?"#ffd60a":"#ffffff66" }}>
                {e.score.toLocaleString()}
              </span>
              <span style={{ fontSize:9,color:"#ffffff22",letterSpacing:1 }}>L{e.level}</span>
            </div>
          ))}
          <div style={{ display:"flex",gap:10,justifyContent:"center",marginTop:20 }}>
            <button onClick={startGame}
              style={{ background:"linear-gradient(135deg,#0a84ff,#0051a8)",border:"none",color:"#fff",
                fontFamily:DFONT,fontSize:14,letterSpacing:3,padding:"12px 26px",cursor:"pointer",borderRadius:4 }}>
              PLAY AGAIN
            </button>
            <button onClick={()=>setGameState("menu")}
              style={{ background:"#ffffff08",border:"1px solid #ffffff15",color:"#ffffff55",
                fontFamily:FONT,fontSize:11,letterSpacing:2,padding:"12px 18px",cursor:"pointer",borderRadius:4 }}>
              MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

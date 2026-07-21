/* Bloxis – LevelMap: scrollbar bankarta i Candy Crush-stil.
   Fejk-3D med parallaxlager, allt ritat i kod (SVG + CSS), inga assets.
   Prestanda: parallax och animationer använder enbart transform/opacity,
   scrollhanteraren är rAF-gatad. */
import React, {
  useCallback, useEffect, useMemo, useRef, useState
} from 'react';
import { WorldTheme, themeA } from './theme';
import './levelmap.css';

export interface LevelData {
  id: number;
  stars: 0 | 1 | 2 | 3;
  unlocked: boolean;
}

export interface LevelMapProps {
  levels: LevelData[];
  /** Nivå som avataren står på. Default: första upplåsta utan stjärnor. */
  currentId?: number;
  onLevelSelect?: (id: number) => void;
  theme?: WorldTheme;
}

/* ===== Layoutkonstanter ===== */
const NODE_GAP = 132;      // px mellan noder i höjdled
const TOP_PAD = 170;
const BOTTOM_PAD = 150;
const AMPLITUDE = 29;      // slingrets bredd i % av kartbredden

/* Parallaxhastigheter: <1 = längre bort, >1 = närmare än vägen. */
const SPEED_BG = 0.18;
const SPEED_MID = 0.45;
const SPEED_FG = 1.15;

/** Deterministisk "slump" så dekoren ser likadan ut varje render. */
function seeded(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Pt { xPct: number; y: number; }

function nodePos(i: number, totalH: number): Pt {
  return {
    xPct: 50 + Math.sin(i * 0.9) * AMPLITUDE,
    y: totalH - BOTTOM_PAD - i * NODE_GAP
  };
}

/** Mjuk kurva genom punkterna (kvadratiska segment via mittpunkter). */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].xPct} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].xPct + pts[i + 1].xPct) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].xPct} ${pts[i].y} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.xPct} ${last.y}`;
}

/** Böljande kullsilhuett som SVG-path (fylls ner till botten). */
function ridge(yBase: number, amp: number, freq: number, phase: number, h: number): string {
  let d = `M 0 ${h}`;
  for (let x = 0; x <= 100; x += 4) {
    const y = yBase + Math.sin((x / 100) * Math.PI * 2 * freq + phase) * amp;
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  return `${d} L 100 ${h} Z`;
}

/* ===== Småkomponenter (ren SVG, inga assets) ===== */

function Stars({ count, theme }: { count: number; theme: WorldTheme }) {
  return (
    <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
      {[0, 1, 2].map(i => (
        <path
          key={i}
          transform={`translate(${i * 15 + 1} ${i === 1 ? 0 : 2}) scale(0.6)`}
          d="M10 0 L12.9 6.1 L19.6 7 L14.7 11.6 L16 18.2 L10 15 L4 18.2 L5.3 11.6 L0.4 7 L7.1 6.1 Z"
          fill={i < count ? theme.star : theme.starEmpty}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="1.4"
        />
      ))}
    </svg>
  );
}

function Padlock() {
  return (
    <svg width="24" height="26" viewBox="0 0 24 26" aria-hidden>
      <rect x="3" y="11" width="18" height="13" rx="3.5" fill="#c9a23f" stroke="rgba(0,0,0,0.35)" strokeWidth="1.4" />
      <path d="M7 11 V8 a5 5 0 0 1 10 0 V11" fill="none" stroke="#b0bec8" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="2.2" fill="#5a4713" />
    </svg>
  );
}

function Avatar({ theme }: { theme: WorldTheme }) {
  const a = theme.avatar;
  return (
    <svg viewBox="0 0 46 46" width="46" height="46" aria-hidden>
      <ellipse cx="23" cy="26" rx="17" ry="18" fill={a.body} />
      <ellipse cx="23" cy="31" rx="10" ry="9" fill={a.belly} />
      <circle cx="17" cy="20" r="3.1" fill="#fff" />
      <circle cx="29" cy="20" r="3.1" fill="#fff" />
      <circle cx="17.8" cy="20.7" r="1.6" fill={a.eye} />
      <circle cx="29.8" cy="20.7" r="1.6" fill={a.eye} />
      <path d="M19 27 Q23 30.5 27 27" stroke={a.eye} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M14 9 Q17 3 21 8" stroke={a.body} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M32 9 Q29 3 25 8" stroke={a.body} strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ===== Parallaxlagrens innehåll ===== */

function BackgroundLayer({ theme, height }: { theme: WorldTheme; height: number }) {
  const bands = useMemo(() => {
    const out: React.ReactNode[] = [];
    const n = Math.max(2, Math.round(height / 420));
    for (let b = 0; b < n; b++) {
      const r = seeded(b * 17 + 3);
      out.push(
        <path
          key={b}
          d={ridge(height - 90 - b * ((height - 160) / n), 24 + r * 18, 1.1 + r, r * 6.28, height)}
          fill={theme.hillsFar}
          opacity={0.5 - b * (0.3 / n)}
        />
      );
    }
    return out;
  }, [theme, height]);

  // sjö med glitter längst ner
  const sparkles = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      x: 6 + seeded(i * 7 + 1) * 88,
      y: height - 18 - seeded(i * 3 + 2) * 46,
      r: 0.5 + seeded(i * 5 + 4) * 0.7,
      delay: seeded(i * 11) * 2.4
    })), [height]);

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }}>
      {bands}
      <rect x="0" y={height - 74} width="100" height="74" fill={theme.water.deep} />
      <rect x="0" y={height - 74} width="100" height="26" fill={theme.water.surface} />
      {sparkles.map((s, i) => (
        <circle
          key={i}
          className="lm-sparkle"
          style={{ ['--delay' as string]: `${s.delay}s` }}
          cx={s.x} cy={s.y} r={s.r}
          fill={theme.water.sparkle}
        />
      ))}
    </svg>
  );
}

function MidLayer({ theme, height }: { theme: WorldTheme; height: number }) {
  const hills = useMemo(() => {
    const out: React.ReactNode[] = [];
    const n = Math.max(2, Math.round(height / 360));
    for (let b = 0; b < n; b++) {
      const r = seeded(b * 29 + 7);
      out.push(
        <path
          key={b}
          d={ridge(height - 60 - b * ((height - 140) / n), 30 + r * 22, 1.4 + r * 0.8, r * 6.28 + 2, height)}
          fill={b % 2 ? theme.hillsMid : theme.hillsNear}
          opacity={0.55 - b * (0.25 / n)}
        />
      );
    }
    return out;
  }, [theme, height]);

  const clouds = useMemo(() =>
    Array.from({ length: Math.max(3, Math.round(height / 500)) }, (_, i) => ({
      top: 60 + seeded(i * 13 + 5) * (height - 200),
      scale: 0.7 + seeded(i * 7 + 2) * 0.7,
      dur: 46 + seeded(i * 3 + 1) * 40,
      delay: -seeded(i * 5 + 9) * 60
    })), [height]);

  return (
    <div style={{ position: 'relative', height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height, position: 'absolute', inset: 0, width: '100%' }}>
        {hills}
      </svg>
      {clouds.map((c, i) => (
        <div
          key={i}
          className="lm-cloud"
          style={{
            top: c.top,
            ['--dur' as string]: `${c.dur}s`,
            ['--delay' as string]: `${c.delay}s`
          }}
        >
          <svg width={110 * c.scale} height={44 * c.scale} viewBox="0 0 110 44">
            <ellipse cx="34" cy="30" rx="30" ry="13" fill={theme.cloud} />
            <ellipse cx="62" cy="22" rx="24" ry="15" fill={theme.cloud} />
            <ellipse cx="84" cy="31" rx="20" ry="11" fill={theme.cloud} />
          </svg>
        </div>
      ))}
    </div>
  );
}

function ForegroundLayer({ theme, height }: { theme: WorldTheme; height: number }) {
  // buskar/stenar i kanterna, närmare kameran än vägen
  const props = useMemo(() =>
    Array.from({ length: Math.max(4, Math.round(height / 300)) }, (_, i) => {
      const r = seeded(i * 19 + 11);
      return {
        left: i % 2 === 0,
        y: 120 + (i / Math.max(4, Math.round(height / 300))) * (height - 260) + r * 90,
        scale: 0.55 + r * 0.4,
        flip: r > 0.5
      };
    }), [height]);

  return (
    <div style={{ position: 'relative', height }}>
      {props.map((p, i) => (
        <svg
          key={i}
          width={90 * p.scale}
          height={56 * p.scale}
          viewBox="0 0 90 56"
          style={{
            position: 'absolute',
            top: p.y,
            [p.left ? 'left' : 'right']: -22,
            transform: p.flip ? 'scaleX(-1)' : undefined
          }}
        >
          <ellipse cx="30" cy="40" rx="28" ry="16" fill={theme.foliage1} />
          <ellipse cx="58" cy="44" rx="22" ry="12" fill={theme.foliage2} />
          <ellipse cx="22" cy="32" rx="9" ry="5" fill="rgba(255,255,255,0.22)" />
        </svg>
      ))}
    </div>
  );
}

/* ===== Huvudkomponenten ===== */

export default function LevelMap({ levels, currentId, onLevelSelect, theme = themeA }: LevelMapProps) {
  const totalH = TOP_PAD + BOTTOM_PAD + (levels.length - 1) * NODE_GAP;
  const points = useMemo(
    () => levels.map((_, i) => nodePos(i, totalH)),
    [levels.length, totalH]
  );

  const currentIdx = useMemo(() => {
    if (currentId != null) {
      const idx = levels.findIndex(l => l.id === currentId);
      if (idx >= 0) return idx;
    }
    const idx = levels.findIndex(l => l.unlocked && l.stars === 0);
    return idx >= 0 ? idx : levels.length - 1;
  }, [levels, currentId]);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  const [viewH, setViewH] = useState(600);
  const [shakeId, setShakeId] = useState<number | null>(null);
  const [popIds, setPopIds] = useState<Set<number>>(new Set());
  const prevUnlocked = useRef<Map<number, boolean>>(new Map());
  const prevIdx = useRef<number | null>(null);
  const hopping = useRef(false);

  /* Mät höjden så parallaxlagren kan dimensioneras. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setViewH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layerH = useCallback(
    (speed: number) => viewH + Math.max(0, totalH - viewH) * speed,
    [viewH, totalH]
  );

  /* Parallax: rAF-gatad scrollhanterare, enbart transform. */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const st = scroller.scrollTop;
      if (bgRef.current) bgRef.current.style.transform = `translate3d(0, ${-st * SPEED_BG}px, 0)`;
      if (midRef.current) midRef.current.style.transform = `translate3d(0, ${-st * SPEED_MID}px, 0)`;
      if (fgRef.current) fgRef.current.style.transform = `translate3d(0, ${-st * SPEED_FG}px, 0)`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [viewH, totalH]);

  /* Pop-animation när noder låses upp. */
  useEffect(() => {
    const newly: number[] = [];
    levels.forEach(l => {
      if (l.unlocked && prevUnlocked.current.get(l.id) === false) newly.push(l.id);
      prevUnlocked.current.set(l.id, l.unlocked);
    });
    if (newly.length) {
      setPopIds(prev => new Set([...prev, ...newly]));
      const t = setTimeout(() => {
        setPopIds(prev => {
          const next = new Set(prev);
          newly.forEach(id => next.delete(id));
          return next;
        });
      }, 700);
      return () => clearTimeout(t);
    }
  }, [levels]);

  const avatarXY = useCallback((idx: number) => {
    const w = contentRef.current?.clientWidth ?? 390;
    const p = points[idx];
    return { x: (p.xPct / 100) * w, y: p.y };
  }, [points]);

  const scrollToIdx = useCallback((idx: number, smooth: boolean) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = points[idx].y - scroller.clientHeight * 0.55;
    scroller.scrollTo({
      top: Math.max(0, Math.min(target, totalH - scroller.clientHeight)),
      behavior: smooth ? 'smooth' : 'auto'
    });
  }, [points, totalH]);

  /* Avatar: placera direkt vid mount, hoppa nod-för-nod vid byte. */
  useEffect(() => {
    const el = avatarRef.current;
    if (!el) return;
    const from = prevIdx.current;
    prevIdx.current = currentIdx;
    const setAt = (idx: number) => {
      const { x, y } = avatarXY(idx);
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    if (from == null || from === currentIdx || hopping.current) {
      setAt(currentIdx);
      if (from == null) scrollToIdx(currentIdx, false);
      return;
    }
    // hoppa via varje mellanliggande nod med liten båge
    hopping.current = true;
    const dir = currentIdx > from ? 1 : -1;
    const steps: number[] = [];
    for (let i = from + dir; dir > 0 ? i <= currentIdx : i >= currentIdx; i += dir) steps.push(i);
    let prev = from;
    const hopOnce = (i: number): Promise<void> => {
      const a = avatarXY(prev);
      const b = avatarXY(steps[i]);
      prev = steps[i];
      const midX = (a.x + b.x) / 2;
      const midY = Math.min(a.y, b.y) - 54;
      const anim = el.animate(
        [
          { transform: `translate3d(${a.x}px, ${a.y}px, 0)` },
          { transform: `translate3d(${midX}px, ${midY}px, 0)`, offset: 0.5 },
          { transform: `translate3d(${b.x}px, ${b.y}px, 0)` }
        ],
        { duration: 400, easing: 'ease-in-out' }
      );
      return anim.finished.then(() => { el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`; });
    };
    (async () => {
      for (let i = 0; i < steps.length; i++) await hopOnce(i);
      hopping.current = false;
      scrollToIdx(currentIdx, true);
    })();
  }, [currentIdx, avatarXY, scrollToIdx]);

  const handleTap = useCallback((lv: LevelData) => {
    if (lv.unlocked) {
      onLevelSelect?.(lv.id);
    } else {
      setShakeId(lv.id);
      setTimeout(() => setShakeId(s => (s === lv.id ? null : s)), 500);
    }
  }, [onLevelSelect]);

  /* Tematokens → CSS-variabler. */
  const cssVars = {
    '--lm-sky1': theme.sky[0],
    '--lm-sky2': theme.sky[1],
    '--lm-node-base1': theme.node.base1,
    '--lm-node-base2': theme.node.base2,
    '--lm-node-done1': theme.node.done1,
    '--lm-node-done2': theme.node.done2,
    '--lm-node-locked': theme.node.lockedBase,
    '--lm-node-text': theme.node.text,
    '--lm-ring': theme.node.ring
  } as React.CSSProperties;

  const roadD = smoothPath(points);
  const doneD = currentIdx > 0 ? smoothPath(points.slice(0, currentIdx + 1)) : '';

  return (
    <div ref={rootRef} className="lm-root" style={cssVars}>
      {/* Parallax: bakgrund och mellanlager bakom vägen */}
      <div ref={bgRef} className="lm-layer" style={{ height: layerH(SPEED_BG) }}>
        <BackgroundLayer theme={theme} height={layerH(SPEED_BG)} />
      </div>
      <div ref={midRef} className="lm-layer" style={{ height: layerH(SPEED_MID) }}>
        <MidLayer theme={theme} height={layerH(SPEED_MID)} />
      </div>

      {/* Huvudlagret: väg + noder + avatar (hastighet 1.0) */}
      <div ref={scrollerRef} className="lm-scroller">
        <div ref={contentRef} className="lm-content" style={{ height: totalH }}>
          <svg className="lm-path-svg" viewBox={`0 0 100 ${totalH}`} preserveAspectRatio="none">
            <path d={roadD} fill="none" stroke={theme.path.edge} strokeWidth={17}
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={roadD} fill="none" stroke={theme.path.surface} strokeWidth={12}
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {doneD && (
              <path d={doneD} fill="none" stroke={theme.path.done} strokeWidth={12}
                strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )}
            <path className="lm-path-dash" d={roadD} fill="none" stroke={theme.path.dash}
              strokeWidth={2.5} strokeDasharray="6 12" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
          </svg>

          {levels.map((lv, i) => {
            const p = points[i];
            const cls = [
              'lm-node',
              lv.stars > 0 && 'is-done',
              !lv.unlocked && 'is-locked',
              i === currentIdx && lv.unlocked && 'is-current',
              popIds.has(lv.id) && 'is-popping',
              shakeId === lv.id && 'is-shaking'
            ].filter(Boolean).join(' ');
            return (
              <React.Fragment key={lv.id}>
                <div className="lm-node-shadow" style={{ left: `${p.xPct}%`, top: p.y }} />
                <button
                  className={cls}
                  style={{ left: `${p.xPct}%`, top: p.y }}
                  onClick={() => handleTap(lv)}
                  aria-label={lv.unlocked ? `Nivå ${lv.id}` : `Nivå ${lv.id} (låst)`}
                >
                  {lv.unlocked
                    ? <>
                        <span className="lm-node-num">{lv.id}</span>
                        <Stars count={lv.stars} theme={theme} />
                      </>
                    : <Padlock />}
                </button>
              </React.Fragment>
            );
          })}

          <div ref={avatarRef} className="lm-avatar">
            <div className="lm-avatar-inner">
              <Avatar theme={theme} />
            </div>
          </div>
        </div>
      </div>

      {/* Förgrund: närmast kameran, rör sig snabbare än vägen */}
      <div ref={fgRef} className="lm-layer" style={{ height: layerH(SPEED_FG), zIndex: 10 }}>
        <ForegroundLayer theme={theme} height={layerH(SPEED_FG)} />
      </div>
    </div>
  );
}

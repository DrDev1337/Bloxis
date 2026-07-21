/* Bloxis – LevelMap: scrollbar bankarta i Candy Crush-stil.
   Fejk-3D med parallaxlager, allt ritat i kod (SVG + CSS), inga assets.
   Prestanda: parallax och animationer använder enbart transform/opacity,
   scrollhanteraren är rAF-gatad. */
import React, {
  useCallback, useEffect, useMemo, useRef, useState
} from 'react';
import { PropKind, WorldTheme, themeA } from './theme';
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

/** Mjuk kurva som går exakt genom varje nodpunkt (Catmull-Rom → Bézier). */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let d = `M ${pts[0].xPct.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1x = p1.xPct + (p2.xPct - p0.xPct) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.xPct - (p3.xPct - p1.xPct) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.xPct.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
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

/** Y-värde på en kullsilhuett vid given x (för att sätta träd på åsen). */
function ridgeY(x: number, yBase: number, amp: number, freq: number, phase: number): number {
  return yBase + Math.sin((x / 100) * Math.PI * 2 * freq + phase) * amp;
}

/** Taggig bergskedja med snökrön. Topphöjder varieras deterministiskt. */
function peaksPath(yBase: number, amp: number, n: number, seedBase: number, h: number) {
  let d = `M 0 ${h} L 0 ${yBase}`;
  const caps: string[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = (i / n) * 100;
    const x2 = ((i + 1) / n) * 100;
    const xm = x0 + (x2 - x0) * (0.38 + seeded(seedBase + i * 7 + 2) * 0.24);
    const peakY = yBase - amp * (0.55 + seeded(seedBase + i) * 0.45);
    const valleyY = yBase - amp * seeded(seedBase + i * 3 + 1) * 0.18;
    d += ` L ${xm.toFixed(1)} ${peakY.toFixed(1)} L ${x2.toFixed(1)} ${valleyY.toFixed(1)}`;
    // snökrön: följer sidorna en bit ner med hackig underkant
    const t = 0.3;
    const lx = x0 + (xm - x0) * (1 - t), ly = valleyY + (peakY - valleyY) * (1 - t) + (yBase - valleyY) * 0;
    const rx = xm + (x2 - xm) * t, ry = peakY + (valleyY - peakY) * t;
    const capLy = peakY + (ly - peakY);
    caps.push(
      `M ${lx.toFixed(1)} ${capLy.toFixed(1)} L ${xm.toFixed(1)} ${peakY.toFixed(1)} ` +
      `L ${rx.toFixed(1)} ${ry.toFixed(1)} ` +
      `L ${(xm + (rx - xm) * 0.5).toFixed(1)} ${(ry + 9).toFixed(1)} ` +
      `L ${xm.toFixed(1)} ${(peakY + (ry - peakY) * 0.75).toFixed(1)} ` +
      `L ${(lx + (xm - lx) * 0.45).toFixed(1)} ${(capLy + 8).toFixed(1)} Z`
    );
  }
  return { d: `${d} L 100 ${h} Z`, caps };
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
    <svg viewBox="0 0 46 50" width="46" height="50" aria-hidden>
      <ellipse cx="23" cy="30" rx="17" ry="18" fill={a.body} />
      <ellipse cx="23" cy="35" rx="10" ry="9" fill={a.belly} />
      <circle cx="17" cy="24" r="3.1" fill="#fff" />
      <circle cx="29" cy="24" r="3.1" fill="#fff" />
      <circle cx="17.8" cy="24.7" r="1.6" fill={a.eye} />
      <circle cx="29.8" cy="24.7" r="1.6" fill={a.eye} />
      <path d="M19 31 Q23 34.5 27 31" stroke={a.eye} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* trollkarlshatt */}
      <path d="M23 1 L33.5 15.5 Q23 19.5 12.5 15.5 Z" fill="#4b3a8f" />
      <path d="M23 1 L28 8.5 Q23 10.5 18.5 8.3 Z" fill="#5d49a8" />
      <ellipse cx="23" cy="16" rx="14" ry="3.6" fill="#3b2d73" />
      <circle cx="23" cy="2.2" r="2" fill="#ffce6b" />
      <path d="M20 12 l1 -2.2 1 2.2 2.2 0.3 -1.6 1.5 0.4 2.2 -2 -1.1 -2 1.1 0.4 -2.2 -1.6 -1.5 Z" fill="#ffce6b" />
    </svg>
  );
}

/* ===== Biotop-rekvisita (allt ritat i kod, färger från temat) ===== */

function MapProp({ kind, theme }: { kind: PropKind; theme: WorldTheme }) {
  const c = theme.props;
  switch (kind) {
    case 'pine':
      return (
        <svg viewBox="0 0 44 58" width="100%" height="100%">
          <rect x="19" y="42" width="6" height="12" rx="2" fill={c.trunk} />
          <path d="M22 2 L38 24 L28 24 L40 40 L4 40 L16 24 L6 24 Z" fill={c.leaf2} />
          <path d="M22 2 L32 16 L12 16 Z" fill={c.leaf1} />
        </svg>
      );
    case 'snowPine':
      return (
        <svg viewBox="0 0 44 58" width="100%" height="100%">
          <rect x="19" y="42" width="6" height="12" rx="2" fill={c.trunk} />
          <path d="M22 2 L38 24 L28 24 L40 40 L4 40 L16 24 L6 24 Z" fill={c.leaf2} />
          <path d="M22 2 L31 14 L13 14 Z" fill={c.snow} />
          <path d="M13 24 L31 24 L28 28 L16 28 Z" fill={c.snow} opacity="0.9" />
        </svg>
      );
    case 'tree':
      return (
        <svg viewBox="0 0 52 58" width="100%" height="100%">
          <rect x="23" y="38" width="7" height="18" rx="2.5" fill={c.trunk} />
          <ellipse cx="26" cy="24" rx="21" ry="18" fill={c.leaf2} />
          <ellipse cx="18" cy="18" rx="12" ry="10" fill={c.leaf1} />
          <ellipse cx="34" cy="27" rx="11" ry="9" fill={c.leaf1} opacity="0.7" />
        </svg>
      );
    case 'flower':
      return (
        <svg viewBox="0 0 26 40" width="100%" height="100%">
          <path d="M13 16 Q12 30 13 38" stroke={c.leaf2} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M13 27 Q7 24 5 20" stroke={c.leaf2} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          {[0, 60, 120, 180, 240, 300].map(a => (
            <ellipse key={a} cx="13" cy="10" rx="4" ry="6.5"
              transform={`rotate(${a} 13 10)`} fill={c.accent} />
          ))}
          <circle cx="13" cy="10" r="3.4" fill={c.snow} />
        </svg>
      );
    case 'mushroom':
      return (
        <svg viewBox="0 0 34 34" width="100%" height="100%">
          <rect x="13" y="16" width="8" height="14" rx="3.5" fill={c.snow} />
          <path d="M2 17 Q17 -6 32 17 Q17 23 2 17 Z" fill={c.accent} />
          <circle cx="10" cy="11" r="2.4" fill={c.snow} />
          <circle cx="20" cy="7" r="2" fill={c.snow} />
          <circle cx="25" cy="13" r="1.8" fill={c.snow} />
        </svg>
      );
    case 'rock':
    case 'snowRock':
      return (
        <svg viewBox="0 0 44 30" width="100%" height="100%">
          <path d="M6 28 L2 18 L10 8 L26 4 L40 12 L42 24 L36 28 Z" fill={c.stone1} />
          <path d="M6 28 L10 16 L24 12 L36 28 Z" fill={c.stone2} />
          {kind === 'snowRock' && <path d="M2 18 L10 8 L26 4 L40 12 L34 14 L18 10 L8 18 Z" fill={c.snow} />}
        </svg>
      );
    case 'snowman':
      return (
        <svg viewBox="0 0 34 44" width="100%" height="100%">
          <circle cx="17" cy="31" r="12" fill={c.snow} />
          <circle cx="17" cy="13" r="8.5" fill={c.snow} />
          <circle cx="14" cy="11" r="1.3" fill="#2b2144" />
          <circle cx="20" cy="11" r="1.3" fill="#2b2144" />
          <path d="M17 13.5 L21 15 L17 16.5 Z" fill="#ff9f45" />
          <path d="M5 22 L11 27 M29 22 L23 27" stroke={theme.props.trunk} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'crystal':
      return (
        <svg viewBox="0 0 34 40" width="100%" height="100%">
          <path d="M12 38 L6 20 L12 8 L17 14 Z" fill={c.accent} opacity="0.85" />
          <path d="M17 38 L14 12 L20 2 L26 14 L22 38 Z" fill={c.accent} />
          <path d="M20 2 L26 14 L22 38 L20 30 Z" fill={c.stone2} opacity="0.5" />
          <path d="M17 10 L19 6 L21 10 L19 16 Z" fill={c.snow} opacity="0.85" />
        </svg>
      );
    case 'stump':
      return (
        <svg viewBox="0 0 34 28" width="100%" height="100%">
          <path d="M5 8 L5 22 Q17 28 29 22 L29 8 Z" fill={c.trunk} />
          <ellipse cx="17" cy="8" rx="12" ry="5.5" fill="#d9b384" />
          <ellipse cx="17" cy="8" rx="7" ry="3.2" fill="none" stroke={c.trunk} strokeWidth="1.3" opacity="0.6" />
          <ellipse cx="17" cy="8" rx="3" ry="1.4" fill="none" stroke={c.trunk} strokeWidth="1.2" opacity="0.6" />
        </svg>
      );
    case 'bush':
      return (
        <svg viewBox="0 0 46 30" width="100%" height="100%">
          <ellipse cx="14" cy="20" rx="13" ry="9.5" fill={c.leaf2} />
          <ellipse cx="31" cy="21" rx="12" ry="8.5" fill={c.leaf2} />
          <ellipse cx="22" cy="14" rx="12" ry="9" fill={c.leaf1} />
          <ellipse cx="18" cy="11" rx="5" ry="3" fill={c.snow} opacity="0.3" />
          <circle cx="12" cy="16" r="1.6" fill={c.accent} />
          <circle cx="29" cy="14" r="1.6" fill={c.accent} />
        </svg>
      );
    case 'deadTree':
      return (
        <svg viewBox="0 0 40 52" width="100%" height="100%">
          <path d="M19 50 L19 20 M19 26 L9 14 M19 32 L30 20 M19 20 L14 8 M19 20 L26 6"
            stroke={c.trunk} strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <path d="M8 13 L11 12 M13 7 L16 7 M25 5 L28 6 M29 19 L32 19"
            stroke={c.snow} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </svg>
      );
  }
}

interface ScatterProp { kind: PropKind; xPct: number; y: number; size: number; flip: boolean; }
interface GroundMark { xPct: number; y: number; size: number; }

/** Strö rekvisita längs vägen, på motsatt sida om noden + lite fritt. */
function scatterProps(points: Pt[], theme: WorldTheme): ScatterProp[] {
  const kinds = theme.props.kinds;
  const out: ScatterProp[] = [];
  points.forEach((p, i) => {
    for (let k = 0; k < 4; k++) {
      const r1 = seeded(i * 13 + k * 7 + 1);
      const r2 = seeded(i * 29 + k * 3 + 5);
      const r3 = seeded(i * 41 + k * 11 + 9);
      // håll undan från vägen: motsatt sida om noden, annars slumpad kant
      const side = k === 0 ? (p.xPct > 50 ? 0 : 1) : Math.round(r3);
      out.push({
        kind: kinds[Math.floor(r1 * kinds.length)],
        xPct: side ? 68 + r2 * 27 : 5 + r2 * 27,
        y: p.y - NODE_GAP / 2 + ((k + r1) / 4) * NODE_GAP,
        size: 24 + r2 * 36,
        flip: r3 > 0.5
      });
    }
  });
  // sortera på y så props längre "ner" ritas över dem längre bort
  return out.sort((a, b) => a.y - b.y);
}

/** Små markdetaljer (grästuvor/snödrivor) – tätt men diskret. */
function scatterGround(points: Pt[]): GroundMark[] {
  const out: GroundMark[] = [];
  points.forEach((p, i) => {
    for (let k = 0; k < 4; k++) {
      const r1 = seeded(i * 61 + k * 17 + 3);
      const r2 = seeded(i * 83 + k * 5 + 8);
      const side = Math.round(seeded(i * 7 + k));
      out.push({
        xPct: side ? 58 + r1 * 38 : 4 + r1 * 38,
        y: p.y - NODE_GAP / 2 + r2 * NODE_GAP,
        size: 9 + r1 * 9
      });
    }
  });
  return out;
}

/* ===== Parallaxlagrens innehåll ===== */

function BackgroundLayer({ theme, height }: { theme: WorldTheme; height: number }) {
  const bands = useMemo(() => {
    const out: React.ReactNode[] = [];
    const n = Math.max(2, Math.round(height / 420));
    for (let b = 0; b < n; b++) {
      const r = seeded(b * 17 + 3);
      const yBase = height - 90 - b * ((height - 160) / n);
      const opacity = 0.5 - b * (0.3 / n);
      if (theme.terrain === 'peaks') {
        const pk = peaksPath(yBase, 120 + r * 90, 4 + Math.round(r * 2), b * 31, height);
        out.push(<path key={b} d={pk.d} fill={theme.hillsFar} opacity={opacity} />);
        pk.caps.forEach((cap, ci) => out.push(
          <path key={`${b}c${ci}`} d={cap} fill={theme.props.snow} opacity={opacity + 0.25} />
        ));
      } else {
        out.push(
          <path key={b}
            d={ridge(yBase, 24 + r * 18, 1.1 + r, r * 6.28, height)}
            fill={theme.hillsFar} opacity={opacity} />
        );
      }
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

  // stjärnhimmel över hela landskapet
  const stars = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      x: 2 + seeded(i * 9 + 4) * 96,
      y: 30 + seeded(i * 5 + 6) * (height - 160),
      r: 0.25 + seeded(i * 3 + 8) * 0.4,
      delay: seeded(i * 7 + 1) * 2.4
    })), [height]);

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }}>
      {stars.map((s, i) => (
        <ellipse
          key={`st-${i}`}
          className="lm-sparkle"
          style={{ ['--delay' as string]: `${s.delay}s` }}
          cx={s.x} cy={s.y} rx={s.r} ry={s.r * 4}
          fill="rgba(255, 246, 220, 0.8)"
        />
      ))}
      {theme.terrain === 'peaks' && (
        <>
          <ellipse cx="74" cy="170" rx="15" ry="62" fill="rgba(244, 236, 208, 0.1)" />
          <ellipse cx="74" cy="170" rx="10.5" ry="44" fill="rgba(244, 236, 208, 0.18)" />
          <ellipse cx="74" cy="170" rx="7" ry="29" fill="#f2ead0" />
          <ellipse cx="71.5" cy="162" rx="1.3" ry="5" fill="rgba(180, 175, 150, 0.4)" />
          <ellipse cx="76" cy="176" rx="1" ry="4" fill="rgba(180, 175, 150, 0.35)" />
        </>
      )}
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
      const yBase = height - 60 - b * ((height - 140) / n);
      const fill = b % 2 ? theme.hillsMid : theme.hillsNear;
      const opacity = 0.55 - b * (0.25 / n);
      if (theme.terrain === 'peaks') {
        const pk = peaksPath(yBase, 90 + r * 70, 5 + Math.round(r * 2), b * 53 + 13, height);
        out.push(<path key={b} d={pk.d} fill={fill} opacity={opacity} />);
        pk.caps.forEach((cap, ci) => out.push(
          <path key={`${b}c${ci}`} d={cap} fill={theme.props.snow} opacity={opacity + 0.3} />
        ));
      } else {
        const amp = 30 + r * 22, freq = 1.4 + r * 0.8, phase = r * 6.28 + 2;
        out.push(
          <path key={b} d={ridge(yBase, amp, freq, phase, height)} fill={fill} opacity={opacity} />
        );
        // skogssiluett längs åsen: små granar som följer kullens kurva
        for (let tx = 3; tx <= 97; tx += 6.5) {
          const tr = seeded(b * 71 + tx * 13);
          if (tr < 0.35) continue;
          const ty = ridgeY(tx + tr * 3, yBase, amp, freq, phase);
          const tw = 1.6 + tr * 1.3, th = 20 + tr * 18;
          out.push(
            <path key={`${b}t${tx}`}
              d={`M ${(tx - tw).toFixed(1)} ${ty.toFixed(1)} L ${tx.toFixed(1)} ${(ty - th).toFixed(1)} L ${(tx + tw).toFixed(1)} ${ty.toFixed(1)} Z`}
              fill={theme.hillsNear} opacity={opacity + 0.12} />
          );
        }
      }
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
  const props = useMemo(() => scatterProps(points, theme), [points, theme]);
  const ground = useMemo(() => scatterGround(points), [points]);
  const flies = useMemo(() => {
    if (!theme.fireflies) return [];
    return points.flatMap((p, i) => [0, 1].map(k => ({
      x: 8 + seeded(i * 23 + k * 9 + 2) * 84,
      y: p.y - NODE_GAP / 2 + seeded(i * 31 + k * 5 + 4) * NODE_GAP,
      dx: (seeded(i * 7 + k * 3 + 6) - 0.5) * 70,
      dy: (seeded(i * 11 + k * 7 + 8) - 0.5) * 80,
      dur: 6 + seeded(i * 13 + k) * 6,
      delay: -seeded(i * 17 + k) * 8
    })));
  }, [points, theme]);

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

          {ground.map((g, i) => (
            <svg
              key={`gr-${i}`}
              width={g.size} height={g.size * 0.6}
              viewBox="0 0 12 7"
              style={{
                position: 'absolute', left: `${g.xPct}%`, top: g.y,
                marginLeft: -g.size / 2, pointerEvents: 'none'
              }}
            >
              {theme.props.ground === 'grass'
                ? <path d="M1 7 Q1.6 3 2.4 6.8 M4.4 7 Q5 1.5 5.8 6.8 M8 7 Q8.6 3.5 9.4 6.8"
                    stroke={theme.props.leaf2} strokeWidth="1.1" fill="none"
                    strokeLinecap="round" opacity="0.55" />
                : <ellipse cx="6" cy="4.6" rx="5.4" ry="2.2" fill={theme.props.snow} opacity="0.4" />}
            </svg>
          ))}

          {props.map((pr, i) => (
            <div
              key={`prop-${i}`}
              style={{
                position: 'absolute',
                left: `${pr.xPct}%`,
                top: pr.y,
                width: pr.size,
                height: pr.size * 1.2,
                marginLeft: -pr.size / 2,
                marginTop: -pr.size * 1.1,
                transform: pr.flip ? 'scaleX(-1)' : undefined,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 5px 4px rgba(20, 35, 20, 0.3))'
              }}
            >
              <MapProp kind={pr.kind} theme={theme} />
            </div>
          ))}

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

          {flies.map((f, i) => (
            <span
              key={`ff-${i}`}
              className="lm-firefly"
              style={{
                left: `${f.x}%`,
                top: f.y,
                ['--fdx' as string]: `${f.dx}px`,
                ['--fdy' as string]: `${f.dy}px`,
                ['--fdur' as string]: `${f.dur}s`,
                ['--fdelay' as string]: `${f.delay}s`
              }}
            />
          ))}

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

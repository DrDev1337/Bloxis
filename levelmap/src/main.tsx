/* Demo för LevelMap: 20 mockade nivåer i en mobilram, med knappar för att
   simulera att man klarar nivåer (avatarhopp + upplåsnings-pop). */
import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LevelMap, { LevelData } from './LevelMap';
import { themeA, themeB, WorldTheme } from './theme';

function mockLevels(): LevelData[] {
  return Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    stars: (i < 5 ? ((i % 3) + 1) : 0) as LevelData['stars'],
    unlocked: i < 6
  }));
}

function App() {
  const [levels, setLevels] = useState<LevelData[]>(mockLevels);
  const [theme, setTheme] = useState<WorldTheme>(themeA);
  const [picked, setPicked] = useState<number | null>(null);

  const winCurrent = useCallback(() => {
    setLevels(prev => {
      const idx = prev.findIndex(l => l.unlocked && l.stars === 0);
      if (idx < 0) return prev;
      return prev.map((l, i) => {
        if (i === idx) return { ...l, stars: ((idx % 3) + 1) as LevelData['stars'] };
        if (i === idx + 1) return { ...l, unlocked: true };
        return l;
      });
    });
  }, []);

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12
    }}>
      <div style={{
        width: 'min(400px, 96vw)', height: 'min(720px, 80vh)',
        borderRadius: 28, overflow: 'hidden', position: 'relative',
        boxShadow: '0 24px 60px rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)'
      }}>
        <LevelMap
          levels={levels}
          theme={theme}
          onLevelSelect={id => { setPicked(id); setTimeout(() => setPicked(null), 1600); }}
        />
        {picked != null && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(20,22,43,0.9)', padding: '8px 18px', borderRadius: 999,
            fontWeight: 700, zIndex: 30, whiteSpace: 'nowrap'
          }}>
            onLevelSelect({picked})
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={btn} onClick={winCurrent}>🏆 Klara nivå</button>
        <button style={btn} onClick={() => setLevels(mockLevels())}>↺ Återställ</button>
        <button style={btn} onClick={() => setTheme(t => (t === themeA ? themeB : themeA))}>
          🎨 Tema: {theme.name}
        </button>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  font: 'inherit', fontWeight: 700, color: '#eef0ff',
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 12, padding: '10px 14px', cursor: 'pointer'
};

createRoot(document.getElementById('root')!).render(<App />);

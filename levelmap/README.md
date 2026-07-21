# Bloxis LevelMap

Polerad bankarts-komponent i React + TypeScript. Fejk-3D à la Candy Crush:
puffiga noder, mjuka skuggor, tre parallaxlager, idle-animationer och en
avatar som hoppar mellan noderna. Allt ritas i kod (SVG/CSS) – inga assets.

## Köra demon

```bash
cd levelmap
npm install
npm run dev        # utvecklingsserver
npm run build      # produktionsbygge till dist/
npm run typecheck  # tsc --noEmit
```

Demon visar 20 mockade nivåer i en mobilram med knappar för att simulera
"klara nivå" (avatarhopp + upplåsnings-pop), återställa och byta tema.

## API

```tsx
import LevelMap, { LevelData } from './LevelMap';
import { themeA } from './theme';

<LevelMap
  levels={levels}          // [{ id, stars: 0-3, unlocked: boolean }]
  currentId={6}            // valfri – annars första upplåsta utan stjärnor
  onLevelSelect={id => …}  // tap på upplåst nod
  theme={themeA}           // WorldTheme från theme.ts
/>
```

- Tap på **låst** nod ger en ruska-animation (ingen callback).
- När `unlocked` går från `false` till `true` spelas en spring-pop.
- När `currentId` flyttas hoppar avataren nod-för-nod dit, och kartan
  scrollar mjukt efter.
- Vid mount scrollar kartan mjukt till aktuell nivå.

## Tema

Alla färger/tokens ligger i `theme.ts` (`WorldTheme`). `themeForLevel(i)`
mappar nivåindex → tema (20 nivåer per värld). Två teman ingår:
Gröna ängarna (A) och Frostbergen (B).

## Prestanda

- Parallax och alla animationer använder enbart `transform`/`opacity`
  (kompositortrådvänligt, inga layoutpass).
- Scrollhanteraren är rAF-gatad, lagren har `will-change: transform`.
- Avatarhoppet använder Web Animations API.

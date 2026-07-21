/* Bloxis level map – tematokens.
   Allt visuellt (färger, gradienter, dekor) styrs härifrån så att varje
   värld kan få eget tema utan att röra komponenten. */

/** Rekvisita som kan strös längs vägen. Ritas i kod av komponenten. */
export type PropKind =
  | 'pine' | 'tree' | 'flower' | 'mushroom' | 'rock'
  | 'snowPine' | 'snowman' | 'crystal' | 'snowRock';

export interface WorldTheme {
  name: string;
  /** Himmelsgradient, topp → botten */
  sky: [string, string];
  /** Parallaxlagrens kullfärger, bakre → främre */
  hillsFar: string;
  hillsMid: string;
  hillsNear: string;
  /** Vägen mellan noderna */
  path: {
    edge: string;      // mörk kantlinje
    surface: string;   // vägbanan
    dash: string;      // streckad mittlinje
    done: string;      // avklarad sträcka
  };
  node: {
    base1: string;     // sfärgradient topp
    base2: string;     // sfärgradient botten
    done1: string;     // avklarad nod, gradient topp
    done2: string;     // avklarad nod, gradient botten
    lockedBase: string;
    ring: string;      // puls-ring runt aktuell nivå
    text: string;
  };
  star: string;
  starEmpty: string;
  cloud: string;
  /** Vatten längst ner med glitter */
  water: { surface: string; deep: string; sparkle: string };
  /** Förgrundsdekorens färg (buskar/stenar i kanterna) */
  foliage1: string;
  foliage2: string;
  avatar: { body: string; belly: string; eye: string };
  /** Biotopens rekvisita längs vägen + färger den ritas med */
  props: {
    kinds: PropKind[];
    trunk: string;      // trädstammar
    leaf1: string;      // ljusare grönska/kron-färg
    leaf2: string;      // mörkare grönska
    stone1: string;     // sten, ljus
    stone2: string;     // sten, skugga
    snow: string;       // snö/highlights
    accent: string;     // blommor/svamphattar/kristaller
  };
}

/** Tema A: Gröna ängarna – mjukt, soligt godislandskap. */
export const themeA: WorldTheme = {
  name: 'Gröna ängarna',
  sky: ['#8ed6ff', '#d8f3e8'],
  hillsFar: '#9fd9a3',
  hillsMid: '#6fc478',
  hillsNear: '#4CAF5F',
  path: {
    edge: 'rgba(90, 61, 33, 0.55)',
    surface: '#e8cf9f',
    dash: 'rgba(255, 255, 255, 0.85)',
    done: 'rgba(255, 200, 60, 0.75)'
  },
  node: {
    base1: '#7ee08a',
    base2: '#2f9e4f',
    done1: '#ffd76e',
    done2: '#ff9f3d',
    lockedBase: '#8fa0a8',
    ring: '#ffd645',
    text: '#ffffff'
  },
  star: '#ffd645',
  starEmpty: 'rgba(255, 255, 255, 0.35)',
  cloud: 'rgba(255, 255, 255, 0.92)',
  water: { surface: '#5fc9e8', deep: '#3a9fd0', sparkle: 'rgba(255, 255, 255, 0.9)' },
  foliage1: '#3d8f4d',
  foliage2: '#2e7340',
  avatar: { body: '#ff6dc8', belly: '#ffd2ec', eye: '#2b2144' },
  props: {
    kinds: ['pine', 'tree', 'flower', 'mushroom', 'rock', 'tree', 'pine'],
    trunk: '#8a5a33',
    leaf1: '#67c46f',
    leaf2: '#3d9e50',
    stone1: '#b9c0bb',
    stone2: '#8e968f',
    snow: '#ffffff',
    accent: '#ff5d6c'
  }
};

/** Tema B: Frostbergen – kyligt blått, redo för nivå 21-40. */
export const themeB: WorldTheme = {
  name: 'Frostbergen',
  sky: ['#3d5a96', '#a8c8e8'],
  hillsFar: '#8fb4d9',
  hillsMid: '#6d95c4',
  hillsNear: '#4d76aa',
  path: {
    edge: 'rgba(30, 45, 80, 0.6)',
    surface: '#dbe8f5',
    dash: 'rgba(255, 255, 255, 0.9)',
    done: 'rgba(255, 200, 60, 0.75)'
  },
  node: {
    base1: '#8fd8f5',
    base2: '#3a7fc4',
    done1: '#ffd76e',
    done2: '#ff9f3d',
    lockedBase: '#7c8ba0',
    ring: '#ffd645',
    text: '#ffffff'
  },
  star: '#ffd645',
  starEmpty: 'rgba(255, 255, 255, 0.35)',
  cloud: 'rgba(255, 255, 255, 0.85)',
  water: { surface: '#9fd9f0', deep: '#5aa8d8', sparkle: 'rgba(255, 255, 255, 0.95)' },
  foliage1: '#5d86b8',
  foliage2: '#456a99',
  avatar: { body: '#ff6dc8', belly: '#ffd2ec', eye: '#2b2144' },
  props: {
    kinds: ['snowPine', 'snowman', 'crystal', 'snowRock', 'snowPine', 'crystal'],
    trunk: '#5d4a3a',
    leaf1: '#4d8a6a',
    leaf2: '#336650',
    stone1: '#c9d8e5',
    stone2: '#93a8bc',
    snow: '#ffffff',
    accent: '#8fd8f5'
  }
};

export const themes: WorldTheme[] = [themeA, themeB];

export const LEVELS_PER_WORLD = 20;

/** Tema för en nivå (0-indexerad): nivå 0-19 → tema A, 20-39 → tema B osv. */
export function themeForLevel(levelIndex: number): WorldTheme {
  return themes[Math.floor(levelIndex / LEVELS_PER_WORLD) % themes.length];
}

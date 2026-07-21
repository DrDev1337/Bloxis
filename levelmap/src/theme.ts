/* Bloxis level map – tematokens.
   Allt visuellt (färger, gradienter, dekor) styrs härifrån så att varje
   värld kan få eget tema utan att röra komponenten. */

/** Rekvisita som kan strös längs vägen. Ritas i kod av komponenten. */
export type PropKind =
  | 'pine' | 'tree' | 'flower' | 'mushroom' | 'rock' | 'stump' | 'bush'
  | 'snowPine' | 'snowman' | 'crystal' | 'snowRock' | 'deadTree';

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
  /** Landskapsform i parallaxlagren: mjuka kullar eller taggiga bergstoppar */
  terrain: 'hills' | 'peaks';
  /** Eldflugor som svävar över landskapet */
  fireflies?: boolean;
  /** Biotopens rekvisita längs vägen + färger den ritas med */
  props: {
    kinds: PropKind[];
    /** Små markdetaljer som strös tätt: grästuvor eller snödrivor */
    ground: 'grass' | 'snow';
    trunk: string;      // trädstammar
    leaf1: string;      // ljusare grönska/kron-färg
    leaf2: string;      // mörkare grönska
    stone1: string;     // sten, ljus
    stone2: string;     // sten, skugga
    snow: string;       // snö/highlights
    accent: string;     // blommor/svamphattar/kristaller
  };
}

/** Tema A: Förtrollade skogen – skymning, mossa och eldflugor. */
export const themeA: WorldTheme = {
  name: 'Förtrollade skogen',
  sky: ['#241c4d', '#173230'],
  hillsFar: '#3a5d54',
  hillsMid: '#2c4a44',
  hillsNear: '#1f3833',
  path: {
    edge: 'rgba(15, 12, 8, 0.65)',
    surface: '#7d7264',
    dash: 'rgba(255, 222, 140, 0.95)',
    done: 'rgba(255, 206, 107, 0.75)'
  },
  node: {
    base1: '#63a888',
    base2: '#28564a',
    done1: '#ffd98c',
    done2: '#d9913a',
    lockedBase: '#565b66',
    ring: '#ffce6b',
    text: '#f6efdd'
  },
  star: '#ffce6b',
  starEmpty: 'rgba(255, 245, 220, 0.3)',
  cloud: 'rgba(214, 205, 240, 0.35)',
  water: { surface: '#39707f', deep: '#234852', sparkle: 'rgba(170, 255, 226, 0.9)' },
  foliage1: '#2c5a45',
  foliage2: '#1d4233',
  avatar: { body: '#ff6dc8', belly: '#ffd2ec', eye: '#2b2144' },
  terrain: 'hills',
  props: {
    kinds: ['pine', 'tree', 'flower', 'mushroom', 'rock', 'tree', 'pine', 'bush', 'stump', 'mushroom'],
    ground: 'grass',
    trunk: '#5d4230',
    leaf1: '#4a8a68',
    leaf2: '#2a5745',
    stone1: '#8f9aa3',
    stone2: '#626c76',
    snow: '#f2e8d0',
    accent: '#c86bff'
  },
  fireflies: true
};

/** Tema B: Månbergen – frostiga toppar under fullmånen. */
export const themeB: WorldTheme = {
  name: 'Månbergen',
  sky: ['#131a3d', '#31427a'],
  hillsFar: '#5b74ab',
  hillsMid: '#44598f',
  hillsNear: '#324473',
  path: {
    edge: 'rgba(15, 20, 45, 0.65)',
    surface: '#a8b8d6',
    dash: 'rgba(255, 235, 170, 0.95)',
    done: 'rgba(255, 206, 107, 0.75)'
  },
  node: {
    base1: '#8fb8e8',
    base2: '#3a5a9e',
    done1: '#ffd98c',
    done2: '#d9913a',
    lockedBase: '#59617a',
    ring: '#ffce6b',
    text: '#f6efdd'
  },
  star: '#ffce6b',
  starEmpty: 'rgba(255, 245, 220, 0.3)',
  cloud: 'rgba(226, 232, 255, 0.5)',
  water: { surface: '#5a7fb8', deep: '#33507e', sparkle: 'rgba(230, 240, 255, 0.95)' },
  foliage1: '#3d557e',
  foliage2: '#2b3f63',
  avatar: { body: '#ff6dc8', belly: '#ffd2ec', eye: '#2b2144' },
  terrain: 'peaks',
  props: {
    kinds: ['snowPine', 'snowman', 'crystal', 'snowRock', 'snowPine', 'crystal', 'deadTree', 'snowPine'],
    ground: 'snow',
    trunk: '#4d3f33',
    leaf1: '#41707e',
    leaf2: '#2b4c57',
    stone1: '#bccbe0',
    stone2: '#8394b3',
    snow: '#f4f0ff',
    accent: '#9fd0ff'
  },
  fireflies: false
};

export const themes: WorldTheme[] = [themeA, themeB];

export const LEVELS_PER_WORLD = 20;

/** Tema för en nivå (0-indexerad): nivå 0-19 → tema A, 20-39 → tema B osv. */
export function themeForLevel(levelIndex: number): WorldTheme {
  return themes[Math.floor(levelIndex / LEVELS_PER_WORLD) % themes.length];
}

/* Bloxis – bandefinitioner.
   type: 'score'   -> nå target poäng innan dragen tar slut
   type: 'gems'    -> rensa alla ädelstenar (G)
   type: 'ice'     -> rensa all is (I) – is kräver två rensningar
   type: 'collect' -> samla count block av färgen color (palettindex)
   board: 8 rader à 8 tecken. '.' tom, '#' block, 'G' ädelsten, 'I' is.
   Var tionde bana börjar en ny värld (tema i kartan). */
(function (global) {
  'use strict';

  var E = [
    '........','........','........','........',
    '........','........','........','........'
  ];

  var LEVELS = [
    /* ===== Värld 1: Gröna ängarna ===== */
    { // 1 – uppvärmning
      type: 'score', target: 300, moves: 20, board: E
    },
    { // 2
      type: 'score', target: 700, moves: 24, board: E
    },
    { // 3 – första ädelstenarna
      type: 'gems', moves: 22, board: [
        '........','........','........','........',
        '........','........','........','G......G'
      ]
    },
    { // 4 – hörnstöd
      type: 'score', target: 900, moves: 24, board: [
        '##....##','#......#','........','........',
        '........','........','#......#','##....##'
      ]
    },
    { // 5 – färgjakt: gula block
      type: 'collect', color: 2, count: 12, moves: 22, board: E
    },
    { // 6 – trappa
      type: 'score', target: 1200, moves: 26, board: [
        '#.......','##......','###.....','####....',
        '........','........','........','........'
      ]
    },
    { // 7 – första isen
      type: 'ice', moves: 24, board: [
        '........','........','........','........',
        '........','........','...II...','...II...'
      ]
    },
    { // 8 – gropar
      type: 'gems', moves: 26, board: [
        '........','........','..#..#..','..G..G..',
        '..G..G..','..#..#..','........','........'
      ]
    },
    { // 9 – ram
      type: 'score', target: 1400, moves: 28, board: [
        '########','#......#','#......#','#......#',
        '#......#','#......#','#......#','########'
      ]
    },
    { // 10 – ädelstenskors
      type: 'gems', moves: 26, board: [
        '...GG...','...GG...','........','GG....GG',
        'GG....GG','........','...GG...','...GG...'
      ]
    },

    /* ===== Värld 2: Frostbergen ===== */
    { // 11 – färgjakt: blå block
      type: 'collect', color: 5, count: 16, moves: 26, board: E
    },
    { // 12 – isflak
      type: 'ice', moves: 28, board: [
        '........','........','..I..I..','.#I..I#.',
        '.#I..I#.','..I..I..','........','........'
      ]
    },
    { // 13 – schackrutor
      type: 'score', target: 1600, moves: 28, board: [
        '#.#..#.#','........','#.#..#.#','........',
        '........','#.#..#.#','........','#.#..#.#'
      ]
    },
    { // 14 – begravda skatter
      type: 'gems', moves: 28, board: [
        '........','........','........','........',
        '........','..####..','.#G##G#.','##G##G##'
      ]
    },
    { // 15 – ismur
      type: 'ice', moves: 30, board: [
        '........','........','........','.IIIIII.',
        '.IIIIII.','........','........','........'
      ]
    },
    { // 16 – pelare
      type: 'score', target: 1800, moves: 30, board: [
        '#..##..#','#..##..#','#..##..#','........',
        '........','#..##..#','#..##..#','#..##..#'
      ]
    },
    { // 17 – färgjakt: röda block bland bråte
      type: 'collect', color: 0, count: 18, moves: 30, board: [
        '........','..#..#..','........','#......#',
        '#......#','........','..#..#..','........'
      ]
    },
    { // 18 – diagonal av stenar
      type: 'gems', moves: 30, board: [
        'G.......','.G......','..G.....','...G....',
        '....G...','.....G..','......G.','.......G'
      ]
    },
    { // 19 – frusna skatter
      type: 'gems', moves: 32, board: [
        '........','..IIII..','.IG..GI.','.I....I.',
        '.I....I.','.IG..GI.','..IIII..','........'
      ]
    },
    { // 20 – labyrint
      type: 'score', target: 2500, moves: 34, board: [
        '#.#.#.#.','........','.#.#.#.#','........',
        '#.#.#.#.','........','.#.#.#.#','........'
      ]
    },

    /* ===== Värld 3: Solnedgångsöknen ===== */
    { // 21 – istäcke
      type: 'ice', moves: 32, board: [
        'II....II','I......I','........','...II...',
        '...II...','........','I......I','II....II'
      ]
    },
    { // 22 – färgjakt: gröna block
      type: 'collect', color: 3, count: 22, moves: 32, board: E
    },
    { // 23 – hörnstenar
      type: 'gems', moves: 30, board: [
        'GG....GG','G#....#G','........','........',
        '........','........','G#....#G','GG....GG'
      ]
    },
    { // 24 – pyramid
      type: 'score', target: 2200, moves: 32, board: [
        '........','........','...##...','..####..',
        '.######.','########','........','........'
      ]
    },
    { // 25 – isgångar
      type: 'ice', moves: 34, board: [
        '..I..I..','..I..I..','........','II....II',
        'II....II','........','..I..I..','..I..I..'
      ]
    },
    { // 26 – färgjakt: lila block bland bråte
      type: 'collect', color: 6, count: 24, moves: 34, board: [
        '#......#','........','..#..#..','........',
        '........','..#..#..','........','#......#'
      ]
    },
    { // 27 – skattkammaren
      type: 'gems', moves: 34, board: [
        '##....##','#G....G#','........','..#GG#..',
        '..#GG#..','........','#G....G#','##....##'
      ]
    },
    { // 28 – stora slaget
      type: 'score', target: 3000, moves: 36, board: [
        '#.#..#.#','........','#..##..#','........',
        '........','#..##..#','........','#.#..#.#'
      ]
    },
    { // 29 – isfästningen
      type: 'ice', moves: 36, board: [
        'IIII....','I..I....','I..I....','IIII....',
        '....IIII','....I..I','....I..I','....IIII'
      ]
    },
    { // 30 – mästarprovet
      type: 'gems', moves: 38, board: [
        'G#.II.#G','#......#','.I....I.','.G.##.G.',
        '.G.##.G.','.I....I.','#......#','G#.II.#G'
      ]
    }
  ];

  /* Världar för bankartan. */
  var WORLDS = [
    { name: 'Gröna ängarna', from: 0, to: 9, hue: 145 },
    { name: 'Frostbergen', from: 10, to: 19, hue: 205 },
    { name: 'Solnedgångsöknen', from: 20, to: 29, hue: 25 }
  ];

  global.BloxisLevels = LEVELS;
  global.BloxisWorlds = WORLDS;
})(this);

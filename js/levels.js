/* Bloxis – bandefinitioner.
   type: 'score'   -> nå target poäng innan dragen tar slut
   type: 'gems'    -> rensa alla ädelstenar (G)
   type: 'ice'     -> rensa all is (I) – is kräver två rensningar
   type: 'collect' -> samla count block av färgen color (palettindex)
   type: 'sand'    -> rensa all sand (S) – sanden sprider sig till en tom
                      granne var sandEvery:e drag (standard 3)
   type: 'mist'    -> lyft all stjärndimma (M) – dimrutor går inte att
                      bygga på; en rensning i rutan intill lyfter dimman
   type: 'eggs'    -> rensa alla drakägg (E) innan de kläcks – varje ägg
                      har eggTimer drag på sig, annars är banan förlorad
   board: 8 rader à 8 tecken. '.' tom, '#' block, 'G' ädelsten, 'I' is,
   'S' sand, 'M' dimma, 'E' drakägg.
   Var tionde bana börjar en ny värld med sin egen signaturmekanik:
   V1 grunderna, V2 is, V3 sand, V4 stjärndimma, V5 drakägg. */
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
      type: 'collect', color: 2, count: 10, moves: 24, board: E
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
      type: 'collect', color: 5, count: 12, moves: 28, board: E
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
      type: 'collect', color: 0, count: 14, moves: 32, board: [
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

    /* ===== Värld 3: Solnedgångsöknen – sanden sprider sig ===== */
    { // 21 – första sanddynen
      type: 'sand', sandEvery: 3, moves: 30, board: [
        '........','........','........','........',
        '........','........','...SS...','...SS...'
      ]
    },
    { // 22 – färgjakt: gröna block
      type: 'collect', color: 3, count: 16, moves: 34, board: E
    },
    { // 23 – två dyner
      type: 'sand', sandEvery: 3, moves: 32, board: [
        'SS......','........','........','........',
        '........','........','........','......SS'
      ]
    },
    { // 24 – pyramid
      type: 'score', target: 2200, moves: 32, board: [
        '........','........','...##...','..####..',
        '.######.','########','........','........'
      ]
    },
    { // 25 – sandbankar
      type: 'sand', sandEvery: 3, moves: 34, board: [
        '........','........','........','SS....SS',
        'SS....SS','........','........','........'
      ]
    },
    { // 26 – färgjakt: lila block bland bråte
      type: 'collect', color: 6, count: 18, moves: 36, board: [
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
    { // 28 – sandstorm
      type: 'sand', sandEvery: 2, moves: 34, board: [
        '##....##','........','...SS...','...SS...',
        '........','........','........','........'
      ]
    },
    { // 29 – isfästningen
      type: 'ice', moves: 36, board: [
        'IIII....','I..I....','I..I....','IIII....',
        '....IIII','....I..I','....I..I','....IIII'
      ]
    },
    { // 30 – öknens hjärta
      type: 'sand', sandEvery: 2, moves: 36, board: [
        'SS......','........','........','........',
        '......SS','........','........','........'
      ]
    },

    /* ===== Värld 4: Stjärnhimlen – stjärndimman ===== */
    { // 31 – första dimslöjan
      type: 'mist', moves: 28, board: [
        'M......M','........','........','........',
        '........','........','........','........'
      ]
    },
    { // 32 – månskärvor
      type: 'ice', moves: 34, board: [
        '...II...','..I..I..','.I....I.','I......I',
        'I......I','.I....I.','..I..I..','...II...'
      ]
    },
    { // 33 – dimbankar
      type: 'mist', moves: 32, board: [
        '........','........','........','M......M',
        'M......M','........','........','........'
      ]
    },
    { // 34 – stjärnbilder
      type: 'gems', moves: 36, board: [
        'G......G','.#....#.','..G..G..','...##...',
        '...##...','..G..G..','.#....#.','G......G'
      ]
    },
    { // 35 – dimhörnen
      type: 'mist', moves: 34, board: [
        'MM......','........','........','........',
        '........','........','........','......MM'
      ]
    },
    { // 36 – frusna månar
      type: 'ice', moves: 36, board: [
        '.II..II.','.II..II.','........','II....II',
        'II....II','........','.II..II.','.II..II.'
      ]
    },
    { // 37 – färgjakt: ljusblå nebulosa
      type: 'collect', color: 4, count: 18, moves: 36, board: [
        '........','.#.##.#.','........','#..II..#',
        '#..II..#','........','.#.##.#.','........'
      ]
    },
    { // 38 – dimmans öga
      type: 'mist', moves: 36, board: [
        '...MM...','...MM...','........','........',
        '........','........','........','........'
      ]
    },
    { // 39 – supernovan
      type: 'score', target: 3800, moves: 40, board: [
        '#..##..#','..I..I..','#......#','.I.##.I.',
        '.I.##.I.','#......#','..I..I..','#..##..#'
      ]
    },
    { // 40 – dimhöljet
      type: 'mist', moves: 38, board: [
        'MM....MM','........','........','........',
        '........','........','........','MM....MM'
      ]
    },

    /* ===== Värld 5: Drakberget – drakäggen kläcks ===== */
    { // 41 – det första ägget
      type: 'eggs', eggTimer: 14, moves: 30, board: [
        '........','........','........','........',
        '........','........','...E....','........'
      ]
    },
    { // 42 – två ägg
      type: 'eggs', eggTimer: 14, moves: 32, board: [
        '........','........','..E.....','........',
        '........','........','.....E..','........'
      ]
    },
    { // 43 – lavaklipporna
      type: 'score', target: 3000, moves: 36, board: [
        '##....##','#......#','........','...##...',
        '...##...','........','#......#','##....##'
      ]
    },
    { // 44 – bergsboet
      type: 'eggs', eggTimer: 13, moves: 34, board: [
        '##....##','........','..E..E..','........',
        '........','........','........','........'
      ]
    },
    { // 45 – askmoln
      type: 'sand', sandEvery: 2, moves: 34, board: [
        '........','...SS...','........','........',
        '........','........','...SS...','........'
      ]
    },
    { // 46 – tre ägg i klippan
      type: 'eggs', eggTimer: 17, moves: 36, board: [
        '........','..E.....','........','.....E..',
        '........','........','..E.....','........'
      ]
    },
    { // 47 – drakens skatter
      type: 'gems', moves: 36, board: [
        '........','.#G..G#.','..#..#..','..G..G..',
        '..#..#..','.#G..G#.','........','........'
      ]
    },
    { // 48 – brådskan
      type: 'eggs', eggTimer: 10, moves: 34, board: [
        '........','........','...E....','........',
        '....E...','........','........','........'
      ]
    },
    { // 49 – färgjakt: eldröda block
      type: 'collect', color: 0, count: 18, moves: 38, board: [
        '#......#','........','........','........',
        '........','........','........','#......#'
      ]
    },
    { // 50 – drakmoderns prov
      type: 'eggs', eggTimer: 12, moves: 40, board: [
        '##....##','........','..E..E..','........',
        '........','...E....','........','##....##'
      ]
    }
  ];

  /* Världar för bankartan. */
  var WORLDS = [
    { name: 'Gröna ängarna', from: 0, to: 9, hue: 145 },
    { name: 'Frostbergen', from: 10, to: 19, hue: 205 },
    { name: 'Solnedgångsöknen', from: 20, to: 29, hue: 25 },
    { name: 'Stjärnhimlen', from: 30, to: 39, hue: 265 },
    { name: 'Drakberget', from: 40, to: 49, hue: 355 }
  ];

  global.BloxisLevels = LEVELS;
  global.BloxisWorlds = WORLDS;
})(this);

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
   type: 'ghosts'  -> fånga alla andar (A) – de svävar till en tom granne
                      var ghostEvery:e drag (standard 2)
   type: 'keys'    -> samla alla nycklar (K) – lås (L) kan inte rensas
                      förrän alla nycklar samlats, då krossas de
   board: 8 rader à 8 tecken. '.' tom, '#' block, 'G' ädelsten, 'I' is,
   'S' sand, 'M' dimma, 'E' drakägg, 'A' ande, 'K' nyckel, 'L' lås.
   Var tolfte bana börjar en ny värld med sin egen signaturmekanik:
   V1 grunderna, V2 is, V3 sand, V4 stjärndimma, V5 drakägg,
   V6 andar, V7 nycklar & lås. */
(function (global) {
  'use strict';

  var E = [
    '........','........','........','........',
    '........','........','........','........'
  ];

  var LEVELS = [
    /* ===== Värld 1: Gröna ängarna – grunderna ===== */
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
    { // 10 – färgjakt: rosa blomster
      type: 'collect', color: 7, count: 12, moves: 30, board: E
    },
    { // 11 – månstigen
      type: 'gems', moves: 28, board: [
        '..G.....','.....G..','G.......','....G...',
        '.......G','..G.....','.....G..','........'
      ]
    },
    { // 12 – ädelstenskors
      type: 'gems', moves: 26, board: [
        '...GG...','...GG...','........','GG....GG',
        'GG....GG','........','...GG...','...GG...'
      ]
    },

    /* ===== Värld 2: Frostbergen – isen ===== */
    { // 13 – färgjakt: blå block
      type: 'collect', color: 5, count: 12, moves: 28, board: E
    },
    { // 14 – isflak
      type: 'ice', moves: 28, board: [
        '........','........','..I..I..','.#I..I#.',
        '.#I..I#.','..I..I..','........','........'
      ]
    },
    { // 15 – schackrutor
      type: 'score', target: 1600, moves: 28, board: [
        '#.#..#.#','........','#.#..#.#','........',
        '........','#.#..#.#','........','#.#..#.#'
      ]
    },
    { // 16 – begravda skatter
      type: 'gems', moves: 28, board: [
        '........','........','........','........',
        '........','..####..','.#G##G#.','##G##G##'
      ]
    },
    { // 17 – ismur
      type: 'ice', moves: 30, board: [
        '........','........','........','.IIIIII.',
        '.IIIIII.','........','........','........'
      ]
    },
    { // 18 – pelare
      type: 'score', target: 1800, moves: 30, board: [
        '#..##..#','#..##..#','#..##..#','........',
        '........','#..##..#','#..##..#','#..##..#'
      ]
    },
    { // 19 – färgjakt: röda block bland bråte
      type: 'collect', color: 0, count: 14, moves: 32, board: [
        '........','..#..#..','........','#......#',
        '#......#','........','..#..#..','........'
      ]
    },
    { // 20 – diagonal av stenar
      type: 'gems', moves: 30, board: [
        'G.......','.G......','..G.....','...G....',
        '....G...','.....G..','......G.','.......G'
      ]
    },
    { // 21 – frusna skatter
      type: 'gems', moves: 32, board: [
        '........','..IIII..','.IG..GI.','.I....I.',
        '.I....I.','.IG..GI.','..IIII..','........'
      ]
    },
    { // 22 – isbron
      type: 'ice', moves: 32, board: [
        '........','........','........','..IIII..',
        '..IIII..','........','........','........'
      ]
    },
    { // 23 – snöstormen
      type: 'score', target: 2000, moves: 32, board: [
        '#......#','........','...##...','........',
        '........','...##...','........','#......#'
      ]
    },
    { // 24 – labyrint
      type: 'score', target: 2500, moves: 34, board: [
        '#.#.#.#.','........','.#.#.#.#','........',
        '#.#.#.#.','........','.#.#.#.#','........'
      ]
    },

    /* ===== Värld 3: Solnedgångsöknen – sanden sprider sig ===== */
    { // 25 – första sanddynen
      type: 'sand', sandEvery: 3, moves: 30, board: [
        '........','........','........','........',
        '........','........','...SS...','...SS...'
      ]
    },
    { // 26 – färgjakt: gröna block
      type: 'collect', color: 3, count: 16, moves: 34, board: E
    },
    { // 27 – två dyner
      type: 'sand', sandEvery: 3, moves: 32, board: [
        'SS......','........','........','........',
        '........','........','........','......SS'
      ]
    },
    { // 28 – pyramid
      type: 'score', target: 2200, moves: 32, board: [
        '........','........','...##...','..####..',
        '.######.','########','........','........'
      ]
    },
    { // 29 – sandbankar
      type: 'sand', sandEvery: 3, moves: 34, board: [
        '........','........','........','SS....SS',
        'SS....SS','........','........','........'
      ]
    },
    { // 30 – färgjakt: lila block bland bråte
      type: 'collect', color: 6, count: 18, moves: 36, board: [
        '#......#','........','..#..#..','........',
        '........','..#..#..','........','#......#'
      ]
    },
    { // 31 – skattkammaren
      type: 'gems', moves: 34, board: [
        '##....##','#G....G#','........','..#GG#..',
        '..#GG#..','........','#G....G#','##....##'
      ]
    },
    { // 32 – sandstorm
      type: 'sand', sandEvery: 2, moves: 34, board: [
        '##....##','........','...SS...','...SS...',
        '........','........','........','........'
      ]
    },
    { // 33 – isfästningen
      type: 'ice', moves: 36, board: [
        'IIII....','I..I....','I..I....','IIII....',
        '....IIII','....I..I','....I..I','....IIII'
      ]
    },
    { // 34 – oasen
      type: 'sand', sandEvery: 3, moves: 34, board: [
        '........','...SS...','..S##S..','..S##S..',
        '...SS...','........','........','........'
      ]
    },
    { // 35 – färgjakt: orange dyngrus
      type: 'collect', color: 1, count: 14, moves: 36, board: E
    },
    { // 36 – öknens hjärta
      type: 'sand', sandEvery: 2, moves: 36, board: [
        'SS......','........','........','........',
        '......SS','........','........','........'
      ]
    },

    /* ===== Värld 4: Stjärnhimlen – stjärndimman ===== */
    { // 37 – första dimslöjan
      type: 'mist', moves: 28, board: [
        'M......M','........','........','........',
        '........','........','........','........'
      ]
    },
    { // 38 – månskärvor
      type: 'ice', moves: 34, board: [
        '...II...','..I..I..','.I....I.','I......I',
        'I......I','.I....I.','..I..I..','...II...'
      ]
    },
    { // 39 – dimbankar
      type: 'mist', moves: 32, board: [
        '........','........','........','M......M',
        'M......M','........','........','........'
      ]
    },
    { // 40 – stjärnbilder
      type: 'gems', moves: 36, board: [
        'G......G','.#....#.','..G..G..','...##...',
        '...##...','..G..G..','.#....#.','G......G'
      ]
    },
    { // 41 – dimhörnen
      type: 'mist', moves: 34, board: [
        'MM......','........','........','........',
        '........','........','........','......MM'
      ]
    },
    { // 42 – frusna månar
      type: 'ice', moves: 36, board: [
        '.II..II.','.II..II.','........','II....II',
        'II....II','........','.II..II.','.II..II.'
      ]
    },
    { // 43 – färgjakt: ljusblå nebulosa
      type: 'collect', color: 4, count: 18, moves: 36, board: [
        '........','.#.##.#.','........','#..II..#',
        '#..II..#','........','.#.##.#.','........'
      ]
    },
    { // 44 – dimmans öga
      type: 'mist', moves: 36, board: [
        '...MM...','...MM...','........','........',
        '........','........','........','........'
      ]
    },
    { // 45 – supernovan
      type: 'score', target: 3800, moves: 40, board: [
        '#..##..#','..I..I..','#......#','.I.##.I.',
        '.I.##.I.','#......#','..I..I..','#..##..#'
      ]
    },
    { // 46 – vintergatan
      type: 'mist', moves: 34, board: [
        'M.M.M.M.','........','........','........',
        '........','........','........','........'
      ]
    },
    { // 47 – stjärnregn
      type: 'gems', moves: 36, board: [
        '.G....G.','........','........','.G....G.',
        '........','........','.G....G.','........'
      ]
    },
    { // 48 – dimhöljet
      type: 'mist', moves: 38, board: [
        'MM....MM','........','........','........',
        '........','........','........','MM....MM'
      ]
    },

    /* ===== Värld 5: Drakberget – drakäggen kläcks ===== */
    { // 49 – det första ägget
      type: 'eggs', eggTimer: 14, moves: 30, board: [
        '........','........','........','........',
        '........','........','...E....','........'
      ]
    },
    { // 50 – två ägg
      type: 'eggs', eggTimer: 14, moves: 32, board: [
        '........','........','..E.....','........',
        '........','........','.....E..','........'
      ]
    },
    { // 51 – lavaklipporna
      type: 'score', target: 3000, moves: 36, board: [
        '##....##','#......#','........','...##...',
        '...##...','........','#......#','##....##'
      ]
    },
    { // 52 – bergsboet
      type: 'eggs', eggTimer: 13, moves: 34, board: [
        '##....##','........','..E..E..','........',
        '........','........','........','........'
      ]
    },
    { // 53 – askmoln
      type: 'sand', sandEvery: 2, moves: 34, board: [
        '........','...SS...','........','........',
        '........','........','...SS...','........'
      ]
    },
    { // 54 – tre ägg i klippan
      type: 'eggs', eggTimer: 17, moves: 36, board: [
        '........','..E.....','........','.....E..',
        '........','........','..E.....','........'
      ]
    },
    { // 55 – drakens skatter
      type: 'gems', moves: 36, board: [
        '........','.#G..G#.','..#..#..','..G..G..',
        '..#..#..','.#G..G#.','........','........'
      ]
    },
    { // 56 – brådskan
      type: 'eggs', eggTimer: 10, moves: 34, board: [
        '........','........','...E....','........',
        '....E...','........','........','........'
      ]
    },
    { // 57 – färgjakt: eldröda block
      type: 'collect', color: 0, count: 18, moves: 38, board: [
        '#......#','........','........','........',
        '........','........','........','#......#'
      ]
    },
    { // 58 – tvillingtornen
      type: 'eggs', eggTimer: 12, moves: 34, board: [
        '........','........','.E....E.','........',
        '........','........','........','........'
      ]
    },
    { // 59 – lavatunnlarna
      type: 'ice', moves: 36, board: [
        '........','........','........','.II..II.',
        '.II..II.','........','........','........'
      ]
    },
    { // 60 – drakmoderns prov
      type: 'eggs', eggTimer: 12, moves: 40, board: [
        '##....##','........','..E..E..','........',
        '........','...E....','........','##....##'
      ]
    },

    /* ===== Värld 6: Viskande skogen – andarna svävar ===== */
    { // 61 – den första anden
      type: 'ghosts', ghostEvery: 3, moves: 28, board: [
        '........','........','........','........',
        '........','........','...A....','........'
      ]
    },
    { // 62 – två viskningar
      type: 'ghosts', ghostEvery: 3, moves: 30, board: [
        '........','........','..A.....','........',
        '........','.....A..','........','........'
      ]
    },
    { // 63 – färgjakt: älvornas stoft
      type: 'collect', color: 7, count: 14, moves: 36, board: E
    },
    { // 64 – andar bland träden
      type: 'ghosts', ghostEvery: 2, moves: 32, board: [
        '#......#','........','..A.....','........',
        '.....A..','........','........','#......#'
      ]
    },
    { // 65 – älvornas skatt
      type: 'gems', moves: 32, board: [
        '........','..G..G..','.G....G.','........',
        '.G....G.','..G..G..','........','........'
      ]
    },
    { // 66 – tre irrbloss
      type: 'ghosts', ghostEvery: 2, moves: 34, board: [
        '........','..A.....','........','......A.',
        '........','...A....','........','........'
      ]
    },
    { // 67 – skogsdimman
      type: 'mist', moves: 34, board: [
        '........','........','........','........',
        '........','........','........','MM....MM'
      ]
    },
    { // 68 – andefängelset
      type: 'ghosts', ghostEvery: 3, moves: 38, board: [
        '........','.A....A.','........','........',
        '........','........','...A....','........'
      ]
    },
    { // 69 – trollstigen
      type: 'score', target: 3200, moves: 36, board: [
        '#.......','.#......','........','...#....',
        '....#...','........','......#.','.......#'
      ]
    },
    { // 70 – vaktande ekar
      type: 'ghosts', ghostEvery: 2, moves: 36, board: [
        '##......','........','...A....','........',
        '....A...','........','.A......','......##'
      ]
    },
    { // 71 – gökboet
      type: 'eggs', eggTimer: 12, moves: 34, board: [
        '........','........','..E.....','........',
        '.....E..','........','........','........'
      ]
    },
    { // 72 – andarnas natt
      type: 'ghosts', ghostEvery: 2, moves: 38, board: [
        '.A......','........','....A...','........',
        '........','......A.','........','........'
      ]
    },

    /* ===== Värld 7: Kristallgrottan – nycklar och lås ===== */
    { // 73 – den första nyckeln
      type: 'keys', moves: 28, board: [
        'L......L','........','........','........',
        '........','........','...K....','........'
      ]
    },
    { // 74 – dubbellåset
      type: 'keys', moves: 32, board: [
        'L......L','........','..K.....','........',
        '........','.....K..','........','...L....'
      ]
    },
    { // 75 – kristallskörden
      type: 'gems', moves: 36, board: [
        '........','.G....G.','........','...GG...',
        '...GG...','........','........','........'
      ]
    },
    { // 76 – låsmuren
      type: 'keys', moves: 34, board: [
        '..LLLL..','........','........','........',
        '.K....K.','........','........','........'
      ]
    },
    { // 77 – grottdiset
      type: 'mist', moves: 34, board: [
        '...MM...','........','........','........',
        '........','........','........','...MM...'
      ]
    },
    { // 78 – tre nycklars valv
      type: 'keys', moves: 36, board: [
        'LL....LL','........','..K.....','........',
        '.....K..','........','..K.....','........'
      ]
    },
    { // 79 – rasgruset
      type: 'sand', sandEvery: 2, moves: 34, board: [
        '........','.SS.....','........','........',
        '........','........','.....SS.','........'
      ]
    },
    { // 80 – den låsta buren
      type: 'keys', moves: 36, board: [
        'L......L','........','...LL...','........',
        '........','.K....K.','........','L......L'
      ]
    },
    { // 81 – gruvans andar
      type: 'ghosts', ghostEvery: 2, moves: 34, board: [
        '........','..A.....','........','.....A..',
        '........','..A.....','........','........'
      ]
    },
    { // 82 – nyckelsmedjan
      type: 'keys', moves: 38, board: [
        'LL.....L','........','.K......','....K...',
        '........','......K.','........','L.....LL'
      ]
    },
    { // 83 – drakens gömma
      type: 'eggs', eggTimer: 11, moves: 34, board: [
        '........','........','..E.....','........',
        '.....E..','........','........','........'
      ]
    },
    { // 84 – kristallvalvet
      type: 'keys', moves: 40, board: [
        'L......L','.K....K.','........','........',
        '...K....','........','........','L......L'
      ]
    }
  ];

  /* Världar för bankartan. */
  var WORLDS = [
    { name: 'Gröna ängarna', from: 0, to: 11, hue: 145 },
    { name: 'Frostbergen', from: 12, to: 23, hue: 205 },
    { name: 'Solnedgångsöknen', from: 24, to: 35, hue: 25 },
    { name: 'Stjärnhimlen', from: 36, to: 47, hue: 265 },
    { name: 'Drakberget', from: 48, to: 59, hue: 355 },
    { name: 'Viskande skogen', from: 60, to: 71, hue: 165 },
    { name: 'Kristallgrottan', from: 72, to: 83, hue: 310 }
  ];

  global.BloxisLevels = LEVELS;
  global.BloxisWorlds = WORLDS;
})(this);

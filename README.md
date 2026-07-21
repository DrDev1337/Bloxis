# Bloxis

Ett blockpussel-spel för mobil och surfplatta, i stil med Block Blast: blocken
faller inte – du **drar ut pjäser** på ett 8×8-bräde, och när en **rad eller
kolumn** blir full rensas den och ger poäng.

## Spellägen

- **∞ Oändligt läge** – spela så länge du kan. Spelet tar slut när ingen av
  dina pjäser får plats. Innan start väljer du **brädstorlek** (8×8, 10×10
  eller 12×12 – större är lättare) och **svårighet**:
  - 🌱 **Lätt** – bara enkla former länge, svårare fasas in långsamt
  - 🎯 **Klassisk** – mjuk stegring från enkla till alla former
  - 🔥 **Svår** – alla former från första draget

  Rekord sparas per kombination av storlek och svårighet.
- **🧩 Banor** – 40 banor på en scrollbar bankarta med fyra världar
  (Gröna ängarna, Frostbergen, Solnedgångsöknen, Stjärnhimlen) och fyra
  måltyper:
  - 🎯 **Poängbanor**: nå poängmålet innan dragen tar slut.
  - 💎 **Ädelstensbanor**: rensa alla ädelstenar.
  - 🧊 **Isbanor**: rensa all is – is kräver två rensningar (spricker först).
  - 🎨 **Färgjakt**: samla ett antal block av en viss färg.

  Varje klarad bana ger 1–3 stjärnor (fler drag kvar = fler stjärnor) och låser
  upp nästa bana. Framstegen sparas på enheten.

- **📅 Dagens utmaning** – en ny bana varje dag, samma för alla (datum-seedad).
  Vinster bygger en 🔥 streak och ger extra mynt; en kalender visar veckans
  resultat.

## Guide, utmärkelser och inställningar

- Helt nya spelare möts av en **interaktiv guide** som lär ut placering och
  rad-/kolumnrensning (kan spelas om via "Så spelar du").
- **🏅 Utmärkelser**: 12 achievements (kombo, multirensningar, streaks m.m.)
  som ger mynt när de låses upp.
- **⚙️ Inställningar**: ljudeffekter, bakgrundsmusik (genererad med WebAudio),
  vibration och **färgblindläge** (unika symboler på varje blockfärg).

## Avatar och garderob

Din avatar hoppar mellan noderna på bankartan. I 🎩 **Garderoben** (menyn,
eller tryck på avataren på kartan) finns 62 utseenden i sex kategorier:
**hattar** (trollkarlshatt, häxhatt, svamphatt, piratbandana, guldkrona …),
**föremål** (trollstav, svärd, kristallkula, äventyrsvimpel, yxa …),
**rygg** (röd mantel, älvvingar, fjärilsvingar, stjärnmantel …),
**ansikte** (glasögon, monokel, fräknar, ögonlapp …), **kroppsfärger**
och **ögonfärger**. Allt ritas i kod och sparas på enheten.

De fyra första kroppsfärgerna och ögonfärgerna är **gratis basutbud** –
resten köps för mynt. Innan ett köp visas en **förhandsvisning** av hur
avataren skulle se ut, och köpet genomförs först när du bekräftar.

Åtta utseenden är **exklusiva belöningar** som inte kan köpas – de låses
bara upp via utmärkelser: 🌿 Lagerkrans (klara värld 1), 🌙 Månkrona
(3 dagar i streak), ✨ Månstav (kombo ×5), 👑 Stjärnspira (5000 p i
oändligt läge), 🐉 Drakfjäll-färgen (10 klarade banor), 🌟 Stjärnögon
(1000 p i oändligt läge), 🐲 Drakvingar (rensa 3+ linjer i ett drag)
och ⭐ Stjärnkind (kombo ×3). Låsta belöningar visas gråtonade i
garderoben med sitt krav, och utmärkelselistan visar vilken
garderobsbelöning varje utmärkelse ger.

## Mynt och boosters

Klarade banor ger mynt (10 × stjärnor), oändligt läge ger poäng/200. För mynt
köper du boosters direkt i spelet:

| Booster | Pris | Effekt |
| --- | --- | --- |
| 🔨 Hammare | 30 | Ta bort ett enskilt block |
| 💣 Bomb | 60 | Spräng ett 3×3-område |
| 🔄 Byt | 20 | Slumpa om de tre pjäserna |
| ↩️ Ångra | 25 | Ångra senaste draget |

## Juice

Partikelexplosioner, flygande poängsiffror, skärmskak vid multirensningar,
beröm-texter, syntetiserade ljudeffekter (WebAudio – inga ljudfiler) och
haptisk vibration på mobil.

## Poäng

- 1 poäng per placerad blockcell.
- Rensade linjer: 100 × (antal linjer)² – att rensa flera linjer samtidigt ger
  alltså mycket mer.
- **Kombo**: rensar du linjer flera drag i rad växer en multiplikator
  (+25 % per steg i kedjan).

## Publicering på GitHub Pages

Varje push till `main` (eller den nuvarande utvecklingsbranchen) kör
arbetsflödet `.github/workflows/deploy-pages.yml`, som publicerar spelet till
branchen `gh-pages`. **Engångssteg:** aktivera Pages under
*Settings → Pages → Build and deployment*: välj källa **Deploy from a branch**,
branch **gh-pages** och mapp **/(root)**, och spara. Därefter ligger spelet på:

> https://drdev1337.github.io/Bloxis/

## Köra spelet

Spelet är en ren webbapp utan byggsteg. Starta en statisk webbserver i
projektmappen:

```bash
npx serve .
# eller
python3 -m http.server 8080
```

Öppna sedan adressen i mobilens/surfplattans webbläsare. Spelet är en **PWA**:
via "Lägg till på hemskärmen" installeras det med ikon, fullskärm och
offline-stöd (service worker).

## Teknik

- Ren HTML/CSS/JavaScript, ingen byggkedja och inga beroenden.
- Rendering med Canvas, styrning med Pointer Events (fungerar med både
  pekskärm och mus).
- Responsiv layout för mobil och surfplatta, i stående och liggande läge.
- Framsteg (rekord + stjärnor) sparas i `localStorage`.

### Filstruktur

```
index.html            Skärmar och markup
css/style.css         All stil
js/shapes.js          Blockformer och färger
js/levels.js          Bandefinitioner (lätta att utöka)
js/game.js            Spellogik (UI-oberoende)
js/main.js            Rendering, dra-och-släpp, skärmflöde
manifest.webmanifest  PWA-manifest
sw.js                 Service worker (offline)
```

## Lägga till banor

Lägg till ett objekt i `js/levels.js`. Brädet anges som 8 strängar à 8 tecken:
`.` = tomt, `#` = block, `G` = ädelsten.

```js
{ type: 'gems', moves: 30, board: [
  '........','........','........','...GG...',
  '...GG...','........','........','........'
] }
```

## Native app?

Vill ni distribuera via App Store/Google Play kan webbappen paketeras rakt av
med [Capacitor](https://capacitorjs.com/): `npx cap init` och peka `webDir` på
projektroten.

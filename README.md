# Bloxis

Ett blockpussel-spel för mobil och surfplatta, i stil med Block Blast: blocken
faller inte – du **drar ut pjäser** på ett 8×8-bräde, och när en **rad eller
kolumn** blir full rensas den och ger poäng.

## Spellägen

- **∞ Oändligt läge** – spela så länge du kan. Spelet tar slut när ingen av
  dina pjäser får plats. Rekordet sparas på enheten.
- **🧩 Banor** – 30 banor på en scrollbar bankarta med tre världar
  (Gröna ängarna, Frostbergen, Solnedgångsöknen) och fyra måltyper:
  - 🎯 **Poängbanor**: nå poängmålet innan dragen tar slut.
  - 💎 **Ädelstensbanor**: rensa alla ädelstenar.
  - 🧊 **Isbanor**: rensa all is – is kräver två rensningar (spricker först).
  - 🎨 **Färgjakt**: samla ett antal block av en viss färg.

  Varje klarad bana ger 1–3 stjärnor (fler drag kvar = fler stjärnor) och låser
  upp nästa bana. Framstegen sparas på enheten.

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

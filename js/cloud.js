/* Bloxis – adapterkontrakt för molnsparning.
   Detta är standardimplementationen ("local") som inte gör någonting:
   spelet är alltid offline-first och fungerar helt utan den här filen.

   När molnsparning kopplas in (t.ex. Firebase) ersätts window.BloxisCloud
   av en fil med SAMMA kontrakt – spellogiken rör sig inte:

   {
     id: 'firebase',            // backendens namn (visas i inställningarna)
     ready: true,               // true när backenden är initierad
     signIn(cb),                // loggar in (anonymt eller konto); cb(user|null)
     signOut(),
     user(),                    // { uid } | null
     premium(cb),               // cb(bool) – serverns besked om premium.
                                //   Klientflaggan styr bara UI; den riktiga
                                //   spärren är backendens säkerhetsregler.
     push(chars, cb),           // chars = [{ id, name, updated, keys }]
                                //   keys = { 'stars': '…', 'coins': '…', … }
                                //   cb(ok)
     pull(cb)                   // cb(chars|null) – senaste sparade läget
   }

   Synkstrategin ligger i main.js (cloudSyncSoon): varje lokal skrivning
   markerar datat som smutsigt och en debouncad push skickar upp hela
   karaktärslistan. Vid uppstart hämtas molnläget och slås ihop
   (stjärnor = max per bana, i övrigt vinner senaste tidsstämpel). */
(function (global) {
  'use strict';
  global.BloxisCloud = {
    id: 'local',
    ready: false,
    signIn: function (cb) { if (cb) cb(null); },
    signOut: function () {},
    user: function () { return null; },
    premium: function (cb) { if (cb) cb(false); },
    push: function (chars, cb) { if (cb) cb(false); },
    pull: function (cb) { if (cb) cb(null); }
  };
})(this);

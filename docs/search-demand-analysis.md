# Zoekvraag- & kansenanalyse — juli 2026

*Onderzoek naar actuele zoekvraag in de edelmetalen-niche, toegespitst op preciousmetalscharts.com.
Aanvulling op `marketing-plan.md` (concurrentie/monetisatie) — dit document gaat over VRAAG en
welke pagina's we bouwen. Volume-claims zijn richtinggevend (Google Trends-signalen + SERP-
observatie, geen betaalde tooldata).*

## De marktcontext (juli 2026)
- Goud ~$4.100–4.180, +25% j/j, maar **−6,5% deze maand** — de markt zit in een pullback na de
  piek van jan 2026. "Has gold peaked / gold correction" is de actuele piekvraag.
- "How to buy gold" bereikte in dec 2025 het **hoogste zoekvolume sinds 2004**; totale goud-
  interesse piekte all-time in maart 2026 (Iran/Hormuz) en is daarna sterk afgekoeld.
- Les: vraag is **spike-gedreven**, niet structureel verhoogd → bouw pagina's die élke spike
  vangen (beide richtingen!) i.p.v. één nieuwscyclus najagen.

## Top-kansen (gerangschikt voor deze site)

1. **"Why is gold/silver up/down today"** — hoge duurzaamheid; her-gezocht op elke volatiele dag,
   in béide richtingen. Dealer-sites draaien dalingen niet eerlijk. → **GEBOUWD (cluster 1,
   2026-07-03): 4 dagelijkse driver-pagina's** `/why-is-<metal>-moving`. Vervolg: archief van
   dagen ("what moved gold in June 2026" long-tail).
2. **Inflatie-gecorrigeerde / "echte" goudprijs** — goud brak sep 2025 het 1980-record in reële
   termen (Bloomberg); elke nieuwe ATH hertriggert de vraag. Pure datavraag, nul advies-risico.
   Concurrentie: statische zwakke charts (macrotrends). → `/gold-price-inflation-adjusted` met
   auto-SSR-zin "Gold at $X is Y% above its 1980 inflation-adjusted peak."
3. **"Is gold overvalued?" — waarderings-datapagina** — dé lopende debatvraag van deze cyclus.
   Overal meningen, **nergens neutrale data-dashboards**. Geen-advies is hier juist het product:
   5–6 auto-updatende historische meters (reële prijs-percentiel, Dow/gold, ratio-percentiel,
   afstand tot trend) zonder verdict. → `/is-gold-overvalued`.
4. **Melt value / "how much is my gold worth"** — consumenten-verkoopgolf op recordprijzen (ABC);
   cash-for-gold-kopers domineren maar zijn conflicted. Pure rekenkunde (karaat × gewicht × spot).
   → melt-value calculator; voedt bullion-affiliate contextueel.
5. **Ratio-hub verdiepen** (bestaat al) — ratio-alerts, percentiel-antwoordzin, wekelijkse ratio-
   regel in de recap. Meest verdedigbare "head term" die we al bezitten.
6. **Central-bank gold buying tracker** — structureel verhaal (4.000+ ton sinds 2022), WGC publiceert
   kwartaal-data (ververst zichzelf), concurrentie voor een schone tracker is LAAG.
   → `/central-bank-gold-buying`.
7. **Gold vs stocks vs bitcoin** (lange horizon, start-jaar-kiezer, nominaal/reëel) — evergreen,
   jaarlijks hernieuwd; bijna niemand doet 50-jaar reëel.
8. **Silver industrial demand / deficit-hub** — 6e tekortjaar, solar-substitutie live controverse;
   neutrale data zeldzaam. → `/silver-demand`.
9. **Multi-currency per-gram: alléén EUR/GBP/CHF** — EUR-goud had een eigen ATH (~€4.561 mrt 2026).
   INR/AED-SERPs zijn vergrendeld → overslaan.
10. **Platinum-rally** (+120% in 2025, hydrogen-verhaal) — klein volume, maar vrijwel geen
    onafhankelijke datadekking → makkelijke citatie-winst.

## Skip-lijst (veel volume, verkeerde fit)
- "Gold price prediction 2026/2030" — advies/voorspellings-val, SERP van banken + AI-slop, rot snel.
- "Best gold IRA companies" — vergrendeld door betaalde affiliate-reviewers.
- "Gold price today" / "gold rate today India" — Google beantwoordt het zelf; structureel vergrendeld.
- "How to buy gold" head-term — dealer-oorlog, al afgekoeld.
- "Silver $100/$300"-hype — froth; één neutraal "wat analisten echt voorspellen"-blok volstaat.
- PAXG/tokenized gold — crypto-publiek, verkeerde monetisatie.

## Seizoenskalender (essentie)
- **Nu (zomer) = lull → bouwseizoen.** Infrastructuur nu neerzetten.
- **Jul 6 → feb**: 50-jr seizoensopleving; **nov–feb** = goud's sterkste venster → beste lanceer-
  moment voor nieuwe datapagina's.
- **Jan**: outlook/prediction-piek → data-gedreven year-in-review publiceren (stats, geen voorspelling).
- **Feb–apr**: US tax season → gold-IRA-funnelvenster.
- **Okt–nov**: Diwali/Indiase trouwseizoen → wereldwijde "gold demand"-nieuwsgolf → recap/drivers.
- **Schokken overrulen alles** (mrt 2026 = all-time zoekpiek) → driver-pagina's + recap zijn de
  schokdempers; snel houden.

## Quick wins voor de huidige cyclus (gebouwd om niet te verouderen)
1. Real-terms record tracker (kans #2) — ~1 dag werk op bestaande pipeline + CPI.
2. **All-time-high log** — auto-tabel van elk record (2025: 53 ATHs): datum, prijs, dagen sinds
   vorige, reëel/nominaal. Journalisten + AI citeren lijsten; regenereert zichzelf.
3. **Drawdown-meter** — "goud staat X% onder de piek van jan 2026; mediane correctie in bull-markten: Y%"
   — bedient de huidige "has gold peaked"-piek met pure data en viert straks vanzelf nieuwe records.
4. Melt-value calculator (kans #4).
5. "Is gold overvalued? The data" (kans #3) — nu bouwen terwijl het debat heet is.

## AI-search-vorm (geldt voor alles)
Direct antwoord in eerste 40–60 woorden · één benoemde-bron-statistiek per ~150–200 woorden ·
schema + verse timestamps. Grootste gat: onze beste data is nog niet overal verpakt als
één-zins-antwoordcapsules op eigen URL's.

## Aanbevolen bouwvolgorde (na cluster 1)
1. Real-terms tracker + ATH-log + drawdown-meter (samen één "records & waardering"-cluster;
   deelt één generator).
2. "Is gold overvalued?"-datapagina (hergebruikt dezelfde meters).
3. Melt-value calculator.
4. Central-bank buying tracker (kwartaal-cadans, WGC-attributie).
5. Vergelijkings-engine (gold vs stocks/bitcoin/inflation) — grootste bouw, sterkste evergreen.

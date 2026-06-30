# Precious Metals Charts — iOS-app (native SwiftUI)

Een native iPhone-app met dezelfde opzet als de Live-webapp: live goud/zilver/platina/palladium-
spotprijzen met dag-verandering en een intraday-grafiekje per metaal, plus valuta- en eenheidkeuze.
De app leest exact dezelfde data als de website (`prices.json` + `intraday.json`) — geen account,
geen API-sleutel, geen persoonsgegevens.

> **Belangrijk:** ik (de assistent) kan de code schrijven, maar **bouwen, testen en indienen doe jij
> op je Mac** in Xcode + App Store Connect met je eigen Apple Developer-account. Dat hoort zo —
> alleen jij hebt toegang tot je account en de ondertekening (signing). Hieronder staat elke stap.

---

## Wat je nodig hebt
- Een **Mac** met **Xcode** (gratis uit de Mac App Store).
- Je **Apple Developer-account** (die heb je al).
- Deze map `ios-app/PreciousMetalsCharts/` met 4 Swift-bestanden.

## Stap 1 — Maak het project aan in Xcode
1. Open **Xcode** → **File → New → Project…**
2. Kies **iOS → App** → **Next**.
3. Vul in:
   - **Product Name:** `PreciousMetalsCharts`
   - **Team:** kies je Apple Developer-team (je account).
   - **Organization Identifier:** bijv. `com.preciousmetalscharts` (of je eigen domein omgekeerd).
     → de **Bundle Identifier** wordt dan `com.preciousmetalscharts.PreciousMetalsCharts`.
   - **Interface:** **SwiftUI** · **Language:** **Swift**
   - Vinkjes (Core Data / Tests) mag je **uit** laten.
4. **Next** → kies een map → **Create**.

## Stap 2 — Zet mijn code erin
Xcode heeft nu twee bestanden gemaakt: `PreciousMetalsChartsApp.swift` en `ContentView.swift`.
1. **Vervang de inhoud** van die twee bestanden door de inhoud van mijn gelijknamige bestanden
   (open mijn bestand, selecteer alles, kopieer, plak over het Xcode-bestand).
2. Voeg de andere twee toe: sleep **`Model.swift`** en **`PricesViewModel.swift`** vanuit deze map
   in de Xcode-projectnavigator (links). Vink **"Copy items if needed"** aan → **Finish**.

Je hebt nu 4 bestanden in het project: `PreciousMetalsChartsApp.swift`, `Model.swift`,
`PricesViewModel.swift`, `ContentView.swift`.

## Stap 3 — Stel het doel-iOS in
- Klik bovenaan op het projectnaam-icoon (blauw) → tab **General** → **Minimum Deployments** → zet op
  **iOS 16.0** (of hoger).
- Internet werkt meteen: de app praat met `https://preciousmetalscharts.com` (HTTPS), dus je hoeft
  **niets** aan App Transport Security te wijzigen.

## Stap 4 — Testen
- Kies bovenin een simulator (bijv. **iPhone 15**) → druk op **▶︎ Run** (of ⌘R).
- De app start en toont na ~1 seconde de live prijzen. Wissel **Currency** en **Unit** om te testen,
  trek naar beneden om te verversen.
- Zie je een build-fout? **Kopieer de rode foutmelding en stuur 'm naar mij** — dan los ik het op
  (ik kan Xcode hier niet draaien, dus dit gaat met een paar rondjes heen-en-weer).

## Stap 5 — App-icoon
Er staan **twee kant-en-klare iconen** voor je klaar in de map **`ios-app/AppIcon/`** (beide
1024×1024, dekkend, zonder alfakanaal — precies wat de App Store eist):
- **`AppIcon-B-gold.png`** — gouden achtergrond met donker grafiek-merkteken (hoog contrast, muntachtig).
- **`AppIcon-A-dark-glow.png`** — donker grafiet met oplichtend goud (sfeervol/premium).

In Xcode: open **Assets** → **AppIcon** → sleep je favoriet erin (bij het 1024-vak / "Single Size").
Xcode maakt zelf de kleinere formaten. Apple maakt zelf de ronde hoeken — daarom zijn de iconen vierkant.
Wil je een aanpassing (andere goudtint, meer/minder gloed, dunnere lijn)? Vraag het me.

## Stap 6 — Naar de App Store (wanneer je tevreden bent)
1. In Xcode: kies bovenin **Any iOS Device (arm64)** als doel.
2. **Product → Archive**. Als de archive klaar is → **Distribute App → App Store Connect → Upload**.
3. Ga naar **App Store Connect** (appstoreconnect.apple.com) → **Apps → +** → maak een app-record met
   dezelfde Bundle ID.
4. Vul in: naam, beschrijving, categorie (**Finance**), schermafbeeldingen (maak ze in de simulator
   met ⌘S), en **Privacy → Data Not Collected** (de app verzamelt geen persoonsgegevens).
   Geef als **privacy-policy/support-URL** bijv. `https://preciousmetalscharts.com/disclaimer`.
5. Selecteer de geüploade build → **Submit for Review**.

> **Review-tip:** dit is een echte native app (geen webview-wrapper), dus het komt normaal gesproken
> netjes door Apple's review. Voeg later gerust native extra's toe (home-screen widget, prijs-alerts)
> — dat versterkt de app verder. Vraag het me wanneer je zover bent.

---

## Adverteerder-ruimte onderin (server-gestuurd)
Onderaan de app zit een **sponsor-/advertentieruimte** — net als in de Live-webapp. Die is
**server-gestuurd**: de app leest `https://preciousmetalscharts.com/app-ad.json`, dus je kunt een
adverteerder plaatsen of wisselen **zonder de app opnieuw in te dienen** — je past één bestand aan.
- **Geen betaalde adverteerder?** Laat `active:false` → de app toont automatisch je eigen
  nieuwsbrief-promo (een echte, klikbare knop — netter voor Apple's review dan een lege plek).
- **Wel een adverteerder?** Zet in `app-ad.json`: `active:true`, `sponsored:true`, en vul
  `title`, `subtitle` en `url` (https). Het label "ADVERTISEMENT" verschijnt dan automatisch
  (verplichte transparantie). Upload het bestand → binnen ~1 min zien alle gebruikers het.
  Ik kan dit voor je invullen zodra je een sponsor hebt.

## Wat de app doet (kort)
- `prices.json` → prijs, dag-open en `changePct` per metaal + wisselkoersen (`fx.rates`).
- `intraday.json` → rollende ~26-uurs reeks per metaal voor het grafiekje.
- Prijs = `usd_per_ounce × eenheidsfactor × wisselkoers`; dag-verandering identiek aan de webapp.
- Ververst automatisch elke 60 sec en bij terugkeer naar de voorgrond; eerlijke "verouderd"-melding
  als de data ouder dan ~20 min is (net als de site).

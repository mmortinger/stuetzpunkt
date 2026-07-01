# Recommendation-Feature

Dieses Dokument beschreibt die zusätzliche Empfehlungsschicht für Stützpunkt. Das bestehende manuelle Tages-/Warenkorb-System bleibt erhalten; die Empfehlungen sind eine optionale Hilfe darüber.

## Seiten

### Home

`index.html` ist die Tagesansicht:

- Tagesnavigation
- Empfehlungsprofil
- Tagesempfehlung
- normaler Speiseplan mit Steppers
- Warenkorb/Sweet-Spot-Berechnung

### Wochenübersicht

`weekly.html` ist eine zweite statische Seite:

- eigenes Navigationstab neben Home
- Empfehlungsprofil
- Wochenkarten für alle geladenen Tage
- vergangene Tage sind ausgegraut
- pro Tag eine vertikale Empfehlungsliste
- pro Tag Refresh für Hauptspeise und Kombination

Beide Seiten verwenden dieselbe `app.js` und unterscheiden sich über `body data-page="home"` bzw. `body data-page="weekly"`.

## Empfehlungsprofil

Die Einstellungen sind in einem Akkordeon untergebracht und standardmäßig eingeklappt.

### Allgemein

- **Sweet Spot**
  - `Möglichst nah`
  - `Knapp drunter`
  - `Leicht drüber`
- **Ernährung**
  - `Alles`
  - `Vegetarisch`
- **Großer Salat statt Hauptspeise erlauben**
  - Wenn aktiv, darf ein großer Salat als Hauptspeise-Ersatz empfohlen werden.
  - Wenn ein großer Salat als Hauptspeise verwendet wird, wird kein kleiner Salat zusätzlich gewählt.
- **Immer 1 Gebäck zu großem Salat**
  - Wenn aktiv, wird bei großem Salat als Hauptspeise mindestens ein Gebäck ergänzt.
  - Diese Option greift nur, wenn der Zusatz `Gebäck` nicht auf `Nie` steht.

### Zusätze

Jeder Zusatz hat drei Modi:

- `Bei Bedarf`
  - der Optimierer darf den Zusatz verwenden, wenn er damit besser am Sweet Spot landet
- `Immer`
  - der Zusatz ist in Empfehlungskandidaten immer enthalten, sofern er verfügbar und zur Ernährung passend ist
- `Nie`
  - der Zusatz wird in Empfehlungen nicht verwendet

- Obst
- Suppe
- Gebäck
- Orangensaft
- Kleiner Salat
- Nachspeise

Obst und Nachspeise stehen für neue User standardmäßig auf `Bei Bedarf`. Die übrigen Zusätze stehen standardmäßig auf `Nie`.

## Info-Hover

Alle Einstellungen haben ein kleines `i` mit Erklärung. Die Hinweise funktionieren per Hover und Fokus.

Beim `Profil-Link` gibt es ebenfalls ein kleines `i` links vom Button. Es erklärt:

- Einstellungen werden automatisch im Browser gespeichert.
- Der Profil-Link schreibt die Einstellungen zusätzlich in die URL.
- Ein Bookmark oder geteilter Link lädt später genau diese Einstellungen wieder.

## Profil-Speicherung

Das Profil wird automatisch in `localStorage` gespeichert:

```js
stuetzpunkt-profile-v1
```

Der Profil-Link kodiert das Profil zusätzlich in den URL-Hash:

```text
index.html#p=...
weekly.html#p=...
```

Beim Laden gilt:

1. Wenn ein Profil im URL-Hash vorhanden ist, wird dieses geladen.
2. Das Hash-Profil wird lokal gespeichert.
3. Wenn kein Hash-Profil vorhanden ist, wird `localStorage` verwendet.
4. Wenn auch dort nichts liegt, gelten die Defaults.

## Empfehlungslogik

Die App baut Kandidaten aus:

- einer Hauptspeise oder optional großem Salat
- Zusätzen je nach Modus `Bei Bedarf`, `Immer` oder `Nie`

Danach wird jeder Kandidat gegen die aktuelle Sweet-Spot-Strategie bewertet.

### Andere Hauptspeise

Der Button `Andere Hauptspeise` rotiert nicht blind durch beliebige Kombinationen. Stattdessen wird:

1. pro Hauptspeise die beste Kombination berechnet
2. diese Liste nach Sweet-Spot-Score sortiert
3. zur nächsten Hauptspeise in dieser sortierten Liste gewechselt

Dadurch bleibt auch nach einem Refresh die Sweet-Spot-Einstellung wichtig.

### Wochen-Refresh

In der Wochenübersicht hat jede Tageskarte zwei Buttons:

- **Hauptspeise**
  - wechselt zur nächsten sinnvoll bewerteten Hauptspeise
- **Kombi**
  - rotiert durch alternative Kombinationen derselben Bewertungsliste

## Vegetarisch-Erkennung

Vegetarisch wird heuristisch erkannt:

- Der Slot `Vegetarisch / Vegan` zählt als vegetarisch.
- Zusätzlich wird der Text grob nach Fleisch/Fisch-Begriffen durchsucht.

Vegan wird bewusst nicht als Option angeboten, weil die verfügbaren Speiseplandaten dafür nicht zuverlässig genug sind.

## Grenzen

- Keine Userverwaltung.
- Keine serverseitige Speicherung.
- Profile im Link sind nicht geheim, sondern nur kodiert.
- Die Ernährungserkennung ist heuristisch und kann Speiseplan-Texte falsch interpretieren.
- Empfehlungen verändern den Warenkorb erst, wenn der User `Übernehmen` klickt.

# Stützpunkt — Kantinen-Rechner

Kleine Webapp für den Mittags-Essenszuschuss in der Firmenkantine.  
Zeigt den aktuellen Speiseplan, lässt Gerichte anklicken und berechnet live,
was das Essen kostet und wie viele Stück Obst noch **gratis** dazugenommen werden können.

## Lokal testen

```bash
# Einmalig: Scraper installieren
pip install -r requirements.txt

# Speiseplan holen
python3 scraper.py

# Lokaler Dev-Server (same-origin für die JSON-Fetches)
npm run dev
# → Home: http://127.0.0.1:4173/
# → Wochenübersicht: http://127.0.0.1:4173/weekly.html
```

## Deployment via GitHub Pages

### 1. Repository erstellen & Code pushen

```bash
git init
git add .
git commit -m "init"
git remote add origin git@github.com:DEIN-USER/stuetzpunkt.git
git push -u origin main
```

### 2. GitHub Pages aktivieren

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, Folder: `/ (root)` → Save.

### 3. Action-Schreibrechte erlauben

Settings → Actions → General → Workflow permissions → **Read and write permissions** → Save.

### 4. Ersten Scraper-Lauf manuell auslösen

Actions → „Speiseplan aktualisieren" → Run workflow.

Ab dann läuft der Scraper **automatisch Mo–Fr um 06:00 CEST** und committet die neue `menu.json`.

---

## Konfiguration

`config.json` enthält alle fixen Werte (Stützung, Fixpreise).  
Diese Datei wird **nie** vom Scraper überschrieben — nur manuell anpassen wenn sich etwas ändert.

```json
{
  "min_betrag":    4.28,
  "max_stuetzung": 6.66,
  "preise_fix": {
    "obst_stueck":       1.00,
    "gebaeck_stueck":    1.50,
    "orangensaft_glas":  3.60,
    "salat_klein":       2.90,
    "salat_gross":       5.10
  }
}
```

## Berechnungslogik

```
sweet_spot     = min_betrag + max_stuetzung       // = 10,94 €
du_zahlst(wk)  = max(min_betrag, wk − max_stuetzung)
```

Solange der Warenkorb ≤ sweet_spot bleibt, zahlst du immer `min_betrag` (4,28 €).
Danach steigt der Preis linear.

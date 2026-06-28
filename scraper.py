#!/usr/bin/env python3
"""
Stützpunkt scraper — fetches the Platinum Vienna menu and writes menu.json.
Usage: python3 scraper.py
"""
import copy
import json
import re
import sys
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

MENU_URL = "https://menus.doco.com/platinum/menu/"
OUTPUT_FILE = "menu.json"

# Category labels that map to "mains"
MAIN_SLOTS = {"Hauptspeise 1", "Hauptspeise 2", "Vegetarisch / Vegan", "Special"}


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

def fetch_html(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; Stuetzpunkt-Scraper/1.0)"}
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.text


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def parse_price_value(text: str) -> float | None:
    """'2,50 €' → 2.50  (handles German decimal comma)"""
    # Remove thousand-separators first (dots in German), then swap comma→dot
    cleaned = text.replace(".", "").replace(",", ".")
    m = re.search(r"\d+\.\d+|\d+", cleaned)
    if m:
        try:
            return float(m.group())
        except ValueError:
            pass
    return None


def parse_prices(menu_row) -> dict:
    """Return {'int': float|None, 'ext': float|None} from a .menu row."""
    result = {"int": None, "ext": None}
    for mp in menu_row.select(".menu-price"):
        pre = mp.select_one(".price-pre")
        val = mp.select_one(".price")
        if not pre or not val:
            continue
        pre_text = pre.get_text(strip=True).lower()
        price = parse_price_value(val.get_text(strip=True))
        if price is None:
            continue
        if "int" in pre_text:
            result["int"] = price
        elif "ext" in pre_text:
            result["ext"] = price
    return result


def clean_desc(menu_row) -> str:
    """Get description text with embedded price nodes removed."""
    desc_el = menu_row.select_one(".menu-desc")
    if not desc_el:
        return ""
    desc_copy = copy.deepcopy(desc_el)
    for node in desc_copy.select(".menu-price, .menu-price-pre, .menu-prices-pre"):
        node.decompose()
    return desc_copy.get_text(" ", strip=True)


def date_to_iso(date_raw: str) -> str | None:
    """'22.06.2026' → '2026-06-22'"""
    try:
        d, m, y = date_raw.strip().split(".")
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Day / week parsing
# ---------------------------------------------------------------------------

def parse_day(col) -> dict | None:
    """Parse one day column (.col-md-2 containing a .day) into a day dict."""
    day_el = col.select_one(".day")
    if not day_el:
        return None

    dayname_el = day_el.select_one(".dayname")
    date_el    = day_el.select_one(".date")
    if not dayname_el or not date_el:
        return None

    weekday  = dayname_el.get_text(strip=True)
    date_iso = date_to_iso(date_el.get_text(strip=True))
    if not date_iso:
        return None

    day: dict = {
        "date":     date_iso,
        "weekday":  weekday,
        "soup":     None,
        "salads":   [],
        "mains":    [],
        "desserts": [],
    }

    current_cat: str | None = None

    for menu_row in col.select(".menu"):
        # Update current category if this row has a label
        cat_el = menu_row.select_one(".menu-category")
        if cat_el:
            current_cat = cat_el.get_text(strip=True)

        if current_cat is None:
            continue  # no category determined yet, skip

        name_el = menu_row.select_one(".menu-name")
        name = name_el.get_text(strip=True) if name_el else ""
        if not name:
            continue  # nothing useful in this row

        desc   = clean_desc(menu_row)
        prices = parse_prices(menu_row)

        if current_cat == "Suppe":
            if day["soup"] is None:
                day["soup"] = {
                    "name": name,
                    "desc": desc,
                    "int":  prices["int"],
                    "ext":  prices["ext"],
                }
            else:
                # Freitags-Sonderfall: erster Salatbuffet-Eintrag kommt ohne eigenes
                # Kategorie-Label direkt nach der Suppe → als Salat erfassen.
                day["salads"].append({"name": name, "desc": desc})

        elif current_cat == "Salatbuffet":
            # Salads have no prices in the HTML (prices come from config.json)
            day["salads"].append({"name": name, "desc": desc})

        elif current_cat in MAIN_SLOTS:
            day["mains"].append({
                "slot": current_cat,
                "name": name,
                "desc": desc,
                "int":  prices["int"],
                "ext":  prices["ext"],
            })

        elif current_cat == "Dessert":
            # Second dessert has no category label → current_cat stays "Dessert"
            day["desserts"].append({
                "name": name,
                "int":  prices["int"],
                "ext":  prices["ext"],
            })
        # else: unknown category → skip defensively

    return day


def parse_week(week_el) -> dict | None:
    """Parse one week block (.row.table-menu-black) into a week dict."""
    cols = [c for c in week_el.select("div.col-md-2") if c.select_one(".day")]
    if not cols:
        return None

    days = []
    for col in cols:
        day = parse_day(col)
        if day:
            days.append(day)

    if not days:
        return None

    return {"week_start": days[0]["date"], "days": days}


def scrape(url: str) -> dict:
    html = fetch_html(url)
    soup = BeautifulSoup(html, "html.parser")

    week_els = soup.select("div.row.table-menu-black")
    weeks = []
    for we in week_els[:2]:          # at most 2 weeks
        week = parse_week(we)
        if week:
            weeks.append(week)

    return {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "weeks": weeks,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"Fetching {MENU_URL} …")
    try:
        data = scrape(MENU_URL)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    week_count = len(data["weeks"])
    day_count  = sum(len(w["days"]) for w in data["weeks"])
    print(f"Parsed {week_count} week(s), {day_count} day(s).")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Written → {OUTPUT_FILE}")

    # Quick sanity check
    for week in data["weeks"]:
        for day in week["days"]:
            issues = []
            if day["soup"] is None:
                issues.append("no soup")
            if not day["mains"]:
                issues.append("no mains")
            if day["soup"] and day["soup"]["int"] is None:
                issues.append("soup missing Int price")
            for m in day["mains"]:
                if m["int"] is None:
                    issues.append(f"main '{m['name']}' missing Int price")
            if issues:
                print(f"  WARN {day['weekday']} {day['date']}: {', '.join(issues)}")


if __name__ == "__main__":
    main()

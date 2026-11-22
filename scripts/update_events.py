"""Read upcoming "big news days" from official pages and save them to data/events_auto.json.

Sources (official only):
  US Federal Reserve FOMC calendar   https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
  RBI press releases (RSS), looking for "Meeting Schedule of the Monetary Policy Committee"

Hand-checked dates in data/events.json always win; this file only adds dates.
Nothing is deleted: past dates stay in the file (useful later to study what happened on those days).
If fewer than 3 upcoming dates are known, the script says so (the workflow then opens a reminder issue).
If a page cannot be read, the script prints a warning and keeps the existing file.
"""
import datetime as dt
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
FED_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'
RBI_RSS = 'https://rbi.org.in/pressreleases_rss.xml'
UA = 'Mozilla/5.0 (compatible; bullion-awareness-site/1.0; non-commercial; once-daily)'
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
MI = {m: i for i, m in enumerate(MONTHS, 1)}
FED_MEANING = 'US interest rates move the world gold price, which Indian prices follow. Big surprises can move prices a lot in a day.'
RBI_MEANING = 'RBI decides interest rates. A change can move the rupee, and a weaker rupee makes gold dearer here. Nobody knows the decision in advance.'


def http_get(url):
    import requests
    r = requests.get(url, headers={'User-Agent': UA}, timeout=30)
    r.raise_for_status()
    return r.text


def parse_fed(html):
    """Return [(start, end)] two-day FOMC meetings from the Fed calendar page."""
    out = []
    parts = re.split(r'(\d{4})\s+FOMC\s+Meetings', html)
    for i in range(1, len(parts) - 1, 2):
        year, seg = int(parts[i]), parts[i + 1]
        for m in re.finditer(r'>\s*(' + '|'.join(MONTHS) + r')\s*<.{0,400}?>\s*(\d{1,2})-(\d{1,2})\*?\s*<', seg, re.S):
            mon, a, b = MI[m.group(1)], int(m.group(2)), int(m.group(3))
            if b < a:
                continue  # meeting across two months: skip rather than guess
            try:
                out.append((dt.date(year, mon, a), dt.date(year, mon, b)))
            except ValueError:
                continue
    return sorted(set(out))


def parse_rbi_rss(xml):
    """Return links of RBI press releases announcing an MPC meeting schedule."""
    out = []
    for item in re.findall(r'<item>(.*?)</item>', xml, re.S):
        title = re.search(r'<title>(.*?)</title>', item, re.S)
        link = re.search(r'<link>(.*?)</link>', item, re.S)
        if title and link and re.search(r'Meeting Schedule of the Monetary Policy Committee', title.group(1), re.I):
            out.append(link.group(1).strip())
    return out


def parse_rbi_schedule(html):
    """'April 6, 7 and 8, 2026' -> (2026-04-06, 2026-04-08)."""
    out = []
    pat = r'(' + '|'.join(MONTHS) + r')\s+(\d{1,2})((?:,\s*\d{1,2})*)\s+and\s+(\d{1,2}),\s*(\d{4})'
    for m in re.finditer(pat, html):
        mon, a, b, y = MI[m.group(1)], int(m.group(2)), int(m.group(4)), int(m.group(5))
        if b < a:
            continue
        out.append((dt.date(y, mon, a), dt.date(y, mon, b)))
    return sorted(set(out))


def event(kind, s, e, title, meaning, src_name, url, status):
    return {'kind': kind, 'start': s.isoformat(), 'end': e.isoformat(), 'status': status,
            'en': {'title': title, 'meaning': meaning}, 'source': {'name': src_name, 'url': url}, 'auto': True}


def main():
    path = os.path.join(DATA, 'events_auto.json')
    old = []
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fh:
            old = json.load(fh)
    found = []
    try:
        for s, e in parse_fed(http_get(FED_URL)):
            found.append(event('fed_fomc', s, e, 'US Federal Reserve decision', FED_MEANING,
                               'Federal Reserve: FOMC meeting calendars', FED_URL, 'scheduled'))
    except Exception as ex:
        print(f'warning: Fed calendar not read: {ex}')
    try:
        for link in parse_rbi_rss(http_get(RBI_RSS))[:3]:
            for s, e in parse_rbi_schedule(http_get(link)):
                found.append(event('rbi_mpc', s, e, 'RBI interest-rate decision', RBI_MEANING,
                                   'RBI: Monetary Policy Committee meeting schedule', link, 'confirmed'))
    except Exception as ex:
        print(f'warning: RBI schedule not read: {ex}')
    keys = {(e['kind'], e['start']) for e in old}
    merged = old + [e for e in found if (e['kind'], e['start']) not in keys]
    merged.sort(key=lambda e: e['start'])
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(merged, fh, ensure_ascii=False, indent=2)
    today = dt.date.today().isoformat()
    manual = []
    mp = os.path.join(DATA, 'events.json')
    if os.path.exists(mp):
        with open(mp, encoding='utf-8') as fh:
            manual = json.load(fh)
    upcoming = {(e['kind'], e['start']) for e in manual + merged if e['end'] >= today}
    print(f'read {len(found)} dates; {len(upcoming)} upcoming dates known')
    out = os.environ.get('GITHUB_OUTPUT')
    if out:
        with open(out, 'a') as fh:
            fh.write(f"few_events={'true' if len(upcoming) < 3 else 'false'}\n")


if __name__ == '__main__':
    main()

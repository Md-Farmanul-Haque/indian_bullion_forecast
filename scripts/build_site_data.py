"""Build data/site.json, the only file the website reads.

Everything shown on the site is computed here from files in data/:
  ibja_daily.csv        IBJA daily AM/PM rates (with the PDF each row came from)
  forecasts.csv         the public, append-only record of ranges we published
  research/chart_data.json   RBI yearly series and RBI Sovereign Gold Bond prices
  facts.json, events.json    dated facts and upcoming dates, each with a source

Method (plain words): the one-month range starts at today's price, assumes
no trend (up and down equally likely) and takes its width from how much the
price moved day to day over the last 60 published days. 80% range uses
z = 1.2816, 50% range z = 0.6745, horizon = 21 trading days (about 30 days).

Usage:
  python3 scripts/build_site_data.py            # build site.json only
  python3 scripts/build_site_data.py --record   # also save today's ranges to forecasts.csv
"""
import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(__file__))
import ibja  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
METHOD_VERSION = 'v1-zero-trend-60d'
Z80, Z50 = 1.2816, 0.6745
WINDOW = 60          # daily moves used for the width
MIN_MOVES = 30       # fewer than this -> no range
LOOKBACK_DAYS = 120  # moves must be this recent
H_DAYS = 30          # calendar days ahead
H_TRADING = 21       # trading days in that span
MAX_STEP_GAP = 6     # a "daily move" may span a weekend/holiday, not a data gap
MATCH_DAYS = 4       # actual price = last published price within 4 days before the target
RECORD_MAX_AGE = 4   # only record a range if the data is at most 4 days old (keeps the record forward-looking)

METALS = {
    'gold22': {'field': 'g916', 'unit': '10 g'},
    'gold24': {'field': 'g999', 'unit': '10 g'},
    'silver': {'field': 's999', 'unit': '1 kg'},
}
LEDGER_COLS = ['made_on', 'recorded_utc', 'metal', 'start_price', 'session', 'target_date',
               'low80', 'high80', 'low50', 'high50', 'sigma_daily', 'moves_used', 'method']


def series(rows, field):
    out = []
    for d in sorted(rows):
        r = rows[d]
        if r.get(field + '_pm') is not None:
            out.append((d, r[field + '_pm'], 'PM', r))
        elif r.get(field + '_am') is not None:
            out.append((d, r[field + '_am'], 'AM', r))
    return out


def moves(ser):
    """(end_date, log move) for consecutive published days without a data gap."""
    out = []
    for (d0, p0, *_), (d1, p1, *_) in zip(ser, ser[1:]):
        if (d1 - d0).days <= MAX_STEP_GAP:
            out.append((d1, math.log(p1 / p0)))
    return out


def sigma_at(mv, t):
    recent = [m for d, m in mv if d <= t and (t - d).days <= LOOKBACK_DAYS][-WINDOW:]
    if len(recent) < MIN_MOVES:
        return None, len(recent)
    return statistics.stdev(recent), len(recent)


def make_range(p, sig):
    s = sig * math.sqrt(H_TRADING)
    return {'low80': p * math.exp(-Z80 * s), 'high80': p * math.exp(Z80 * s),
            'low50': p * math.exp(-Z50 * s), 'high50': p * math.exp(Z50 * s)}


def price_near(ser, target):
    best = None
    for d, p, *_ in ser:
        if d <= target and (target - d).days <= MATCH_DAYS:
            best = (d, p)
    return best


def backtest(ser, mv):
    pts = []
    for d, p, *_ in ser:
        sig, n = sigma_at(mv, d)
        if sig is None:
            continue
        hit = price_near(ser, d + dt.timedelta(days=H_DAYS))
        if hit is None:
            continue
        r = make_range(p, sig)
        a = hit[1]
        pts.append({'d': d.isoformat(), 'p': p, 'lo80': round(r['low80']), 'hi80': round(r['high80']),
                    'lo50': round(r['low50']), 'hi50': round(r['high50']), 'a': a, 'ad': hit[0].isoformat(),
                    'h80': r['low80'] <= a <= r['high80'], 'h50': r['low50'] <= a <= r['high50']})
    n = len(pts)
    months = sorted({x['d'][:7] for x in pts})
    return {'n': n, 'hit80': sum(x['h80'] for x in pts), 'hit50': sum(x['h50'] for x in pts),
            'above80': sum(x['a'] > x['hi80'] for x in pts), 'below80': sum(x['a'] < x['lo80'] for x in pts),
            'months': months, 'points': pts}


def gaps(ser):
    out = []
    for (d0, *_), (d1, *_) in zip(ser, ser[1:]):
        if (d1 - d0).days > MAX_STEP_GAP:
            out.append([(d0 + dt.timedelta(days=1)).isoformat(), (d1 - dt.timedelta(days=1)).isoformat()])
    return out


def read_ledger(path):
    if not os.path.exists(path):
        return []
    with open(path, newline='', encoding='utf-8') as fh:
        return list(csv.DictReader(fh))


def append_ledger(path, recs):
    new = not os.path.exists(path)
    with open(path, 'a', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=LEDGER_COLS)
        if new:
            w.writeheader()
        for r in recs:
            w.writerow(r)


def score_ledger(ledger, sers):
    out = []
    for r in ledger:
        ser = sers.get(r['metal'])
        t = dt.date.fromisoformat(r['target_date'])
        res = {k: r[k] for k in ('made_on', 'recorded_utc', 'metal', 'target_date', 'session')}
        for k in ('start_price', 'low80', 'high80', 'low50', 'high50'):
            res[k] = float(r[k])
        hit = price_near(ser, t) if ser else None
        last = ser[-1][0] if ser else None
        if hit and last and last >= t - dt.timedelta(days=MATCH_DAYS) and hit[0] >= t - dt.timedelta(days=MATCH_DAYS):
            a = hit[1]
            res.update(status='checked', actual=a, actual_date=hit[0].isoformat(),
                       h80=res['low80'] <= a <= res['high80'], h50=res['low50'] <= a <= res['high50'])
        else:
            res['status'] = 'waiting'
        out.append(res)
    return out


def sgb_checks(rows, chart):
    """Reproduce RBI's Sovereign Gold Bond prices (simple average of IBJA 999 closing prices)."""
    out = []
    mon = {m: i for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
    for s in chart.get('sgb_prices_rbi', []):
        txt = s['ibja_dates'].replace('–', '-')
        m = re.match(r'^([\d,\s-]+)\s([A-Z][a-z]{2})\s(\d{4})$', txt)
        if not m:
            continue
        nums, mo, yr = m.group(1), mon[m.group(2)], int(m.group(3))
        days = []
        for part in nums.split(','):
            part = part.strip()
            if '-' in part:
                a, b = (int(x) for x in part.split('-'))
                days += list(range(a, b + 1))
            elif part:
                days.append(int(part))
        dates = [dt.date(yr, mo, x) for x in days]
        closes = []
        for d in dates:
            r = rows.get(d)
            if r is None:
                continue
            closes.append(r['g999_pm'] if r.get('g999_pm') is not None else r.get('g999_am'))
        if len(dates) and all(d in rows for d in dates) and None not in closes:
            ours = round(sum(closes) / len(closes) / 10)
            out.append({'rbi_date': s['redemption_date'], 'what': s['type'], 'ibja_days': s['ibja_dates'],
                        'rbi_rs_per_g': s['rs_per_gram'], 'ours_rs_per_g': ours,
                        'match': abs(ours - s['rs_per_gram']) <= 1,
                        'url': f"https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid={s['prid']}"})
    return out


def build(record=False, today=None):
    today = today or dt.datetime.now(dt.timezone.utc).date()
    rows = ibja.read_csv(os.path.join(DATA, 'ibja_daily.csv'))
    def load(*parts):
        with open(os.path.join(DATA, *parts), encoding='utf-8') as fh:
            return json.load(fh)
    chart, facts, events = load('research', 'chart_data.json'), load('facts.json'), load('events.json')
    ledger_path = os.path.join(DATA, 'forecasts.csv')

    site = {'generated_utc': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'method': {'version': METHOD_VERSION, 'z80': Z80, 'z50': Z50, 'window': WINDOW, 'min_moves': MIN_MOVES,
                       'horizon_days': H_DAYS, 'horizon_trading_days': H_TRADING, 'match_days': MATCH_DAYS},
            'metals': {}, 'facts': facts, 'events': events}
    sers, new_recs = {}, []
    ledger = read_ledger(ledger_path)
    for key, cfg in METALS.items():
        ser = series(rows, cfg['field'])
        sers[key] = ser
        mv = moves(ser)
        d, p, sess, r = ser[-1]
        ago = price_near(ser, d - dt.timedelta(days=30))
        sig, n = sigma_at(mv, d)
        m = {'unit': cfg['unit'], 'latest': {'date': d.isoformat(), 'session': sess, 'price': p, 'source': r['sources'][-1]},
             'month_ago': {'date': ago[0].isoformat(), 'price': ago[1]} if ago else None,
             'history': [[x[0].isoformat(), x[1]] for x in ser], 'gaps': gaps(ser),
             'backtest': backtest(ser, mv)}
        if sig is not None:
            rg = make_range(p, sig)
            m['forecast'] = {'made_on': d.isoformat(), 'target': (d + dt.timedelta(days=H_DAYS)).isoformat(),
                             'sigma_daily': sig, 'moves_used': n, **{k: round(v) for k, v in rg.items()}}
            already = any(x['metal'] == key and x['made_on'] == d.isoformat() for x in ledger)
            if record and not already and (today - d).days <= RECORD_MAX_AGE:
                new_recs.append({'made_on': d.isoformat(), 'recorded_utc': site['generated_utc'], 'metal': key,
                                 'start_price': p, 'session': sess, 'target_date': m['forecast']['target'],
                                 'low80': round(rg['low80']), 'high80': round(rg['high80']),
                                 'low50': round(rg['low50']), 'high50': round(rg['high50']),
                                 'sigma_daily': f'{sig:.6f}', 'moves_used': n, 'method': METHOD_VERSION})
        site['metals'][key] = m
    if new_recs:
        append_ledger(ledger_path, new_recs)
        ledger = read_ledger(ledger_path)
    site['record'] = score_ledger(ledger, sers)
    last = max(rows)
    lr = rows[last]
    site['bill_rates'] = {'date': last.isoformat(),
                          'per_10g': {f: (lr.get(f + '_pm') or lr.get(f + '_am')) for f in ibja.FIELDS},
                          'session': 'PM' if lr.get('g916_pm') else 'AM', 'source': lr['sources'][-1]}
    site['data'] = {'first': min(rows).isoformat(), 'last': last.isoformat(), 'days': len(rows),
                    'multi_source_days': sum(1 for r in rows.values() if len(r['sources']) > 1),
                    'dropped_values': sum(len(r['notes']) for r in rows.values()),
                    'sources': sorted({s for r in rows.values() for s in r['sources']}),
                    'methods': sorted({r['method'] for r in rows.values()})}
    site['sgb_checks'] = sgb_checks(rows, chart)
    a, b = dt.date(2026, 5, 12), dt.date(2026, 5, 13)
    if a in rows and b in rows and rows[a].get('g999_pm') and rows[b].get('g999_pm'):
        site['duty_example'] = {'before': {'date': a.isoformat(), 'g999_pm': rows[a]['g999_pm'], 's999_pm': rows[a].get('s999_pm')},
                                'after': {'date': b.isoformat(), 'g999_pm': rows[b]['g999_pm'], 's999_pm': rows[b].get('s999_pm')},
                                'sources': sorted(set(rows[a]['sources'] + rows[b]['sources']))}
    site['yearly'] = [{'fy': y['fiscal_year'], 'gold': y['gold_rs_per_10g'], 'silver': y.get('silver_rs_per_kg')}
                      for y in chart['master_yearly']
                      if isinstance(y.get('gold_rs_per_10g'), (int, float)) and y['fiscal_year'] >= '1970-71'
                      and 'YEAR-TO-DATE' not in str(y.get('gold_value_type', ''))]
    site['yearly_source'] = {'name': 'RBI Handbook of Statistics on Indian Economy, table "Average price of gold and silver in domestic and foreign markets" (2025-26 edition T35; older editions T41/T42)',
                             'url': chart['meta']['source_urls']['T35'],
                             'note': chart['meta']['series_break']}
    with open(os.path.join(DATA, 'site.json'), 'w', encoding='utf-8') as fh:
        json.dump(site, fh, ensure_ascii=False, separators=(',', ':'))
    return site, new_recs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--record', action='store_true', help='append new ranges to data/forecasts.csv')
    a = ap.parse_args()
    site, new = build(record=a.record)
    for k, m in site['metals'].items():
        f = m.get('forecast')
        b = m['backtest']
        print(f"{k}: {m['latest']['date']} {m['latest']['session']} {m['latest']['price']}"
              + (f" | 80%: {f['low80']}-{f['high80']} 50%: {f['low50']}-{f['high50']} (sigma {f['sigma_daily']:.4f}, n={f['moves_used']})" if f else ' | no range')
              + f" | past test 80%: {b['hit80']}/{b['n']} 50%: {b['hit50']}/{b['n']} months={len(b['months'])}")
    print('SGB checks:', [(c['rbi_date'], c['rbi_rs_per_g'], c['ours_rs_per_g'], c['match']) for c in site['sgb_checks']])
    print('recorded:', len(new), '| record rows:', len(site['record']))


if __name__ == '__main__':
    main()

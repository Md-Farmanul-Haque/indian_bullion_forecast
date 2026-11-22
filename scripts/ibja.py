"""Shared helpers for IBJA (India Bullion and Jewellers Association) daily rates.

IBJA publishes an AM (opening) and a PM (closing) rate on business days for
Gold 999, 995, 916 (22K), 750 (18K), 585 (14K) per 10 g and Silver 999 per kg.
Rates exclude GST and making charges.

The "30 days" PDF on ibjarates.com lists rows like:
    16-Nov-26 | 134380 | 134971 | 133842 | ... | 169280 | 170251
in this column order (AM, PM pairs):
    999, 995, 916, 750, 585 (gold, per 10 g), Silver 999 (per kg)
A row with only 6 numbers carries AM rates only (PM not yet published).

Built-in check: IBJA derives the lower purities from Gold 999 with fixed
factors (995 = 0.996, 916 = 0.916, 750 = 0.75, 585 = 0.585 of the 999 rate).
Every gold value is checked against that; a value that fails is dropped,
never "corrected". Silver has no such check, so silver is cross-checked
between overlapping PDFs and against day-to-day jumps.
"""
import csv
import datetime as dt
import re

FIELDS = ['g999', 'g995', 'g916', 'g750', 'g585', 's999']
COLS = ['date'] + [f'{f}_{s}' for f in FIELDS for s in ('am', 'pm')] + ['sources', 'method', 'notes']
FACTOR = {'g995': 0.996, 'g916': 0.916, 'g750': 0.75, 'g585': 0.585}
FACTOR_TOL_REL = 0.0001  # 0.01% (about Rs 15 per 10 g): IBJA's own rounding/derivation differences;
                         # a digit slip that matters (>0.1%) is always caught
MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}

DATE_RE = re.compile(r'(\d{1,2})-([A-Za-z]{3})-(\d{2,4})')
TOKEN_RE = re.compile(r'\d{1,3}(?:,\d{2,3})+|\d+|(?<![\w])-(?![\w])')
ROW_RE = re.compile(
    r'(\d{1,2}-[A-Za-z]{3}-\d{2,4})\s*\**\s*\|?'
    r'((?:\s*\|?\s*(?:\d{1,3}(?:,\d{2,3})+|\d{4,7}|-)(?![\d-])){6,12})')


def parse_date(s):
    m = DATE_RE.fullmatch(s.strip())
    if not m:
        return None
    d, mon, y = m.groups()
    mon = MONTHS.get(mon.lower())
    if not mon:
        return None
    y = int(y)
    y = y + 2000 if y < 100 else y
    try:
        return dt.date(y, mon, int(d))
    except ValueError:
        return None


def _num(tok):
    if tok == '-':
        return None
    return int(tok.replace(',', ''))


def parse_text(text):
    """Return {date: {field_session: int|None}} for every rate row found in text.

    Holiday / SAT / SUN rows carry no numbers and are skipped.
    """
    out = {}
    for m in ROW_RE.finditer(text):
        d = parse_date(m.group(1))
        if d is None:
            continue
        toks = TOKEN_RE.findall(m.group(2))
        vals = [_num(t) for t in toks]
        row = {}
        if len(vals) == 12:
            for i, f in enumerate(FIELDS):
                row[f + '_am'] = vals[2 * i]
                row[f + '_pm'] = vals[2 * i + 1]
        elif len(vals) == 6:
            for i, f in enumerate(FIELDS):
                row[f + '_am'] = vals[i]
                row[f + '_pm'] = None
        else:
            continue
        if any(v is not None and not (1000 <= v <= 2_000_000) for v in row.values()):
            continue
        out[d] = row
    return out


def check_row(row):
    """Apply the purity-factor check. Returns (clean_row, notes)."""
    clean, notes = dict(row), []
    for s in ('am', 'pm'):
        base = row.get(f'g999_{s}')
        if base is None:
            continue
        fails = [f for f, k in FACTOR.items()
                 if row.get(f'{f}_{s}') is not None and abs(row[f'{f}_{s}'] - base * k) > max(3, base * k * FACTOR_TOL_REL)]
        if len(fails) >= 3:          # the 999 value itself is suspect
            for f in ['g999'] + list(FACTOR):
                clean[f'{f}_{s}'] = None
            notes.append(f'{s}: gold row failed purity check, dropped')
        else:
            for f in fails:
                clean[f'{f}_{s}'] = None
                notes.append(f'{s}: {f} failed purity check ({row[f"{f}_{s}"]} vs 999x{FACTOR[f]}), dropped')
    return clean, notes


def merge_candidates(cands):
    """cands: list of (source, row). Values must agree across sources; a field
    two sources disagree on is dropped. Returns (row, sources, notes)."""
    merged, notes, srcs = {}, [], []
    for src, _ in cands:
        if src not in srcs:
            srcs.append(src)
    for f in FIELDS:
        for s in ('am', 'pm'):
            k = f'{f}_{s}'
            vals = {r[k] for _, r in cands if r.get(k) is not None}
            if len(vals) == 1:
                merged[k] = vals.pop()
            elif len(vals) > 1:
                merged[k] = None
                notes.append(f'{k}: sources disagree {sorted(vals)}, dropped')
            else:
                merged[k] = None
    return merged, srcs, notes


def silver_jump_check(rows, limit=0.12):
    """Flag silver values that jump more than `limit` from the previous published value
    and are backed by only one source. Mutates rows in place; returns notes."""
    notes, prev, prev_d = [], None, None
    for d in sorted(rows):
        r = rows[d]
        if prev_d is not None and (d - prev_d).days > 6:
            prev = None          # only compare neighbouring business days, not across a data gap
        prev_d = d
        for s in ('am', 'pm'):
            v = r.get(f's999_{s}')
            if v is None:
                continue
            if prev is not None and abs(v / prev - 1) > limit and len(r['sources']) < 2:
                r[f's999_{s}'] = None
                r['notes'].append(f's999_{s} jump {prev}->{v} unconfirmed, dropped')
                notes.append(f'{d} s999_{s}')
                continue
            prev = v
    return notes


def read_csv(path):
    rows = {}
    try:
        with open(path, newline='', encoding='utf-8') as fh:
            for rec in csv.DictReader(fh):
                d = dt.date.fromisoformat(rec['date'])
                r = {c: (int(rec[c]) if rec[c] not in ('', None) else None) for c in COLS[1:-3]}
                r['sources'] = rec['sources'].split() if rec['sources'] else []
                r['method'] = rec['method']
                r['notes'] = [n for n in rec['notes'].split(' ; ') if n] if rec['notes'] else []
                rows[d] = r
    except FileNotFoundError:
        pass
    return rows


def write_csv(path, rows):
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(COLS)
        for d in sorted(rows):
            r = rows[d]
            w.writerow([d.isoformat()] + ['' if r.get(c) is None else r[c] for c in COLS[1:-3]]
                       + [' '.join(r['sources']), r['method'], ' ; '.join(r['notes'])])

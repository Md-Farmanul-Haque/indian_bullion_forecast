"""Daily update: add the newest IBJA rates to data/ibja_daily.csv.

Steps (at most a few small requests per run, once a day):
1. Open the IBJA home page and find the link to the current "30 days" PDF.
2. Download that PDF, read its table, check every row (purity check), and
   add new dates. Dates we already have are compared: a machine-read PDF
   value replaces a hand-transcribed one if they differ (logged in notes).
3. Read up to 5 older PDFs listed in data/ibja_backfill_urls.txt that have
   not been read yet (fills gaps and re-checks the transcribed history).
4. Keep every downloaded PDF, unchanged, in data/raw/ibja/ (the original evidence).

If IBJA cannot be reached the script prints a warning and exits 0, so the
site still builds from the data already in the repository.
Usage: python3 scripts/update_ibja.py [--offline-pdf FILE ...]
"""
import argparse
import datetime as dt
import io
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
import ibja  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
HOME_URLS = ['https://ibjarates.com/', 'https://www.ibjarates.com/']
UA = os.environ.get('IBJA_USER_AGENT', 'Mozilla/5.0 (compatible; bullion-awareness-site/1.0; non-commercial; once-daily)')
PDF_LINK_RE = re.compile(r'''(?:https?://(?:www\.)?ibjarates\.com)?/?UploadedFiles/30DaysPdf/[^"'<>]+?\.pdf''', re.I)
STAMP_RE = re.compile(r'Pdf_\d+_(\d{17})')
BACKFILL_PER_RUN = 5


def http_get(url, timeout=30):
    import requests
    r = requests.get(url, headers={'User-Agent': UA, 'Accept': '*/*'}, timeout=timeout)
    r.raise_for_status()
    return r.content


def norm_url(href):
    href = href.strip().replace('&amp;', '&')
    if not href.lower().startswith('http'):
        href = 'https://ibjarates.com/' + href.lstrip('/')
    parts = urllib.parse.urlsplit(href)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, urllib.parse.quote(urllib.parse.unquote(parts.path)), '', ''))


def find_pdf_links(html):
    links = {norm_url(m.group(0)) for m in PDF_LINK_RE.finditer(html)}
    def stamp(u):
        m = STAMP_RE.search(u)
        return m.group(1) if m else ''
    return sorted(links, key=stamp, reverse=True)


def pdf_text(pdf_bytes):
    import pdfplumber
    chunks = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                for row in table:
                    chunks.append(' | '.join((c or '').replace('\n', ' ') for c in row))
            chunks.append(page.extract_text() or '')
    return '\n'.join(chunks)


def pdf_rows(pdf_bytes):
    return ibja.parse_text(pdf_text(pdf_bytes))


def merge(rows, new_rows, src, today):
    """Merge machine-read rows into rows. Returns list of log lines."""
    log = []
    for d, r in sorted(new_rows.items()):
        if d > today or d < today - dt.timedelta(days=800):
            continue
        clean, notes = ibja.check_row(r)
        if not any(v is not None for v in clean.values()):
            continue
        if d not in rows:
            rows[d] = {**clean, 'sources': [src], 'method': 'pdf-extracted', 'notes': notes}
            log.append(f'{d}: added')
            continue
        cur = rows[d]
        changed, confirmed = [], 0
        for k, v in clean.items():
            if v is None:
                continue
            if cur.get(k) is None:
                cur[k] = v
                changed.append(f'{k} filled')
            elif cur[k] == v:
                confirmed += 1
            elif cur['method'] == 'transcribed-checked':
                cur['notes'].append(f'{k} corrected {cur[k]}->{v} by PDF extraction')
                cur[k] = v
                changed.append(f'{k} corrected')
            else:
                cur['notes'].append(f'{k}: later PDF shows {v}, kept {cur[k]}')
        if src not in cur['sources']:
            cur['sources'].append(src)
        if cur['method'] == 'transcribed-checked' and confirmed and not any('corrected' in c for c in changed):
            cur['method'] = 'transcribed-pdf-confirmed'
        if changed:
            log.append(f'{d}: ' + ', '.join(changed))
    return log


def archive(url, raw):
    """Keep every downloaded IBJA PDF unchanged in data/raw/ibja/ (the original evidence)."""
    name = os.path.basename(urllib.parse.unquote(urllib.parse.urlsplit(url).path)).replace(' ', '_')
    folder = os.path.join(DATA, 'raw', 'ibja')
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    if not os.path.exists(path):
        with open(path, 'wb') as fh:
            fh.write(raw)


def read_list(path):
    if not os.path.exists(path):
        return []
    return [ln.strip() for ln in open(path, encoding='utf-8') if ln.strip() and not ln.startswith('#')]


def processed_urls():
    path = os.path.join(DATA, 'ibja_sources.csv')
    out = set()
    if os.path.exists(path):
        for ln in open(path, encoding='utf-8').read().splitlines()[1:]:
            url, *_rest = ln.split(',')
            if ln.endswith('pdf-extracted'):
                out.add(url)
    return out


def note_source(url, rows_read):
    path = os.path.join(DATA, 'ibja_sources.csv')
    if rows_read:
        first, last = min(rows_read), max(rows_read)
    else:
        first = last = ''
    with open(path, 'a', encoding='utf-8') as fh:
        fh.write(f'{url},{first},{last},{len(rows_read)},pdf-extracted\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--offline-pdf', nargs='*', help='read these local PDF files instead of the network (tests)')
    a = ap.parse_args()
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).date()
    csv_path = os.path.join(DATA, 'ibja_daily.csv')
    rows = ibja.read_csv(csv_path)
    before = len(rows)
    log = []
    if a.offline_pdf:
        for p in a.offline_pdf:
            log += merge(rows, pdf_rows(open(p, 'rb').read()), os.path.basename(p), today)
    else:
        done = processed_urls()
        todo = []
        for home in HOME_URLS:
            try:
                html = http_get(home).decode('utf-8', 'replace')
                links = find_pdf_links(html)
                if links:
                    todo.append(links[0])
                    break
                print(f'warning: no 30-day PDF link found on {home}')
            except Exception as e:  # network or HTTP error: keep going with what we have
                print(f'warning: could not open {home}: {e}')
        backfill = [norm_url(u) for u in read_list(os.path.join(DATA, 'ibja_backfill_urls.txt'))]
        todo += [u for u in backfill if u not in done and u not in todo][:BACKFILL_PER_RUN]
        for url in todo:
            try:
                raw = http_get(url)
                archive(url, raw)
                new = pdf_rows(raw)
            except Exception as e:
                print(f'warning: could not read {url}: {e}')
                continue
            print(f'read {len(new)} rows from {url}')
            log += merge(rows, new, url, today)
            note_source(url, new)
    ibja.silver_jump_check(rows)
    ibja.write_csv(csv_path, rows)
    print(f'dates before: {before}, after: {len(rows)}, last: {max(rows) if rows else "-"}')
    for line in log:
        print('  ' + line)


if __name__ == '__main__':
    main()

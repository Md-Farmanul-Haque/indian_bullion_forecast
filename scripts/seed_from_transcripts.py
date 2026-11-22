"""Build data/ibja_daily.csv from the text transcriptions of IBJA 30-day PDFs.

Each file in data/ibja_transcripts/ is a row-by-row copy of one PDF
published on ibjarates.com (file name = PDF id). Every row is checked with
the purity factors; rows present in more than one PDF must agree.
Run: python3 scripts/seed_from_transcripts.py
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import ibja  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://www.ibjarates.com/UploadedFiles/30DaysPdf/{}_Daily%20Opening%20and%20Closing%20Market%20Rate.pdf'


def pdf_url(name):
    return URL.format(name)


def main():
    cands, coverage = {}, []
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'ibja_transcripts', '*.txt'))):
        name = os.path.splitext(os.path.basename(path))[0]
        rows = ibja.parse_text(open(path, encoding='utf-8').read())
        coverage.append((name, min(rows), max(rows), len(rows)))
        for d, r in rows.items():
            clean, notes = ibja.check_row(r)
            cands.setdefault(d, []).append((pdf_url(name), clean, notes))
    out, report = {}, []
    for d, lst in cands.items():
        merged, srcs, notes = ibja.merge_candidates([(s, r) for s, r, _ in lst])
        for _, _, n in lst:
            notes = n + notes
        merged.update(sources=srcs, method='transcribed-checked', notes=sorted(set(notes)))
        out[d] = merged
        report += [f'{d}: {n}' for n in merged['notes']]
    report += ['silver jump: ' + n for n in ibja.silver_jump_check(out)]
    ibja.write_csv(os.path.join(ROOT, 'data', 'ibja_daily.csv'), out)
    with open(os.path.join(ROOT, 'data', 'ibja_sources.csv'), 'w', encoding='utf-8') as fh:
        fh.write('pdf_url,first_date,last_date,rows,how_read\n')
        for name, a, b, n in coverage:
            fh.write(f'{pdf_url(name)},{a},{b},{n},transcribed then checked\n')
    print(f'dates: {len(out)}  first: {min(out)}  last: {max(out)}')
    print(f'multi-source dates: {sum(1 for r in out.values() if len(r["sources"]) > 1)}')
    print('issues:' if report else 'issues: none')
    for line in report:
        print('  ' + line)


if __name__ == '__main__':
    main()

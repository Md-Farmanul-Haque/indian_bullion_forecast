"""Unit and data-integrity tests. Run: python -m unittest discover -s tests -v"""
import csv
import datetime as dt
import io
import json
import math
import os
import random
import re
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import ibja  # noqa: E402
import build_site_data as B  # noqa: E402
import update_ibja as U  # noqa: E402

FULL = '16-Nov-26 | 134380 | 134971 | 133842 | 134431 | 123092 | 123633 | 100785 | 101228 | 78612 | 78958 | 169280 | 170251'


class Parse(unittest.TestCase):
    def test_full_row(self):
        r = ibja.parse_text(FULL)[dt.date(2026, 11, 16)]
        self.assertEqual(r['g916_pm'], 123633)
        self.assertEqual(r['s999_am'], 169280)

    def test_am_only_and_dash_and_holiday(self):
        txt = ('12-Oct-26 | 148425 | 147831 | 135957 | 111319 | 86829 | 220874\n11-Oct-26 | SUN\n'
               '10-Nov-26 | 142420 | - | 141850 | - | 130457 | - | 106815 | - | 83316 | - | 186000 | -\n09-Nov-26 | Market Holiday')
        rows = ibja.parse_text(txt)
        self.assertEqual(set(rows), {dt.date(2026, 10, 12), dt.date(2026, 11, 10)})
        self.assertEqual(rows[dt.date(2026, 10, 12)]['g916_am'], 135957)
        self.assertIsNone(rows[dt.date(2026, 10, 12)]['g916_pm'])
        self.assertIsNone(rows[dt.date(2026, 11, 10)]['g999_pm'])

    def test_spaces_commas_and_split_lines(self):
        txt = '07-Sep-26\n152,475 152,703 151,864 152,092 139,667 139,876 114,356 114,527 89,198 89,331 2,31,489 2,31,650'
        r = ibja.parse_text(txt)[dt.date(2026, 9, 7)]
        self.assertEqual(r['s999_am'], 231489)
        self.assertEqual(r['g999_pm'], 152703)

    def test_purity_check(self):
        r = ibja.parse_text(FULL)[dt.date(2026, 11, 16)]
        clean, notes = ibja.check_row(r)
        self.assertEqual(notes, [])
        bad = dict(r, g916_pm=128633)  # one digit wrong
        clean, notes = ibja.check_row(bad)
        self.assertIsNone(clean['g916_pm'])
        self.assertEqual(clean['g999_pm'], 134971)
        worse = dict(r, g999_am=184380)  # base wrong -> all derived fail -> whole session dropped
        clean, notes = ibja.check_row(worse)
        self.assertIsNone(clean['g999_am'])
        self.assertIsNone(clean['g916_am'])

    def test_disagreeing_sources_dropped(self):
        a = ibja.parse_text(FULL)[dt.date(2026, 11, 16)]
        b = dict(a, s999_pm=171251)
        merged, srcs, notes = ibja.merge_candidates([('x', a), ('y', b)])
        self.assertIsNone(merged['s999_pm'])
        self.assertEqual(merged['g916_pm'], 123633)


class PdfReading(unittest.TestCase):
    def make_pdf(self, rows):
        from reportlab.lib.pagesizes import landscape, A4
        from reportlab.platypus import SimpleDocTemplate, Table
        buf = io.BytesIO()
        head = [['Date', 'Gold 999\n(AM Price)', 'Gold 999\n(PM Price)', 'Gold 995\n(AM Price)', 'Gold 995\n(PM Price)', 'Gold 916\n(AM Price)',
                 'Gold 916\n(PM Price)', 'Gold 750\n(AM Price)', 'Gold 750\n(PM Price)', 'Gold 585\n(AM Price)', 'Gold 585\n(PM Price)',
                 'Silver 999\n(AM Price)', 'Silver 999\n(PM Price)'], [''] + ['10 Gms'] * 10 + ['1 Kg'] * 2]
        SimpleDocTemplate(buf, pagesize=landscape(A4)).build([Table(head + rows)])
        return buf.getvalue()

    def test_pdf_table_round_trip(self):
        rows = [['16-Nov-26'] + FULL.split(' | ')[1:], ['15-Nov-26', 'SUN'] + [''] * 11,
                ['13-Nov-26', '135884', '135809', '135340', '135265', '124470', '124401', '101913', '101857', '79492', '79448', '177500', '178000']]
        got = U.pdf_rows(self.make_pdf(rows))
        self.assertEqual(set(got), {dt.date(2026, 11, 16), dt.date(2026, 11, 13)})
        self.assertEqual(got[dt.date(2026, 11, 13)]['s999_pm'], 178000)
        self.assertEqual(got[dt.date(2026, 11, 16)]['g916_pm'], 123633)

    def test_find_links_newest_first(self):
        html = ('<a href="https://ibjarates.com/UploadedFiles/30DaysPdf/Pdf_1633_20261113124802509_Daily Opening and Closing Market Rate.pdf">a</a>'
                '<a href="/UploadedFiles/30DaysPdf/Pdf_9968_20261116124229816_Daily Opening and Closing Market Rate.pdf">b</a>')
        links = U.find_pdf_links(html)
        self.assertIn('20261116', links[0])
        self.assertIn('%20', links[0])

    def test_merge_corrects_transcription_and_ignores_future(self):
        today = dt.date(2026, 11, 22)
        d = dt.date(2026, 11, 16)
        r = ibja.parse_text(FULL)[d]
        rows = {d: dict(r, s999_pm=170000, sources=['t'], method='transcribed-checked', notes=[])}
        new = {d: r, dt.date(2026, 12, 30): r, dt.date(2026, 11, 17): r}
        U.merge(rows, new, 'pdf', today)
        self.assertEqual(rows[d]['s999_pm'], 170251)
        self.assertIn(dt.date(2026, 11, 17), rows)
        self.assertNotIn(dt.date(2026, 12, 30), rows)
        self.assertEqual(rows[dt.date(2026, 11, 17)]['method'], 'pdf-extracted')


class Engine(unittest.TestCase):
    def test_range_symmetric_in_log(self):
        r = B.make_range(100000, 0.01)
        self.assertAlmostEqual(math.log(r['high80'] / 100000), -math.log(r['low80'] / 100000), places=9)
        self.assertAlmostEqual(math.log(r['high80'] / 100000), 1.2816 * 0.01 * math.sqrt(21), places=9)
        self.assertLess(r['high50'], r['high80'])

    def test_calibrated_on_a_random_walk(self):
        rnd = random.Random(1)
        d, p, ser = dt.date(2020, 1, 1), 100000.0, []
        while len(ser) < 8000:
            if d.weekday() < 5:
                ser.append((d, p, 'PM', {}))
                p *= math.exp(rnd.gauss(0, 0.01))
            d += dt.timedelta(days=1)
        bt = B.backtest(ser, B.moves(ser))
        self.assertGreater(bt['n'], 7000)
        self.assertTrue(0.74 <= bt['hit80'] / bt['n'] <= 0.86, bt['hit80'] / bt['n'])
        self.assertTrue(0.44 <= bt['hit50'] / bt['n'] <= 0.56, bt['hit50'] / bt['n'])

    def test_no_moves_across_data_gaps(self):
        ser = [(dt.date(2026, 1, 5), 100, 'PM', {}), (dt.date(2026, 1, 6), 101, 'PM', {}), (dt.date(2026, 3, 1), 150, 'PM', {})]
        self.assertEqual(len(B.moves(ser)), 1)
        self.assertEqual(B.gaps(ser), [['2026-01-07', '2026-02-28']])

    def test_scoring(self):
        ser = [(dt.date(2026, 1, 1) + dt.timedelta(days=i), 100 + i, 'PM', {}) for i in range(40)]
        led = [{'made_on': '2026-01-01', 'recorded_utc': 'x', 'metal': 'gold22', 'target_date': '2026-01-31', 'session': 'PM',
                'start_price': 100, 'low80': 90, 'high80': 140, 'low50': 95, 'high50': 120},
               {'made_on': '2026-02-01', 'recorded_utc': 'x', 'metal': 'gold22', 'target_date': '2026-03-03', 'session': 'PM',
                'start_price': 100, 'low80': 90, 'high80': 110, 'low50': 95, 'high50': 105}]
        out = B.score_ledger(led, {'gold22': ser})
        self.assertEqual(out[0]['status'], 'checked')
        self.assertTrue(out[0]['h80'])
        self.assertFalse(out[0]['h50'])
        self.assertEqual(out[1]['status'], 'waiting')


class RealData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = ibja.read_csv(os.path.join(ROOT, 'data', 'ibja_daily.csv'))

    def test_every_gold_value_passes_purity_check(self):
        for d, r in self.rows.items():
            clean, notes = ibja.check_row(r)
            self.assertEqual(notes, [], f'{d}: {notes}')

    def test_every_row_has_an_ibja_source(self):
        for d, r in self.rows.items():
            self.assertTrue(r['sources'], d)
            for s in r['sources']:
                self.assertTrue(s.startswith('https://') and 'ibjarates.com' in s or s.endswith('.pdf'), s)
            self.assertLess(d.weekday(), 6, f'{d} is a Sunday')

    def test_reproduces_rbi_sgb_prices(self):
        chart = json.load(open(os.path.join(ROOT, 'data', 'research', 'chart_data.json'), encoding='utf-8'))
        checks = B.sgb_checks(self.rows, chart)
        self.assertGreaterEqual(len(checks), 5)
        self.assertTrue(all(c['match'] for c in checks), checks)

    def test_build_and_record_rules(self):
        tmp = tempfile.mkdtemp()
        try:
            shutil.copytree(os.path.join(ROOT, 'data'), os.path.join(tmp, 'data'))
            old = B.DATA
            B.DATA = os.path.join(tmp, 'data')
            last = max(self.rows)
            site, new = B.build(record=True, today=last + dt.timedelta(days=30))
            self.assertEqual(new, [], 'stale data must not create a forecast')
            site, new = B.build(record=True, today=last + dt.timedelta(days=1))
            self.assertEqual(len(new), 3)
            site, again = B.build(record=True, today=last + dt.timedelta(days=1))
            self.assertEqual(again, [], 'no duplicates')
            for k, m in site['metals'].items():
                f = m['forecast']
                self.assertLess(f['low80'], m['latest']['price'])
                self.assertGreater(f['high80'], m['latest']['price'])
            B.DATA = old
        finally:
            shutil.rmtree(tmp)

    def test_facts_and_events_have_https_sources(self):
        facts = json.load(open(os.path.join(ROOT, 'data', 'facts.json'), encoding='utf-8'))
        for k in ('ibja', 'gst', 'duty', 'huid'):
            self.assertTrue(facts[k]['sources'])
            for s in facts[k]['sources']:
                self.assertTrue(s['url'].startswith('https://'), s)
        for e in json.load(open(os.path.join(ROOT, 'data', 'events.json'), encoding='utf-8')):
            self.assertTrue(e['source']['url'].startswith('https://'))
            self.assertLessEqual(e['start'], e['end'])


class Hygiene(unittest.TestCase):
    def test_no_ai_tool_mentions(self):
        pat = re.compile(r'\b(claude|anthropic|chatgpt|openai|copilot|generated with|co-authored-by)\b', re.I)
        for dirpath, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '__pycache__', '_site')]
            for f in files:
                if f.endswith(('.py', '.js', '.html', '.css', '.json', '.md', '.yml', '.txt', '.csv', '.webmanifest')):
                    p = os.path.join(dirpath, f)
                    if p.endswith('test_data.py'):
                        continue
                    hit = pat.search(open(p, encoding='utf-8', errors='replace').read())
                    self.assertIsNone(hit, f'{p}: {hit and hit.group(0)}')


if __name__ == '__main__':
    unittest.main()

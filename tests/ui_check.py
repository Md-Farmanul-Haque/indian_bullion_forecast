"""Browser check of the simple site: loads it at phone and desktop size, fails on
JavaScript errors or empty key fields, exercises the bill checker and the source sheets.
Usage: python3 tests/ui_check.py [SITE_DIR] [--shots OUT_DIR]"""
import asyncio, functools, http.server, json, os, socketserver, sys, threading

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.join(os.path.dirname(__file__), '..'))
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None


def serve():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Q, directory=ROOT)
    srv = socketserver.TCPServer(('127.0.0.1', 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


async def run():
    from playwright.async_api import async_playwright
    srv = serve()
    url = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
    errors = []
    async with async_playwright() as p:
        chrome = os.environ.get('CHROME_PATH') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
        b = await p.chromium.launch(**({'executable_path': chrome} if chrome else {}), args=['--no-sandbox'])
        for name, vp, metal in [('phone_gold22', (390, 844), 'gold22'), ('phone_silver', (390, 844), 'silver'), ('desktop_gold24', (1280, 900), 'gold24'), ('small_360_gold22', (360, 740), 'gold22')]:
            pg = await b.new_page(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=2 if vp[0] < 500 else 1)
            pg.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
            pg.on('console', lambda m: m.type == 'error' and errors.append(f'{name}: console {m.text}'))
            await pg.goto(f'{url}?metal={metal}')
            await pg.wait_for_selector('#today:not([hidden])', timeout=15000)
            for sel in ['#t-price', '#n-low', '#n-high', '#r-table', '#w-price', '#o-sub', '#a-where', '#t-checked']:
                txt = (await pg.text_content(sel) or '').strip()
                assert txt and txt not in ('–', '₹NaN'), f'{name}: {sel} empty ({txt!r})'
            for i in range(4):  # every time span gives a range
                await pg.evaluate(f"(()=>{{const s=document.getElementById('n-h'); s.value={i}; s.dispatchEvent(new Event('input'))}})()")
                lo, hi = await pg.text_content('#n-low'), await pg.text_content('#n-high')
                assert lo.startswith('₹') and hi.startswith('₹') and lo != hi, f'{name}: span {i} range {lo} {hi}'
            await pg.evaluate("(()=>{const s=document.getElementById('n-h'); s.value=2; s.dispatchEvent(new Event('input'))})()")
            for r in ['1m', '1y', 'all', '6m']:
                await pg.click(f'#o-range [data-r="{r}"]')
                assert await pg.evaluate("document.querySelectorAll('#o-chart svg path').length") >= 1, f'{name}: old prices {r}'
            await pg.fill('#o-date', '2026-10-28')
            assert '₹' in (await pg.text_content('#o-out')), f'{name}: date lookup'
            gaps = json.load(open(os.path.join(ROOT, 'data', 'site.json')))['metals'][metal]['gaps']
            import datetime as _dt
            long_gaps = [g for g in gaps if (_dt.date.fromisoformat(g[1]) - _dt.date.fromisoformat(g[0])).days > 10]
            if long_gaps:
                await pg.fill('#o-date', (_dt.date.fromisoformat(long_gaps[0][0]) + _dt.timedelta(days=8)).isoformat())
                assert 'gap' in (await pg.text_content('#o-out')), f'{name}: gap lookup'
            await pg.fill('#o-date', '2001-06-01')
            assert '2001-02' in (await pg.text_content('#o-out')), f'{name}: yearly lookup'
            await pg.fill('#b-weight', '10'); await pg.fill('#b-making', '12'); await pg.fill('#b-total', '150000')
            res = await pg.text_content('#b-result')
            assert '₹' in res and 'NaN' not in res, f'{name}: bill result {res!r}'
            body = await pg.text_content('body')
            assert 'NaN' not in body and 'undefined' not in body, f'{name}: NaN/undefined on page'
            over = await pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
            assert not over, f'{name}: page scrolls sideways'
            await pg.click('#today .src'); await pg.wait_for_selector('#sheet:not([hidden])')
            n = await pg.evaluate("document.querySelectorAll('#sheet-list a').length")
            assert n >= 2, f'{name}: source sheet has {n} links'
            await pg.click('#sheet-close')
            if SHOTS:
                os.makedirs(SHOTS, exist_ok=True)
                await pg.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=True)
            await pg.close()
        await b.close()
    srv.shutdown()
    if errors:
        print('\n'.join(errors)); sys.exit(1)
    print('UI check: PASS')

asyncio.run(run())

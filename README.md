# Gold & Silver Price Guide (Kolkata)

A free, simple website for families buying jewellery. It shows:

- **Today's reference price:** the IBJA rate for 22K gold, 24K gold and silver, with 3% GST and the date.
- **Next month:** a price range with its chance ("8 in 10"). The range assumes no trend, so it is the same size up and down.
- **Our record:** how often the ranges were right. There is a past test, and a live record saved *before* each result is known.
- **Check a bill:** weight, purity and making charge give a reference total, using the official GST rule (3% of the whole bill).
- **Why prices move:** sliders for world price, rupee and import duty, plus a real example.
- **Dates that could move prices**, **Before you buy** tips (HUID check), and **55 years of RBI prices**.

Every number links to where it came from. Gaps stay gaps. Nothing is estimated from memory.

This is not financial advice. There are no ads and no tracking.

## Where the data comes from

| What | Source | File |
|---|---|---|
| Daily rates (AM/PM) | IBJA daily rate sheets (PDF) on ibjarates.com | `data/ibja_daily.csv` (each row lists its PDF) |
| Yearly history 1970-71 to 2025-26 | RBI Handbook of Statistics on Indian Economy | `data/research/chart_data.json` |
| GST, import duty, HUID | GST Council, WB Commercial Taxes, News On AIR, BIS, PIB | `data/facts.json` |
| Upcoming dates | RBI, US Federal Reserve | `data/events.json` |
| Saved ranges (public record) | made by this site, append-only | `data/forecasts.csv` |

### Checks on the data

- IBJA derives the 995, 916, 750 and 585 rates from the 999 rate using fixed factors. Every gold value is checked against them; a value that fails is dropped, not corrected.
- Where a date appears in two IBJA sheets, both copies must agree.
- RBI's official Sovereign Gold Bond prices are averages of IBJA closing rates. They are recomputed from our data and must match.

## How the one-month range is made

1. **Start price:** the latest IBJA rate.
2. **Width:** the standard deviation of the last 60 daily changes, scaled to 21 trading days.
3. **Ranges:** the 80% range is ±1.2816 of that width, and the 50% range is ±0.6745. There is no trend.

The method is fixed in `scripts/build_site_data.py`, and its version is saved with every range. On a simulated random walk it hits about 80% and 50%.

## Daily update

`.github/workflows/update-and-deploy.yml` runs Monday to Friday at 18:45 IST. It also runs on every push. Each run:

1. reads the newest IBJA PDF;
2. checks and adds new rows;
3. saves the day's ranges to `data/forecasts.csv`;
4. runs all tests;
5. publishes the site to GitHub Pages.

If IBJA cannot be reached, the site still builds and shows how old its newest rate is.

## Run locally

```
python3 scripts/build_site_data.py
python3 -m http.server 8000      # then open http://localhost:8000
python3 -m unittest discover -s tests -p "test_*.py"
node tests/test_calc.js
```

## Folders

- `index.html`, `assets/` — the simple site.
- `scripts/` — the data update, checks and range maths.
- `data/` — all data, with sources.
- `analyst_src/` — the detailed research dashboard, published at `/analyst/` as a snapshot of 21 Nov 2026.
- `tests/` — the tests.

## Use of IBJA rates

IBJA publishes these rates publicly. Its site asks anyone using IBJA prices for valuation or pricing to subscribe to its official API. This site only shows the rates for free public education, credits IBJA on every price, and downloads at most a few files once a day. If IBJA asks, the daily fetch can be switched off by deleting the "Fetch the newest IBJA rates" step.

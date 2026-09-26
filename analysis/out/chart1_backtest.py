#!/usr/bin/env python3
"""Render the worked 2021 backtest example as a submission image (1280x720),
matching CortexRails' actual brand palette/typography (frontend/app/globals.css)."""
import csv
from datetime import datetime, date
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker as mticker

DATA_DIR = Path(__file__).parent.parent / "data"
OUT = Path(__file__).parent / "cortexrails_backtest.png"

FONT_DIR = Path("/tmp/claude-0/fonts/jbm/fonts/ttf")
for f in ["JetBrainsMono-Regular.ttf", "JetBrainsMono-Bold.ttf", "JetBrainsMono-SemiBold.ttf"]:
    fm.fontManager.addfont(str(FONT_DIR / f))
plt.rcParams["font.family"] = "JetBrains Mono"

# Real brand palette (frontend/app/globals.css @theme)
BG = "#07111f"
SURFACE = "#0d1b2e"
BORDER = "#20334b"
TEXT = "#eef5ff"
MUTED = "#91a5bd"
ACCENT = "#ff7058"
ALLOW = "#52e0a2"
LIMIT = "#ffd166"
BLOCK = "#ff766d"

ENTRY_DATE = date(2021, 11, 4)
ENTRY_PRICE = 409.97
TRIGGER_PRICE = 327.98
CROSS_DATE = date(2021, 12, 13)
CROSS_PRICE = 322.14

rows = []
with open(DATA_DIR / "tsla_2021_2024.csv") as f:
    for row in csv.DictReader(f):
        ds = row.get("Date", "").strip()
        try:
            d = datetime.strptime(ds, "%m/%d/%Y").date()
        except ValueError:
            continue
        close = float(row["Close/Last"].strip().lstrip("$"))
        rows.append((d, close))
rows.sort()

start = date(2021, 9, 1)
end = date(2022, 1, 31)
window = [(d, p) for d, p in rows if start <= d <= end]
dates = [d for d, _ in window]
prices = [p for _, p in window]

fig = plt.figure(figsize=(12.8, 7.2), dpi=100)
fig.patch.set_facecolor(BG)

# --- header block (mimics the site's eyebrow + heading pattern) ---
ax_head = fig.add_axes((0, 0.86, 1, 0.14))
ax_head.axis("off")
ax_head.text(0.045, 0.62, "C O R T E X R A I L S   —   P O L I C Y   B A C K T E S T", color=ACCENT,
             fontsize=10.5, fontweight="bold", family="JetBrains Mono")
ax_head.text(0.045, 0.12, "A real liquidation trigger, not a guess",
             color=TEXT, fontsize=19, fontweight="bold", family="JetBrains Mono")
ax_head.axhline(0, xmin=0.045, xmax=0.955, color=BORDER, linewidth=1)

ax = fig.add_axes((0.065, 0.16, 0.89, 0.66))
ax.set_facecolor(SURFACE)

ax.plot(dates, prices, color=ACCENT, linewidth=2.4, solid_joinstyle="round",
        label="TSLA close (real, NASDAQ)", zorder=3)
ax.fill_between(dates, prices, min(prices) - 5, color=ACCENT, alpha=0.06, zorder=1)

ax.axhline(TRIGGER_PRICE, color=BLOCK, linestyle=(0, (5, 4)), linewidth=1.6, zorder=2,
           label=f"Liquidation trigger  ${TRIGGER_PRICE}")

ax.scatter([ENTRY_DATE], [ENTRY_PRICE], color=ALLOW, s=110, zorder=5,
           edgecolor=BG, linewidth=1.5)
ax.annotate("ENTRY\n2021-11-04 · $409.97",
            xy=(ENTRY_DATE, ENTRY_PRICE), xytext=(-118, -46),
            textcoords="offset points", color=ALLOW, fontsize=11, fontweight="bold",
            linespacing=1.7)

ax.scatter([CROSS_DATE], [CROSS_PRICE], color=BLOCK, s=110, zorder=5,
           edgecolor=BG, linewidth=1.5)
ax.annotate("LIQUIDATABLE\n2021-12-13 · $322.14\n26 trading days later",
            xy=(CROSS_DATE, CROSS_PRICE), xytext=(18, -78),
            textcoords="offset points", color=BLOCK, fontsize=11, fontweight="bold",
            linespacing=1.7)

ax.set_ylim(min(prices) * 0.94, max(prices) * 1.12)
ax.set_ylabel("TSLA PRICE (USD)", color=MUTED, fontsize=9.5, labelpad=10)
ax.yaxis.set_major_formatter(mticker.StrMethodFormatter("${x:,.0f}"))

ax.tick_params(colors=MUTED, labelsize=9.5, length=0)
for spine in ax.spines.values():
    spine.set_visible(False)
ax.spines["bottom"].set_visible(True)
ax.spines["bottom"].set_color(BORDER)

ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
ax.grid(True, color=BORDER, linewidth=0.7, alpha=0.6)
ax.set_axisbelow(True)

legend = ax.legend(loc="upper left", facecolor=SURFACE, edgecolor=BORDER,
                    fontsize=10, framealpha=1)
for text in legend.get_texts():
    text.set_color(TEXT)

# --- footer stat strip (mimics the site's hero-proof-grid pattern) ---
ax_foot = fig.add_axes((0, 0, 1, 0.13))
ax_foot.axis("off")
ax_foot.axhline(1, xmin=0.045, xmax=0.955, color=BORDER, linewidth=1)

stats = [
    ("70%", "OF ENTRY DAYS EVENTUALLY\nCROSSED THEIR TRIGGER"),
    ("72", "MEDIAN TRADING DAYS\nTO LIQUIDATION"),
    ("1", "FASTEST TRADING DAY\nTO LIQUIDATION"),
    ("2010–2024", "REAL TSLA DAILY PRICE\nHISTORY BACKTESTED"),
]
x_positions = [0.06, 0.27, 0.48, 0.69]
for (val, label), x in zip(stats, x_positions):
    ax_foot.text(x, 0.62, val, color=TEXT, fontsize=17, fontweight="bold",
                 ha="left", family="JetBrains Mono")
    ax_foot.text(x, 0.14, label, color=MUTED, fontsize=8, ha="left",
                 linespacing=1.5, family="JetBrains Mono")

ax_foot.text(0.955, 0.62, "SOURCE",
             color=MUTED, fontsize=8, ha="right", family="JetBrains Mono")
ax_foot.text(0.955, 0.30, "analysis/backtest.py\ndocs/ANALYSIS.md",
             color=MUTED, fontsize=8, ha="right", va="top", linespacing=1.6,
             family="JetBrains Mono")

plt.savefig(OUT, facecolor=fig.get_facecolor())
print(f"Saved {OUT}")

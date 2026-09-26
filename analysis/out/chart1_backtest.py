#!/usr/bin/env python3
"""Render the worked 2021 backtest example as a submission image (1280x720)."""
import csv
from datetime import datetime, date
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

DATA_DIR = Path(__file__).parent.parent / "data"
OUT = Path(__file__).parent / "cortexrails_backtest.png"

ENTRY_DATE = date(2021, 11, 4)
ENTRY_PRICE = 409.97
TRIGGER_PRICE = 327.98
CROSS_DATE = date(2021, 12, 13)
CROSS_PRICE = 322.14

# Load real price series (2021-2024 NASDAQ file covers this window)
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

fig, ax = plt.subplots(figsize=(12.8, 7.2), dpi=100)
fig.patch.set_facecolor("#0b0e14")
ax.set_facecolor("#0b0e14")

ax.plot(dates, prices, color="#f5c518", linewidth=2.2, label="TSLA close price (real, NASDAQ)")

ax.axhline(TRIGGER_PRICE, color="#ff5c5c", linestyle="--", linewidth=1.6,
           label=f"Liquidation trigger: ${TRIGGER_PRICE}")

ax.scatter([ENTRY_DATE], [ENTRY_PRICE], color="#5ce1ff", s=90, zorder=5)
ax.annotate(f"Entry: {ENTRY_DATE.isoformat()}\n${ENTRY_PRICE}",
            xy=(ENTRY_DATE, ENTRY_PRICE), xytext=(-100, -40),
            textcoords="offset points", color="#5ce1ff", fontsize=12, fontweight="bold")

ax.scatter([CROSS_DATE], [CROSS_PRICE], color="#ff5c5c", s=90, zorder=5)
ax.annotate(f"Liquidatable: {CROSS_DATE.isoformat()}\n${CROSS_PRICE} — 26 trading days later",
            xy=(CROSS_DATE, CROSS_PRICE), xytext=(-190, -45),
            textcoords="offset points", color="#ff5c5c", fontsize=12, fontweight="bold")

ax.set_title("CortexRails Policy: a real liquidation trigger, not a guess",
             color="white", fontsize=18, fontweight="bold", pad=28)
ax.set_ylim(top=max(prices) * 1.12)
ax.set_ylabel("TSLA price (USD)", color="#cfd3dc", fontsize=12)

ax.tick_params(colors="#cfd3dc")
for spine in ax.spines.values():
    spine.set_color("#3a3f4b")

ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
ax.grid(True, color="#22262f", linewidth=0.8)

legend = ax.legend(loc="upper right", facecolor="#151922", edgecolor="#3a3f4b", fontsize=11)
for text in legend.get_texts():
    text.set_color("#e6e8ee")

fig.text(0.5, 0.02,
         "70% of TSLA entry points (2010–2024) eventually crossed their liquidation trigger — median 72 trading days, fastest 1 day.",
         ha="center", color="#8b92a3", fontsize=11)

plt.tight_layout(rect=(0, 0.04, 1, 1))
plt.savefig(OUT, facecolor=fig.get_facecolor())
print(f"Saved {OUT}")

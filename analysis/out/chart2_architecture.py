#!/usr/bin/env python3
"""Render the CortexRails architecture flow as a submission image (1280x720)."""
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.path import Path as MplPath

OUT = Path(__file__).parent / "cortexrails_architecture.png"

fig, ax = plt.subplots(figsize=(12.8, 7.2), dpi=100)
fig.patch.set_facecolor("#0b0e14")
ax.set_facecolor("#0b0e14")
ax.set_xlim(0, 12.8)
ax.set_ylim(0, 7.2)
ax.axis("off")

ax.text(6.4, 6.55, "CortexRails Protocol — architecture", color="white",
        fontsize=22, fontweight="bold", ha="center")
ax.text(6.4, 6.05, "Policy separated from execution: every action is decided before it runs",
        color="#8b92a3", fontsize=13, ha="center")

boxes = [
    ("Agent / Protocol", "Submits a structured\nfinancial intent", "#1c2230", "#5ce1ff"),
    ("CortexRails Policy", "Evaluates asset, position,\nrisk & lifecycle rules", "#2a1c1c", "#f5c518"),
    ("Decision", "ALLOW · LIMIT ·\nREVIEW · BLOCK", "#1c2a20", "#4ade80"),
    ("Financial Adapter", "Lending · Vault ·\nTransfer · Liquidation", "#241c2a", "#c084fc"),
    ("Onchain Execution", "Robinhood Chain testnet\n(Stylus + Solidity)", "#1c2230", "#5ce1ff"),
]

n = len(boxes)
box_w, box_h = 2.05, 1.7
gap = (12.8 - n * box_w) / (n + 1)
y_center = 3.55

centers = []
for i, (title, subtitle, fill, edge) in enumerate(boxes):
    x = gap + i * (box_w + gap)
    centers.append((x + box_w / 2, y_center))
    box = FancyBboxPatch((x, y_center - box_h / 2), box_w, box_h,
                          boxstyle="round,pad=0.02,rounding_size=0.12",
                          linewidth=2.2, edgecolor=edge, facecolor=fill)
    ax.add_patch(box)
    ax.text(x + box_w / 2, y_center + 0.32, title, color="white",
            fontsize=13.5, fontweight="bold", ha="center", va="center")
    ax.text(x + box_w / 2, y_center - 0.28, subtitle, color="#c7cbd6",
            fontsize=10.3, ha="center", va="center", linespacing=1.6)

for i in range(n - 1):
    x0 = centers[i][0] + box_w / 2
    x1 = centers[i + 1][0] - box_w / 2
    arrow = FancyArrowPatch((x0, y_center), (x1, y_center),
                             arrowstyle="-|>", mutation_scale=22,
                             linewidth=2.2, color="#e6e8ee")
    ax.add_patch(arrow)

ax.text(6.4, 1.35,
        "If an action exceeds its permitted amount, CortexRails returns the permitted amount instead of\nsilently changing the request — the caller adjusts and resubmits the intent before execution.",
        color="#8b92a3", fontsize=12, ha="center", linespacing=1.8)

ax.text(6.4, 0.55,
        "Agents propose.  CortexRails decides.  Adapters execute.",
        color="#f5c518", fontsize=14, fontweight="bold", ha="center")

plt.tight_layout()
plt.savefig(OUT, facecolor=fig.get_facecolor())
print(f"Saved {OUT}")

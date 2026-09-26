#!/usr/bin/env python3
"""Render the CortexRails architecture flow as a submission image (1280x720),
matching the actual brand palette/typography (frontend/app/globals.css)."""
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = Path(__file__).parent / "cortexrails_architecture.png"

FONT_DIR = Path("/tmp/claude-0/fonts/jbm/fonts/ttf")
for f in ["JetBrainsMono-Regular.ttf", "JetBrainsMono-Bold.ttf", "JetBrainsMono-SemiBold.ttf"]:
    fm.fontManager.addfont(str(FONT_DIR / f))
plt.rcParams["font.family"] = "JetBrains Mono"

# Real brand palette (frontend/app/globals.css @theme)
BG = "#07111f"
SURFACE = "#0d1b2e"
SURFACE2 = "#11243b"
BORDER = "#20334b"
TEXT = "#eef5ff"
MUTED = "#91a5bd"
ACCENT = "#ff7058"
ALLOW = "#52e0a2"
LIMIT = "#ffd166"
BLOCK = "#ff766d"
REVIEW = "#b9a7ff"

fig, ax = plt.subplots(figsize=(12.8, 7.2), dpi=100)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)
ax.set_xlim(0, 12.8)
ax.set_ylim(0, 7.2)
ax.axis("off")

# header, matching the site's eyebrow + heading pattern
ax.text(0.55, 6.75, "C O R T E X R A I L S   —   S Y S T E M   A R C H I T E C T U R E",
        color=ACCENT, fontsize=11.5, fontweight="bold")
ax.text(0.55, 6.32, "Policy separated from execution", color=TEXT,
        fontsize=20, fontweight="bold")
ax.plot([0.55, 12.25], [5.98, 5.98], color=BORDER, linewidth=1)

boxes = [
    ("AGENT / PROTOCOL", "Submits a structured\nfinancial intent", SURFACE2, "#5ce1ff"),
    ("CORTEXRAILS POLICY", "Evaluates asset, position,\nrisk & lifecycle rules", SURFACE2, ACCENT),
    ("DECISION", "ALLOW · LIMIT ·\nREVIEW · BLOCK", SURFACE2, ALLOW),
    ("FINANCIAL ADAPTER", "Lending · Vault ·\nTransfer · Liquidation", SURFACE2, REVIEW),
    ("ONCHAIN EXECUTION", "Robinhood Chain testnet\n(Stylus + Solidity)", SURFACE2, "#5ce1ff"),
]

n = len(boxes)
box_w, box_h = 2.08, 1.85
gap = (12.8 - n * box_w) / (n + 1)
y_center = 3.85

centers = []
for i, (title, subtitle, fill, edge) in enumerate(boxes):
    x = gap + i * (box_w + gap)
    centers.append((x + box_w / 2, y_center))
    box = FancyBboxPatch((x, y_center - box_h / 2), box_w, box_h,
                          boxstyle="round,pad=0.02,rounding_size=0.1",
                          linewidth=1.6, edgecolor=BORDER, facecolor=fill)
    ax.add_patch(box)
    # accent top rule inside each box (mirrors .feature-section::before on the site)
    ax.plot([x + 0.18, x + 0.7], [y_center + box_h / 2 - 0.22] * 2, color=edge, linewidth=2.4)
    ax.text(x + box_w / 2, y_center + 0.28, title, color=TEXT,
            fontsize=11.8, fontweight="bold", ha="center", va="center")
    ax.text(x + box_w / 2, y_center - 0.32, subtitle, color=MUTED,
            fontsize=9.6, ha="center", va="center", linespacing=1.7)

for i in range(n - 1):
    x0 = centers[i][0] + box_w / 2
    x1 = centers[i + 1][0] - box_w / 2
    arrow = FancyArrowPatch((x0 + 0.04, y_center), (x1 - 0.04, y_center),
                             arrowstyle="-|>", mutation_scale=16,
                             linewidth=1.8, color=MUTED)
    ax.add_patch(arrow)

ax.plot([0.55, 12.25], [1.55, 1.55], color=BORDER, linewidth=1)

ax.text(0.55, 1.15,
        "If an action exceeds its permitted amount, CortexRails returns the permitted amount instead\n"
        "of silently changing the request — the caller adjusts and resubmits before execution.",
        color=MUTED, fontsize=10.8, linespacing=1.9)

ax.text(0.55, 0.42, "AGENTS PROPOSE.", color=ALLOW, fontsize=13, fontweight="bold")
ax.text(3.15, 0.42, "CORTEXRAILS DECIDES.", color=ACCENT, fontsize=13, fontweight="bold")
ax.text(7.05, 0.42, "ADAPTERS EXECUTE.", color=REVIEW, fontsize=13, fontweight="bold")

plt.tight_layout()
plt.savefig(OUT, facecolor=fig.get_facecolor())
print(f"Saved {OUT}")

"""Generate traceable scientific figures from the retained-origin audit.

Use the bundled Python with matplotlib installed in tmp/paper_deps, or another
environment containing matplotlib. No raw evidence or audit outputs are changed.
"""

from __future__ import annotations

from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import sys


ROOT = Path(__file__).resolve().parents[1]
DEPENDENCIES = ROOT / "tmp" / "paper_deps"
if DEPENDENCIES.is_dir():
    sys.path.insert(0, str(DEPENDENCIES))
OUT = ROOT / "paper" / "figures"
OUT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(OUT / ".mplconfig"))

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D


COLORS = {2017: "#007A78", 2022: "#D46F12"}
TEAL, ORANGE, GRAY = "#007A78", "#D46F12", "#666666"
SOURCE_PATHS = [
    ROOT / "outputs" / "revisions" / "event_metrics.json",
    ROOT / "outputs" / "revisions" / "origin_versions.csv",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def style():
    plt.rcParams.update({
        "font.family": "DejaVu Sans", "font.size": 12,
        "axes.labelsize": 12, "axes.titlesize": 12,
        "xtick.labelsize": 12, "ytick.labelsize": 12,
        "legend.fontsize": 12, "figure.facecolor": "white",
        "axes.spines.top": False, "axes.spines.right": False,
        "axes.linewidth": 0.8, "lines.linewidth": 1.2,
        "savefig.dpi": 300, "pdf.fonttype": 42,
        "svg.fonttype": "none", "svg.hashsalt": "seismic-retained-origins-v1",
    })


def save(fig, stem):
    files = []
    for suffix in ("png", "pdf", "svg"):
        path = OUT / f"{stem}.{suffix}"
        metadata = {"Creator": "Seismic Data Geosciences figure pipeline"}
        if suffix == "pdf":
            metadata.update({"CreationDate": None, "ModDate": None})
        elif suffix == "svg":
            metadata["Date"] = None
        fig.savefig(path, dpi=300, metadata=metadata)
        files.append({"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)})
    plt.close(fig)
    return files


def depth_and_location(events):
    fig, axes = plt.subplots(1, 2, figsize=(6.5, 3.9), gridspec_kw={"width_ratios": [1.15, 1]})
    left, right = axes
    for year, marker in ((2017, "o"), (2022, "^")):
        subset = [e for e in events if e["cohort_year"] == year]
        left.scatter(
            [e["earliest_depth_km"] for e in subset],
            [e["latest_depth_km"] for e in subset],
            s=40, color=COLORS[year], marker=marker, alpha=0.85,
            edgecolors="white", linewidths=0.4,
        )
        # A fixed horizontal spread separates overlapping observations without
        # changing the measured vertical displacement. No random seed is needed.
        ordered = sorted(subset, key=lambda e: e["event_id"])
        center = 0 if year == 2017 else 1
        offsets = [0.24 * (i / max(1, len(ordered) - 1) - 0.5) for i in range(len(ordered))]
        values = [e["epicentre_displacement_km"] for e in ordered]
        right.scatter([center + x for x in offsets], values, s=35, color=COLORS[year], marker=marker, alpha=0.9)
        right.hlines(statistics.median(values), center - 0.24, center + 0.24, color="black", linewidth=2)
    left.plot([0, 155], [0, 155], color=GRAY, linestyle="--", zorder=0)
    left.set(xlim=(0, 155), ylim=(0, 155), xticks=[0, 50, 100, 150], yticks=[0, 50, 100, 150],
             xlabel="Earliest retained\ndepth (km)", ylabel="Latest retained depth (km)", title="(A) Depth pairs (n = 36)")
    left.set_aspect("equal", adjustable="box")
    right.set(xlim=(-0.45, 1.45), ylim=(0, 86), xticks=[0, 1], xticklabels=["2017\nn = 22", "2022\nn = 14"],
              ylabel="Epicentre displacement (km)", title="(B) By current cohort")
    right.yaxis.grid(True, color="#E7E7E7", linewidth=0.6)
    right.set_axisbelow(True)
    fig.subplots_adjust(left=0.12, right=0.98, top=0.87, bottom=0.23, wspace=0.62)
    return save(fig, "figure_1_depth_location")


def magnitude_pairs(events):
    exact = [e for e in events if e.get("earliest_magnitude_type") and e["earliest_magnitude_type"] == e.get("latest_magnitude_type")]
    types = Counter(e["earliest_magnitude_type"] for e in exact)
    if types != {"mww": 30, "mb": 1}:
        raise ValueError(f"Review figure panels for changed exact magnitude-type subsets: {types}")
    mww = [e for e in exact if e["earliest_magnitude_type"] == "mww"]
    mb = [e for e in exact if e["earliest_magnitude_type"] == "mb"]
    pairs = Counter((e["earliest_magnitude"], e["latest_magnitude"]) for e in mww)
    fig, (left, right) = plt.subplots(1, 2, figsize=(6.5, 4.3), gridspec_kw={"width_ratios": [1.6, 0.8]})
    # Crossings are drawn last and above ordinary pairs so dense threshold
    # observations cannot conceal the highlighted events.
    for (early, late), count in sorted(pairs.items(), key=lambda item: ((item[0][0] >= 5.5) != (item[0][1] >= 5.5), item[0])):
        crosses = (early >= 5.5) != (late >= 5.5)
        left.scatter(early, late, s=52 * count, marker="^" if crosses else "o",
                     color=ORANGE if crosses else TEAL, edgecolors="white", linewidths=0.5, zorder=5 if crosses else 3)
    for axis in (left,):
        axis.axhline(5.5, color=GRAY, linestyle=":", linewidth=1)
        axis.axvline(5.5, color=GRAY, linestyle=":", linewidth=1)
    left.plot([5.25, 8.4], [5.25, 8.4], color=GRAY, linestyle="--", zorder=0)
    left.set(xlim=(5.25, 8.4), ylim=(5.25, 8.4), xticks=[5.5, 6.5, 7.5], yticks=[5.5, 6.5, 7.5],
             xlabel="Earliest retained\nmagnitude (mww)", ylabel="Latest retained magnitude (mww)", title="(A) Same type: mww (n = 30)")
    left.set_aspect("equal", adjustable="box")
    singleton = mb[0]
    right.plot([0, 1], [singleton["earliest_magnitude"], singleton["latest_magnitude"]], color=TEAL, marker="o", markersize=6)
    right.axhline(5.5, color=GRAY, linestyle=":", linewidth=1)
    right.set(xlim=(-0.35, 1.35), ylim=(5.3, 6.05), xticks=[0, 1], xticklabels=["Earliest", "Latest"], yticks=[5.5, 5.7, 6.0],
              ylabel="Magnitude (mb)", title="(B) mb (n = 1)")
    handles = [
        Line2D([], [], color=TEAL, marker="o", linestyle="", label="Same side of 5.5"),
        Line2D([], [], color=ORANGE, marker="^", linestyle="", label="Crosses 5.5 (n = 4)"),
    ]
    fig.legend(handles=handles, loc="lower center", ncol=1, frameon=False, bbox_to_anchor=(0.51, 0.005))
    fig.subplots_adjust(left=0.12, right=0.98, top=0.88, bottom=0.34, wspace=0.62)
    return save(fig, "figure_2_magnitude_pairs"), exact


def product_timeline(rows):
    event_id = "us2000ahv0"
    subset = sorted([
        row for row in rows if row["event_id"] == event_id and row["uploader_source"] == "us"
        and row["product_type"] == "origin" and row["product_code"] == event_id and row["status"] != "DELETE"
    ], key=lambda row: int(row["update_time_ms"]))
    if not subset or {row["magnitude_type"] for row in subset} != {"mww"}:
        raise ValueError("Timeline requires a single exact magnitude type")
    updates = [datetime.fromisoformat(row["update_time_utc"].replace("Z", "+00:00")) for row in subset]
    magnitude = [float(row["magnitude"]) for row in subset]
    depth = [float(row["depth"]) for row in subset]
    fig, axes = plt.subplots(2, 1, figsize=(6.5, 4.7), sharex=True)
    axes[0].plot(updates, magnitude, color=TEAL, marker="o", markersize=5)
    axes[1].plot(updates, depth, color=ORANGE, marker="s", markersize=5)
    axes[0].set(ylabel="Magnitude (mww)", title=f"{event_id}: {len(subset)} retained non-deletion versions")
    axes[1].set(ylabel="Depth (km)", xlabel="Product updateTime (UTC)")
    for axis in axes:
        axis.yaxis.grid(True, color="#E7E7E7", linewidth=0.6)
        axis.set_axisbelow(True)
    locator = mdates.AutoDateLocator(minticks=3, maxticks=5, interval_multiples=False)
    axes[1].xaxis.set_major_locator(locator)
    axes[1].xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator, tz=timezone.utc))
    fig.subplots_adjust(left=0.16, right=0.98, top=0.88, bottom=0.16, hspace=0.24)
    return save(fig, "figure_3_product_timeline"), subset


def main():
    style()
    events = json.loads(SOURCE_PATHS[0].read_text(encoding="utf-8"))
    with SOURCE_PATHS[1].open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if len(events) != 36 or len({e["event_id"] for e in events}) != 36:
        raise ValueError("Review figure design for changed cohort")
    figures = []
    files = depth_and_location(events)
    figures.append({
        "id": "figure_1", "files": files, "event_ids": [e["event_id"] for e in events],
        "subset": "All 36 events with earliest/latest retained non-deletion primary US origin endpoints.",
        "caption": "Depth and epicentre changes between earliest and latest retained non-deletion versions of each primary US origin branch. (A) Paired depths; dashed line denotes equality. (B) Epicentral displacement by current cohort, with deterministic horizontal offsets to reveal observations and black median bars. Cohorts contain 22 events in 2017 and 14 in 2022. Changes do not estimate error relative to an independent truth.",
    })
    files, exact = magnitude_pairs(events)
    figures.append({
        "id": "figure_2", "files": files, "event_ids": [e["event_id"] for e in exact],
        "subset": "Exact case-sensitive equality of nonempty earliest/latest magnitude-type strings; 30 mww and 1 mb. Five changed-type events are excluded.",
        "excluded_event_ids": [e["event_id"] for e in events if e not in exact],
        "threshold_crossing_ids": [e["event_id"] for e in exact if (e["earliest_magnitude"] >= 5.5) != (e["latest_magnitude"] >= 5.5)],
        "caption": "Same-type magnitude endpoint comparisons, with scales displayed separately. (A) Thirty mww pairs; marker area is proportional to the number of identical endpoint pairs. Orange triangles identify four events crossing 5.5; dotted lines mark that threshold and the dashed line denotes equality. (B) The single mb pair. No magnitude conversion or direct cross-scale comparison is performed. These are current-selected cohorts, so the threshold crossings are not an unbiased estimate of catalogue attrition.",
    })
    files, timeline = product_timeline(rows)
    figures.append({
        "id": "figure_3", "files": files, "event_ids": ["us2000ahv0"],
        "product_ids": [row["product_id"] for row in timeline],
        "subset": "source=us, type=origin, code=us2000ahv0, status != DELETE; exact magnitude type mww throughout.",
        "caption": "Magnitude and depth carried by retained non-deletion origin-product versions for us2000ahv0, ordered by product updateTime. Lines connect retained records for reading only; they do not reconstruct continuous evolution, issue times or the historical preferred solution. The earliest retained version is not assumed to be the first issued version.",
    })
    manifest = {
        "schema_version": 1,
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "generator": {"path": "scripts/make_figures.py", "sha256": digest(Path(__file__)), "python": platform.python_version(), "matplotlib": matplotlib.__version__},
        "sources": [{"path": p.relative_to(ROOT).as_posix(), "sha256": digest(p), "bytes": p.stat().st_size} for p in SOURCE_PATHS],
        "rendering": {"width_inches": 6.5, "font_family": "DejaVu Sans", "font_points": 12, "png_dpi": 300, "colors": {"teal": TEAL, "orange": ORANGE}, "formats": ["png", "pdf", "svg"]},
        "rules": ["No imputed impacts, damages, risk estimates or synthetic earthquake records enter these figures.", "Retained non-deletion means status is not DELETE; superseded UPDATE records are included.", "Endpoint changes are not independent error estimates or evidence of improvement.", "Magnitude types are matched exactly without lowercasing or conversion.", "Current-cohort selection and unknown archive completeness limit generalization.", "Product updateTime is not origin time, initial issue time, indexTime or retrieval time."],
        "figures": figures,
    }
    path = OUT / "figures_manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"figures": len(figures), "outputs": len(figures) * 3, "manifest": str(path)}))


if __name__ == "__main__":
    main()

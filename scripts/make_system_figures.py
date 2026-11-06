"""Create a workflow figure and package two genuine interface captures.

The screenshot is captured through the browser tool after interface QA. This
script does not fabricate, recolor or annotate application pixels. The capture
receipt identifies the exact source bytes, shared view and packaged data hashes.
Scientific figures retain their independently audited original source files.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from scripts import make_figures as base
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
import matplotlib.pyplot as plt

ROOT, OUT = base.ROOT, base.OUT


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def record(path):
    raw = path.read_bytes()
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest()}


def workflow():
    registry_path = ROOT / "system/dist/data/catalogs.json"
    registry = load(registry_path)
    catalogue_counts = {}
    for catalog in registry["catalogs"]:
        pack = load(ROOT / "system/dist" / catalog["events_url"])
        if len(pack["rows"]) != catalog["event_count"]:
            raise ValueError("Catalogue count differs from the registry")
        catalogue_counts[catalog["id"]] = len(pack["rows"])
    events_path = ROOT / "outputs/revisions/event_metrics.json"
    origin_path = ROOT / "outputs/revisions/origin_versions.csv"
    events = load(events_path)
    with origin_path.open(encoding="utf-8", newline="") as stream:
        versions = list(csv.DictReader(stream))
    summary_path = ROOT / "outputs/validation/summary.json"
    # Counts are read from the actual evaluated rows, not copied into labels.
    with (summary_path.parent / "retained_projection_checks.csv").open(encoding="utf-8", newline="") as stream:
        comparison_count = sum(1 for _ in csv.DictReader(stream))
    with (summary_path.parent / "synthetic_policy_checks.csv").open(encoding="utf-8", newline="") as stream:
        synthetic_count = sum(1 for _ in csv.DictReader(stream))
    fig, ax = plt.subplots(figsize=(6.5, 4.7))
    ax.set(xlim=(0, 1), ylim=(0, 1)); ax.axis("off")
    x_positions = [0.015, 0.264, 0.513, 0.762]
    width, height = 0.222, 0.34
    box_text = []

    def box(x, y, heading, lines, fill):
        patch = FancyBboxPatch((x, y), width, height,
                                   boxstyle="round,pad=0.008,rounding_size=0.008",
                                   facecolor=fill, edgecolor="#687C7A", linewidth=.75)
        ax.add_patch(patch)
        title = ax.text(x + width / 2, y + height - .03, heading, ha="center", va="top",
                fontsize=9.3, fontweight="bold", linespacing=1.3)
        text = ax.text(x + width / 2, y + .135, lines, ha="center", va="center",
                fontsize=9.1, linespacing=1.4)
        box_text.extend([(patch, title), (patch, text)])

    def row(y, heading, boxes, fill):
        ax.text(.008, y + height + .043, heading, fontsize=10.5,
                fontweight="bold", va="bottom")
        for x, (title, text) in zip(x_positions, boxes):
            box(x, y, title, text, fill)
        for left, right in zip(x_positions, x_positions[1:]):
            ax.add_patch(FancyArrowPatch((left + width + .001, y + height / 2),
                                        (right - .001, y + height / 2),
                                        arrowstyle="-|>", mutation_scale=9,
                                        color="#425A58", linewidth=1))

    row(.065, "B  Retained revision audit", [
        ("Frozen inputs", f"{len(events)} selected events\n{len(versions)} origin versions\nPreserved bytes"),
        ("Identity\nand clocks", "Product lineage\nSource and author\nProducer clock"),
        ("Evidence\ncontracts", "Captured snapshot\nConditional\nprojection\nHistorical refusal"),
        ("Implementation\nchecks", f"SQL: {comparison_count:,} checks\nSynthetic: {synthetic_count} cases\nReal past states:\nnot validated"),
    ], "#EDF4F3")
    ax.plot([0, 1], [.49, .49], color="#A6B2B0", linewidth=.8, linestyle=(0, (4, 3)))
    row(.55, "A  Exploratory catalogue interface", [
        ("Data\ncatalogues", f"MX (USGS): {catalogue_counts['usgs-mx-historical']:,}\nNA (USGS): {catalogue_counts['usgs-na-2020-2025']:,}\nNRCan: {catalogue_counts['nrcan-ca-historical']:,}"),
        ("Provenance\nboundary", "Active catalogue\nHashes, field limits\nNo automatic merge"),
        ("Local selection", "ID, place, fields\nMap, record table\nCSV, query JSON"),
        ("Display\npreferences", "Theme, light mode\nBase map, viewport\nSelection unchanged"),
    ], "#F7F5ED")
    fig.subplots_adjust(left=.025, right=.99, bottom=.025, top=.96)
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    for patch, text in box_text:
        outer, inner = patch.get_window_extent(renderer), text.get_window_extent(renderer)
        if not (outer.x0 <= inner.x0 <= inner.x1 <= outer.x1 and
                outer.y0 <= inner.y0 <= inner.y1 <= outer.y1):
            raise ValueError("Diagram label escapes its source-derived box: " + text.get_text())
    files = base.save(fig, "figure_architecture")
    return {"id": "architecture", "files": files,
            "sources": [record(p) for p in [registry_path, events_path, origin_path,
                                           summary_path.parent / "retained_projection_checks.csv",
                                           summary_path.parent / "synthetic_policy_checks.csv"]],
            "scope": "Separate pilot audit and exploratory interface; neither row validates historical public catalog states."}


def interface(capture_receipt, *, figure_id, name):
    receipt = load(capture_receipt)
    screenshot = ROOT / receipt["image"]["path"]
    image = plt.imread(screenshot)
    if record(screenshot)["sha256"] != receipt["image"]["sha256"]:
        raise ValueError("Interface screenshot differs from its capture receipt")
    bounds = receipt.get("capture", {}).get("figure_crop_pixel_bounds", [0, 0, image.shape[1], image.shape[0]])
    x0, y0, x1, y1 = bounds
    if not (0 <= x0 < x1 <= image.shape[1] and 0 <= y0 < y1 <= image.shape[0]):
        raise ValueError("Figure frame escapes its immutable browser capture")
    ratio = (y1 - y0) / (x1 - x0)
    if ratio > 1.15:
        raise ValueError("Review screenshot layout before embedding a tall view")
    # Each figure derives from one immutable browser state. Enlarging the
    # overview's controls compares two regions of that same capture, so small
    # source labels can be read without combining independent interface states.
    if figure_id == "interface":
        if image.shape[:2] != (1160, 1408):
            raise ValueError("Review overview frames for changed capture dimensions")
        fig = plt.figure(figsize=(6.5, 4.75))
        panels = [
            ("(A)  Data source and catalogue controls", [.015, .79, .97, .165], [490, 130, 1138, 217]),
            ("(B)  The same 346 selected records", [.015, .002, .97, .735], [17, 359, 1406, 1088]),
        ]
        bounds = []
        for title, position, frame in panels:
            ax = fig.add_axes(position)
            ax.imshow(image, interpolation="none")
            ax.set_xlim(frame[0], frame[2]); ax.set_ylim(frame[3], frame[1])
            ax.set_title(title, loc="left", fontsize=9.5, fontweight="bold", pad=3)
            ax.axis("off")
            bounds.append(frame)
    else:
        fig = plt.figure(figsize=(6.5, 6.5 * ratio))
        ax = fig.add_axes([0, 0, 1, 1])
        ax.imshow(image, interpolation="none")
        ax.set_xlim(x0, x1)
        ax.set_ylim(y1, y0)
        ax.axis("off")
    files = base.save(fig, name)
    return {"id": figure_id, "files": files,
            "sources": [record(capture_receipt), record(screenshot)],
            "native_capture_pixels": {"width": image.shape[1], "height": image.shape[0]},
            "source_pixel_bounds": bounds,
            "scope": "One genuine interface capture of its recorded view. No combined states, retouched observations or usability/source-accuracy evaluation."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--architecture-only", action="store_true")
    parser.add_argument("--capture-receipt", type=Path,
                        default=ROOT / "outputs/inline_2026-11-06/captures/interface_receipt.json")
    parser.add_argument("--inspector-receipt", type=Path,
                        default=ROOT / "outputs/inline_2026-11-06/captures/inspector_receipt.json")
    args = parser.parse_args()
    base.style()
    architecture = workflow()
    figures = [architecture] if args.architecture_only else [
        interface(args.capture_receipt, figure_id="interface", name="figure_interface"),
        architecture,
        interface(args.inspector_receipt, figure_id="inspector", name="figure_inspector"),
    ]
    result = {"schema_version": 1, "generated_utc": datetime.now(timezone.utc).isoformat(),
              "generator": record(Path(__file__).resolve()), "figures": figures,
              "formats": ["png", "pdf", "svg"], "png_dpi": 300}
    (OUT / "system_figures_manifest.json").write_text(json.dumps(result, indent=2), encoding="utf-8", newline="\n")
    if not args.architecture_only:
        originals = load(OUT / "figures_manifest.json")
        ordered = [fig["files"][0] for fig in figures]
        ordered += [fig["files"][0] for fig in originals["figures"]]
        order = {"schema_version": 1, "ordered_figures": ordered,
                 "rule": "Captions in maintained manuscript source follow this order; each image hash is verified before DOCX packaging."}
        (OUT / "manuscript_figures.json").write_text(json.dumps(order, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps({"new_figures": len(figures), "architecture_only": args.architecture_only}))


if __name__ == "__main__":
    main()

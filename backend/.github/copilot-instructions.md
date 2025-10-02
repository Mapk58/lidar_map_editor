<!-- .github/copilot-instructions.md — guidance for AI coding agents working on this repo -->
# Smart Chunks — Copilot instructions

This repository contains a small Python pipeline for processing LiDAR point-clouds (PCD) into per-cluster heightmaps and YOLO-based object inferences. The file `main.py` exposes a FastAPI wrapper that runs the pipeline on uploaded PCDs.

Keep instructions short and actionable. When changing behaviour, prefer editing the pipeline scripts rather than `main.py` orchestration.

- Architecture (big picture)
  - Input: single PCD uploaded to `POST /process_pcd` (see `main.py`).
  - Pipeline stages (called in `run_pipeline`):
    1. `kmeans_pcd.py` — spatial k-means clustering of XY, produces `clusters_pcd/*.pcd`, `neighbors.json` and visualization `clusters_by_count_with_ids.png`.
    2. `ground_detection.py` — per-cluster RANSAC plane fitting, neighbor-consistency repair. Writes `ground_report.json`, `suspects.json`, and optional split PCDs in `split_pcd/ground` and `split_pcd/nonground`.
    3. `render_heightmaps.py` — rasterizes nonground clouds to grayscale PNGs + per-image metadata JSON in `heightmaps/`.
    4. `calculate_inference.py` — runs YOLO (Ultralytics) on the PNGs and writes YOLO-format TXT files to `yolo_labels/`.
    5. `apply_inference.py` — projects YOLO boxes back to 3D, extracts per-object PCDs `inference_*.pcd` and `chunk_clean.pcd` under `labels_pcd/chunk_XXXX`.

- Key files and what to inspect when editing
  - `main.py` — FastAPI endpoints, CORS setting, and the exact CLI flags used for each stage. Change here only if orchestration, job layout, or exposed API changes.
  - `kmeans_pcd.py` — clustering logic and file layout expectations (writes `clusters_pcd/*.pcd` and `neighbors.json`). Many downstream scripts rely on `neighbors.json` and filenames like `cluster_XXXX.pcd`.
  - `ground_detection.py` — important hyperparameters: `--split_dist`, `--inlier_min`, `--angle_soft/hard`. Output JSON `report.json` (named in `main.py` as `ground_report.json`).
  - `render_heightmaps.py` — writes `{cluster}_nonground.png` and `{cluster}_nonground.json` metadata. Metadata keys `origin_xy`, `resolution`, `plane`, `max_height`, `bits`, `width`, `height` are used by `apply_inference.py`.
  - `calculate_inference.py` — expects Ultraytics `YOLO` API; outputs YOLO .txt files named after PNG stem.
  - `apply_inference.py` — converts YOLO TXT + PNG meta -> 3D axis-aligned boxes and splits PCD. Pay attention to coordinate transforms: origin + resolution (see `bbox_to_3d`, `yolo_to_xyxy`).

- Developer workflows and quick commands
  - Install runtime deps (basic): see `requirements.txt` (FastAPI + uvicorn + python-multipart). The heavy deps (Open3D, scikit-learn, ultralytics, imageio/Pillow) are required for full pipeline.
  - Run API locally (development):
    - Start server: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
    - POST a PCD to `/process_pcd` to run full pipeline (the endpoint writes results under `resulting_chunks/<job_id>`).
  - Run pipeline stages individually (useful for debugging):
    - k-means clustering: `python3 kmeans_pcd.py --pcd data/points.pcd --outdir resulting_chunks/<job_id>`
    - ground detection: `python3 ground_detection.py --indir resulting_chunks/<job_id> --save_split --split_outdir split_pcd`
    - render heightmaps: `python3 render_heightmaps.py --indir resulting_chunks/<job_id> --res 0.2 --max_height 3.0 --cap_mode drop --bits 8`
    - run YOLO: `python3 calculate_inference.py --indir resulting_chunks/<job_id> --weights weights/first.pt --images_dir heightmaps --outdir yolo_labels --conf 0.3`
    - apply inference: `python3 apply_inference.py --indir resulting_chunks/<job_id> --bboxes resulting_chunks/<job_id>/yolo_labels --outdir resulting_chunks/<job_id>/labels_pcd`

- Project-specific conventions and gotchas
  - Filenames and directories are part of the contract between scripts. Expected patterns:
    - cluster PCDs: `clusters_pcd/cluster_0000.pcd`, `cluster_0001.pcd`, ...
    - split outputs: `split_pcd/ground/cluster_0000_ground.pcd` and `split_pcd/nonground/cluster_0000_nonground.pcd`.
    - heightmaps: `heightmaps/cluster_0000_nonground.png` and `heightmaps/cluster_0000_nonground.json` (meta keys used by `apply_inference.py`).
    - YOLO outputs: `yolo_labels/cluster_0000_nonground.txt` (YOLOv8 normalized format). `apply_inference.py` expects `.txt` names matching PNG stems.
  - Coordinate transforms: `render_heightmaps.py` writes `origin_xy` and `resolution` (meters per pixel). `apply_inference.py` converts pixel bbox -> global XY via origin + resolution and computes Z from plane (plane params from `ground_report.json`). Don't change metadata keys without updating `apply_inference.py`.
  - Plane format compatibility: `render_heightmaps.py` supports a couple of `ground_report.json` shapes — prefer the default output of `ground_detection.py` (flat dict keyed by cluster id).
  - Performance: `kmeans_pcd.py` downsamples an input set for kmeans via `--keep_ratio` (default 0.02). Large PCDs may hit memory with Open3D; use `--keep_ratio` or `--target_points_per_cluster` to tune.

- Integration points and external dependencies
  - Open3D — reading/writing PCDs and point operations (kmeans, splitting, writing). Many functions raise if Open3D is missing.
  - scikit-learn — KMeans in `kmeans_pcd.py`.
  - ultralytics (YOLO) — `calculate_inference.py` uses `from ultralytics import YOLO`. Tests and CI must have a GPU-enabled environment or CPU fallback; expect slower CPU runs.
  - imageio / Pillow — writing PNGs in `render_heightmaps.py`.

- Examples of targeted edits an AI can make safely
  - Add a `--no-cors` flag to `main.py` to toggle the permissive CORS middleware.
  - Add a `--keep_temp` flag to `main.py` to avoid removing intermediate directories (useful for debugging). The pipeline currently leaves `resulting_chunks/<job_id>` intact — prefer adding a flag rather than changing existing behavior.
  - Improve logging in `run_step` to include elapsed time and return code.

- Testing and verification hints
  - Unit tests are not present. Quick smoke test: run `kmeans_pcd.py` on `data/points.pcd`, then run downstream steps on produced `resulting_chunks/<job_id>` to ensure file contracts match.
  - Validate metadata keys after `render_heightmaps.py` — `apply_inference.py` depends on `origin_xy`, `resolution`, `width`, `height`, `plane`, and `max_height`.

If anything in these instructions is unclear or you want me to include extra examples (e.g., exact sample outputs for `heightmaps/*.json`), say which area to expand and I will iterate. 

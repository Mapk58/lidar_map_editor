import uuid
import shutil
import subprocess
import os
import re
import json
from pathlib import Path
from fastapi import FastAPI, UploadFile, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

DATA_DIR = Path("data")
BASE_URL = "/files"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(BASE_URL, StaticFiles(directory="."), name="files")


def run_step(cmd, cwd=None):
    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            cwd=cwd
        )
        print(f"[OK] {' '.join(cmd)}")
        print(result.stdout)
        return result
    except subprocess.CalledProcessError as e:
        print(f"[FAIL] {' '.join(cmd)}")
        print("STDOUT:\n", e.stdout)
        print("STDERR:\n", e.stderr)
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "command": " ".join(cmd),
                "stdout": e.stdout,
                "stderr": e.stderr
            }
        )


def run_pipeline(input_path: Path, job_dir: Path):
    run_step([
        "python3", "kmeans_pcd.py",
        "--pcd", str(input_path),
        "--keep_ratio", "0.01",
        "--target_points_per_cluster", "100000",
        "--outdir", str(job_dir)
    ])

    run_step([
        "python3", "ground_detection.py",
        "--indir", str(job_dir),
        "--report_json", "ground_report.json",
        "--save_split", "--split_outdir", "split_pcd",
        "--split_dist", "0.20"
    ])

    run_step([
        "python3", "render_heightmaps.py",
        "--indir", str(job_dir),
        "--res", "0.2", "--max_height", "3.0",
        "--cap_mode", "drop", "--bits", "8"
    ])

    run_step([
        "python3", "calculate_inference.py",
        "--indir", str(job_dir),
        "--weights", "weights/first.pt",
        "--images_dir", "heightmaps",
        "--outdir", "yolo_labels",
        "--conf", "0.3"
    ])

    run_step([
        "python3", "apply_inference.py",
        "--indir", str(job_dir),
        "--bboxes", str(job_dir / "yolo_labels"),
        "--outdir", str(job_dir / "labels_pcd")
    ])


def collect_results(job_dir: Path):
    results = []

    ground_dir = job_dir / "split_pcd" / "ground"
    nonground_dir = job_dir / "split_pcd" / "nonground"
    labels_dir = job_dir / "labels_pcd"

    # читаем расширенные данные
    summary_file = labels_dir / "all_summary.json"
    summary_data = {}
    if summary_file.exists():
        with open(summary_file) as f:
            raw = json.load(f)
        for chunk in raw:
            cid = chunk.get("cid")
            inferences = chunk.get("inferences", [])
            summary_data[cid] = {
                inf["id"]: {
                    "confidence": inf["confidence"],
                    "points": inf["points"],
                    "bounding_box": {
                        "center": inf["center"],
                        "size": inf["size"],
                        "yaw": inf["yaw"],
                    }
                }
                for inf in inferences
            }

    ground_files = list(ground_dir.glob("cluster_*_ground.pcd"))
    for gf in sorted(ground_files):
        m = re.search(r"cluster_(\d+)_ground\.pcd", gf.name)
        if not m:
            continue
        chunk_id = int(m.group(1))

        ground_path = f"{BASE_URL}/{gf.relative_to(Path('.')).as_posix()}"

        # static
        label_chunk_dir = labels_dir / f"chunk_{chunk_id:04d}"
        if (label_chunk_dir / "chunk_clean.pcd").exists():
            static_path = f"{BASE_URL}/{(label_chunk_dir / 'chunk_clean.pcd').relative_to(Path('.')).as_posix()}"
        else:
            static_path = f"{BASE_URL}/{(nonground_dir / f'cluster_{chunk_id:04d}_nonground.pcd').relative_to(Path('.')).as_posix()}"

        # dynamic
        dynamic = []
        if label_chunk_dir.exists():
            for inf in sorted(label_chunk_dir.glob("inference_*.pcd")):
                m2 = re.search(r"inference_(\d+)\.pcd", inf.name)
                if not m2:
                    continue
                inf_id = int(m2.group(1))
                obj = {
                    "url": f"{BASE_URL}/{inf.relative_to(Path('.')).as_posix()}",
                    "inference": inf_id,
                }
                extra = summary_data.get(chunk_id, {}).get(inf_id)
                if extra:
                    obj.update(extra)
                dynamic.append(obj)

        results.append({
            "chunk_id": chunk_id,
            "ground": ground_path,
            "static": static_path,
            "dynamic": dynamic
        })

    return results


@app.post("/process_pcd")
async def process_pcd(file: UploadFile):
    job_id = str(uuid.uuid4())
    job_dir = Path("resulting_chunks") / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    DATA_DIR.mkdir(exist_ok=True)
    input_path = job_dir / f"{job_id}.pcd"

    with open(input_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    run_pipeline(input_path, job_dir)
    results = collect_results(job_dir)

    return {
        "job_id": job_id,
        "status": "done",
        "results": results
    }


@app.get("/results/{job_id}")
async def get_results(job_id: str):
    job_dir = Path("resulting_chunks") / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        results = collect_results(job_dir)
        return {
            "job_id": job_id,
            "status": "done",
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error collecting results: {e}")


@app.post("/results")
async def post_results(data: dict = Body(...)):
    job_id = data.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required in JSON")

    job_dir = Path("resulting_chunks") / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # сохраняем json в bbox.json
    bbox_file = job_dir / "bbox.json"
    with open(bbox_file, "w") as f:
        json.dump(data, f, indent=2)

    # пути к файлам
    input_file = job_dir / f"{job_id}.pcd"   # исходный .pcd
    output_file = job_dir / "result.pcd"     # результат

    # запускаем process_pcd.py с input, bbox_file и output
    run_step([
        "python3", "process_pcd.py",
        "--input", str(input_file),
        "--bbox_file", str(bbox_file),
        "--output", str(output_file)
    ])

    return {
        "download_url": f"{BASE_URL}/{output_file.relative_to(Path('.')).as_posix()}",
        "success": True
    }

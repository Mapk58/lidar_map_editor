#!/usr/bin/env python3
import argparse, os, json, numpy as np
import open3d as o3d

def load_meta(meta_path):
    with open(meta_path, "r") as f:
        return json.load(f)

def yolo_to_xyxy_conf(line, img_w, img_h):
    """
    YOLO TXT: class cx cy w h conf (нормализованные)
    -> xmin,ymin,xmax,ymax,cls,conf
    """
    parts = line.strip().split()
    if len(parts) < 6:
        return None
    cls, cx, cy, w, h, conf = map(float, parts[:6])
    cx *= img_w
    cy *= img_h
    w *= img_w
    h *= img_h
    xmin = cx - w/2
    xmax = cx + w/2
    ymin = cy - h/2
    ymax = cy + h/2
    return int(xmin), int(ymin), int(xmax), int(ymax), int(cls), float(conf)

def bbox_to_3d(xmin, ymin, xmax, ymax, meta):
    """BBox в пикселях PNG -> 3D-бокс (ось-выравненный по XY, ограниченный по Z)."""
    ox, oy = meta["origin_xy"]
    res = meta["resolution"]
    # XY границы
    x0 = ox + xmin * res
    x1 = ox + xmax * res
    y0 = oy + ymin * res
    y1 = oy + ymax * res

    # Z: от плоскости до max_height
    n = np.array(meta["plane"]["n"], dtype=float)
    D = float(meta["plane"]["D"])
    max_h = meta["max_height"]
    cx = 0.5*(x0+x1)
    cy = 0.5*(y0+y1)
    z0 = (-D - n[0]*cx - n[1]*cy)/n[2] + 0.2
    z1 = z0 + max_h
    return (min(x0,x1), max(x0,x1)), (min(y0,y1), max(y0,y1)), (z0,z1)

def points_in_box(pts, box):
    (x0,x1), (y0,y1), (z0,z1) = box
    return (pts[:,0]>=x0)&(pts[:,0]<=x1)&(pts[:,1]>=y0)&(pts[:,1]<=y1)&(pts[:,2]>=z0)&(pts[:,2]<=z1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--indir", required=True, help="Папка с split_pcd/nonground и heightmaps")
    ap.add_argument("--bboxes", required=True, help="Папка с YOLO txt файлами инференсов")
    ap.add_argument("--outdir", required=True, help="Куда сохранять результаты")
    args = ap.parse_args()

    ng_dir = os.path.join(args.indir, "split_pcd/nonground")
    hm_dir = os.path.join(args.indir, "heightmaps")
    os.makedirs(args.outdir, exist_ok=True)

    global_summary = []

    for fname in sorted(os.listdir(ng_dir)):
        if not fname.endswith(".pcd"):
            continue
        cid = int(fname.split("_")[1])  # cluster_XXXX_nonground.pcd
        base = os.path.splitext(fname)[0]

        pcd_path = os.path.join(ng_dir, fname)
        meta_path = os.path.join(hm_dir, f"{base}.json")
        bbox_path = os.path.join(args.bboxes, f"{base}.txt")

        if not os.path.exists(bbox_path) or not os.path.exists(meta_path):
            continue

        # облако
        pcd = o3d.io.read_point_cloud(pcd_path)
        pts = np.asarray(pcd.points)
        if pts.shape[0] == 0:
            continue

        # метаданные
        meta = load_meta(meta_path)
        img_w, img_h = meta["width"], meta["height"]

        # читаем bbox
        with open(bbox_path) as f:
            lines = [l for l in f.readlines() if l.strip()]
        if not lines:
            # пустой инференс → просто копируем чанк
            out_chunk_dir = os.path.join(args.outdir, f"chunk_{cid:04d}")
            os.makedirs(out_chunk_dir, exist_ok=True)
            o3d.io.write_point_cloud(os.path.join(out_chunk_dir, "chunk_clean.pcd"), pcd)
            print(f"[i] chunk {cid:04d}: empty bboxes, copied as-is")
            continue

        out_chunk_dir = os.path.join(args.outdir, f"chunk_{cid:04d}")
        os.makedirs(out_chunk_dir, exist_ok=True)

        # подготовим боксы с центрами
        bbox_defs = []
        for i,line in enumerate(lines):
            res = yolo_to_xyxy_conf(line, img_w, img_h)
            if res is None: 
                continue
            xmin,ymin,xmax,ymax,cls,conf = res
            box = bbox_to_3d(xmin,ymin,xmax,ymax, meta)
            # центр в глобальных координатах
            cx_pix = 0.5*(xmin+xmax)
            cy_pix = 0.5*(ymin+ymax)
            gx = meta["origin_xy"][0] + cx_pix * meta["resolution"]
            gy = meta["origin_xy"][1] + cy_pix * meta["resolution"]
            gz = (-float(meta["plane"]["D"]) - meta["plane"]["n"][0]*gx - meta["plane"]["n"][1]*gy)/meta["plane"]["n"][2]
            bbox_defs.append({
                "i": i, "box": box, "center": np.array([gx,gy,gz], dtype=float),
                "conf": conf
            })

        assignments = [[] for _ in bbox_defs]

        # распределим точки
        for idx,pt in enumerate(pts):
            candidates = []
            for b in bbox_defs:
                if points_in_box(pt[None,:], b["box"])[0]:
                    candidates.append(b)
            if len(candidates) == 1:
                assignments[candidates[0]["i"]].append(idx)
            elif len(candidates) > 1:
                dists = [np.linalg.norm(pt - b["center"]) for b in candidates]
                chosen = candidates[int(np.argmin(dists))]
                assignments[chosen["i"]].append(idx)

        mask_remove = np.zeros(pts.shape[0], dtype=bool)
        inf_summaries = []

        for b in bbox_defs:
            inds = assignments[b["i"]]
            if len(inds) == 0:
                continue
            car_pts = pts[inds]
            car_pcd = o3d.geometry.PointCloud()
            car_pcd.points = o3d.utility.Vector3dVector(car_pts)
            out_path = os.path.join(out_chunk_dir, f"inference_{b['i']:02d}.pcd")
            o3d.io.write_point_cloud(out_path, car_pcd)
            mask_remove[inds] = True

            # параметры параллелепипеда
            (x0,x1),(y0,y1),(z0,z1) = b["box"]
            center = [ (x0+x1)/2, (y0+y1)/2, (z0+z1)/2 ]
            size   = [ x1-x0, y1-y0, z1-z0 ]
            yaw    = 0.0  # пока без поворота

            inf_summaries.append({
                "id": b["i"],
                "confidence": b["conf"],
                "center": [float(c) for c in center],
                "size": [float(s) for s in size],
                "yaw": yaw,
                "points": len(inds),
                "pcd_file": os.path.basename(out_path)
            })

        # сохраним очищенный чанк
        clean_pts = pts[~mask_remove]
        clean_pcd = o3d.geometry.PointCloud()
        clean_pcd.points = o3d.utility.Vector3dVector(clean_pts)
        clean_path = os.path.join(out_chunk_dir, "chunk_clean.pcd")
        o3d.io.write_point_cloud(clean_path, clean_pcd)

        chunk_summary = {
            "cid": cid,
            "chunk_clean": os.path.basename(clean_path),
            "total_points": int(pts.shape[0]),
            "removed_points": int(mask_remove.sum()),
            "inferences": inf_summaries
        }

        with open(os.path.join(out_chunk_dir, "summary.json"), "w") as f:
            json.dump(chunk_summary, f, indent=2)

        global_summary.append(chunk_summary)

        print(f"[+] chunk {cid:04d}: {len(lines)} bbox, removed {mask_remove.sum()} pts")

    # общий файл
    with open(os.path.join(args.outdir, "all_summary.json"), "w") as f:
        json.dump(global_summary, f, indent=2)

    print(f"[*] Done. Wrote summaries for {len(global_summary)} chunks")

if __name__ == "__main__":
    main()

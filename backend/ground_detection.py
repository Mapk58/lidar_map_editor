#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ground plane detection per cluster + neighbor consistency check + PCD split + angle repair.

- Читает neighbors.json и clusters_pcd/*.pcd
- Фитит "землю" (RANSAC с предфильтрацией по нижним Z)
- Нормализует и ориентирует нормаль вверх (n_z >= 0)
- Чинит угловые выбросы
- Сохраняет:
    * report.json — финальные (починенные) плоскости
    * suspects.json — список подозрительных кластеров
    * split_pcd/ground/*.pcd и split_pcd/nonground/*.pcd (если включено)

Ground-режим:
- В ground попадает сама плоскость и всё, что ниже неё, плюс зазор split_dist вверх.
"""

import argparse, os, json
import numpy as np
import open3d as o3d
from typing import Optional, Dict

# ---------- utils ----------

def resolve_path(indir: str, p: str) -> str:
    if os.path.isabs(p):
        return p
    cand = os.path.join(indir, p)
    if os.path.exists(cand):
        return cand
    base = os.path.basename(p)
    cand2 = os.path.join(indir, "clusters_pcd", base)
    return cand2 if os.path.exists(cand2) else cand

def fit_ground_plane(pcd_path: str,
                     distance_threshold: float = 0.12,
                     ransac_n: int = 3,
                     num_iterations: int = 1000,
                     prefilter_quantile: float = 0.3,
                     max_points: int = 300_000):
    pcd = o3d.io.read_point_cloud(pcd_path)
    pts = np.asarray(pcd.points)
    if pts.shape[0] < 50:
        return None
    if pts.shape[0] > max_points:
        idx = np.random.choice(pts.shape[0], size=max_points, replace=False)
        pts = pts[idx]
    z = pts[:, 2]
    z_cut = np.quantile(z, prefilter_quantile)
    cand = pts[z <= z_cut + 0.25]
    if cand.shape[0] < 50:
        cand = pts
    pcd_cand = o3d.geometry.PointCloud()
    pcd_cand.points = o3d.utility.Vector3dVector(cand)
    plane_model, inliers = pcd_cand.segment_plane(distance_threshold, ransac_n, num_iterations)
    A, B, C, D = plane_model
    n = np.array([A, B, C], dtype=float)
    norm = np.linalg.norm(n)
    if norm < 1e-9:
        return None
    n /= norm
    D /= norm
    if n[2] < 0:
        n *= -1.0
        D *= -1.0
    inlier_ratio = float(len(inliers)) / float(max(1, cand.shape[0]))
    z_median_ground = float(np.median(cand[inliers, 2])) if len(inliers) > 0 else float(np.median(cand[:, 2]))
    return n, float(D), inlier_ratio, float(n[2]), z_median_ground

def angle_deg(n1: np.ndarray, n2: np.ndarray) -> float:
    return float(np.degrees(np.arccos(np.clip(np.dot(n1, n2), -1.0, 1.0))))

def plane_z_at_xy(n: np.ndarray, D: float, x: float, y: float):
    if abs(n[2]) < 1e-3:
        return None
    return float((-D - n[0] * x - n[1] * y) / n[2])

def split_and_save(pcd_path: str, n: np.ndarray, D: float,
                   split_dist: float, out_ground: str, out_nonground: str):
    """
    В ground попадают все точки на плоскости и ниже неё, а также в слое толщиной split_dist выше.
    """
    pcd = o3d.io.read_point_cloud(pcd_path)
    pts = np.asarray(pcd.points)
    if pts.shape[0] == 0:
        return 0, 0

    signed_dist = pts @ n + D  # положительное значение = выше плоскости
    mask_ground = signed_dist <= split_dist
    ground_pts = pts[mask_ground]
    nonground_pts = pts[~mask_ground]

    if ground_pts.size:
        pcg = o3d.geometry.PointCloud()
        pcg.points = o3d.utility.Vector3dVector(ground_pts)
        o3d.io.write_point_cloud(out_ground, pcg, print_progress=False)
    if nonground_pts.size:
        pcn = o3d.geometry.PointCloud()
        pcn.points = o3d.utility.Vector3dVector(nonground_pts)
        o3d.io.write_point_cloud(out_nonground, pcn, print_progress=False)

    return int(ground_pts.shape[0]), int(nonground_pts.shape[0])

# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--indir", required=True)
    ap.add_argument("--angle_soft", type=float, default=5.0)
    ap.add_argument("--angle_hard", type=float, default=10.0)
    ap.add_argument("--inlier_min", type=float, default=0.3)
    ap.add_argument("--min_nz", type=float, default=0.9)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--report_json", type=str, default="report.json")
    ap.add_argument("--suspects_json", type=str, default="suspects.json")
    ap.add_argument("--save_split", action="store_true")
    ap.add_argument("--split_outdir", type=str, default="split_pcd")
    ap.add_argument("--split_dist", type=float, default=0.12)
    args = ap.parse_args()

    neighbors_path = os.path.join(args.indir, "neighbors.json")
    with open(neighbors_path, "r") as f:
        nb = json.load(f)

    planes: Dict[int, dict] = {}
    suspects = []

    # --- шаг 1. считаем плоскости ---
    for cid_str, info in nb.items():
        cid = int(cid_str)
        pcd_path = resolve_path(args.indir, info.get("pcd_file", ""))
        res = fit_ground_plane(pcd_path)
        if res is None:
            continue
        n, D, inlier_ratio, nz, z_med = res
        good = (nz >= args.min_nz)
        planes[cid] = {
            "n": n.tolist(),
            "D": D,
            "inlier_ratio": inlier_ratio,
            "nz": nz,
            "z_med": z_med,
            "good": bool(good),
            "center_xy": info.get("center", [None, None]),
            "pcd_file": pcd_path
        }

    # --- шаг 2. проверка углов и ремонт ---
    for cid_str, info in nb.items():
        cid = int(cid_str)
        if cid not in planes or not planes[cid]["good"]:
            continue
        n_i = np.array(planes[cid]["n"])
        neigh_ids = [int(nb_info["id"]) for nb_info in info["neighbors"] if int(nb_info["id"]) in planes]
        if not neigh_ids:
            continue
        angs = [angle_deg(n_i, np.array(planes[nid]["n"])) for nid in neigh_ids]
        max_ang, med_ang = max(angs), np.median(angs)
        bad_geom = (planes[cid]["inlier_ratio"] < args.inlier_min)
        if (max_ang > args.angle_hard) or (med_ang > args.angle_soft and bad_geom):
            # ремонт нормали
            neigh_ns = np.stack([planes[nid]["n"] for nid in neigh_ids], axis=0)
            n_fix = np.median(neigh_ns, axis=0)
            n_fix = n_fix / (np.linalg.norm(n_fix) + 1e-9)
            if n_fix[2] < 0:
                n_fix *= -1
            # пересчёт D
            pcd = o3d.io.read_point_cloud(planes[cid]["pcd_file"])
            pts = np.asarray(pcd.points)
            if pts.shape[0] > 0:
                z = pts[:, 2]
                thr = np.quantile(z, 0.3) + 0.25
                cand = pts[z <= thr]
                if cand.shape[0] < 50:
                    cand = pts
                D_fix = - float(np.mean(cand @ n_fix))
            else:
                D_fix = planes[cid]["D"]
            suspects.append({
                "cid": cid,
                "n_orig": planes[cid]["n"],
                "D_orig": planes[cid]["D"],
                "n_fixed": n_fix.tolist(),
                "D_fixed": D_fix,
                "inlier_ratio": planes[cid]["inlier_ratio"],
                "max_angle_to_neighbors": float(max_ang),
                "median_angle_to_neighbors": float(med_ang)
            })
            planes[cid]["n"] = n_fix.tolist()
            planes[cid]["D"] = D_fix
            planes[cid]["status"] = "repaired"

    # --- шаг 3. сохраняем отчёты ---
    print(f"[*] Found {len(planes)} planes, repaired {len(suspects)}")
    with open(os.path.join(args.indir, args.report_json), "w") as f:
        json.dump(planes, f, separators=(',', ':'))
    with open(os.path.join(args.indir, args.suspects_json), "w") as f:
        json.dump(suspects, f, indent=2)

    # --- шаг 4. split по починенным плоскостям ---
    if args.save_split:
        split_dir = os.path.join(args.indir, args.split_outdir)
        ground_dir = os.path.join(split_dir, "ground")
        nonground_dir = os.path.join(split_dir, "nonground")
        os.makedirs(ground_dir, exist_ok=True)
        os.makedirs(nonground_dir, exist_ok=True)
        for cid, p in planes.items():
            if not p["good"]:
                continue
            base = os.path.splitext(os.path.basename(p["pcd_file"]))[0]
            out_g = os.path.join(ground_dir, f"{base}_ground.pcd")
            out_ng = os.path.join(nonground_dir, f"{base}_nonground.pcd")
            split_and_save(p["pcd_file"], np.array(p["n"]), float(p["D"]),
                           args.split_dist, out_g, out_ng)

    print(f"[*] Done. Report in {args.report_json}, suspects in {args.suspects_json}")

if __name__ == "__main__":
    main()

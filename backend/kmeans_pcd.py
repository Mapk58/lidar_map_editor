#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
K-means → Smart merge → KDTree assignment.

Сохраняет:
 - clusters_pcd/*.pcd — точки по кластерам.
 - 01_clusters_by_count_with_ids.png — хитмап по числу точек + номера кластеров.
 - neighbors.json — соседи для каждого кластера.
"""
import argparse, os, json
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as path_effects

try:
    import open3d as o3d
except:
    o3d = None

from sklearn.cluster import KMeans
from scipy.spatial import cKDTree

# ---------- utils ----------

def read_pcd_xy_and_xyz(pcd_path: str):
    if o3d is None:
        raise RuntimeError("Open3D is not installed.")
    pcd = o3d.io.read_point_cloud(pcd_path)
    pts = np.asarray(pcd.points, dtype=np.float64)
    return pts[:, :2], pts

def write_pcd(points_xyz: np.ndarray, path: str):
    pc = o3d.geometry.PointCloud()
    pc.points = o3d.utility.Vector3dVector(points_xyz)
    o3d.io.write_point_cloud(path, pc, print_progress=False)

def rng(seed:int):
    return np.random.RandomState(seed)

def downsample_idx(n:int, keep_ratio:float, seed:int)->np.ndarray:
    if keep_ratio >= 0.999:
        return np.arange(n, dtype=np.int64)
    r = rng(seed)
    keep = r.rand(n) < keep_ratio
    return np.flatnonzero(keep)

# ---------- smart merge по центрам ----------

def merge_centers_until_stable(centers, counts, target_abs):
    centers = np.asarray(centers,dtype=float)
    counts = np.asarray(counts,dtype=float)
    changed=True
    while changed and len(centers)>1:
        changed=False
        order=np.argsort(counts)
        for idx in order:
            if idx>=len(centers): continue
            ci=counts[idx]
            if ci>=target_abs: continue
            dif=centers-centers[idx]
            d2=np.sum(dif*dif,axis=1)
            d2[idx]=np.inf
            j=np.argmin(d2)
            if ci+counts[j]<=target_abs:
                new_count=ci+counts[j]
                new_center=(centers[idx]*ci+counts[j]*counts[j])/new_count
                centers[j]=new_center
                counts[j]=new_count
                centers=np.delete(centers,idx,axis=0)
                counts=np.delete(counts,idx,axis=0)
                changed=True
                break
    return centers,counts

# ---------- plotting ----------

def render_clusters_by_count_with_ids(xy_full, labels_full, counts, centers, title, out_path, max_points=200_000):
    plt.figure(figsize=(18,14))
    ax = plt.gca()

    N = xy_full.shape[0]
    if N > max_points:
        idx = np.random.choice(N, max_points, replace=False)
        xy_plot = xy_full[idx]
        labels_plot = labels_full[idx]
    else:
        xy_plot = xy_full
        labels_plot = labels_full

    vals = counts[labels_plot]
    vmin, vmax = np.percentile(vals, 2), np.percentile(vals, 98)
    sc = ax.scatter(xy_plot[:,0], xy_plot[:,1], c=vals, cmap='viridis', s=0.2,
                    vmin=vmin, vmax=vmax)
    plt.colorbar(sc, ax=ax, fraction=0.046, pad=0.04, label="Points per cluster")

    for cid,(cx,cy) in enumerate(centers):
        txt = ax.text(cx, cy, str(cid), fontsize=10, ha='center', va='center', color='white')
        txt.set_path_effects([path_effects.Stroke(linewidth=2, foreground='black'),
                              path_effects.Normal()])

    ax.set_aspect('equal','box')
    ax.set_title(title)
    plt.tight_layout()
    plt.savefig(out_path, dpi=220)
    plt.close()

# ---------- main ----------

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--pcd",required=True)
    ap.add_argument("--keep_ratio",type=float,default=0.02)
    ap.add_argument("--target_points_per_cluster",type=int,default=100000)
    ap.add_argument("--seed",type=int,default=42)
    ap.add_argument("--outdir",type=str,default="simple_chunks")
    args=ap.parse_args()

    os.makedirs(args.outdir,exist_ok=True)
    tiles_dir=os.path.join(args.outdir,"clusters_pcd")
    os.makedirs(tiles_dir,exist_ok=True)

    xy_full,xyz_full=read_pcd_xy_and_xyz(args.pcd)
    n_full=xy_full.shape[0]
    target_abs=max(1,int(args.target_points_per_cluster))
    K=max(1,int(round(n_full/target_abs)))
    print(f"[*] Points full={n_full}, target_abs={target_abs}, K={K}")

    idx=downsample_idx(n_full,args.keep_ratio,args.seed)
    xy_kept=xy_full[idx]
    print(f"[*] Kept {len(xy_kept)} points for k-means")

    km=KMeans(n_clusters=K,random_state=args.seed,n_init=10)
    labels_kept=km.fit_predict(xy_kept)
    centers=km.cluster_centers_
    kept_counts=np.array([np.sum(labels_kept==cid) for cid in range(K)],dtype=float)
    est_abs_counts=kept_counts/max(args.keep_ratio,1e-9)

    print("[*] Smart merge centers...")
    centers,est_abs_counts=merge_centers_until_stable(centers,est_abs_counts,target_abs)
    
    # --- перенумерация центров ---
    print(f"    After merge: {len(centers)} clusters")

    print("[*] Assigning ALL points by nearest center...")
    tree = cKDTree(np.asarray(centers))
    _, nn = tree.query(xy_full, k=1)
    labels_full = nn.astype(np.int32)

    # считаем количество точек на кластер
    full_counts = np.bincount(labels_full, minlength=len(centers))

    # --- сортировка кластеров ---
    # пример: сверху вниз, слева направо
    order = np.lexsort((centers[:,0], -centers[:,1]))

    # переставляем центры и счётчики
    centers = centers[order]
    full_counts = full_counts[order]

    # переназначаем метки точек
    new_labels = np.empty_like(labels_full)
    for new_id, old_id in enumerate(order):
        new_labels[labels_full == old_id] = new_id
    labels_full = new_labels

    print("[*] Exporting per-cluster PCDs...")
    cluster_files = {}
    for cid in range(len(centers)):
        sel = (labels_full == cid)
        if not np.any(sel):
            continue
        pts_xyz = xyz_full[sel]
        out_pcd = os.path.join(tiles_dir, f"cluster_{cid:04d}.pcd")
        write_pcd(pts_xyz, out_pcd)
        # запомним путь для JSON
        cluster_files[cid] = os.path.relpath(out_pcd, args.outdir)

    out_count = os.path.join(args.outdir,"clusters_by_count_with_ids.png")
    print("[*] Rendering image...")
    render_clusters_by_count_with_ids(xy_full,labels_full,full_counts,centers,
                             "Clusters by point count + IDs",out_count)

    # --- сохранить информацию о соседях ---
    print("[*] Building neighbor graph...")
    centers_arr = np.asarray(centers)
    tree_centers = cKDTree(centers_arr)

    neighbors_info = {}
    for cid, c in enumerate(centers_arr):
        dists, idxs = tree_centers.query(c, k=min(7, len(centers_arr)))
        neighbor_ids = idxs[1:].tolist()  # пропускаем сам себя
        neighbor_dists = dists[1:].tolist()
        neighbors_info[cid] = {
            "center": c.tolist(),
            "pcd_file": cluster_files.get(cid, ""),   # <--- добавили путь к чанку
            "neighbors": [
                {
                    "id": int(nid),
                    "dist": float(nd),
                    "pcd_file": cluster_files.get(int(nid), "")
                }
                for nid, nd in zip(neighbor_ids, neighbor_dists)
            ]
        }

    neighbors_path = os.path.join(args.outdir, "neighbors.json")
    with open(neighbors_path, "w") as f:
        json.dump(neighbors_info, f, indent=2)

    print("[*] Done.")
    print("PCDs in:",tiles_dir)
    print("Image saved:",out_count)
    print("Neighbors saved:",neighbors_path)

if __name__=="__main__":
    main()

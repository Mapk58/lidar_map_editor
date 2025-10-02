#!/usr/bin/env python3
import argparse
import json
import numpy as np
import open3d as o3d


def load_pcd(path):
    pcd = o3d.io.read_point_cloud(path)
    return np.asarray(pcd.points)


def save_pcd(points, path):
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    o3d.io.write_point_cloud(path, pcd)


def load_bboxes(path):
    with open(path, "r") as f:
        data = json.load(f)
    return data["bounding_box"]


def convert_bbox_coords(center, size):
    cx, cy, cz = center
    sx, sy, sz = size

    # Переводим в систему PCD (ROS)
    center_new = np.array([cx, -cz, cy])
    size_new   = np.array([sx, sz, sy])
    return center_new, size_new


def points_in_box(points, center, size, yaw):
    pts = points - center

    cos_y, sin_y = np.cos(-yaw), np.sin(-yaw)
    R = np.array([[cos_y, -sin_y, 0],
                  [sin_y,  cos_y, 0],
                  [0,      0,     1]])
    pts_rot = pts @ R.T

    dx, dy, dz = np.array(size) / 2.0

    mask = (
        (np.abs(pts_rot[:, 0]) <= dx) &
        (np.abs(pts_rot[:, 1]) <= dy) &
        (np.abs(pts_rot[:, 2]) <= dz)
    )
    return mask


def fill_surface_points(center, size, yaw, density=30):
    """
    Генерация случайных точек на нижних 5% бокса.
    center: центр бокса
    size: (dx, dy, dz)
    yaw: угол вокруг Z
    """
    dx, dy, dz = size
    dz_fill = dz * 0.05  # нижние 5%

    # Площадь нижней поверхности (XY)
    area = dx * dy
    n_points = int(area * density)

    # равномерная генерация в пределах [-dx/2, dx/2], [-dy/2, dy/2]
    xs = np.random.uniform(-dx/2, dx/2, n_points)
    ys = np.random.uniform(-dy/2, dy/2, n_points)
    zs = np.random.uniform(-dz/2, -dz/2 + dz_fill, n_points)

    pts = np.vstack([xs, ys, zs]).T

    # Поворот обратно по yaw
    cos_y, sin_y = np.cos(yaw), np.sin(yaw)
    R = np.array([[cos_y, -sin_y, 0],
                  [sin_y,  cos_y, 0],
                  [0,      0,     1]])
    pts_rot = pts @ R.T

    # Сдвиг в центр
    pts_rot += center

    return pts_rot


def main(args):
    print(f"[INFO] Loading input PCD: {args.input}")
    points = load_pcd(args.input)
    print(f"[INFO] Loaded {points.shape[0]} points")

    bboxes = load_bboxes(args.bbox_file)
    print(f"[INFO] Loaded {len(bboxes)} bounding boxes")

    mask_remove = np.zeros(points.shape[0], dtype=bool)
    new_points = []

    for i, box in enumerate(bboxes):
        center, size = convert_bbox_coords(box["center"], box["size"])
        yaw = float(box.get("yaw", 0.0))
        fill_surface = bool(box.get("fill_surface", False))

        mask = points_in_box(points, center, size, yaw)
        removed = mask.sum()
        mask_remove |= mask
        print(f"[INFO] Box {i}: removed {removed} points")

        if fill_surface:
            pts_fill = fill_surface_points(center, size, yaw)
            new_points.append(pts_fill)
            print(f"[INFO] Box {i}: filled {pts_fill.shape[0]} points on surface")

    points_filtered = points[~mask_remove]
    if new_points:
        points_filtered = np.vstack([points_filtered, *new_points])

    print(f"[INFO] Final points: {points_filtered.shape[0]}")

    save_pcd(points_filtered, args.output)
    print(f"[INFO] Saved filtered PCD: {args.output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to input .pcd file")
    parser.add_argument("--bbox_file", required=True, help="Path to bbox JSON file")
    parser.add_argument("--output", required=True, help="Path to save filtered .pcd")
    args = parser.parse_args()
    main(args)

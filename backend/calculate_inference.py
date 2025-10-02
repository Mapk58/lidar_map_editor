#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Запуск YOLO-инференса по nonground-картам и сохранение меток.

- Берёт PNG из heightmaps (или другой папки), запускает модель YOLO.
- Сохраняет результаты в формате YOLO (txt) в папку:
  resulting_chunks/points_chunks/yolo_labels/cluster_XXXX_nonground.txt
"""

import argparse, os, re
from pathlib import Path
from ultralytics import YOLO  # pip install ultralytics
import cv2


def parse_cid_from_name(name: str):
    # ожидаем cluster_XXXX_nonground.*
    m = re.search(r"cluster_(\d+)_nonground", name)
    return int(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--indir", required=True,
                    help="Папка датасета (где split_pcd/nonground или heightmaps/)")
    ap.add_argument("--weights", required=True,
                    help="Файл весов YOLO (.pt)")
    ap.add_argument("--images_dir", type=str, default="heightmaps",
                    help="Папка, где искать PNG (по умолчанию heightmaps)")
    ap.add_argument("--outdir", type=str,
                    default="resulting_chunks/points_chunks/yolo_labels",
                    help="Куда писать .txt результаты")
    ap.add_argument("--conf", type=float, default=0.5, help="Порог confidence")
    args = ap.parse_args()

    in_dir = Path(args.indir) / args.images_dir
    out_dir = Path(args.indir) / args.outdir
    out_dir.mkdir(parents=True, exist_ok=True)

    # загружаем модель
    model = YOLO(args.weights)

    # собираем список PNG
    images = sorted([f for f in in_dir.glob("*.png")])
    print(f"[*] Found {len(images)} images in {in_dir}")

    for img_path in images:
        cid = parse_cid_from_name(img_path.stem)
        if cid is None:
            print(f"[!] Skip {img_path.name}: cid not parsed")
            continue

        # инференс
        results = model(img_path, conf=args.conf, verbose=False)

        # YOLOv8 Results — берём боксы
        dets = results[0].boxes
        lines = []
        for box in dets:
            cls_id = int(box.cls)
            conf = float(box.conf)
            xywh = box.xywh[0].tolist()  # центр_x, центр_y, w, h (в пикселях)
            # нормализуем в [0,1]
            H, W, _ = cv2.imread(str(img_path)).shape
            x, y, w, h = xywh
            x /= W
            w /= W
            y /= H
            h /= H
            lines.append(f"{cls_id} {x:.6f} {y:.6f} {w:.6f} {h:.6f} {conf:.3f}")

        # сохраняем в txt
        out_txt = out_dir / f"{img_path.stem}.txt"
        with open(out_txt, "w") as f:
            f.write("\n".join(lines))

        print(f"[+] {img_path.name} -> {out_txt.name} ({len(lines)} objects)")

    print(f"[*] Done. Results in {out_dir}")


if __name__ == "__main__":
    main()

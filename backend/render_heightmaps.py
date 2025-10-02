#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Рендер PNG высотных карт для nonground-облаков по плоскостям из ground_report.json.

- Проекция без вращения: XY остаётся глобальным, Z идёт в яркость (0..max_height).
- Яркость = (z - z_plane(x,y)), где z_plane из Ax+By+Cz+D=0 (нормаль orient вверх).
- Верхняя граница задаётся --max_height (м).
  * --cap_mode clamp (по умолчанию): всё выше рисуется как max_height.
  * --cap_mode drop: всё выше max_height игнорируется.
- Для каждой PNG пишется .json c метаданными (origin, resolution, plane, масштаб).

Зависимости: numpy, open3d, imageio (если нет imageio — fallback на Pillow).
"""

import argparse, os, re, json
import numpy as np
import open3d as o3d

# --- изображение: попробуем imageio, иначе Pillow ---
_writer = None
def _init_writer():
    global _writer
    try:
        import imageio.v2 as imageio
        _writer = ("imageio", imageio)
    except Exception:
        try:
            from PIL import Image
            _writer = ("pil", Image)
        except Exception as e:
            raise RuntimeError("Need either imageio or Pillow installed to write PNG") from e

def save_grayscale_png(path, arr_uint, bits=8):
    """
    arr_uint: np.ndarray dtype uint8 или uint16, 2D
    """
    if _writer is None:
        _init_writer()
    kind, mod = _writer
    if kind == "imageio":
        mod.imwrite(path, arr_uint)
    else:
        # PIL
        if bits == 8:
            im = mod.fromarray(arr_uint, mode="L")
        elif bits == 16:
            # 'I;16' — 16-bit grayscale
            im = mod.fromarray(arr_uint, mode="I;16")
        else:
            raise ValueError("bits must be 8 or 16")
        im.save(path, format="PNG", optimize=True)

def load_planes(path):
    with open(path, "r") as f:
        data = json.load(f)
    # Поддержка двух форматов:
    # 1) { "0": {...}, "1": {...} }  (как в твоём report_json)
    # 2) { "planes": {...} }
    if "planes" in data and isinstance(data["planes"], dict):
        return {int(k): v for k, v in data["planes"].items()}
    else:
        return {int(k): v for k, v in data.items()}

def parse_cid_from_name(name):
    # ожидаем cluster_XXXX_*.pcd
    m = re.search(r"cluster_(\d+)", name)
    return int(m.group(1)) if m else None

def plane_z_at_xy(n, D, x, y):
    # n=(A,B,C) уже нормирована и ориентирована вверх
    C = n[2]
    if abs(C) < 1e-9:
        return None
    return (-D - n[0]*x - n[1]*y) / C

def rasterize_height(x, y, h, res, bg_value=0):
    """
    Растеризация max-height в сетку (без вращения).
    x,y,h — 1D массивы одинаковой длины
    res — размер пикселя, м/пикс.
    Возвращает (img(H,W), origin_x, origin_y)
    """
    if len(x) == 0:
        return np.zeros((1,1), np.uint8), 0.0, 0.0

    minx, maxx = float(np.min(x)), float(np.max(x))
    miny, maxy = float(np.min(y)), float(np.max(y))

    # добавим крошечные поля, чтобы не было выхода за границы округления
    eps = 1e-6
    minx -= eps; miny -= eps

    W = int(np.ceil((maxx - minx) / res))
    H = int(np.ceil((maxy - miny) / res))
    W = max(W, 1); H = max(H, 1)

    ix = np.floor((x - minx) / res).astype(np.int32)
    iy = np.floor((y - miny) / res).astype(np.int32)
    # clip на всякий случай
    ix = np.clip(ix, 0, W-1)
    iy = np.clip(iy, 0, H-1)

    # накапливаем максимум по высоте
    img = np.full((H, W), -np.inf, dtype=np.float32)
    # векторизованно: выберем "линейный индекс"
    lin = iy * W + ix
    # отсортируем по линейному индексу, затем возьмём максимум в группе
    order = np.argsort(lin)
    lin_sorted = lin[order]
    h_sorted = h[order]

    # проход по группам
    start = 0
    while start < lin_sorted.size:
        end = start + 1
        key = lin_sorted[start]
        while end < lin_sorted.size and lin_sorted[end] == key:
            end += 1
        # максимум на этом ключе
        max_h = float(np.max(h_sorted[start:end]))
        iy_k = key // W
        ix_k = key % W
        img[iy_k, ix_k] = max(img[iy_k, ix_k], max_h)
        start = end

    # пустые клетки → 0
    img[~np.isfinite(img)] = 0.0
    return img, minx, miny

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--indir", required=True, help="Папка датасета (где ground_report.json, split_pcd/...)")
    ap.add_argument("--planes_json", type=str, default="ground_report.json")
    ap.add_argument("--nonground_dir", type=str, default="split_pcd/nonground")
    ap.add_argument("--outdir", type=str, default="heightmaps")
    ap.add_argument("--res", type=float, default=0.10, help="Размер пикселя, м/px")
    ap.add_argument("--max_height", type=float, default=5.0, help="Верхняя граница (м)")
    ap.add_argument("--cap_mode", type=str, default="clamp", choices=["clamp","drop"],
                    help="clamp: значения > max_height прижимаются к max_height; drop: такие точки игнорируются")
    ap.add_argument("--bits", type=int, default=8, choices=[8,16], help="Глубина PNG (8 или 16 бит)")
    ap.add_argument("--bg_value", type=int, default=0, help="Яркость фона (0..255 или 0..65535)")
    args = ap.parse_args()

    planes_path = os.path.join(args.indir, args.planes_json)
    ng_dir = os.path.join(args.indir, args.nonground_dir)
    out_dir = os.path.join(args.indir, args.outdir)
    os.makedirs(out_dir, exist_ok=True)

    planes = load_planes(planes_path)

    # Соберём список nonground-файлов
    if not os.path.isdir(ng_dir):
        raise RuntimeError(f"Not found nonground dir: {ng_dir}")
    pcd_files = [os.path.join(ng_dir, f) for f in os.listdir(ng_dir) if f.endswith(".pcd")]
    pcd_files.sort()

    print(f"[*] Planes: {len(planes)}, nonground PCDs: {len(pcd_files)}")
    _init_writer()

    maxval = 255 if args.bits == 8 else 65535

    index = []  # для сводного index.json

    for pcd_path in pcd_files:
        name = os.path.basename(pcd_path)
        cid = parse_cid_from_name(name)
        if cid is None or cid not in planes:
            print(f"[!] Skip {name}: cid not found in planes")
            continue

        plane = planes[cid]
        n = np.array(plane["n"], dtype=float)  # A,B,C
        D = float(plane["D"])
        if n[2] <= 0:
            # на всякий случай — ориент вверх
            n *= -1.0
            D *= -1.0

        # читаем nonground-точки
        pcd = o3d.io.read_point_cloud(pcd_path)
        pts = np.asarray(pcd.points)
        if pts.shape[0] == 0:
            print(f"[i] Empty nonground: {name}")
            # создадим пустую 1x1 картинку и метаданные
            img = np.zeros((1,1), np.uint8 if args.bits==8 else np.uint16)
            png_path = os.path.join(out_dir, f"{os.path.splitext(name)[0]}.png")
            save_grayscale_png(png_path, img, bits=args.bits)
            meta = {
                "cid": cid,
                "png": os.path.basename(png_path),
                "width": 1, "height": 1,
                "resolution": args.res,
                "origin_xy": [0.0, 0.0],
                "plane": {"n": n.tolist(), "D": D},
                "max_height": args.max_height,
                "cap_mode": args.cap_mode,
                "bits": args.bits
            }
            with open(os.path.join(out_dir, f"{os.path.splitext(name)[0]}.json"), "w") as f:
                json.dump(meta, f, indent=2)
            index.append(meta)
            continue

        # посчитаем высоту относительно плоскости
        x, y, z = pts[:,0], pts[:,1], pts[:,2]
        zpl = plane_z_at_xy(n, D, x, y)
        if zpl is None:
            print(f"[!] Plane C≈0 (vertical), skip {name}")
            continue
        h = z - zpl  # >= 0 (nonground выше плоскости), но на всякий случай обрежем
        h = np.maximum(h, 0.0)

        # применим верхний лимит
        if args.cap_mode == "drop":
            mask = h <= args.max_height
            x, y, h = x[mask], y[mask], h[mask]
        else:
            # clamp
            h = np.minimum(h, args.max_height)

        if h.size == 0:
            # все точки выше лимита и отброшены
            img = np.zeros((1,1), np.uint8 if args.bits==8 else np.uint16)
            png_path = os.path.join(out_dir, f"{os.path.splitext(name)[0]}.png")
            save_grayscale_png(png_path, img, bits=args.bits)
            meta = {
                "cid": cid,
                "png": os.path.basename(png_path),
                "width": 1, "height": 1,
                "resolution": args.res,
                "origin_xy": [0.0, 0.0],
                "plane": {"n": n.tolist(), "D": D},
                "max_height": args.max_height,
                "cap_mode": args.cap_mode,
                "bits": args.bits
            }
            with open(os.path.join(out_dir, f"{os.path.splitext(name)[0]}.json"), "w") as f:
                json.dump(meta, f, indent=2)
            index.append(meta)
            continue

        # растеризуем максимум высоты в клетке
        Hgrid, ox, oy = rasterize_height(x, y, h, res=args.res)
        # нормируем в 0..maxval
        img_f = (Hgrid / float(args.max_height)) * float(maxval)
        img_f = np.clip(img_f, 0, maxval)
        arr_uint = img_f.astype(np.uint8 if args.bits==8 else np.uint16)

        # фон туда, где пусто (0 уже и так фон), оставим как есть
        if args.bg_value != 0:
            arr_uint[Hgrid == 0] = np.uint16(args.bg_value) if args.bits==16 else np.uint8(args.bg_value)

        # сохраняем
        stem = os.path.splitext(name)[0]  # cluster_XXXX_nonground
        png_path = os.path.join(out_dir, f"{stem}.png")
        save_grayscale_png(png_path, arr_uint, bits=args.bits)

        meta = {
            "cid": cid,
            "png": os.path.basename(png_path),
            "width": int(arr_uint.shape[1]),
            "height": int(arr_uint.shape[0]),
            "resolution": args.res,            # м/пиксель
            "origin_xy": [ox, oy],             # левый-нижний угол сетки в глобальных XY
            "plane": {"n": n.tolist(), "D": D},
            "max_height": args.max_height,
            "cap_mode": args.cap_mode,
            "bits": args.bits,
            "scale": {"min_height": 0.0, "max_height": args.max_height, "maxval": int(maxval)}
        }
        with open(os.path.join(out_dir, f"{stem}.json"), "w") as f:
            json.dump(meta, f, indent=2)

        index.append(meta)
        print(f"[+] {name} -> {os.path.basename(png_path)}  ({arr_uint.shape[1]}x{arr_uint.shape[0]})")

    # общий индекс
    with open(os.path.join(out_dir, "index.json"), "w") as f:
        json.dump({"items": index}, f, indent=2)
    print(f"[*] Done. Wrote {len(index)} PNG + JSON to {out_dir}")
    
if __name__ == "__main__":
    main()

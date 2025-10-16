
# LiDAR Map Editor

Веб-приложение для редактирования и обработки LiDAR-карт с поддержкой YOLO-инференса и кластеризации облаков точек.  
Архитектура включает:
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11, Uvicorn)  
  + обработка `.pcd` через `open3d`, `numpy`, `scikit-learn`
  + YOLO-инференс через `torch` + `ultralytics`
- **Frontend**: [Vite](https://vitejs.dev/) (Node.js 20, TypeScript)

## Требования

- Docker >= 24  
- NVIDIA GPU + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)  
- Порты `8000` (API) и `3000` (Frontend) свободны

## Сборка контейнера

```bash
docker build -t lidar-map-editor .
````

> ⚠️ Образ базируется на `nvidia/cuda:12.1.1-runtime-ubuntu22.04` и тянет PyTorch с CUDA 12.1.

## Запуск

### CPU-режим
```bash
docker run --rm -p 3000:3000 -p 8000:8000 lidar-map-editor
```

### GPU-режим

```bash
docker run --rm --gpus all -p 3000:3000 -p 8000:8000 lidar-map-editor
```

### Если порт 3000 занят

Можно пробросить на другой:

```bash
docker run --rm --gpus all -p 8080:3000 -p 8000:8000 lidar-map-editor
```

* Frontend → [http://localhost:8080](http://localhost:8080)
* Backend API → [http://localhost:8000](http://localhost:8000)

## Структура проекта

```
backend/   # FastAPI + обработка PCD, YOLO
frontend/  # Vite/React UI
run.sh     # быстрый запуск контейнера
Dockerfile # сборка приложения
```

## Backend (FastAPI)

Запускается внутри контейнера:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Основные эндпоинты:

* `POST /process_pcd` — обработка облака (кластеризация + YOLO)
* `GET /results/{id}` — выдача сохранённых результатов

## Frontend (Vite)

Запускается внутри контейнера:

```bash
yarn dev --host 0.0.0.0 --port 3000
```

Разработка локально (без Docker):

```bash
cd frontend
yarn install
yarn dev
```

## Локальный запуск без Docker

### Backend

```bash
cd backend
pip install -r requirements.txt  # или см. список зависимостей ниже
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install -g yarn
yarn install
yarn dev
```

## Основные Python-зависимости

* `fastapi`, `uvicorn`
* `numpy`, `scipy`, `scikit-learn`
* `open3d`
* `matplotlib`, `pillow`, `tqdm`
* `torch`, `torchvision`, `torchaudio` (CUDA 12.1)
* `ultralytics`
* `opencv-python`


```

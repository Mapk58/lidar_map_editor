# База: CUDA Runtime + Python
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

# --- Системные пакеты ---
RUN apt-get update && apt-get -o Acquire::Check-Valid-Until=false install -y --no-install-recommends \
    python3 python3-pip python3-dev build-essential \
    libgl1 libglib2.0-0 ffmpeg git curl wget \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Python зависимости ---
RUN pip3 install --upgrade pip
# Ставим PyTorch + CUDA 12.1
RUN pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
# Остальные зависимости
RUN pip3 install fastapi uvicorn python-multipart \
    numpy scipy scikit-learn open3d matplotlib pillow \
    ultralytics tqdm opencv-python

# --- Node.js 20 + Yarn ---
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && npm install -g yarn \
 && rm -rf /var/lib/apt/lists/*

# --- Фронтенд ---
COPY frontend/package.json frontend/yarn.lock ./frontend/
WORKDIR /app/frontend
RUN yarn install --frozen-lockfile

# --- Копируем исходники ---
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

# --- Стартовый скрипт ---
RUN echo '#!/bin/bash\n\
cd /app/backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload &\n\
cd /app/frontend && yarn dev --host 0.0.0.0 --port 3000\n' > /app/start.sh \
 && chmod +x /app/start.sh

EXPOSE 8000 3000
CMD ["/app/start.sh"]

# 前端构建
FROM node:trixie-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# 后端 + 静态托管
FROM python:3.12.14-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY 职业信息.json ./
COPY images/ ./images/
COPY --from=frontend /app/frontend/dist ./static
ENV DNFER_STATIC_DIR=/app/static
ENV DNFER_JOB_DATA_PATH=/app/职业信息.json
ENV DNFER_IMAGES_DIR=/app/images/adventure
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# FaceBlur — 面部模糊處理網頁工具

## 簡介

FaceBlur 係一個網頁工具，讓用戶上載相片後，系統會自動偵測相片中嘅**面部**，並提供選項讓用戶選擇是否對面部進行模糊處理，保護個人私隱。

**核心特點：** 只模糊面部，唔會模糊全身。使用 **YuNet**（OpenCV DNN）偵測面部，支援多人場景。

## 技術棧

### 後端 — NestJS
- **框架**: NestJS (TypeScript)
- **面部偵測**: YuNet (OpenCV `FaceDetectorYN`) — Python subprocess
- **模糊處理**: Python Pillow (GaussianBlur)
- **影像資訊**: Sharp (Node.js)
- **檔案上載**: Multer（NestJS 內建支持）
- **暫存管理**: 本地暫存 + 5分鐘自動清理

### 前端 — React + Vite
- **框架**: React 18 + TypeScript
- **構建工具**: Vite
- **UI**: Tailwind CSS
- **互動**: Canvas overlay 顯示面部偵測框 + 選擇模糊

## 為何選擇 YuNet？

| 模型 | 偵測數量（測試相） | 置信度 | 速度 |
|------|----------|----------|------|
| BlazeFace | 0-1 | 低（12-80%）| 快 |
| TinyFaceDetector | 0-3 | 低（12-17%）| 中 |
| **YuNet (OpenCV)** | **28-77** | **高（0.5-0.94）** | **快** |

YuNet 喺多人場景、細面、側面等情況下明顯優勝。

## 快速開始

### 前置條件
- Node.js 20+
- Python 3 + OpenCV + Pillow
```bash
pip3 install opencv-python-headless Pillow numpy
```

### 安裝同啟動

```bash
# 安裝後端依賴
cd backend && npm install

# 安裝前端依賴
cd ../frontend && npm install

# 啟動開發伺服器
cd backend && npm run start:dev    # http://localhost:3000
cd frontend && npm run dev          # http://localhost:5173
```

### CLI 快速處理

```bash
# 在 backend/scripts 目錄下執行
python3 detect_blur.py detect <input> [--threshold 0.5]
python3 detect_blur.py blur <input> <output> [--blur 25] [--padding 0.3] [--threshold 0.5]

# 示例
python3 scripts/detect_blur.py detect photo.jpg --threshold 0.5
python3 scripts/detect_blur.py blur photo.jpg output.jpg --blur 25 --padding 0.3
```

## API

| 端點 | 方法 | 描述 |
|------|------|------|
| `/api/upload` | POST | 上載相片（multipart/form-data）|
| `/api/detect` | POST | 偵測面部（參數：imageId, threshold）|
| `/api/blur` | POST | 模糊處理（參數：imageId, threshold, blurStrength, padding）|
| `/api/image/:id` | GET | 獲取原始相片 |
| `/api/cleanup/:id` | DELETE | 清理暫存檔案 |
| `/api/model-status` | GET | 模型狀態 |

## 隱私保護

- 上載嘅相片只會暫時存儲喺伺服器
- 處理完成後 5 分鐘自動刪除
- 唔會將任何影像數據傳送畀第三方服務
- 所有偵測同處理都喺本地完成

## 授權

MIT License
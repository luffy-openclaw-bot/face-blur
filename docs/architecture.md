# FaceBlur 架構文件

## 系統概覽

FaceBlur 係一個人物模糊處理網頁工具，採用前後端分離架構：

- **後端**: NestJS（長駐進程，模型載入一次）
- **前端**: React + Vite（SPA）

## API 設計

### 1. 上載相片

```
POST /api/upload
Content-Type: multipart/form-data

Request:  image file (JPEG/PNG, max 10MB)
Response: { imageId: string, width: number, height: number }
```

### 2. 偵測人物

```
POST /api/detect
Content-Type: application/json

Request:  { imageId: string }
Response: {
  imageId: string,
  detections: [
    {
      id: number,
      type: "person",
      bbox: { x: number, y: number, width: number, height: number },
      confidence: number
    }
  ]
}
```

### 3. 模糊處理

```
POST /api/blur
Content-Type: application/json

Request:  {
  imageId: string,
  regions: [
    { x: number, y: number, width: number, height: number }
  ],
  blurStrength: number  // 1-20, default 10
}
Response: Processed image (binary JPEG/PNG)
Content-Type: image/jpeg
```

### 4. 下載處理結果

```
GET /api/download/:imageId
Response: Processed image binary
```

### 5. 清理暫存

```
DELETE /api/cleanup/:imageId
Response: { success: boolean }
```

## 模組設計

### AiModule（人物偵測）

- 使用 `@tensorflow/tfjs-node` + COCO-SSD 預訓練模型
- 模型喺 NestJS 啟動時載入（Singleton），避免每次請求重新載入
- 只偵測 `person` 類別，過濾其他物件
- 返回邊界框座標同置信度

```typescript
@Injectable()
export class AiService {
  private model: cocoSsd.ObjectDetection;

  async onModuleInit() {
    await tf.ready();
    this.model = await cocoSsd.load();
  }

  async detectPeople(imageBuffer: Buffer): Promise<Detection[]> {
    const tensor = tf.node.decodeImage(imageBuffer);
    const predictions = await this.model.detect(tensor, undefined, 0.5);
    tensor.dispose();
    return predictions.filter(p => p.class === 'person');
  }
}
```

### ImageModule（影像處理）

- **UploadService**: 處理檔案上載、驗證、暫存
- **BlurService**: 使用 Sharp 做區域性 Gaussian blur

```typescript
@Injectable()
export class BlurService {
  async blurRegions(
    imageBuffer: Buffer,
    regions: Region[],
    strength: number = 10
  ): Promise<Buffer> {
    let pipeline = sharp(imageBuffer);

    const composites = await Promise.all(
      regions.map(async (region) => {
        const { x, y, width, height } = region;
        const blurredRegion = await sharp(imageBuffer)
          .extract({ left: x, top: y, width, height })
          .blur(strength)
          .toBuffer();
        return { input: blurredRegion, left: x, top: y };
      })
    );

    return pipeline.composite(composites).toBuffer();
  }
}
```

### 自動清理（PrivacyInterceptor）

```typescript
@Injectable()
export class PrivacyInterceptor implements NestInterceptor {
  // 處理完成後自動刪除暫存檔案
  // 設定 TTL（例如 5 分鐘後自動清理）
}
```

## 前端流程

```
[上載相片] → [顯示原圖] → [呼叫 /api/detect]
     ↓
[Canvas 顯示偵測框] → [用戶選擇/取消選擇邊界框]
     ↓
[呼叫 /api/blur] → [顯示處理結果] → [下載]
```

### DetectionCanvas 互動

- 用戶可以點擊偵測框嚟選擇/取消選擇要模糊嘅區域
- 支援拖曳調整邊界框範圍
- 即時預覽模糊效果

## 部署考量

### 開發環境
- NestJS: `npm run start:dev` (port 3000)
- React: `npm run dev` (port 5173)
- Vite proxy 設定將 `/api` 請求轉發至 NestJS

### 生產環境
- NestJS: `npm run build && npm run start:prod`
- React: `npm run build`，靜態檔案由 NestJS 或 Nginx 提供
- 建議使用 Docker + Docker Compose

### Docker 配置

```dockerfile
# Backend Dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y libvips-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/main.js"]
```

## 效能考量

1. **模型載入**: COCO-SSD 模型約 6MB，首次載入需要 2-3 秒
2. **偵測時間**: 一般相片（1920×1080）約 500ms-2s
3. **模糊處理**: Sharp 區域模糊約 200-500ms
4. **記憶體**: 每個請求約 50-100MB（取決於相片大小）
5. **建議**: 限制上載大小 10MB、圖片最大 4096×4096

## 安全考量

1. **檔案驗證**: 驗證上載檔案類型（只接受 JPEG/PNG）
2. **大小限制**: 10MB 上載限制
3. **自動清理**: 暫存檔案 TTL 5 分鐘
4. **CORS**: 生產環境只允許指定域名
5. **Rate Limiting**: 每個 IP 每分鐘最多 10 個請求
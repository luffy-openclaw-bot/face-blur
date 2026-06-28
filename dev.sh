#!/bin/bash

# FaceBlur 開發環境啟動腳本

echo "🎭 FaceBlur 開發環境"
echo "========================"
echo ""

# 啟動後端
echo "🔧 啟動後端 (NestJS)..."
cd backend
npm run start:dev &
BACKEND_PID=$!
echo "   後端 PID: $BACKEND_PID"
echo "   後端地址: http://localhost:3000"
echo ""

# 等待後端啟動
echo "⏳ 等待後端啟動（AI 模型載入需要幾秒）..."
sleep 5
echo ""

# 啟動前端
echo "🎨 啟動前端 (React + Vite)..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!
echo "   前端 PID: $FRONTEND_PID"
echo "   前端地址: http://localhost:5173"
echo ""

echo "🎭 FaceBlur 已啟動！"
echo "   前端: http://localhost:5173"
echo "   後端: http://localhost:3000/api/health"
echo ""
echo "按 Ctrl+C 停止所有服務"

# 等待
wait
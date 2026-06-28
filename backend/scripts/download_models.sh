#!/bin/bash
# Download required model files for FaceBlur
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Downloading YuNet face detection model..."
curl -sL "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" \
  -o "$SCRIPT_DIR/face_detection_yunet.onnx"

echo "Downloading SFace face recognition model..."
curl -sL "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx" \
  -o "$SCRIPT_DIR/face_recognition_sface.onnx"

echo "✅ Models downloaded successfully!"
echo "  - face_detection_yunet.onnx (YuNet)"
echo "  - face_recognition_sface.onnx (SFace)"
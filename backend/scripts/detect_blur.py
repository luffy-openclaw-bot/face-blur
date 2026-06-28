#!/usr/bin/env python3
"""
FaceBlur Detection & Blur Script — YuNet (OpenCV DNN)
Usage:
  python3 detect_blur.py detect <input> [--threshold 0.5] [--min-size 0.0001] [--max-size 0.02]
  python3 detect_blur.py blur <input> <output> [--threshold 0.5] [--blur 25] [--padding 0.3] [--min-size 0.0001] [--max-size 0.02]
"""

import argparse
import json
import sys
import os

import cv2
import numpy as np
from PIL import Image, ImageFilter

# YuNet model path — same directory as this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "face_detection_yunet.onnx")


def detect_faces(image_path: str, threshold: float = 0.5, min_size: float = 0.0001, max_size: float = 0.02):
    """Detect faces using YuNet and return list of face dicts."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    
    h, w = img.shape[:2]
    img_area = w * h

    fd = cv2.FaceDetectorYN.create(MODEL_PATH, "", (w, h))
    fd.setScoreThreshold(threshold)

    result = fd.detect(img)
    faces = []

    if result is not None and len(result) > 1:
        for face in result[1]:
            x, y, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])
            # YuNet returns landmarks at indices 4-13, confidence at index 14
            conf = float(face[-1]) if len(face) > 14 else float(face[4])
            face_area = fw * fh

            # Filter by reasonable face size relative to image
            if min_size <= face_area / img_area <= max_size:
                faces.append({
                    "x": x,
                    "y": y,
                    "width": fw,
                    "height": fh,
                    "confidence": round(conf, 2),
                })

    return {"width": w, "height": h, "faces": faces}


def blur_faces(image_path: str, output_path: str, threshold: float = 0.5,
               blur_strength: int = 25, padding: float = 0.3,
               min_size: float = 0.0001, max_size: float = 0.02):
    """Detect faces and apply Gaussian blur to each face region."""
    result = detect_faces(image_path, threshold, min_size, max_size)
    w, h = result["width"], result["height"]
    faces = result["faces"]

    pil_img = Image.open(image_path)

    for face in faces:
        fx, fy = face["x"], face["y"]
        fw, fh = face["width"], face["height"]

        # Add padding
        pad_x = int(fw * padding)
        pad_y = int(fh * padding)
        bx1 = max(0, fx - pad_x)
        by1 = max(0, fy - pad_y)
        bx2 = min(w, fx + fw + pad_x)
        by2 = min(h, fy + fh + pad_y)

        region = pil_img.crop((bx1, by1, bx2, by2))
        blurred = region.filter(ImageFilter.GaussianBlur(radius=blur_strength))
        pil_img.paste(blurred, (bx1, by1))

    pil_img.save(output_path, quality=95)
    return {"width": w, "height": h, "faces_blurred": len(faces), "output": output_path}


def main():
    parser = argparse.ArgumentParser(description="FaceBlur — YuNet face detection and blurring")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # detect command
    detect_parser = subparsers.add_parser("detect", help="Detect faces in an image")
    detect_parser.add_argument("input", help="Path to input image")
    detect_parser.add_argument("--threshold", type=float, default=0.5, help="Confidence threshold (0-1)")
    detect_parser.add_argument("--min-size", type=float, default=0.0001, help="Min face size as fraction of image area")
    detect_parser.add_argument("--max-size", type=float, default=0.02, help="Max face size as fraction of image area")

    # blur command
    blur_parser = subparsers.add_parser("blur", help="Detect and blur faces in an image")
    blur_parser.add_argument("input", help="Path to input image")
    blur_parser.add_argument("output", help="Path to output image")
    blur_parser.add_argument("--threshold", type=float, default=0.5, help="Confidence threshold (0-1)")
    blur_parser.add_argument("--blur", type=int, default=25, help="Blur strength (Gaussian radius)")
    blur_parser.add_argument("--padding", type=float, default=0.3, help="Padding ratio around face (0-1)")
    blur_parser.add_argument("--min-size", type=float, default=0.0001, help="Min face size as fraction of image area")
    blur_parser.add_argument("--max-size", type=float, default=0.02, help="Max face size as fraction of image area")

    args = parser.parse_args()

    if args.command == "detect":
        result = detect_faces(args.input, args.threshold, args.min_size, args.max_size)
        print(json.dumps(result, indent=2))
    elif args.command == "blur":
        result = blur_faces(args.input, args.output, args.threshold, args.blur, args.padding, args.min_size, args.max_size)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
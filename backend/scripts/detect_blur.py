#!/usr/bin/env python3
"""
FaceBlur Detection, Matching & Blur Script — YuNet + SFace

Usage:
  python3 detect_blur.py detect <input> [--threshold 0.5] [--min-size 0.0001] [--max-size 0.02]
  python3 detect_blur.py blur <input> <output> [--threshold 0.5] [--blur 25] [--padding 0.3] [--shape oval] [--feather 0.3]
  python3 detect_blur.py blur_regions <input> <output> --regions '[...]' [--blur 25] [--padding 0.3] [--shape oval] [--feather 0.3]
  python3 detect_blur.py crop_faces <input> [--threshold 0.5]
  python3 detect_blur.py extract_embedding <input> [--threshold 0.5]
  python3 detect_blur.py match_faces <input> --refs '<json>' [--threshold 0.5] [--match-threshold 0.4]
"""

import argparse
import json
import sys
import os
import base64

import cv2
import numpy as np
from PIL import Image, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DETECTOR_MODEL = os.path.join(SCRIPT_DIR, "face_detection_yunet.onnx")
RECOGNIZER_MODEL = os.path.join(SCRIPT_DIR, "face_recognition_sface.onnx")


def get_detector(input_size, threshold=0.5, min_size=0.0001, max_size=0.02):
    """Create and configure a YuNet face detector."""
    w, h = input_size
    detector = cv2.FaceDetectorYN.create(DETECTOR_MODEL, "", (w, h))
    detector.setScoreThreshold(threshold)
    return detector


def get_recognizer():
    """Create a SFace face recognizer."""
    return cv2.FaceRecognizerSF.create(RECOGNIZER_MODEL, "")


def detect_faces(image_path: str, threshold: float = 0.5, min_size: float = 0.0001, max_size: float = 0.02):
    """Detect faces using YuNet and return list of face dicts."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    h, w = img.shape[:2]
    img_area = w * h

    detector = get_detector((w, h), threshold)
    result = detector.detect(img)
    faces = []

    if result is not None and len(result) > 1:
        for face in result[1]:
            x, y, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])
            conf = float(face[-1]) if len(face) > 14 else float(face[4])
            face_area = fw * fh

            if min_size <= face_area / img_area <= max_size:
                faces.append({
                    "x": x, "y": y, "width": fw, "height": fh,
                    "confidence": round(conf, 2),
                })

    return {"width": w, "height": h, "faces": faces}


def crop_face(img, face):
    """Crop a face region from an image (with slight padding for better alignment)."""
    x, y, fw, fh = face["x"], face["y"], face["width"], face["height"]
    pad = int(max(fw, fh) * 0.1)
    h_img, w_img = img.shape[:2]
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(w_img, x + fw + pad)
    y2 = min(h_img, y + fh + pad)
    return img[y1:y2, x1:x2]


def crop_faces(image_path: str, threshold: float = 0.5, min_size: float = 0.0001, max_size: float = 0.02):
    """Detect faces and return cropped face images as base64 JPEGs."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    h, w = img.shape[:2]
    img_area = w * h
    detector = get_detector((w, h), threshold)
    result = detector.detect(img)

    crops = []
    if result is not None and len(result) > 1:
        for i, face in enumerate(result[1]):
            x, y, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])
            conf = float(face[-1]) if len(face) > 14 else float(face[4])
            face_area = fw * fh

            if not (min_size <= face_area / img_area <= max_size):
                continue

            face_dict = {"x": x, "y": y, "width": fw, "height": fh, "confidence": round(conf, 2)}
            face_crop = crop_face(img, face_dict)

            _, buffer = cv2.imencode('.jpg', face_crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
            face_b64 = base64.b64encode(buffer).decode('utf-8')

            crops.append({
                "id": i,
                "bbox": {"x": x, "y": y, "width": fw, "height": fh},
                "confidence": round(conf, 2),
                "crop_base64": face_b64,
            })

    return {"width": w, "height": h, "faces": crops}


def extract_embedding(image_path: str, threshold: float = 0.5):
    """Extract face embedding from an image (assumes one face or uses the first detected face)."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    h, w = img.shape[:2]
    detector = get_detector((w, h), threshold)
    recognizer = get_recognizer()

    result = detector.detect(img)
    if result is None or len(result[1]) == 0:
        raise ValueError("No face detected in reference image")

    face = result[1][0]
    aligned = recognizer.alignCrop(img, face)
    feature = recognizer.feature(aligned)

    embedding = feature.flatten().tolist()

    face_dict = {
        "x": int(face[0]), "y": int(face[1]),
        "width": int(face[2]), "height": int(face[3]),
    }
    face_crop = crop_face(img, face_dict)
    _, buffer = cv2.imencode('.jpg', face_crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
    crop_b64 = base64.b64encode(buffer).decode('utf-8')

    return {
        "embedding": embedding,
        "embedding_dim": len(embedding),
        "face_bbox": face_dict,
        "face_crop_base64": crop_b64,
    }


def match_faces(image_path: str, refs_json: str, threshold: float = 0.5,
                 match_threshold: float = 0.4, min_size: float = 0.0001, max_size: float = 0.02):
    """Match detected faces in an image against reference face embeddings."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    h, w = img.shape[:2]
    img_area = w * h

    refs = json.loads(refs_json) if isinstance(refs_json, str) else refs_json
    detector = get_detector((w, h), threshold)
    recognizer = get_recognizer()

    result = detector.detect(img)
    matches = []

    if result is None or len(result[1]) == 0:
        return {"width": w, "height": h, "matches": [], "faces_detected": 0}

    ref_embeddings = []
    for ref in refs:
        emb = np.array(ref["embedding"], dtype=np.float32).reshape(1, -1)
        ref_embeddings.append({"ref_id": ref.get("ref_id", "unknown"), "embedding": emb})

    for face in result[1]:
        x, y, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])
        conf = float(face[-1]) if len(face) > 14 else float(face[4])
        face_area = fw * fh

        if not (min_size <= face_area / img_area <= max_size):
            continue

        try:
            aligned = recognizer.alignCrop(img, face)
            face_feature = recognizer.feature(aligned)
        except Exception:
            continue

        best_match = None
        best_score = float('-inf')

        for ref in ref_embeddings:
            score = recognizer.match(face_feature, ref["embedding"], cv2.FaceRecognizerSF_FR_COSINE)
            if score > best_score:
                best_score = score
                best_match = ref["ref_id"]

        matches.append({
            "face_index": len(matches),
            "bbox": {"x": x, "y": y, "width": fw, "height": fh},
            "confidence": round(conf, 2),
            "matched_ref": best_match if best_score >= match_threshold else None,
            "match_score": round(best_score, 4),
            "is_match": best_score >= match_threshold,
        })

    return {
        "width": w,
        "height": h,
        "faces_detected": len(matches),
        "matches": matches,
        "match_threshold": match_threshold,
    }


def apply_oval_blur(img: Image.Image, cx: int, cy: int, rx: int, ry: int,
                     blur_strength: int, feather: float = 0.3) -> Image.Image:
    """Apply oval-shaped Gaussian blur with feathered edges.

    Optimized: only blurs the bounding region of the oval, not the entire image.

    Args:
        img: PIL Image (original)
        cx, cy: Center of the oval
        rx, ry: Semi-axes (horizontal, vertical radius)
        blur_strength: Gaussian blur radius
        feather: Feather amount as fraction of the smaller semi-axis (0=hard edge, 0.6=very soft)
    """
    w, h = img.size

    # Inner ellipse (full blur) and outer ellipse (fade boundary)
    inner_rx = max(1, rx * (1 - feather))
    inner_ry = max(1, ry * (1 - feather))
    outer_rx = max(2, rx)
    outer_ry = max(2, ry)

    # Calculate bounding box of the outer ellipse (only process this region)
    margin = int(max(outer_rx, outer_ry) * 0.5) + blur_strength + 10
    x1 = max(0, int(cx - outer_rx - margin))
    y1 = max(0, int(cy - outer_ry - margin))
    x2 = min(w, int(cx + outer_rx + margin))
    y2 = min(h, int(cy + outer_ry + margin))

    # Crop the region
    region = img.crop((x1, y1, x2, y2))
    rw, rh = region.size

    # Build mask for this region (relative coordinates)
    yy, xx = np.mgrid[0:rh, 0:rw]
    local_cx = cx - x1
    local_cy = cy - y1

    norm_dist_inner = np.sqrt(((xx - local_cx) / max(inner_rx, 1)) ** 2 + ((yy - local_cy) / max(inner_ry, 1)) ** 2)
    norm_dist_outer = np.sqrt(((xx - local_cx) / max(outer_rx, 1)) ** 2 + ((yy - local_cy) / max(outer_ry, 1)) ** 2)

    mask = np.zeros((rh, rw), dtype=np.float32)
    mask[norm_dist_inner <= 1.0] = 1.0

    if feather < 0.01:
        mask = np.where(norm_dist_outer <= 1.0, 1.0, 0.0).astype(np.float32)
    else:
        transition = (norm_dist_inner > 1.0) & (norm_dist_outer < 1.0)
        ratio = (outer_rx - inner_rx) / max(outer_rx, 1)
        if ratio > 1e-6:
            mask[transition] = np.clip((1.0 - (norm_dist_outer[transition] - 1.0) / (ratio * max(outer_rx / inner_rx, 1))), 0, 1)
        else:
            mask[transition] = 0.5

    mask = np.clip(mask, 0.0, 1.0)

    # Blur only the cropped region
    blurred_region = region.filter(ImageFilter.GaussianBlur(radius=blur_strength))

    # Alpha composite: result = original * (1 - mask) + blurred * mask
    arr = np.array(region)
    blurred_arr = np.array(blurred_region)
    mask_3d = mask[:, :, np.newaxis]
    result_arr = (arr.astype(np.float32) * (1 - mask_3d) + blurred_arr.astype(np.float32) * mask_3d)
    result_arr = np.clip(result_arr, 0, 255).astype(np.uint8)
    result_region = Image.fromarray(result_arr)

    # Paste back
    img = img.copy()
    img.paste(result_region, (x1, y1))
    return img


def apply_rect_blur(img: Image.Image, x: int, y: int, w: int, h: int,
                    blur_strength: int, padding: float = 0.3) -> Image.Image:
    """Apply rectangular Gaussian blur with hard edges (legacy behavior)."""
    img_w, img_h = img.size
    pad_x = int(w * padding)
    pad_y = int(h * padding)
    bx1 = max(0, x - pad_x)
    by1 = max(0, y - pad_y)
    bx2 = min(img_w, x + w + pad_x)
    by2 = min(img_h, y + h + pad_y)

    region_crop = img.crop((bx1, by1, bx2, by2))
    blurred = region_crop.filter(ImageFilter.GaussianBlur(radius=blur_strength))
    img.paste(blurred, (bx1, by1))
    return img


def blur_regions(image_path: str, output_path: str, regions: list,
                 blur_strength: int = 25, padding: float = 0.3,
                 shape: str = "oval", feather: float = 0.3):
    """Apply blur to specific face regions in an image.

    Args:
        shape: 'rect' for rectangular blur (legacy) or 'oval' for elliptical feathered blur
        feather: Feather amount (0=hard edge, 0.6=very soft transition). Only used with 'oval'.
    """
    pil_img = Image.open(image_path).copy()
    w, h = pil_img.size

    blurred_count = 0
    for region in regions:
        fx, fy = region["x"], region["y"]
        fw, fh = region["width"], region["height"]
        pad_x = int(fw * padding)
        pad_y = int(fh * padding)

        if shape == "oval":
            # Calculate center and semi-axes for the oval
            cx = fx + fw // 2
            cy = fy + fh // 2
            rx = (fw // 2) + pad_x
            ry = (fh // 2) + pad_y
            pil_img = apply_oval_blur(pil_img, cx, cy, rx, ry, blur_strength, feather)
        else:
            # Legacy rectangular blur
            pil_img = apply_rect_blur(pil_img, fx, fy, fw, fh, blur_strength, padding)

        blurred_count += 1

    pil_img.save(output_path, quality=95)
    return {"width": w, "height": h, "faces_blurred": blurred_count, "output": output_path}


def blur_faces(image_path: str, output_path: str, threshold: float = 0.5,
               blur_strength: int = 25, padding: float = 0.3,
               min_size: float = 0.0001, max_size: float = 0.02,
               shape: str = "oval", feather: float = 0.3):
    """Detect faces and apply blur to each face region."""
    result = detect_faces(image_path, threshold, min_size, max_size)
    return blur_regions(image_path, output_path, result["faces"],
                       blur_strength, padding, shape, feather)


def main():
    parser = argparse.ArgumentParser(description="FaceBlur — YuNet + SFace face detection, matching and blurring")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # detect command
    p_detect = subparsers.add_parser("detect", help="Detect faces in an image")
    p_detect.add_argument("input", help="Path to input image")
    p_detect.add_argument("--threshold", type=float, default=0.5)
    p_detect.add_argument("--min-size", type=float, default=0.0001)
    p_detect.add_argument("--max-size", type=float, default=0.02)

    # blur command — detect and blur ALL faces
    p_blur = subparsers.add_parser("blur", help="Detect and blur ALL faces")
    p_blur.add_argument("input", help="Path to input image")
    p_blur.add_argument("output", help="Path to output image")
    p_blur.add_argument("--threshold", type=float, default=0.5)
    p_blur.add_argument("--blur", type=int, default=25)
    p_blur.add_argument("--padding", type=float, default=0.3)
    p_blur.add_argument("--shape", choices=["rect", "oval"], default="oval",
                        help="Blur shape: rect (rectangular) or oval (elliptical with feathered edges)")
    p_blur.add_argument("--feather", type=float, default=0.3,
                        help="Feather amount for oval blur (0=hard edge, 0.6=very soft)")
    p_blur.add_argument("--min-size", type=float, default=0.0001)
    p_blur.add_argument("--max-size", type=float, default=0.02)

    # blur_regions command — blur SELECTED face regions
    p_regions = subparsers.add_parser("blur_regions", help="Blur specific face regions")
    p_regions.add_argument("input", help="Path to input image")
    p_regions.add_argument("output", help="Path to output image")
    p_regions.add_argument("--regions", required=True, help="JSON array of face regions")
    p_regions.add_argument("--blur", type=int, default=25)
    p_regions.add_argument("--padding", type=float, default=0.3)
    p_regions.add_argument("--shape", choices=["rect", "oval"], default="oval",
                          help="Blur shape: rect or oval")
    p_regions.add_argument("--feather", type=float, default=0.3,
                          help="Feather amount for oval blur (0=hard edge, 0.6=very soft)")

    # crop_faces command
    p_crop = subparsers.add_parser("crop_faces", help="Detect faces and return cropped face images as base64")
    p_crop.add_argument("input", help="Path to input image")
    p_crop.add_argument("--threshold", type=float, default=0.5)
    p_crop.add_argument("--min-size", type=float, default=0.0001)
    p_crop.add_argument("--max-size", type=float, default=0.02)

    # extract_embedding command
    p_embed = subparsers.add_parser("extract_embedding", help="Extract face embedding from reference image")
    p_embed.add_argument("input", help="Path to reference face image")
    p_embed.add_argument("--threshold", type=float, default=0.5)

    # match_faces command
    p_match = subparsers.add_parser("match_faces", help="Match faces against reference embeddings")
    p_match.add_argument("input", help="Path to group photo")
    p_match.add_argument("--refs", required=True, help="JSON array of reference objects with 'embedding' and 'ref_id'")
    p_match.add_argument("--threshold", type=float, default=0.5)
    p_match.add_argument("--match-threshold", type=float, default=0.4)
    p_match.add_argument("--min-size", type=float, default=0.0001)
    p_match.add_argument("--max-size", type=float, default=0.02)

    args = parser.parse_args()

    try:
        if args.command == "detect":
            result = detect_faces(args.input, args.threshold, args.min_size, args.max_size)
            print(json.dumps(result, indent=2))

        elif args.command == "blur":
            result = blur_faces(args.input, args.output, args.threshold, args.blur,
                               args.padding, args.min_size, args.max_size,
                               args.shape, args.feather)
            print(json.dumps(result, indent=2))

        elif args.command == "blur_regions":
            regions = json.loads(args.regions)
            result = blur_regions(args.input, args.output, regions, args.blur,
                                 args.padding, args.shape, args.feather)
            print(json.dumps(result, indent=2))

        elif args.command == "crop_faces":
            result = crop_faces(args.input, args.threshold, args.min_size, args.max_size)
            print(json.dumps(result, indent=2))

        elif args.command == "extract_embedding":
            result = extract_embedding(args.input, args.threshold)
            print(json.dumps(result, indent=2))

        elif args.command == "match_faces":
            result = match_faces(args.input, args.refs, args.threshold,
                                args.match_threshold, args.min_size, args.max_size)
            print(json.dumps(result, indent=2))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
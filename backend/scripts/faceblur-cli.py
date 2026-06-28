#!/usr/bin/env python3
"""
FaceBlur Interactive CLI — Selective face blurring tool with face matching.

Commands:
  blur       Detect and blur faces (interactive or automatic)
  extract    Extract face embedding from a reference image
  match      Match faces against reference embeddings
"""

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from detect_blur import detect_faces, blur_regions, extract_embedding, match_faces


def interactive_select(faces: list) -> list:
    """Let user interactively select which faces to blur."""
    if not faces:
        print("No faces detected!")
        return []

    print(f"\n{'='*50}")
    print(f"  Detected {len(faces)} face(s)")
    print(f"{'='*50}\n")

    for i, face in enumerate(faces):
        print(f"  [{i+1}] Face at ({face['x']}, {face['y']}) "
              f"size {face['width']}x{face['height']} "
              f"confidence {face['confidence']*100:.0f}%")

    print(f"\n  Select faces to blur (comma-separated numbers, 'all', or 'none'):")
    print(f"  Example: 1,3,5  or  all  or  none")

    try:
        selection = input("\n  Your choice: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("\n  Cancelled.")
        return []

    if selection == 'all' or selection == 'a':
        return faces

    if selection == 'none' or selection == 'n' or selection == '':
        return []

    try:
        indices = [int(x.strip()) - 1 for x in selection.split(',')]
        selected = []
        for idx in indices:
            if 0 <= idx < len(faces):
                selected.append(faces[idx])
            else:
                print(f"  Warning: index {idx+1} out of range, skipping")
        return selected
    except ValueError:
        print("  Invalid input. Please use comma-separated numbers.")
        return []


def cmd_blur(args):
    """Detect and blur faces."""
    # Step 1: Detect faces
    if not args.json:
        print(f"🔍 Detecting faces in: {args.input}")

    try:
        result = detect_faces(args.input, args.threshold)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    faces = result["faces"]
    width, height = result["width"], result["height"]

    if not args.json:
        print(f"   Found {len(faces)} face(s) in {width}x{height} image")

    # Step 2: Match against reference faces if provided
    faces_to_blur = faces  # Default: all detected faces

    if args.ref:
        refs = []
        for ref_path in args.ref:
            try:
                emb = extract_embedding(ref_path, args.threshold)
                refs.append({
                    "ref_id": os.path.basename(ref_path).rsplit('.', 1)[0],
                    "embedding": emb["embedding"],
                })
                if not args.json:
                    print(f"   📎 Loaded reference: {os.path.basename(ref_path)}")
            except Exception as e:
                print(f"   ⚠️ Could not extract face from {ref_path}: {e}", file=sys.stderr)

        if refs:
            match_result = match_faces(
                args.input, json.dumps(refs),
                args.threshold, args.match_threshold,
            )

            if args.action == "blur":
                faces_to_blur = [
                    m["bbox"] if isinstance(m["bbox"], dict) else {"x": m["bbox"][0], "y": m["bbox"][1], "width": m["bbox"][2], "height": m["bbox"][3]}
                    for m in match_result["matches"] if m["is_match"]
                ]
                if not args.json:
                    print(f"   🎯 Matched {len(faces_to_blur)} face(s) for blurring")
            elif args.action == "exclude":
                faces_to_blur = [
                    m["bbox"] if isinstance(m["bbox"], dict) else {"x": m["bbox"][0], "y": m["bbox"][1], "width": m["bbox"][2], "height": m["bbox"][3]}
                    for m in match_result["matches"] if not m["is_match"]
                ]
                if not args.json:
                    excluded_count = sum(1 for m in match_result["matches"] if m["is_match"])
                    print(f"   ✅ Excluding {excluded_count} matched face(s), blurring the rest")

    elif not args.all:
        faces_to_blur = interactive_select(faces)

    if not faces_to_blur:
        if args.json:
            print(json.dumps({
                "input": args.input, "output": None,
                "width": width, "height": height,
                "faces_detected": len(faces), "faces_blurred": 0,
                "message": "No faces selected for blurring",
            }, indent=2))
        else:
            print("\n  No faces selected. Output file not created.")
        return

    # Step 3: Blur
    if not args.json:
        print(f"\n🎨 Blurring {len(faces_to_blur)} face(s)...")

    try:
        output = blur_regions(args.input, args.output, faces_to_blur, args.blur, args.padding,
                             args.shape, args.feather, args.scale)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps({
            "input": args.input, "output": args.output,
            "width": width, "height": height,
            "faces_detected": len(faces), "faces_blurred": len(faces_to_blur),
            "blurred_regions": faces_to_blur,
            "blur_strength": args.blur, "padding": args.padding,
        }, indent=2))
    else:
        print(f"   ✅ Saved to: {args.output}")
        print(f"   Blurred {len(faces_to_blur)} of {len(faces)} detected face(s)")


def cmd_extract(args):
    """Extract face embedding from a reference image."""
    try:
        result = extract_embedding(args.input, args.threshold)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            bbox = result["face_bbox"]
            print(f"Face detected at ({bbox['x']}, {bbox['y']}) size {bbox['width']}x{bbox['height']}")
            print(f"Embedding dimension: {result['embedding_dim']}")
            print(f"Use this embedding for match_faces command")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_match(args):
    """Match faces against reference embeddings."""
    refs = []
    for ref_path in args.ref:
        with open(ref_path) as f:
            data = json.load(f)
            if isinstance(data, list):
                refs.extend(data)
            else:
                refs.append(data)

    try:
        result = match_faces(args.input, json.dumps(refs), args.threshold, args.match_threshold)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"Detected {result['faces_detected']} faces")
            for m in result['matches']:
                status = f"→ {m['matched_ref']}" if m['is_match'] else "(no match)"
                print(f"  Face {m['face_index']}: confidence {m['confidence']*100:.0f}%, "
                      f"match score {m['match_score']:.2f} {status}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="FaceBlur CLI — Selective face blurring with face matching",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # blur subcommand
    p_blur = subparsers.add_parser("blur", help="Detect and blur faces")
    p_blur.add_argument("input", help="Path to input image")
    p_blur.add_argument("output", help="Path to output image")
    p_blur.add_argument("--threshold", type=float, default=0.5, help="Detection threshold (0-1)")
    p_blur.add_argument("--blur", type=int, default=25, help="Blur strength (5-50)")
    p_blur.add_argument("--padding", type=float, default=0.3, help="Padding around face (0-0.6)")
    p_blur.add_argument("--all", action="store_true", help="Blur ALL detected faces (non-interactive)")
    p_blur.add_argument("--json", action="store_true", help="Output JSON result")
    p_blur.add_argument("--ref", action="append", help="Reference face image (can specify multiple)")
    p_blur.add_argument("--match-threshold", type=float, default=0.4, help="Match similarity threshold (0-1)")
    p_blur.add_argument("--action", choices=["blur", "exclude"], default="blur",
                        help="Action for matched faces: blur or exclude (default: blur)")
    p_blur.add_argument("--shape", choices=["rect", "oval"], default="oval",
                        help="Blur shape: rect (rectangular) or oval (elliptical, default: oval)")
    p_blur.add_argument("--feather", type=float, default=0.3,
                        help="Feather amount for oval blur (0=hard edge, 0.6=soft, default: 0.3)")
    p_blur.add_argument("--scale", type=float, default=0.75,
                        help="Oval size as fraction of face bbox (0.4=tiny, 0.75=default, 1.0=full face)")

    # extract subcommand
    p_extract = subparsers.add_parser("extract", help="Extract face embedding from reference image")
    p_extract.add_argument("input", help="Path to reference face image")
    p_extract.add_argument("--threshold", type=float, default=0.5)
    p_extract.add_argument("--json", action="store_true", help="Output as JSON")

    # match subcommand
    p_match = subparsers.add_parser("match", help="Match faces against reference embeddings")
    p_match.add_argument("input", help="Path to group photo")
    p_match.add_argument("--ref", action="append", required=True,
                         help="JSON file with face embedding (can specify multiple)")
    p_match.add_argument("--threshold", type=float, default=0.5)
    p_match.add_argument("--match-threshold", type=float, default=0.4)
    p_match.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    if args.command == "blur":
        cmd_blur(args)
    elif args.command == "extract":
        cmd_extract(args)
    elif args.command == "match":
        cmd_match(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
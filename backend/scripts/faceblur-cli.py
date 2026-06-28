#!/usr/bin/env python3
"""
FaceBlur Interactive CLI — Selective face blurring tool.

Usage:
  python3 faceblur-cli.py <input> <output> [--threshold 0.5] [--blur 25] [--padding 0.3] [--all]

Modes:
  --all       Blur ALL detected faces (non-interactive)
  (default)  Interactive mode: show faces, let user choose which to blur

Examples:
  # Interactive mode — choose which faces to blur
  python3 faceblur-cli.py photo.jpg blurred.jpg

  # Blur all faces automatically
  python3 faceblur-cli.py photo.jpg blurred.jpg --all

  # Adjust detection threshold and blur strength
  python3 faceblur-cli.py photo.jpg blurred.jpg --threshold 0.3 --blur 30 --padding 0.4
"""

import argparse
import json
import os
import sys

# Import detect_blur functions
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from detect_blur import detect_faces, blur_regions


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

    # Parse comma-separated numbers
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


def main():
    parser = argparse.ArgumentParser(
        description="FaceBlur CLI — Selective face blurring tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode — choose which faces to blur
  python3 faceblur-cli.py photo.jpg blurred.jpg

  # Blur all faces automatically
  python3 faceblur-cli.py photo.jpg blurred.jpg --all

  # Adjust detection threshold and blur strength
  python3 faceblur-cli.py photo.jpg blurred.jpg --threshold 0.3 --blur 30 --padding 0.4
        """,
    )
    parser.add_argument("input", help="Path to input image")
    parser.add_argument("output", help="Path to output image")
    parser.add_argument("--threshold", type=float, default=0.5, help="Detection confidence threshold (0-1, default: 0.5)")
    parser.add_argument("--blur", type=int, default=25, help="Blur strength / Gaussian radius (5-50, default: 25)")
    parser.add_argument("--padding", type=float, default=0.3, help="Padding ratio around face (0-0.6, default: 0.3)")
    parser.add_argument("--all", action="store_true", help="Blur ALL detected faces (non-interactive)")
    parser.add_argument("--min-size", type=float, default=0.0001, help="Min face size as fraction of image area")
    parser.add_argument("--max-size", type=float, default=0.02, help="Max face size as fraction of image area")
    parser.add_argument("--json", action="store_true", help="Output JSON result (for LLM function calling)")

    args = parser.parse_args()

    # Step 1: Detect faces
    if not args.json:
        print(f"🔍 Detecting faces in: {args.input}")

    try:
        result = detect_faces(args.input, args.threshold, args.min_size, args.max_size)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    faces = result["faces"]
    width, height = result["width"], result["height"]

    if not args.json:
        print(f"   Found {len(faces)} face(s) in {width}x{height} image")

    # Step 2: Select faces to blur
    if args.all:
        selected_faces = faces
    else:
        selected_faces = interactive_select(faces)

    if not selected_faces:
        if args.json:
            print(json.dumps({
                "input": args.input,
                "output": None,
                "width": width,
                "height": height,
                "faces_detected": len(faces),
                "faces_blurred": 0,
                "message": "No faces selected for blurring",
            }, indent=2))
        else:
            print("\n  No faces selected. Output file not created.")
        return

    # Step 3: Blur selected faces
    if not args.json:
        print(f"\n🎨 Blurring {len(selected_faces)} face(s)...")

    try:
        output = blur_regions(args.input, args.output, selected_faces, args.blur, args.padding)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        # JSON output for LLM function calling
        print(json.dumps({
            "input": args.input,
            "output": args.output,
            "width": width,
            "height": height,
            "faces_detected": len(faces),
            "faces_blurred": len(selected_faces),
            "blurred_regions": selected_faces,
            "blur_strength": args.blur,
            "padding": args.padding,
        }, indent=2))
    else:
        print(f"   ✅ Saved to: {args.output}")
        print(f"   Blurred {len(selected_faces)} of {len(faces)} detected face(s)")


if __name__ == "__main__":
    main()
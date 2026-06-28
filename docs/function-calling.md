# FaceBlur — LLM Function Calling Schema

This document defines OpenAI-compatible function calling schemas for FaceBlur.
These can be used with any LLM that supports function calling (OpenAI, Claude, Gemini, etc.).

## Function: `detect_faces`

Detect faces in an image using YuNet model.

```json
{
  "name": "detect_faces",
  "description": "Detect faces in an image. Returns face locations (bounding boxes) with confidence scores. Use this first before blurring.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_path": {
        "type": "string",
        "description": "Path to the input image file"
      },
      "threshold": {
        "type": "number",
        "description": "Detection confidence threshold (0-1). Lower = more faces detected but more false positives. Default: 0.5",
        "default": 0.5
      }
    },
    "required": ["image_path"]
  }
}
```

**Example call:**
```json
{
  "name": "detect_faces",
  "arguments": {
    "image_path": "/path/to/photo.jpg",
    "threshold": 0.5
  }
}
```

**Example response:**
```json
{
  "width": 4096,
  "height": 2304,
  "faces": [
    { "x": 784, "y": 979, "width": 70, "height": 84, "confidence": 0.94 },
    { "x": 2870, "y": 948, "width": 58, "height": 75, "confidence": 0.93 }
  ]
}
```

---

## Function: `blur_all_faces`

Detect and blur ALL faces in an image.

```json
{
  "name": "blur_all_faces",
  "description": "Detect and blur ALL faces in an image. Use this when the user wants every face blurred.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_path": {
        "type": "string",
        "description": "Path to the input image file"
      },
      "output_path": {
        "type": "string",
        "description": "Path for the output blurred image"
      },
      "threshold": {
        "type": "number",
        "description": "Detection confidence threshold (0-1). Default: 0.5",
        "default": 0.5
      },
      "blur_strength": {
        "type": "integer",
        "description": "Gaussian blur radius (5-50). Higher = more blurry. Default: 25",
        "default": 25
      },
      "padding": {
        "type": "number",
        "description": "Padding ratio around each face (0-0.6). Extends blur beyond face boundaries. Default: 0.3",
        "default": 0.3
      }
    },
    "required": ["image_path", "output_path"]
  }
}
```

---

## Function: `blur_selected_faces`

Blur ONLY the selected face regions. Use after `detect_faces` to let the user choose which faces to blur.

```json
{
  "name": "blur_selected_faces",
  "description": "Blur specific face regions in an image. Pass face bounding boxes from detect_faces results. This allows selective blurring — the user can choose which faces to blur and which to leave visible.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_path": {
        "type": "string",
        "description": "Path to the input image file"
      },
      "output_path": {
        "type": "string",
        "description": "Path for the output blurred image"
      },
      "faces": {
        "type": "array",
        "description": "Array of face regions to blur. Each region must have x, y, width, height from detect_faces results.",
        "items": {
          "type": "object",
          "properties": {
            "x": { "type": "integer", "description": "Left x coordinate of face bbox" },
            "y": { "type": "integer", "description": "Top y coordinate of face bbox" },
            "width": { "type": "integer", "description": "Width of face bbox in pixels" },
            "height": { "type": "integer", "description": "Height of face bbox in pixels" }
          },
          "required": ["x", "y", "width", "height"]
        }
      },
      "blur_strength": {
        "type": "integer",
        "description": "Gaussian blur radius (5-50). Higher = more blurry. Default: 25",
        "default": 25
      },
      "padding": {
        "type": "number",
        "description": "Padding ratio around each face (0-0.6). Default: 0.3",
        "default": 0.3
      }
    },
    "required": ["image_path", "output_path", "faces"]
  }
}
```

**Example workflow (LLM function calling):**

```
User: "Blur the faces in this photo but leave the person on the left visible"

1. LLM calls detect_faces("/path/to/photo.jpg", threshold=0.5)
   → Returns 3 faces: face1 (left), face2 (center), face3 (right)

2. LLM calls blur_selected_faces(
     image_path="/path/to/photo.jpg",
     output_path="/path/to/blurred.jpg",
     faces=[
       {"x": ..., "y": ..., "width": ..., "height": ...},  // face2 (center)
       {"x": ..., "y": ..., "width": ..., "height": ...},  // face3 (right)
     ],
     blur_strength=25,
     padding=0.3
   )
   → Blurs only face2 and face3, leaving face1 (left) visible
```

---

## CLI Usage

The functions above map directly to the `detect_blur.py` script:

```bash
# detect_faces →
python3 scripts/detect_blur.py detect photo.jpg --threshold 0.5

# blur_all_faces →
python3 scripts/detect_blur.py blur photo.jpg output.jpg --threshold 0.5 --blur 25 --padding 0.3

# blur_selected_faces →
python3 scripts/detect_blur.py blur_regions photo.jpg output.jpg \
  --regions '[{"x":784,"y":979,"width":70,"height":84}]' \
  --blur 25 --padding 0.3
```

## Interactive CLI

For human use, there's also an interactive CLI:

```bash
# Interactive — shows faces and lets you choose
python3 scripts/faceblur-cli.py photo.jpg blurred.jpg

# Non-interactive — blur all faces
python3 scripts/faceblur-cli.py photo.jpg blurred.jpg --all

# JSON output for LLM pipeline
python3 scripts/faceblur-cli.py photo.jpg blurred.jpg --all --json
```

## API Endpoints (Web)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload image (multipart/form-data) |
| `/api/detect` | POST | Detect faces: `{imageId, threshold}` |
| `/api/blur` | POST | Blur ALL faces: `{imageId, threshold, blurStrength, padding}` |
| `/api/blur-faces` | POST | Blur SELECTED faces: `{imageId, faces: [{x,y,width,height}], blurStrength, padding}` |
| `/api/image/:id` | GET | Get original image |
| `/api/cleanup/:id` | DELETE | Delete uploaded image |
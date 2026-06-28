# FaceBlur — LLM Function Calling Schema

This document defines OpenAI-compatible function calling schemas for FaceBlur.
These can be used with any LLM that supports function calling (OpenAI, Claude, Gemini, etc.).

## Function: `detect_faces`

Detect faces in an image using YuNet model.

```json
{
  "name": "detect_faces",
  "description": "Detect faces in an image. Returns face locations (bounding boxes) with confidence scores.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_path": {
        "type": "string",
        "description": "Path to the input image file"
      },
      "threshold": {
        "type": "number",
        "description": "Detection confidence threshold (0-1). Lower = more faces. Default: 0.5",
        "default": 0.5
      }
    },
    "required": ["image_path"]
  }
}
```

## Function: `extract_face_embedding`

Extract a face embedding vector from a reference face image. Use this to create a reference for face matching.

```json
{
  "name": "extract_face_embedding",
  "description": "Extract a 128-dimensional face embedding from a reference face image. The embedding can be used to match faces in group photos. Returns the embedding vector and face crop preview.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_path": {
        "type": "string",
        "description": "Path to a reference face image (should contain one clear face)"
      },
      "threshold": {
        "type": "number",
        "description": "Detection confidence threshold. Default: 0.5",
        "default": 0.5
      }
    },
    "required": ["image_path"]
  }
}
```

## Function: `match_faces`

Match faces in a group photo against reference face embeddings.

```json
{
  "name": "match_faces",
  "description": "Match detected faces in a group photo against reference face embeddings. Returns which faces match which reference person, with similarity scores.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_path": {
        "type": "string",
        "description": "Path to the group photo"
      },
      "refs": {
        "type": "array",
        "description": "Array of reference face objects, each with ref_id and embedding (from extract_face_embedding)",
        "items": {
          "type": "object",
          "properties": {
            "ref_id": { "type": "string", "description": "Identifier for this reference person" },
            "embedding": {
              "type": "array",
              "items": { "type": "number" },
              "description": "128-dimensional embedding vector from extract_face_embedding"
            }
          },
          "required": ["ref_id", "embedding"]
        }
      },
      "threshold": {
        "type": "number",
        "description": "YuNet detection threshold (0-1). Default: 0.5",
        "default": 0.5
      },
      "match_threshold": {
        "type": "number",
        "description": "Cosine similarity threshold for matching (0-1). Higher = stricter. Default: 0.4",
        "default": 0.4
      }
    },
    "required": ["image_path", "refs"]
  }
}
```

## Function: `blur_all_faces`

Detect and blur ALL faces in an image.

```json
{
  "name": "blur_all_faces",
  "description": "Detect and blur ALL faces in an image.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_path": { "type": "string" },
      "output_path": { "type": "string" },
      "threshold": { "type": "number", "default": 0.5 },
      "blur_strength": { "type": "integer", "default": 25 },
      "padding": { "type": "number", "default": 0.3 }
    },
    "required": ["image_path", "output_path"]
  }
}
```

## Function: `blur_selected_faces`

Blur ONLY the specified face regions.

```json
{
  "name": "blur_selected_faces",
  "description": "Blur specific face regions in an image. Pass face bounding boxes from detect_faces or match_faces results.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_path": { "type": "string" },
      "output_path": { "type": "string" },
      "faces": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "x": { "type": "integer" },
            "y": { "type": "integer" },
            "width": { "type": "integer" },
            "height": { "type": "integer" }
          },
          "required": ["x", "y", "width", "height"]
        }
      },
      "blur_strength": { "type": "integer", "default": 25 },
      "padding": { "type": "number", "default": 0.3 }
    },
    "required": ["image_path", "output_path", "faces"]
  }
}
```

## LLM Workflow Examples

### Example 1: Blur a specific person in a group photo

```
User: "Blur the person on the left in this photo"

1. LLM calls detect_faces("/path/to/photo.jpg")
   → Returns 3 faces: face1 (left), face2 (center), face3 (right)

2. LLM calls blur_selected_faces(
     image_path="/path/to/photo.jpg",
     output_path="/path/to/blurred.jpg",
     faces=[{"x":784,"y":979,"width":70,"height":84}]  // face1 only
   )
```

### Example 2: Blur everyone EXCEPT a specific person

```
User: "Keep my face clear, blur everyone else"
  [User provides a reference selfie]

1. LLM calls extract_face_embedding("/path/to/selfie.jpg")
   → Returns embedding vector [0.12, -1.13, ...] (128 dims)

2. LLM calls match_faces(
     image_path="/path/to/group.jpg",
     refs=[{"ref_id": "user", "embedding": [...]}],
     match_threshold=0.4
   )
   → Returns: face0 matches "user" (0.95), face1 no match, face2 no match

3. LLM calls blur_selected_faces(
     image_path="/path/to/group.jpg",
     output_path="/path/to/blurred.jpg",
     faces=[
       {"x": ..., "y": ..., "width": ..., "height": ...},  // face1
       {"x": ..., "y": ..., "width": ..., "height": ...},  // face2
     ]
     // face0 (user) is excluded from blurring
   )
```

## CLI Usage

```bash
# Detect faces
python3 scripts/detect_blur.py detect photo.jpg --threshold 0.5

# Extract face embedding (for matching)
python3 scripts/detect_blur.py extract_embedding selfie.jpg --json > selfie_embedding.json

# Match faces against reference
python3 scripts/detect_blur.py match_faces group.jpg --refs selfie_embedding.json --json

# Blur all faces
python3 scripts/detect_blur.py blur photo.jpg output.jpg --threshold 0.5 --blur 25

# Blur specific regions
python3 scripts/detect_blur.py blur_regions photo.jpg output.jpg \
  --regions '[{"x":784,"y":979,"width":70,"height":84}]' --blur 25 --padding 0.3

# Interactive CLI with reference matching
python3 scripts/faceblur-cli.py group.jpg output.jpg --ref selfie.jpg --action blur

# Interactive CLI — blur everyone EXCEPT the reference person
python3 scripts/faceblur-cli.py group.jpg output.jpg --ref selfie.jpg --action exclude
```

## API Endpoints (Web)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload image (multipart/form-data) |
| `/api/upload-ref` | POST | Upload reference face + extract embedding |
| `/api/detect` | POST | Detect faces: `{imageId, threshold}` |
| `/api/crop-faces` | POST | Detect + crop faces as base64 |
| `/api/match-faces` | POST | Match faces: `{imageId, refs, threshold, matchThreshold}` |
| `/api/blur` | POST | Blur ALL faces: `{imageId, threshold, blurStrength, padding}` |
| `/api/blur-faces` | POST | Blur SELECTED faces: `{imageId, faces[], blurStrength, padding}` |
| `/api/image/:id` | GET | Get original image |
| `/api/cleanup/:id` | DELETE | Delete uploaded image |
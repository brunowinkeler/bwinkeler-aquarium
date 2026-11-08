# ADR 004: On-device drawing extraction

- Status: accepted
- Date: 2026-11-07

## Context

The phone must turn a photo of a drawing on white paper into a creature with a transparent
background. AI background-removal models are trained on photos of objects and tend to keep the
whole sheet as the subject; they are also heavy to download on a phone.

## Decision

1. Extract the drawing on the phone with classical computer vision: find the paper, rectify it with
   a homography, separate ink from paper with adaptive thresholds, and keep the enclosed white
   interior of outline-only drawings opaque.
2. Support a free white sheet (automatic detection plus manual corner adjustment) and a printed
   template with ArUco markers that fixes orientation and encodes the creature kind.
3. Run the pipeline in a Web Worker and export a PNG of at most 512 px on its longest side.
4. Keep real photos as test fixtures and require IoU ≥ 0.95 against hand-labeled masks.

## Consequences

- No image leaves the phone before the user confirms the preview.
- The server only checks the PNG header and size; it never decodes images.
- Extraction quality depends on lighting and paper contrast; the corner editor is the fallback.

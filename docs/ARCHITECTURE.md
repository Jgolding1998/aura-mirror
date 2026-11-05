# Architecture

```text
USB camera / Pi stream  -> Camera adapter -> mirror + capture
                                      -> MediaPipe hands -> cursor/pinch
Browser speech / Whisper -> text -> command router -> closet / overlay UI
                                                -> assistant API -> Meta
Assistant response -> speech adapter -> local Kokoro / ElevenLabs / browser en-GB
Captured garment -> classify -> confirm metadata -> disk closet
Person photo + real garment -> try-on API -> FASHN GPU service -> saved result
```

The browser never receives API secrets. `/api/config` only exposes provider names, configured flags, a public voice ID, local model paths and an optional camera stream URL. The Node API binds to loopback, restricts browser origins, limits uploads and expensive requests, validates image decoding, re-encodes uploaded images as PNG, and writes closet updates serially and atomically.

Core backend boundaries:

- `server/config.mjs`: environment variables and safe public capability description.
- `server/store.mjs`: local closet persistence and category validation.
- `server/images.mjs`: safe decoding/resizing and optional edge background removal.
- `server/providers.mjs`: Meta vision/advice and ElevenLabs synthesis.
- `voice/service.py`: CPU Kokoro ONNX synthesis with a warm model, a small reply cache and the `bm_george` British voice.
- `server/app.mjs`: HTTP routing plus Whisper and try-on adapters.
- `tryon/service.py`: standalone FASHN model process; token check and one inference at a time.
- `pi/camera_server.py`: independent camera stream with no image persistence.

The UI and backend share the contract in `API-CONTRACT.md`. Device adapters communicate through images/text rather than hardware-specific objects, so the UI does not need rewriting for a Pi. The default is a single-user local application; there is no cloud account system, multi-user isolation or production deployment claim.

Photos remain until deleted through the closet or manually removed from a backed-up `.data` directory. Generated try-on images currently persist independently of closet-item deletion. There is no automatic cloud sync, analytics, identity recognition, publishing or hackathon submission.

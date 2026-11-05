# Implementation research — 4 November 2026

These are primary sources checked during the build. None of the services below is represented as an unlimited free hosted API.

| Component | Choice and reason | Source |
| --- | --- | --- |
| Hand tracking | MediaPipe Hand Landmarker, browser WASM/GPU; no inference API charge. Model and WASM bundled locally. | [Google guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js), [sample repository](https://github.com/google-ai-edge/mediapipe-samples/tree/main/examples/hand_landmarker/js) |
| Vision and advice | Meta image-capable Chat Completions model behind a server-side adapter. Native fetch avoids an unnecessary provider SDK. | [Meta quickstart](https://dev.meta.ai/docs/quickstart), [Chat Completions guide](https://dev.meta.ai/docs/protocols/chat-completions) |
| Natural British voice | ElevenLabs TTS adapter; Eldrin rather than a legacy default voice. Access and quotas depend on the user's account. | [TTS endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [default voice replacements](https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-are-default-voices) |
| Free British voice | Kokoro 82M with `bm_george` on CPU through the ONNX runtime. Reused the local model and voice pack, verified WAV output and browser playback. | [Model card](https://huggingface.co/hexgrad/Kokoro-82M), [ONNX runtime](https://github.com/thewh1teagle/kokoro-onnx) |
| Realistic try-on | FASHN VTON 1.5, Apache-2.0 source release, person + garment images, no hand-built segmentation mask required. Chosen over noncommercial-only alternatives. GPU compute still required for practical inference. | [Official code and install](https://github.com/fashn-AI/fashn-vton-1.5), [release](https://fashn.ai/blog/fashn-vton-1-5-open-source-release) |
| Local transcription | whisper.cpp HTTP adapter; open source and runs on user's hardware. Not Wispr Flow. | [Official server README](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server) |
| Pi camera | Picamera2, optional CSI-camera MJPEG/snapshot process with CORS for the local app. | [Raspberry Pi manual](https://datasheets.raspberrypi.com/camera/picamera2-manual.pdf), [source](https://github.com/raspberrypi/picamera2) |

The plugin catalog was also searched for ElevenLabs; no matching connector was returned in this session. The app therefore uses an explicit ElevenLabs REST adapter and does not depend on an MCP server at runtime. MCP is useful for development tooling, not necessary for the camera loop.

The open-source FASHN model was selected for an optional self-hosted integration. No upstream try-on weights were downloaded on this AMD integrated-GPU PC. The adapter contract is tested with synthetic local HTTP fixtures; that does not validate actual model output. Refer to upstream code/model/dependency licenses before deploying a redistributed GPU environment. MediaPipe model provenance and downloaded SHA-256 hashes are recorded in `public/models/manifest.json`.

The six starter garment illustrations are original SVG assets created for this app. They are sample garments, not product photos or items owned by the user.

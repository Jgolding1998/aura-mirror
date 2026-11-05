# Setup and quick provider swaps

## Meta vision

1. Copy `.env.example` to `.env` and add your existing Meta key as `MODEL_API_KEY` locally. Do not paste it into chat or prefix it with `VITE_`.
2. Leave `META_BASE_URL=https://api.meta.ai/v1` and `META_MODEL=muse-spark-1.3`, or choose an image-capable model your account supports.
3. Restart the Node server. Settings should show Meta configured. This indicates a key is present; the first actual request confirms access.
4. Add a garment photo. Meta suggests a name, colour and category, which you can correct before saving. When you ask for style advice, a captured frame is sent to Meta.

The app calls Meta's OpenAI-compatible Chat Completions endpoint using native `fetch`, not an OpenAI account or API key. Your hackathon credits must appear in Meta Billing before making paid requests.

## Free British voice with Kokoro

Kokoro's `bm_george` is the default local voice. It runs on CPU with no account or API key. The original Windows setup reuses the Kokoro model and voice pack already installed on that computer. To install on another machine with Python 3.10+ and a supported ONNX Runtime wheel:

```powershell
python -m pip install -r voice/requirements.txt
python voice/download_models.py
```

The model and voice pack take roughly 340 MB. The downloader stores them in `.data/voice` and records their sources and SHA-256 hashes. To reuse an existing installation instead, set `KOKORO_MODEL_PATH` and `KOKORO_VOICES_PATH` to the two local files in `.env`.

Add the following to `.env`, then restart `npm start`:

```dotenv
LOCAL_TTS_URL=http://127.0.0.1:8791
START_LOCAL_VOICE=true
KOKORO_VOICE=bm_george
```

The Node server starts a loopback Python voice process automatically. Use `PYTHON` to point to the interpreter in your Python environment if necessary. `KOKORO_THREADS=3` is the default CPU tuning; lower it if voice competes with camera tracking on a Pi. In **Settings**, click **Hear Aura**. You can enable **Speak replies to typed commands too** to use audio without the microphone. Local voice is selected before ElevenLabs when both are configured.

## Optional ElevenLabs British voice

Clear `LOCAL_TTS_URL`, set `START_LOCAL_VOICE=false`, add these to `.env` and restart:

```dotenv
ELEVENLABS_API_KEY=your-existing-key-added-locally
ELEVENLABS_VOICE_ID=6WwXjDDEMyNmFG95zycZ
ELEVENLABS_MODEL=eleven_flash_v2_5
```

Eldrin is ElevenLabs' suggested replacement for George, a British baritone. Add the voice to My Voices if your account requires it, or set a different British voice ID you have access to. Free accounts have restrictions on library voice API access. An HTTP 401/403/404 or quota error is surfaced; the UI can use a British browser voice instead. API keys stay on the Node server. With no key configured, no ElevenLabs requests are made.

## Photorealistic try-on

Aura generates a still photo locally with FASHN. The Windows CPU preset uses float32 computation, a 336 × 504 canvas and 12 sampling steps. Tops use a mask over the original shirt, which reduces bleed-through. The model can still distort details in difficult swaps. A CUDA host can use the full resolution model.

Choose **Try on** on a shirt card, or use **Try your own** to capture or upload a garment photo. You can also say **“Try what I’m holding”** to capture it, then choose **Try without saving**. Set the garment down, keep your face, shoulders and chest in view, and press **Take photo and try on**. A seated photo is enough for shirts. You can also upload a portrait. Keep the panel open while it renders.

### Windows CPU setup

Use a Windows x64 Python environment with matching CPU builds of PyTorch and torchvision. Clone [FASHN v1.5](https://github.com/fashn-AI/fashn-vton-1.5) at revision `7c0f10af3f91ad4048fe9729c470a13ef905d25a`. Install it with `python -m pip install --no-deps -e <fashn-checkout>`, then install the adapter dependencies:

```powershell
python -m pip install -r tryon/requirements.txt onnxruntime safetensors huggingface_hub numpy opencv-python tqdm einops matplotlib fashn-human-parser==0.1.1
python <fashn-checkout>/scripts/download_weights.py --weights-dir <absolute-weights-directory>
```

Add these settings to Aura’s `.env`. Set `PYTHON` to that environment’s Python executable if needed. If you downloaded into a separate Hugging Face cache, set `FASHN_CACHE_DIR` to the same directory.

```dotenv
FASHN_DEVICE=cpu
FASHN_WEIGHTS_DIR=<absolute-weights-directory>
TRYON_SERVICE_URL=http://127.0.0.1:8793
START_LOCAL_TRYON=true
```

Restart Aura with `npm start`. The worker loads the model on the first request and uses the downloaded files offline.

### CUDA setup

On the GPU host, create a Python 3.11 environment and install PyTorch for its CUDA version. Then use the official repository:

```bash
git clone https://github.com/fashn-AI/fashn-vton-1.5.git
cd fashn-vton-1.5
python -m venv .venv
source .venv/bin/activate
pip install -e .
python scripts/download_weights.py --weights-dir ./weights
pip install -r /path/to/aura-mirror/tryon/requirements.txt
export FASHN_WEIGHTS_DIR="$PWD/weights"
export TRYON_SERVICE_TOKEN="choose-a-local-service-token"
python -m uvicorn service:app --app-dir /path/to/aura-mirror/tryon --host 127.0.0.1 --port 8790
```

The upstream weights download is about 2 GB, plus parser weights downloaded on first use. Inference latency and GPU memory depend on hardware. First inference also loads the model. On Windows use `.venv\Scripts\Activate.ps1`, PowerShell `$env:` syntax and absolute Windows paths instead.

On the Aura server, set `TRYON_SERVICE_URL=http://127.0.0.1:8790` and the same `TRYON_SERVICE_TOKEN` in `.env`. For a separate GPU machine, use an authenticated HTTPS reverse proxy or a private tunnel. The included service binds to loopback in the example. Avoid exposing the raw GPU service publicly.

Shirts and jackets use FASHN’s `tops` category. Pants use `bottoms`. Aura saves the generated image locally.

## Raspberry Pi migration

Recommended split: Pi 5 + Camera Module/USB webcam + display + microphone/speaker; browser runs the interface and hand model, Node stores the closet and proxies services; CUDA host runs generated try-on. Benchmark hand tracking on the actual Pi and lower camera resolution if needed.

For a USB camera, run Chromium on the Pi and keep `CAMERA_STREAM_URL` empty. `getUserMedia` can use it like the Windows webcam. Camera/microphone require localhost or HTTPS. Opening an unencrypted LAN IP in another device generally will not provide browser camera permissions.

For the CSI Camera Module, use Raspberry Pi OS with Picamera2:

```bash
sudo apt install python3-picamera2 python3-pil
python3 pi/camera_server.py
```

Set `CAMERA_STREAM_URL=http://127.0.0.1:8090/stream.mjpg` in the app `.env`, then restart. The included service also exposes `/snapshot.jpg` and `/health`, supplies CORS headers for the app's loopback origins, and stops the camera on Ctrl+C. It uses Picamera2 APIs and has been syntax-checked, not tested on physical Pi hardware in this build. The camera feed is displayed as an image stream; check gesture support for that source in Settings. Prefer a USB camera for full browser hand tracking if the stream source is not supported by the detector.

If a separate device hosts the UI, explicitly configure `--host`, `--origin` and `ALLOWED_ORIGINS`, and use HTTPS/private networking. Do not forward these local services to the public internet. Preserve `.data/` when moving to the Pi. Use `npm ci`, `npm run prepare:models`, `npm run build`, `npm start` on the destination. The included model/WASM files avoid runtime CDN downloads.

## Whisper instead of browser speech

Build [whisper.cpp](https://github.com/ggml-org/whisper.cpp), download an English model and run its server on loopback:

```bash
./build/bin/whisper-server -m models/ggml-base.en.bin --host 127.0.0.1 --port 8080 --convert
```

`--convert` requires ffmpeg and allows browser WebM uploads. Set `WHISPER_URL=http://127.0.0.1:8080/inference`. The Aura backend accepts audio data URLs and forwards multipart audio to that endpoint. If this build's browser UI does not expose a Whisper recording mode, use browser speech for the demo; the HTTP adapter is ready for an external mic process. True always-on local wake-word detection is a later hardware component; the current wake phrase is detected from speech recognition while listening is enabled.

## Troubleshooting

- **Camera permission denied:** use the browser site controls to allow it; close apps already using the camera. The demo and uploads still work.
- **No British browser voice:** install an English UK voice through your OS, or configure ElevenLabs. Do not label a different fallback accent as British.
- **Gesture model error:** run `npm run prepare:models`; verify `/models/hand_landmarker.task` and `/models/wasm/` load.
- **Can't detect a dark garment:** improve lighting, use a contrasting background and keep your hand fully in frame. Plain-background cleanup is approximate.
- **Closet won't load:** check the Node server at `/api/health`; back up `.data` before troubleshooting. A malformed existing database will fail rather than be overwritten.
- **Port in use:** set `PORT`, update Vite's proxy for development, and adjust allowed origins. Do not kill unrelated processes.

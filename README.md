# Aura Mirror

A camera-first wardrobe prototype built by Codex and Claude. Claude led the interface and interaction design. Browse translucent garment cards, select with a hand pinch, use “Hey Meta” voice commands, save clothing photographs, and preview clothing over the live mirror.

## Run on Windows

Requires Node.js 22.12+ (Node 24 recommended). From this directory:

```powershell
npm.cmd ci
npm.cmd run prepare:models
npm.cmd run build
npm.cmd start
```

Open **http://localhost:8787**. Alternatively, run `./start.ps1` from PowerShell. For development, `npm.cmd run dev` serves the interface at http://localhost:5173.

Click **Browse shirts** to explore without hardware, or **Start mirror and voice** for the live mirror. Camera and microphone access begin after you choose to start. The mirror opens with the wardrobe tucked away and the assistant in the upper-right corner. Mouse, touch, keyboard and the command box are available alongside gestures.

Say **“Wake up Meta, daddy’s home”** for a short musical cue, a greeting and current weather if a city has been configured. Say **“Let’s try on some clothes”** to open the wardrobe. Configure the weather city and coordinates in `.env` to use [Open-Meteo](https://open-meteo.com/). The optional `AURA_WAKE_MUSIC` setting points to a local audio file. Aura plays an original chime by default.

On the original Windows machine, **Settings → Hear Aura** plays the local Kokoro British voice. The configured build reuses existing local model files. On a new machine, follow the free voice setup in [SETUP](docs/SETUP.md) or use the browser voice fallback.

With the camera on, hold a garment in the centre and say **“Hey Meta, try what I’m holding.”** Check the image and category, then choose **Try without saving** for a temporary overlay or **Save to closet** to keep it. A plain contrasting background gives a cleaner cutout. For an existing garment, select its closet card or say its name.

## What runs without accounts

- Camera mirror, persistent local closet, photo upload/capture and category selection.
- Local MediaPipe hand detection and pinch selection after enabling gestures.
- Transparent clothing illustrations and live image overlays with manual alignment or optional shoulder/hip anchors.
- Typed command routing; browser voice recognition where supported.
- Free Kokoro British English voice when its local model is installed. Browser synthesis is the fallback.
- Simple edge-connected plain-background removal, best with a contrasting garment against an evenly lit wall. This is not semantic garment segmentation.

## What requires configuration

- **Meta:** Muse Spark 1.3 classifies a captured garment when you click **Suggest details** and provides image-grounded outfit advice on request. Set `MODEL_API_KEY` in `.env`.
- **ElevenLabs (optional):** British baritone speech through a server-side API. Set `ELEVENLABS_API_KEY` and clear `LOCAL_TTS_URL`; default voice is Eldrin. Account access/quota may be required.
- **Generated try-on:** FASHN runs on a Windows CPU in reduced resolution or on a CUDA GPU at full resolution. See [setup](docs/SETUP.md#photorealistic-try-on).
- **Whisper:** an optional whisper.cpp HTTP transcription server, separate from the browser speech recognizer. This is not an integration with the Wispr Flow desktop application.

See [setup and hardware migration](docs/SETUP.md), [architecture](docs/ARCHITECTURE.md), [research and licenses](docs/RESEARCH.md), and [validation](docs/VALIDATION.md).

**Try on live** fits a shirt photo to the clothing region of your camera view. Use either starter T-shirt photo, choose a saved top, or capture or upload your own. You can stay seated with your face, shoulders and chest in view. **Render a photo** opens the separate still photo tool.

## Local data

Wardrobe metadata is stored in `.data/closet.json`. Garment and generated pictures are in `.data/media/`. Back up this folder together. The two sample T-shirt photos are bundled separately. Store secrets in `.env`, which is ignored by Git.

The API binds to loopback by default. Camera video stays in the browser unless you explicitly capture a garment, save an image or request Meta visual advice or generated try-on. Meta image requests and generated try-on send the captured frame to your configured service. Kokoro runs on this computer; ElevenLabs receives response text only if configured. Browser speech recognition may use your browser vendor's remote service while listening is enabled.

## Checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit
```

The end-to-end suite uses an isolated Chrome session and synthetic camera/audio devices. It never accesses your real webcam or microphone. Physical hand accuracy and recognition in your room still need a real hardware check.

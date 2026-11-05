# Shared integration contract

Frontend owns `src/`, public illustrative SVG assets. Backend owns `server/`, `tests/`, `tryon/`, `pi/`, root configuration and documentation. Do not modify each other's files.

All API responses are JSON except /api/voice (audio). Errors are `{error:string}` with non-2xx status. Image data URLs accept PNG/JPEG/WebP only; max 12 MB decoded.

- GET /api/health -> {ok:true}
- GET /api/config -> {vision:{provider:'local'|'meta',ready:boolean},voice:{provider:'browser'|'elevenlabs'|'kokoro',ready:boolean,voiceId?:string},tryon:{provider:'overlay'|'fashn-local',ready:boolean,cpu:boolean},camera:{source:'browser'|'stream',streamUrl?:string},speech:{provider:'browser'|'whisper',ready:boolean},gestures:{modelUrl:string,poseModelUrl?:string,wasmPath:string}}
- GET /api/closet -> {items: ClosetItem[]}
- POST /api/closet -> {item:ClosetItem}; body {name:string,category:'shirts'|'pants'|'jackets',color?:string,imageDataUrl:string,removeBackground?:boolean}. Stores on disk persistently. Uses manual category from dialog; can first classify.
- PATCH /api/closet/:id -> {item:ClosetItem}; {name?,category?,color?}
- DELETE /api/closet/:id -> {ok:true}
- POST /api/classify -> {name:string,category:'shirts'|'pants'|'jackets',color:string,provider:'manual'|'meta',message?:string}; body {imageDataUrl:string}. If no Meta key returns manual provider: user must confirm/edit suggested category; do not claim AI identified garment.
- POST /api/assistant -> {text:string,provider:'local'|'meta'}; body {message:string,selectedItemId?:string,imageDataUrl?:string}. Local helpful responses when no key; Meta multimodal when configured. Client routes known closet commands locally first.
- POST /api/garment-preview -> {imageDataUrl:string}; body {imageDataUrl:string,removeBackground?:boolean}. Normalizes a temporary garment image without writing to the closet.
- POST /api/voice -> audio/wav (Kokoro), audio/mpeg (ElevenLabs) or 503 JSON; body {text:string}. Browser speech synthesis is a client fallback. Never send secrets to client.
- POST /api/tryon returns {imageUrl:string,provider:'fashn-local',label:string}. Send personImageDataUrl with either itemId or garmentImageDataUrl and category. The latter uses a captured garment without saving it to the closet. Generation requires a configured FASHN service and an explicit user action.
- POST /api/transcribe -> {text:string,provider:'whisper'}; body {audioDataUrl:string}; 503 if not configured. Optional MediaRecorder to local Whisper-compatible server, browser recognition default.

ClosetItem = {id:string,name:string,category:'shirts'|'pants'|'jackets',color:string,imageUrl:string,createdAt:string,source:'demo'|'camera'}. Seed six curated items with bundled transparent SVG imageUrl under /demo/. Real upload is stored under /media/<uuid>.png. Demo illustrations must be visually good garment cutouts and labelled sample closet.

Do not call Meta/OpenAI/ElevenLabs directly from client. Only getUserMedia after a clear Start camera click; browser mic explicit Listen button. SpeechRecognition may use browser cloud recognition; label this in settings. Hey Meta wake phrase only processed while voice listening is enabled. Stop listening / camera controls release resources. Do not start hardware from Playwright automated tests.

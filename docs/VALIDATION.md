# Validation — 4 November 2026

Claude built the mirror interface and six original transparent garment SVGs. Codex implemented the server, provider adapters, Raspberry Pi and GPU service wrappers, and the local Kokoro integration. Both checked the running browser app.

| Check | Result |
| --- | --- |
| TypeScript and Vite production build | Passed |
| Node test suite | 16 passed: upload validation, transparent background cleanup, persistence and concurrency, mocked Meta and FASHN contracts, voice command parsing, mirrored pointer and pose math |
| Playwright Chrome | 9 passed: hardware off by default, demo closet, typed commands, photo upload/edit/delete and reload, denied camera handling, synthetic camera capture, honest unconfigured try-on, wake phrase routing, responsive layout, MediaPipe model loading and release, unsaved held-garment preview |
| Local voice end to end | Real Kokoro `bm_george` ran through `/api/voice`; valid PCM WAV, 24 kHz, 4.25 seconds, peak 0.523. First synthesis through Aura about 4.05 seconds on the Windows host; repeated replies are cached. A muted headless Chrome run confirmed WAV playback started and ended. |
| Dependency audit | No vulnerabilities reported by npm audit at build time |
| Python adapter syntax | Pi camera, FASHN service and Kokoro service parsed successfully |

The desktop demo and mobile layout were visually checked. Browser tests used synthetic camera frames and simulated recognition transcripts. Physical hand selection, pose alignment, real-room wake recognition and the Pi camera require an in-person check. The Meta HTTP contract used a local test server. Live overlays and local voice run without external services.

## Local CPU try-on

Live try-on runs clothing segmentation and pose detection in a browser worker. The browser follows small shoulder and chest movements between mask updates and draws an opaque replacement over detected clothing. A moving seated test frame rendered at about 25 frames per second on this PC, with the original chest graphic covered. The camera feed and all inference stayed local. The preview estimates fit from visible shoulders and clothing boundaries, so physical sizing and changes in sleeve length remain approximate.

Aura’s `/api/tryon` accepted separate public sample photos of a person and a shirt, ran FASHN offline on a Ryzen 7 7730U, and served the generated PNG in 9 minutes 39 seconds including first-request model loading. The tested preset used a 384 × 576 canvas and 20 float32 sampling steps. The sample preserved the person and showed the dark top, with remnants of the original garment at the waist and minor background distortion. The browser tests exercised garment capture, temporary preview, separate portrait capture and result display with a stubbed model response.

The revised preset uses a 336 × 504 canvas, 12 float32 steps and clothing masking for tops. The close-framed crop-top test took 4 minutes 17 seconds and still showed visible artifacts. The [seated-photo test](https://commons.wikimedia.org/wiki/File:White_T_shirt.jpg) used the bundled charcoal tee and took 5 minutes 10 seconds. It removed the original white collar and sleeves in the preview, with distortions around the arms and logo. The real camera was not used.

Hardware smoke check: turn on the camera, hold one hand fully in frame and pinch over a category; turn on Follow my body and stand back; start listening and say “Hey Meta, show jackets”; hold a garment against a plain wall, try it without saving, then save it under the chosen category.

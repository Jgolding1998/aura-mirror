# Third-party notices

Aura application source and original sample garment illustrations are under the root MIT license. Third-party code, binaries and model assets keep their own licenses.

- The two bundled T-shirt photographs are unmodified images by Daniel Furon for the Wikimedia Foundation, licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The originals are [Charcoal Graphic Tee](https://commons.wikimedia.org/wiki/File:BlueIEditShirt-plainBackground.jpeg) and [Royal Blue Graphic Tee](https://commons.wikimedia.org/wiki/File:GlobeTeeRoyal.jpg).
- The bundled live clothing segmentation model is Google's SelfieMulticlass model under the Apache 2.0 license. [Model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf)

- MediaPipe Tasks Vision 0.10.32, Google: Apache-2.0. The browser runtime WASM is copied from the NPM package; hand-landmarker model is downloaded from Google's MediaPipe model bucket. Provenance and file hashes are in `public/models/manifest.json`. Upstream license: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
- React and React DOM, Meta: MIT.
- Optional current weather data is provided by [Open-Meteo](https://open-meteo.com/).
- Lucide icons: ISC. https://github.com/lucide-icons/lucide/blob/main/LICENSE
- Express, dotenv, Vite, TypeScript, concurrently and Playwright: retain upstream dependency notices through the locked NPM packages.
- Sharp: Apache-2.0; its prebuilt native components include third-party libraries with their own notices in the installed packages.
- FASHN VTON 1.5 is an optional external installation, not bundled in this source distribution. Its code/model and third-party components remain under their upstream licenses: https://github.com/fashn-AI/fashn-vton-1.5
- Picamera2 and whisper.cpp are optional external installations, not bundled.
- Kokoro-82M (Apache-2.0) and kokoro-onnx (MIT) are optional external installations. Existing local models are reused where configured; the source zip does not include the voice weights. https://huggingface.co/hexgrad/Kokoro-82M and https://github.com/thewh1teagle/kokoro-onnx

No model training data, third-party fashion photographs, celebrity voice clones or upstream GPU model weights are included. ElevenLabs and Meta APIs are services governed by their account terms; this source license does not grant access to them.

# Aura Mirror on Raspberry Pi OS

Run Aura on a Raspberry Pi with an HDMI display and a USB webcam, with the browser and the server both on the Pi.

The launcher was checked with a stand-in browser. Camera permissions, audio and frame rate still need a test on the physical Pi.

## What you need

- 64-bit Raspberry Pi OS with the graphical desktop, signed in as a normal user. Chromium normally comes with it.
- A display on HDMI, a USB webcam, and a keyboard and mouse for setup.
- Node.js 22.12 or newer for ARM64. Node 24 is recommended.

Live top try-on needs no account, API key, paid service or GPU. It runs in the browser using the model files included in `public/models`.

## 1. Copy the project to the Pi

Clone the public source on the Pi. This gives you the model files and source without Windows-specific dependencies or local keys.

```bash
git clone https://github.com/Jgolding1998/aura-mirror.git ~/aura-mirror
```

To bring your closet across, also copy `.data/` into the project. It holds your closet records and photos, so keep it private.

## 2. Install Node.js for your user

Check for an existing version first:

```bash
node -v
node -p process.arch   # should print arm64
```

If it is older than 22.12, Raspberry Pi OS's own package may be too old. This installs the official ARM64 build for your user only, with no `sudo`:

```bash
base=https://nodejs.org/dist/latest-v22.x
cd /tmp
curl -fsSLO "$base/SHASUMS256.txt"
file=$(awk '/linux-arm64\.tar\.xz$/ {print $2}' SHASUMS256.txt)
curl -fsSLO "$base/$file"
grep " $file\$" SHASUMS256.txt | sha256sum -c -
mkdir -p ~/.local/node
tar -xJf "$file" -C ~/.local/node --strip-components=1
export PATH="$HOME/.local/node/bin:$PATH"
```

To keep it for future terminals, add that `export` line to `~/.bashrc`.

## 3. Build on the Pi

```bash
cd ~/aura-mirror
npm ci
npm run build
```

Run `npm run prepare:models` only if the launcher says models are missing. It downloads any that are absent and copies the browser runtime files. If the build runs out of memory on a smaller board, close other apps and try again.

## 4. Optional: create a local `.env`

Aura runs without a `.env`. Create one only if you want to change settings or add your own keys:

```bash
cp .env.example .env
nano .env
```

Keep the file on the Pi and never put keys in a `VITE_` variable. For this setup:

- Leave `CAMERA_STREAM_URL` empty so the browser uses the USB webcam directly.
- Leave `TRYON_SERVICE_URL`, `START_LOCAL_TRYON` and `START_LOCAL_VOICE` unset. Live top try-on does not need them.
- Set `AURA_WEATHER_*` only if you want weather in the welcome briefing.

## 5. Check the webcam

```bash
lsusb                  # the webcam should be listed
ls -l /dev/video*      # video devices should exist
groups                 # should include "video"
```

For a clearer list, `v4l2-ctl --list-devices` names each device. It comes from the optional `v4l-utils` package. A Pi can show several `/dev/video*` entries that are not cameras, so don't use the count as a test.

If the camera is listed but won't start, close other apps using it and try another USB port. Use a powered hub if the webcam keeps disconnecting.

## 6. Run it

Open a terminal **on the Pi desktop**, not over plain SSH:

```bash
cd ~/aura-mirror
bash pi/launch-mirror.sh --check   # reports readiness; starts nothing
bash pi/launch-mirror.sh
```

The launcher:

1. Checks the desktop session, Node, Chromium and the build.
2. Reuses Aura if it already answers on the port. If another program has the port, it stops with a message and leaves that program alone.
3. Otherwise starts `node server/index.mjs` on `127.0.0.1`, waiting up to 45 seconds for it to become healthy.
4. Opens `http://localhost:8787/` in Chromium's kiosk mode.

To exit, press **Alt+F4**, or **Ctrl+C** in the terminal. A server the launcher started stops with it. A server that was already running keeps going.

| Setting | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Port to check and use. Takes priority over `PORT` in `.env`. |
| `AURA_BROWSER_MODE` | `kiosk` | Use `app` for a window with the browser's site controls. |
| `AURA_HEALTH_TIMEOUT` | `45` | Seconds to wait for the server. |

```bash
PORT=8788 AURA_BROWSER_MODE=app bash pi/launch-mirror.sh
```

On a port other than 8787, the launcher allows that port's loopback addresses, unless `ALLOWED_ORIGINS` is already set in the shell. That replaces any `ALLOWED_ORIGINS` value in `.env` for that run.

Logs and browser data are kept in `~/.local/state/aura-mirror/`.

## Camera and microphone permissions

The launcher grants nothing. Chromium asks you, and you decide. The app requests the camera only after you choose to start it.

Aura keeps its browser permissions in a separate Chromium profile. If the prompt doesn't appear in kiosk mode, run with `AURA_BROWSER_MODE=app` and check the site's permissions.

## Features without keys

| Feature | Without keys or a GPU |
| --- | --- |
| Live try-on for tops | Works, using a browser overlay. Fit is approximate. |
| Closet, photos and uploads | Works, stored locally in `.data/`. |
| Hand tracking | Works, using local models. Smoothness on your Pi is unmeasured. |
| Mouse, touch, keyboard, typed commands | Works. |
| Rendered photo try-on, including the jeans | Unavailable. Needs a separate FASHN service, which is not a good fit for a Pi. |
| Voice | See below. |

The app asks the webcam for up to 1920×1080. If live tracking is slow, try a lower-resolution webcam and close other apps. There is no launcher setting for this.

## Voice limitations and the typed fallback

**Expect voice input may not work on the Pi.** Listening uses the browser's Web Speech API, and Chromium builds for Linux often have no speech service behind it. If so, Aura reports that the speech service could not be reached.

- A Pi has no built-in microphone, so you need a USB one. Speech may be sent to the browser vendor's cloud service.
- "Hey Meta" is heard only while listening is on. There is no always-on wake word.
- Setting `WHISPER_URL` does not fix this today. The server can forward audio to Whisper, but the app has no in-browser recording mode that uses it.
- Spoken replies use the browser's voices unless you configure another provider. The Pi may have no British voice, and Aura won't present a different accent as British. ElevenLabs is optional and uses your own key. The local Kokoro voice has not been tried on a Pi.

**Typed fallback:** choose **Type a command** on the mirror, or use the command box. Typed commands, mouse, touch and keyboard all work without a microphone, so keep a keyboard or touch input attached.

## Optional: start when you sign in

The launcher does not set this up. If you want it, create `~/.config/autostart/aura-mirror.desktop` yourself, replacing `YOU` with your username:

```ini
[Desktop Entry]
Type=Application
Name=Aura Mirror
Exec=env PATH=/home/YOU/.local/node/bin:/usr/local/bin:/usr/bin:/bin bash /home/YOU/aura-mirror/pi/launch-mirror.sh
X-GNOME-Autostart-enabled=true
```

Test the launcher by hand first. This has not been tried on a Pi, and support can vary by desktop session. To turn it off, delete the file. Without a terminal, use the logs to troubleshoot, and exit with Alt+F4.

## Troubleshooting

| Message or symptom | What to do |
| --- | --- |
| `no graphical session found` | Run it from a terminal on the Pi desktop. |
| Node.js is missing or older than 22.12 | Repeat step 2 and check `PATH` in this terminal. |
| `port ... is used by something else` | Use another port: `PORT=8788 bash pi/launch-mirror.sh`. |
| `rejects the browser's origin` | Add `http://localhost:<port>` to `ALLOWED_ORIGINS`, then restart the server. |
| `not healthy` or `exited during startup` | Read `~/.local/state/aura-mirror/server.log`. A `sharp` error usually means `node_modules` came from another platform: delete it and run `npm ci`. |
| No window opens | Read `~/.local/state/aura-mirror/browser.log`. |
| Black camera view | Repeat step 5, then check the permission as described above. |

Don't forward this port to the internet or expose it on your network. Using a phone or another computer needs HTTPS or private networking and is not covered here; see `docs/SETUP.md`.

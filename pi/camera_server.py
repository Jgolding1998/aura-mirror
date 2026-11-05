"""Loopback MJPEG/snapshot camera for Raspberry Pi Camera Module + Picamera2.

Use Raspberry Pi OS system Python (apt install python3-picamera2).
No photos are stored by this process. Ctrl+C stops the camera.
"""
import argparse
import io
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--origin", action="append", default=["http://localhost:8787", "http://127.0.0.1:8787", "http://localhost:5173", "http://127.0.0.1:5173"])
    args = parser.parse_args()
    from picamera2 import Picamera2
    from PIL import Image
    condition = threading.Condition()
    latest = {"frame": None, "sequence": 0, "running": True}
    camera = Picamera2()
    camera.configure(camera.create_video_configuration(main={"size": (1280, 720), "format": "RGB888"}, controls={"FrameRate": 15}))

    def capture():
        while latest["running"]:
            frame = camera.capture_array()
            # Picamera2 RGB888 arrays use BGR channel order.
            output = io.BytesIO()
            Image.fromarray(frame[:, :, ::-1]).save(output, format="JPEG", quality=82)
            with condition:
                latest["frame"] = output.getvalue()
                latest["sequence"] += 1
                condition.notify_all()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            origin = self.headers.get("Origin")
            if origin and origin not in args.origin:
                self.send_error(403, "Origin is not allowed")
                return
            route = urlsplit(self.path).path
            if route not in {"/stream.mjpg", "/snapshot.jpg", "/health"}:
                self.send_error(404)
                return
            self.send_response(200)
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Type", "application/json" if route == "/health" else "image/jpeg" if route == "/snapshot.jpg" else "multipart/x-mixed-replace; boundary=FRAME")
            self.end_headers()
            if route == "/health":
                self.wfile.write(b'{"ok":true}')
                return
            sequence = -1
            try:
                while latest["running"]:
                    with condition:
                        condition.wait_for(lambda: latest["sequence"] != sequence and latest["frame"] is not None, timeout=5)
                        frame, sequence = latest["frame"], latest["sequence"]
                    if not frame:
                        continue
                    if route == "/snapshot.jpg":
                        self.wfile.write(frame)
                        return
                    self.wfile.write(b"--FRAME\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n")
            except (BrokenPipeError, ConnectionResetError):
                pass

    camera.start()
    thread = threading.Thread(target=capture, daemon=True)
    thread.start()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    print(f"Pi camera: http://{args.host}:{args.port}/stream.mjpg")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        latest["running"] = False
        server.server_close()
        thread.join(timeout=2)
        camera.stop()
        camera.close()


if __name__ == "__main__":
    main()

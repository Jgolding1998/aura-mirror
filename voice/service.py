"""CPU-only, local British voice using Kokoro ONNX. No API key or cloud calls."""
import argparse
import io
import json
import os
import pathlib
import threading
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def main():
    root = pathlib.Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8791)
    args = parser.parse_args()
    model = os.environ.get('KOKORO_MODEL_PATH', str(root / '.data' / 'voice' / 'kokoro-v1.0.onnx'))
    voices = os.environ.get('KOKORO_VOICES_PATH', str(root / '.data' / 'voice' / 'voices-v1.0.bin'))
    if not pathlib.Path(model).is_file() or not pathlib.Path(voices).is_file():
        raise SystemExit('Kokoro models are missing. Run python voice/download_models.py first.')
    from kokoro_onnx import Kokoro
    import onnxruntime as ort
    import soundfile as sf
    options = ort.SessionOptions()
    options.intra_op_num_threads = max(1, min(8, int(os.environ.get('KOKORO_THREADS', '3'))))
    options.inter_op_num_threads = 1
    options.add_session_config_entry('session.intra_op.allow_spinning', '0')
    session = ort.InferenceSession(model, sess_options=options, providers=['CPUExecutionProvider'])
    synth = Kokoro.from_session(session, voices)
    lock = threading.Lock()
    voice = os.environ.get('KOKORO_VOICE', 'bm_george')

    @lru_cache(maxsize=32)
    def speak(text):
        samples, rate = synth.create(text, voice=voice, speed=0.97, lang='en-gb')
        stream = io.BytesIO()
        sf.write(stream, samples, rate, format='WAV', subtype='PCM_16')
        return stream.getvalue()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != '/health':
                self.send_error(404)
                return
            body = json.dumps({'ok': True, 'provider': 'kokoro', 'voice': voice}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path != '/speak':
                self.send_error(404)
                return
            # Only Node should call this loopback service, never a remote browser.
            if self.headers.get('Origin'):
                self.send_error(403)
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size < 10000:
                    self.send_error(413)
                    return
                data = json.loads(self.rfile.read(size))
                text = data.get('text')
                if not isinstance(text, str) or not 0 < len(text.strip()) <= 1500:
                    self.send_error(400)
                    return
            except (ValueError, TypeError, AttributeError):
                self.send_error(400)
                return
            if not lock.acquire(blocking=False):
                self.send_error(429, 'Voice is busy')
                return
            try:
                body = speak(text.strip())
                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as e:
                print(f'Voice generation failed: {type(e).__name__}', flush=True)
                self.send_error(500, 'Voice generation failed')
            finally:
                lock.release()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    print(f'Kokoro British voice ({voice}) ready at http://{args.host}:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()

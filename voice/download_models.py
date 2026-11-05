"""Download official Kokoro ONNX release assets; record provenance and hashes."""
import hashlib
import json
import pathlib
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
target = root / '.data' / 'voice'
target.mkdir(parents=True, exist_ok=True)
base = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
records = []
for filename in ('kokoro-v1.0.onnx', 'voices-v1.0.bin'):
    destination = target / filename
    if not destination.exists():
        print(f'Downloading {filename}', flush=True)
        temporary = destination.with_suffix(destination.suffix + '.download')
        urllib.request.urlretrieve(base + filename, temporary)
        temporary.replace(destination)
    digest = hashlib.file_digest(destination.open('rb'), 'sha256').hexdigest()
    records.append({'file': filename, 'source': base + filename, 'sha256': digest})
(target / 'manifest.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print('Kokoro models ready. Start python voice/service.py', flush=True)

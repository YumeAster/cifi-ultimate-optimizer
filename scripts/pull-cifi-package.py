"""Read only the installed CIFI APK pair through LDPlayer's documented shell.

No game save, credentials, settings or other package is accessed. Raw packages
remain in the ignored work/ directory and are not deployed with the web app.
"""
import argparse
import base64
import hashlib
import io
import json
import shlex
from pathlib import Path
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--ld', required=True)
parser.add_argument('--package-root', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
if not args.package_root.startswith('/data/app/com.OctocubeGamesCompany.CIFI-') or not args.package_root.endswith('/') or '..' in args.package_root:
    raise SystemExit('Not the inspected CIFI package directory')
output = Path(args.output).resolve()
allowed = (Path(__file__).resolve().parents[1] / 'work').resolve()
if not output.is_relative_to(allowed) or output == allowed:
    raise SystemExit('Package output must be a dedicated work/ subdirectory')
output.mkdir(parents=True, exist_ok=True)
for name in ['base.apk', 'split_config.x86_64.apk']:
    source = args.package_root + name
    command = [args.ld, '-s', '0']
    digest_output = subprocess.run(command + ['sha256sum', source], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode('ascii').strip()
    expected = digest_output.split()[0].lower()
    if len(expected) != 64 or any(c not in '0123456789abcdef' for c in expected):
        raise SystemExit('Invalid source hash')
    target = output / name
    if target.exists():
        digest = hashlib.file_digest(target.open('rb'), 'sha256').hexdigest()
        if digest != expected:
            raise SystemExit('Existing package differs; will not overwrite')
        print(json.dumps({'file': str(target), 'sha256': digest, 'reused': True}), flush=True)
        continue
    # LDPlayer may truncate one very large stdout response without an error.
    # Read bounded chunks and verify both byte counts and the Android hash.
    size_text = subprocess.run(command + ['stat', '-c', '%s', source], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode('ascii').strip()
    size = int(size_text)
    block_size = 1024 * 1024
    payload = bytearray()
    for offset in range(0, size, block_size):
        block = offset // block_size
        expected_length = min(block_size, size - offset)
        query = f'dd if={shlex.quote(source)} bs={block_size} skip={block} count=1 2>/dev/null | base64'
        chunk = None
        for attempt in range(3):
            encoded = subprocess.run(command + [query], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
            try:
                chunk = base64.b64decode(b''.join(encoded.split()), validate=True)
            except ValueError:
                chunk = None
            if chunk is not None and len(chunk) == expected_length:
                break
        else:
            raise SystemExit(f'Incomplete APK read at block {block}')
        payload.extend(chunk)
        if block % 16 == 0:
            print(json.dumps({'file': name, 'readBytes': len(payload), 'totalBytes': size}), flush=True)
    digest = hashlib.sha256(payload).hexdigest()
    if digest != expected or not zipfile.is_zipfile(io.BytesIO(payload)):
        raise SystemExit('Package integrity verification failed')
    with target.open('xb') as stream:
        stream.write(payload)
    print(json.dumps({'file': str(target), 'bytes': len(payload), 'sha256': digest, 'reused': False}), flush=True)

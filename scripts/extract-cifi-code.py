"""Extract only static CIFI metadata/native code from the verified APK pair."""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import zipfile

root = Path(__file__).resolve().parents[1] / 'work' / 'cifi-static-0.7.3.63'
output = root / 'code'
output.mkdir(exist_ok=True)
for apk, member, filename in [
    ('base.apk', 'assets/bin/Data/Managed/Metadata/global-metadata.dat', 'global-metadata.dat'),
    ('split_config.x86_64.apk', 'lib/x86_64/libil2cpp.so', 'libil2cpp.so'),
]:
    target = output / filename
    with zipfile.ZipFile(root / apk) as archive:
        if not target.exists():
            with archive.open(member) as source, target.open('xb') as destination:
                shutil.copyfileobj(source, destination)
        if target.stat().st_size != archive.getinfo(member).file_size:
            raise SystemExit('Extracted member size mismatch')
    with target.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    print(json.dumps({'file': str(target), 'sha256': digest, 'bytes': target.stat().st_size}))
with (output / 'global-metadata.dat').open('rb') as source:
    print(json.dumps({'metadataMagicAndVersion': struct.unpack('<II', source.read(8))}))

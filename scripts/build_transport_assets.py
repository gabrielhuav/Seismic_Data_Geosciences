"""Package deterministic gzip transport copies without changing source JSON bytes."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'system/dist'
MANIFEST = 'data/transport-manifest.json'

def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def compressed(raw: bytes) -> bytes:
    buffer = io.BytesIO()
    # An empty stored filename, mtime=0 and GzipFile's OS=255 header are portable.
    with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, compresslevel=9, mtime=0) as stream:
        stream.write(raw)
    return buffer.getvalue()

def build(dist: Path = DIST, verify_only: bool = False) -> dict:
    files = sorted(p for p in (dist / 'data').rglob('*')
                   if p.is_file() and p.suffix in {'.json', '.geojson'}
                   and p.relative_to(dist).as_posix() != MANIFEST)
    assets = []
    for path in files:
        raw = path.read_bytes()
        # Verify that transport copies represent structured UTF-8 data, not arbitrary files.
        json.loads(raw.decode('utf-8'))
        gz = compressed(raw)
        target = path.with_name(path.name + '.gz')
        if verify_only:
            if not target.is_file() or target.read_bytes() != gz:
                raise ValueError(f'Gzip transport differs: {target.relative_to(dist)}')
        else:
            target.write_bytes(gz)
        assets.append({'path': path.relative_to(dist).as_posix(), 'bytes': len(raw),
                       'sha256': digest(raw), 'gzip': {'path': target.relative_to(dist).as_posix(),
                       'bytes': len(gz), 'sha256': digest(gz)}})
    manifest = {'schema': 'seismic-transport/1',
                'compression': 'gzip level 9; empty filename; mtime 0; OS 255',
                'integrity': 'Verify compressed and original byte length/SHA-256; source files remain unchanged.',
                'assets': assets}
    body = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')
    target = dist / MANIFEST
    if verify_only:
        if not target.is_file() or target.read_bytes() != body:
            raise ValueError('Transport manifest differs from the preserved source files')
    else:
        target.write_bytes(body)
    return {'manifest': MANIFEST, 'manifest_sha256': digest(body), 'manifest_bytes': len(body),
            'assets': len(assets), 'original_bytes': sum(x['bytes'] for x in assets),
            'gzip_bytes': sum(x['gzip']['bytes'] for x in assets),
            'mode': 'verify-only' if verify_only else 'build'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    print(json.dumps(build(verify_only=args.verify_only), sort_keys=True))

if __name__ == '__main__':
    main()

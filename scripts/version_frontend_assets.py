"""Bind local code, styles and interface images to their exact bytes, without data edits."""
from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'system/dist'


def versioned_html(text):
    def replace(match):
        prefix, target = match.groups()
        if target.startswith(('vendor/', 'http:', 'https:', '/')):
            return match.group(0)
        name = target.split('?', 1)[0]
        path = (DIST / name).resolve()
        if not path.is_relative_to(DIST.resolve()) or not path.is_file():
            raise ValueError('Missing local frontend dependency: ' + name)
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
        return prefix + name + '?v=' + checksum + '"'
    return re.sub(r'((?:src|href|data)=")([^"#]+\.(?:js|css|svg|png|jpe?g|webp|ico)(?:\?[^"#]*)?)"', replace, text)


def main():
    path = DIST / 'index.html'
    text = path.read_text(encoding='utf-8')
    marker = '<script src="app.js'
    for dependency in ('history-explorer.js', 'quick-start.js'):
        if f'<script src="{dependency}' not in text:
            at = text.index(marker)
            text = text[:at] + f'<script src="{dependency}" defer></script>' + text[at:]
    text = text.replace('2026.11 · review', '2026.11.10 · review')
    path.write_text(versioned_html(text), encoding='utf-8', newline='\n')
    print('Entry page bound to local code, styles and interface-image SHA-256 prefixes; source data unchanged.')


if __name__ == '__main__':
    main()

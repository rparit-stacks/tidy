#!/bin/bash
# Builds a signed (ad-hoc) .app and wraps it in a drag-to-Applications DMG with the ring artwork.  Usage: npm run dmg
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=$(node -p "require('./package.json').productName || 'Tidy'")
VER=$(node -p "require('./package.json').version")
ARCH=${ARCH:-$(uname -m | sed 's/x86_64/x64/')}
OUT=dist; rm -rf "$OUT/$NAME-darwin-$ARCH"; mkdir -p "$OUT"

env -u ELECTRON_RUN_AS_NODE npx electron-packager . "$NAME" --platform=darwin --arch="$ARCH" --out="$OUT" --overwrite \
  --app-bundle-id="$(node -p "require('./package.json').appId || 'com.example.tidy'")" --icon=assets/icon.icns \
  --ignore='^/(dist|scripts|assets/(icon-1024|dmg-bg(@2x)?)\.png|assets/dmg-background\.tiff|\.agents|\.claude|\.github|\.venv-dmg|mac_cleaner_app_prompt\.md|skills-lock\.json|README\.md|LICENSE)'
APP="$OUT/$NAME-darwin-$ARCH/$NAME.app"
codesign --force --deep --sign - "$APP"

# installer artwork + layout (dmgbuild lays the window out without opening Finder)
[ -x .venv-dmg/bin/dmgbuild ] || { python3 -m venv .venv-dmg && .venv-dmg/bin/pip install -q dmgbuild; }
env -u ELECTRON_RUN_AS_NODE npx electron scripts/make-dmg-bg.js 2>&1 | grep -v rendezvous || true
DMG="$OUT/$NAME-$VER-$ARCH.dmg"; rm -f "$DMG"
.venv-dmg/bin/dmgbuild -s scripts/dmg-settings.py -D app="$APP" -D bg=assets/dmg-background.tiff -D icon=assets/icon.icns "$NAME" "$DMG"
hdiutil verify "$DMG" >/dev/null && echo "OK  $DMG  ($(du -h "$DMG" | cut -f1))"

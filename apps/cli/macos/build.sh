#!/bin/bash
# Builds dist/UsageFleet.app, the macOS notifier the npm package ships. Needs Xcode.
set -euo pipefail
cd "$(dirname "$0")"

app=../dist/UsageFleet.app
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp Info.plist "$app/Contents/"
cp AppIcon.icns "$app/Contents/Resources/"
for arch in arm64 x86_64; do
	xcrun swiftc -O -swift-version 5 -target "$arch-apple-macos11" notifier.swift -o "$tmp/$arch"
done
lipo -create "$tmp/arm64" "$tmp/x86_64" -output "$app/Contents/MacOS/usagefleet-notifier"
# Ad-hoc is enough: npm sets no quarantine flag, so Gatekeeper never assesses the app.
codesign --force --sign - "$app"

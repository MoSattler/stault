#!/bin/sh
# Renders assets/icon.svg into the app icons the build reads (electrobun.config.ts).
# Run after editing the SVG and commit the results. Needs rsvg-convert and ImageMagick.
set -eu
cd "$(dirname "$0")/../assets"

# Windows and Linux: the tile fills the canvas.
rsvg-convert -w 512 icon.svg -o icon.png

# macOS: the tile sits on Apple's icon grid (824 px inside a 1024 px canvas).
mac=$(mktemp -t stault-icon).png
rsvg-convert -w 824 icon.svg | magick - -background none -gravity center -extent 1024x1024 "$mac"
rm -rf icon.iconset
mkdir icon.iconset
for size in 16 32 128 256 512; do
	magick "$mac" -resize "${size}x${size}" "icon.iconset/icon_${size}x${size}.png"
	magick "$mac" -resize "$((size * 2))x$((size * 2))" "icon.iconset/icon_${size}x${size}@2x.png"
done
rm "$mac"

#!/usr/bin/env bash
# Runs the on-device instrumentation tests (widget rendering) and collects the rendered PNGs.
set -u
OUT=android-smoke
mkdir -p "$OUT/widgets"
log=$(adb shell am instrument -w com.phacharapol.dayplanner.test/androidx.test.runner.AndroidJUnitRunner 2>&1)
echo "$log" | tail -n 40
adb pull /sdcard/Android/data/com.phacharapol.dayplanner/files/widgets/. "$OUT/widgets/" >/dev/null 2>&1 || true
ls -la "$OUT/widgets" || true
# Inline the renders in the log (base64) so they can be reviewed without downloading artifacts.
for f in "$OUT"/widgets/*.png; do
  [ -f "$f" ] || continue
  echo "::group::png $(basename "$f")"
  echo "PNG-BEGIN $(basename "$f")"
  base64 -w 0 "$f"; echo
  echo "PNG-END"
  echo "::endgroup::"
done
echo "$log" | grep -q "^OK (" || { echo "Instrumentation tests failed"; exit 1; }

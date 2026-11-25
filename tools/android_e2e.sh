#!/usr/bin/env bash
# Chạy trong máy ảo Android (GitHub Actions): cài APK debug, mở app, nối DevTools của WebView, chạy android_e2e.mjs.
set -u
mkdir -p e2e
APK=android/app/build/outputs/apk/debug/app-debug.apk
ls -la "$APK"
adb shell getprop ro.build.version.release
adb shell dumpsys package com.google.android.webview | grep -m1 versionName || true
adb install -r "$APK"
adb shell am start -n app.docsongngu/.MainActivity
PID=""
for i in $(seq 1 60); do
  PID=$(adb shell pidof app.docsongngu | tr -d '\r')
  [ -n "$PID" ] && break
  sleep 1
done
echo "app pid: $PID"
for i in $(seq 1 60); do
  adb shell cat /proc/net/unix 2>/dev/null | grep -q "webview_devtools_remote_$PID" && break
  sleep 1
done
adb forward tcp:9222 "localabstract:webview_devtools_remote_$PID"
node tools/android_e2e.mjs 9222 e2e
CODE=$?
adb logcat -d > e2e/logcat_full.txt 2>&1 || true
grep -aE "Capacitor|chromium|AndroidRuntime|docsongngu" e2e/logcat_full.txt | tail -n 400 > e2e/logcat.txt || true
rm -f e2e/logcat_full.txt
echo "e2e exit: $CODE"
exit $CODE

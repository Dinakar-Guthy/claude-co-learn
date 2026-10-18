#!/bin/sh
# Headless Chrome for drive.mjs (fresh profile each run, DevTools on port 9333).
rm -rf /tmp/e2e/profile; mkdir -p /tmp/e2e/profile
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --remote-debugging-port=9333 --user-data-dir=/tmp/e2e/profile --window-size=900,1000 --autoplay-policy=no-user-gesture-required about:blank > /tmp/e2e/chrome.log 2>&1 &

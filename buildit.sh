#!/bin/bash 

cp src/manifest-chrome.json src/manifest.json

NODE_ENV=production npm run build

if [ -d test-build ]; then
  rm -r test-build
fi

if [ -d test-build-firefox ]; then
  rm -r test-build-firefox
fi

cp -r build test-build
cp -r build test-build-firefox
cp src/manifest-firefox.json test-build-firefox/manifest.json

echo "Done"


#!/bin/bash
set -e
sudo mkdir -p /opt/babitk/web
sudo rm -rf /opt/babitk/web/*
python3 -m zipfile -e /tmp/babitk-web.zip /tmp/babitk-web-extracted
sudo cp -a /tmp/babitk-web-extracted/. /opt/babitk/web/
sudo chown -R pro2do:pro2do /opt/babitk
# Keep existing links page if uploaded separately
sudo systemctl restart babitk-web.service
sleep 1
curl -s -o /dev/null -w 'local_http=%{http_code}\n' http://127.0.0.1:8080/
ls -la /opt/babitk/web/assets/

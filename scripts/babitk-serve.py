#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html", "/links.html"):
            self.send_header("Cache-Control", "no-store, max-age=0")
        else:
            self.send_header("Cache-Control", "public, max-age=300")
        super().end_headers()

os.chdir("/opt/babitk/web")
ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()

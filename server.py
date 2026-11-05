from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).parent)
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Serve the demonstration and its explicit assets only.
        from urllib.parse import unquote, urlsplit
        path = unquote(urlsplit(self.path).path)
        allowed = {'/', '/index.html', '/style.css', '/data.js', '/model.js', '/app.js'}
        if path not in allowed and not (path.startswith('/assets/') and '..' not in path and '\\' not in path):
            self.send_error(404)
            return
        return super().do_GET()
    def do_HEAD(self):
        return self.do_GET()
print('Purchase demo: http://127.0.0.1:8150', flush=True)
ThreadingHTTPServer(('127.0.0.1', 8150), Handler).serve_forever()

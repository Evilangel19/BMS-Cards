"""Static server for the browser tests: python3 tools/serve.py PORT --directory DIR. With CSP=1 in the environment it sends the Content Security Policy of src-tauri/tauri.conf.json, as the desktop program does; a violation is then written to the console (the tests list the page errors)."""
import functools, http.server, json, os, sys
port = int(sys.argv[1]); d = sys.argv[sys.argv.index('--directory') + 1] if '--directory' in sys.argv else '.'
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.environ.get('CSP_LOG', '/tmp/csp-violations.log')
csp = json.load(open(R + '/src-tauri/tauri.conf.json'))['app']['security']['csp'] if os.environ.get('CSP') == '1' else None
if csp: csp += '; report-uri /__csp'
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(s):
        if csp: s.send_header('Content-Security-Policy', csp)
        super().end_headers()
    def do_POST(s):
        n = int(s.headers.get('Content-Length') or 0); b = s.rfile.read(n).decode('utf8', 'replace')
        if s.path == '/__csp':
            with open(LOG, 'a') as f: f.write(b + '\n')
        s.send_response(204); s.end_headers()
    def log_message(s, *a): pass
http.server.ThreadingHTTPServer(('', port), functools.partial(H, directory=d)).serve_forever()

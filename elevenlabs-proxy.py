#!/usr/bin/env python3
"""ElevenLabs proxy - forward TTS requests via system proxy to api.elevenlabs.io"""
import subprocess, sys, os, http.server, tempfile

LISTEN_PORT = 8339

class Proxy(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        tmp = None
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b''

            tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.json')
            tmp.write(body)
            tmp.close()

            target = f'https://api.elevenlabs.io{self.path}'

            # Write body file, output to separate file, status code to stderr
            outfile = tempfile.NamedTemporaryFile(delete=False)
            outfile.close()

            cmd = [
                'curl', '-s', '-X', 'POST', target,
                '-H', 'Content-Type: application/json',
                '-H', f'xi-api-key: {self.headers.get("xi-api-key","")}',
                '-d', f'@{tmp.name}',
                '-x', 'http://127.0.0.1:7890',
                '--connect-timeout', '15', '--max-time', '30',
                '-o', outfile.name,
                '-w', '%{http_code}'
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=35)
            os.unlink(tmp.name); tmp = None

            # Status code from w (stderr)
            status_str = result.stdout.decode().strip()
            try:
                status = int(status_str)
            except:
                status = 502

            # Read response body from file
            with open(outfile.name, 'rb') as f:
                resp_body = f.read()
            os.unlink(outfile.name)

            self.send_response(status)
            if status == 200:
                self.send_header('Content-Type', 'audio/mpeg')
            else:
                self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.end_headers()
            self.wfile.write(resp_body)

        except Exception as e:
            print(f"[ERROR] {e}")
            self._send_error(502, str(e))
        finally:
            if tmp:
                try: os.unlink(tmp.name)
                except: pass

    def _send_error(self, code, msg):
        try:
            self.send_response(code)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if isinstance(msg, str):
                self.wfile.write(msg.encode())
            else:
                self.wfile.write(str(msg).encode())
        except: pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def log_message(self, fmt, *args):
        print(f"[proxy] {args[0]}")

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')

    # Quick test
    r = subprocess.run(
        ['curl', '-x', 'http://127.0.0.1:7890', '-s', '-o', os.devnull, '-w', '%{http_code}',
         'https://api.elevenlabs.io/v1/voices', '--connect-timeout', '5'],
        capture_output=True, timeout=10)
    if r.stdout.strip() != b'200':
        print(f"ERROR: proxy test failed: {r.stdout.decode()}")
        sys.exit(1)
    print("Proxy test OK")

    print(f"\nElevenLabs proxy: http://0.0.0.0:{LISTEN_PORT}")
    print(f"  -> api.elevenlabs.io via 127.0.0.1:7890")
    print(f"  Ctrl+C to stop\n")
    sys.stdout.flush()

    server = http.server.ThreadingHTTPServer(('0.0.0.0', LISTEN_PORT), Proxy)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDone.")
        server.shutdown()

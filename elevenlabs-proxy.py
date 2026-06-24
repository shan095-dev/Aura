#!/usr/bin/env python3
"""ElevenLabs proxy — forward TTS requests via system proxy to api.elevenlabs.io"""
import subprocess, sys, os, http.server, tempfile

LISTEN_PORT = 8339
CURL_PATH = "curl"

class Proxy(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b''

            # Write body to temp file
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.json')
            tmp.write(body)
            tmp.close()

            # Build curl command with proxy
            target = f'https://api.elevenlabs.io{self.path}'
            cmd = [CURL_PATH, '-s', '-w', '\n%{http_code}', '-X', 'POST', target,
                   '-H', 'Content-Type: application/json',
                   '-H', f'xi-api-key: {self.headers.get("xi-api-key","")}',
                   '-d', f'@{tmp.name}',
                   '-x', 'http://127.0.0.1:7890',
                   '--connect-timeout', '15', '--max-time', '30',
                   '-o', '-']

            result = subprocess.run(cmd, capture_output=True, timeout=35)
            os.unlink(tmp.name)

            output = result.stdout
            # Split: last line is HTTP status
            parts = output.rsplit(b'\n', 2)
            if len(parts) >= 2 and parts[-1].strip().isdigit():
                status = int(parts[-1].strip())
                audio = parts[-2] if len(parts) >= 3 else parts[0]
            else:
                # Full response is likely audio
                status = 200
                audio = output if output else result.stderr

            self.send_response(200 if audio else status)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.end_headers()
            if audio:
                self.wfile.write(audio)
        except Exception as e:
            print(f"[ERROR] {e}")
            try:
                self.send_response(502)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(str(e).encode())
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
    # Test curl works
    r = subprocess.run([CURL_PATH, '-x', 'http://127.0.0.1:7890', '-s', '-o', os.devnull, '-w', '%{http_code}',
                        'https://api.elevenlabs.io/v1/voices', '--connect-timeout', '5'],
                       capture_output=True, timeout=10)
    if r.stdout.strip() != b'200':
        print(f"ERROR: curl proxy test failed: {r.stdout.decode()}")
        print(r.stderr.decode()[:200])
        sys.exit(1)
    print(f"Proxy test OK (curl -> ElevenLabs via 7890)")

    print(f"\nElevenLabs proxy: http://0.0.0.0:{LISTEN_PORT}")
    print(f"  -> api.elevenlabs.io via proxy 127.0.0.1:7890")
    print(f"  Press Ctrl+C to stop\n")
    sys.stdout.flush()

    server = http.server.ThreadingHTTPServer(('0.0.0.0', LISTEN_PORT), Proxy)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDone.")
        server.shutdown()

"""Small local web API for reviewing personal courses."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from personal_course import USER_ID, analysis_for, draft_course, read_course, save_course, search_courses

HTML = Path(__file__).with_name("review.html")


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, data):
        content = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":
            content = HTML.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        args = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            if url.path == "/api/v1/courses/search":
                self.respond(200, search_courses(args["semester"], args["keyword"]))
            elif url.path == "/api/v1/analyses":
                self.respond(200, analysis_for(args["semester"], args["serial_no"], os.getenv("GROQ_API_KEY", "")))
            elif url.path == "/api/v1/user-courses":
                analysis = analysis_for(args["semester"], args["serial_no"], os.getenv("GROQ_API_KEY", ""))
                user_id = args["user_id"]
                self.respond(200, read_course(user_id, analysis) or draft_course(analysis, user_id))
            else:
                self.respond(404, {"error": "找不到 API"})
        except (KeyError, ValueError) as exc:
            self.respond(400, {"error": str(exc)})
        except Exception as exc:
            self.respond(502, {"error": str(exc)})

    def do_PUT(self):
        if urlparse(self.path).path != "/api/v1/user-courses":
            return self.respond(404, {"error": "找不到 API"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 1_000_000:
                raise ValueError("資料大小不合法")
            payload = json.loads(self.rfile.read(size))
            user_id = payload["user_id"]
            if payload["course"]["user_id"] != user_id:
                raise ValueError("使用者 ID 不一致")
            analysis = analysis_for(payload["semester"], payload["serial_no"])
            path = save_course(payload["course"], analysis)
            self.respond(200, {"path": str(path), "course": read_course(user_id, analysis)})
        except (ValueError, KeyError, TypeError) as exc:
            self.respond(400, {"error": str(exc)})
        except Exception as exc:
            self.respond(502, {"error": str(exc)})


if __name__ == "__main__":
    host, port = "127.0.0.1", 8765
    print(f"開啟 http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()

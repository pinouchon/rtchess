#!/usr/bin/env python3
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = 8000

games = {}


def cors_headers(handler):
  handler.send_header("Access-Control-Allow-Origin", "*")
  handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  handler.send_header("Access-Control-Allow-Headers", "Content-Type")


class Handler(SimpleHTTPRequestHandler):
  def do_OPTIONS(self):
    parsed = urlparse(self.path)
    if parsed.path.startswith("/api/"):
      self.send_response(204)
      cors_headers(self)
      self.end_headers()
    else:
      super().do_OPTIONS()

  def do_GET(self):
    parsed = urlparse(self.path)
    if parsed.path == "/api/pvp/status":
      qs = parse_qs(parsed.query)
      game_id = qs.get("game", [None])[0]
      if not game_id:
        self.send_response(400)
        cors_headers(self)
        self.end_headers()
        return
      game = games.get(game_id, {"host": True, "guest": False, "started": False})
      games.setdefault(game_id, game)
      print(f"[status] game={game_id} state={game}")
      self.send_response(200)
      cors_headers(self)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      self.wfile.write(json.dumps({"gameId": game_id, **game}).encode())
      return
    return super().do_GET()

  def do_POST(self):
    parsed = urlparse(self.path)
    length = int(self.headers.get("Content-Length", 0))
    body = self.rfile.read(length) if length else b"{}"
    try:
      data = json.loads(body or "{}")
    except json.JSONDecodeError:
      data = {}

    if parsed.path == "/api/pvp/join":
      game_id = data.get("gameId")
      role = data.get("role")
      if not game_id or role not in ("host", "guest"):
        self.send_response(400)
        cors_headers(self)
        self.end_headers()
        return
      game = games.setdefault(game_id, {"host": False, "guest": False, "started": False})
      if role == "host":
        game["host"] = True
      if role == "guest":
        game["guest"] = True
      print(f"[join] game={game_id} role={role} state={game}")
      self.send_response(200)
      cors_headers(self)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      self.wfile.write(json.dumps({"ok": True, "gameId": game_id, **game}).encode())
      return

    if parsed.path == "/api/pvp/start":
      game_id = data.get("gameId")
      if not game_id:
        self.send_response(400)
        cors_headers(self)
        self.end_headers()
        return
      game = games.setdefault(game_id, {"host": False, "guest": False, "started": False})
      game["started"] = True
      print(f"[start] game={game_id} state={game}")
      self.send_response(200)
      cors_headers(self)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      self.wfile.write(json.dumps({"ok": True, "gameId": game_id, **game}).encode())
      return

    self.send_response(404)
    cors_headers(self)
    self.end_headers()


if __name__ == "__main__":
  server = HTTPServer(("0.0.0.0", PORT), Handler)
  print(f"Serving on port {PORT}")
  server.serve_forever()

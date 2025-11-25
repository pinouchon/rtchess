#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8000;
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

const games = new Map(); // gameId -> {host: null|ws, guest: null|ws, state: string}
const recvBuffers = new WeakMap(); // socket -> Buffer

function serveStatic(req, res) {
  const reqPath = req.url.split("?")[0];
  let relative = reqPath.replace(/^\/+/, "");
  if (relative === "" || relative === "/") relative = "index.html";
  let filePath = path.join(ROOT, relative);
  console.log("[static] req", req.url, "->", relative);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // fallback to SPA entry
      const indexPath = path.join(ROOT, "index.html");
      console.log("[static] miss, fallback to index.html");
      fs.readFile(indexPath, (err2, data2) => {
        if (err2) {
          console.log("[static] index fallback failed", err2);
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function wsAccept(key) {
  return crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", "binary")
    .digest("base64");
}

function sendFrame(socket, obj) {
  const data = Buffer.from(JSON.stringify(obj));
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.from([0x81, 126, (len >> 8) & 0xff, len & 0xff]);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

function parseFrameAt(buffer, start = 0) {
  if (buffer.length - start < 2) return null;
  const first = buffer[start];
  const second = buffer[start + 1];
  const opcode = first & 0x0f;
  const isMasked = (second & 0x80) === 0x80;
  let len = second & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length - start < offset + 2) return null;
    len = buffer.readUInt16BE(start + offset);
    offset += 2;
  } else if (len === 127) {
    if (buffer.length - start < offset + 8) return null;
    len = Number(buffer.readBigUInt64BE(start + offset));
    offset += 8;
  }
  let mask;
  if (isMasked) {
    if (buffer.length - start < offset + 4) return null;
    mask = buffer.slice(start + offset, start + offset + 4);
    offset += 4;
  }
  if (buffer.length - start < offset + len) return null;
  const payload = buffer.slice(start + offset, start + offset + len);
  if (isMasked) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }
  return { opcode, data: payload.toString("utf8"), next: start + offset + len };
}

function getGame(gameId) {
  if (!games.has(gameId)) games.set(gameId, { host: null, guest: null, state: "waiting_for_guest" });
  return games.get(gameId);
}

function broadcast(gameId, msg, except) {
  const game = getGame(gameId);
  [game.host, game.guest].forEach((ws) => {
    if (ws && ws !== except) sendFrame(ws, msg);
  });
}

function handleMessage(socket, gameId, role, msg) {
  try {
    const data = JSON.parse(msg);
    if (data.type === "start" && role === "host") {
      const game = getGame(gameId);
      game.state = "started";
      console.log("[ws] start", { gameId });
      broadcast(gameId, { type: "started", gameId }, null);
      broadcast(gameId, { type: "state", state: { host: !!game.host, guest: !!game.guest, state: game.state } }, null);
    }
    if (data.type === "move") {
      console.log("[ws] move recv", { gameId, role, move: data.move, ts: data.ts, clientId: data.clientId });
      broadcast(gameId, { ...data, gameId }, socket);
    }
    if (data.type === "resign") {
      console.log("[ws] resign", { gameId, role, ts: data.ts });
      const game = getGame(gameId);
      game.state = "over";
      broadcast(gameId, { type: "resign", role, gameId, ts: data.ts }, socket);
      broadcast(gameId, { type: "state", state: { host: !!game.host, guest: !!game.guest, state: game.state } }, null);
    }
    if (data.type === "rematch") {
      console.log("[ws] rematch", { gameId, role, ts: data.ts });
      const game = getGame(gameId);
      if (game.host && game.guest) {
        game.state = "ready_to_start";
      } else {
        game.state = "waiting_for_guest";
      }
      broadcast(gameId, { type: "rematch", gameId, ts: data.ts }, socket);
      broadcast(gameId, { type: "state", state: { host: !!game.host, guest: !!game.guest, state: game.state } }, null);
    }
  } catch (e) {
    // ignore malformed
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.startsWith("/api/pvp/status")) {
    res.writeHead(404);
    res.end();
    return;
  }
  serveStatic(req, res);
});

server.on("upgrade", (req, socket) => {
  const { pathname, query } = (() => {
    const u = new URL(req.url, `http://${req.headers.host}`);
    return { pathname: u.pathname, query: u.searchParams };
  })();
  console.log("[ws] upgrade", pathname, "params", Object.fromEntries(query.entries()));
  if (pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }
  const accept = wsAccept(key);
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
  );

  const gameId = query.get("game");
  const role = query.get("role");
  if (!gameId || !["host", "guest"].includes(role)) {
    console.log("[ws] missing params", { gameId, role });
    socket.destroy();
    return;
  }
  const game = getGame(gameId);
  if (role === "host") game.host = socket;
  if (role === "guest") game.guest = socket;
  if (game.host && game.guest && game.state === "waiting_for_guest") {
    game.state = "ready_to_start";
  }
  sendFrame(socket, {
    type: "state",
    gameId,
    state: { host: !!game.host, guest: !!game.guest, state: game.state, started: game.state === "started" },
  });
  broadcast(gameId, { type: "joined", gameId, role }, socket);

  recvBuffers.set(socket, Buffer.alloc(0));

  socket.on("data", (chunk) => {
    let buf = Buffer.concat([recvBuffers.get(socket) || Buffer.alloc(0), chunk]);
    let offset = 0;
    while (offset < buf.length) {
      const frame = parseFrameAt(buf, offset);
      if (!frame) break;
      offset = frame.next;
      if (frame.opcode === 0x8) {
        socket.destroy();
        return;
      }
      if (frame.opcode === 0x1) {
        handleMessage(socket, gameId, role, frame.data);
      }
    }
    recvBuffers.set(socket, buf.slice(offset));
  });

  socket.on("close", () => {
    const g = getGame(gameId);
    if (g.host === socket) g.host = null;
    if (g.guest === socket) g.guest = null;
    recvBuffers.delete(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Serving on http://0.0.0.0:${PORT}`);
});

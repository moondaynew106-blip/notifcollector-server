// test-device.js
import fetch from "node-fetch";

const SERVER = "http://localhost:3000";
const clientId = "android-test";
const deviceName = "Test Device";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeFetch(url, options = {}, retryDelay = 3000) {
  while (true) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      console.log(`⚠️ Server unreachable (${err.message}). Retrying in ${retryDelay / 1000}s...`);
      await sleep(retryDelay);
    }
  }
}

async function register() {
  while (true) {
    try {
      console.log("📡 Registering device...");
      const res = await fetch(`${SERVER}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, deviceName }),
      });
      if (res.ok) {
        console.log("✅ Registered successfully!");
        return;
      }
      console.log(`⚠️ Registration failed: ${res.status}`);
    } catch (err) {
      console.log(`⚠️ Registration error: ${err.message}`);
    }
    await sleep(3000);
  }
}

function handleCommand(cmd) {
  if (cmd === "fetch") {
    const notifications = [
      { app: "WhatsApp", title: "Message", message: "Hello!", receivedAt: Date.now() },
      { app: "Telegram", title: "Ping", message: "Hi from bot", receivedAt: Date.now() },
    ];
    return JSON.stringify({ action: "fetch", notifications });
  } else if (cmd === "upload") {
    return JSON.stringify({ action: "upload", status: "uploaded" });
  } else {
    return `Unknown command: ${cmd}`;
  }
}

async function heartbeatLoop() {
  while (true) {
    try {
      await fetch(`${SERVER}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
    } catch (err) {
      console.log(`⚠️ Heartbeat failed: ${err.message}`);
    }
    await sleep(5000);
  }
}

async function pollLoop() {
  while (true) {
    try {
      const res = await fetch(`${SERVER}/poll?clientId=${clientId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const cmds = await res.json();
      for (const { command } of cmds) {
        console.log(`📥 Received command: ${command}`);
        const output = handleCommand(command);

        await fetch(`${SERVER}/response`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, output }),
        });
      }
    } catch (err) {
      console.log(`⚠️ Polling failed (${err.message}). Reconnecting...`);
      await register();
    }
    await sleep(5000);
  }
}

(async () => {
  await register();
  pollLoop();
  heartbeatLoop();
})();

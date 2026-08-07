import 'dotenv/config';
import http from 'http';
import { createApp } from './app.js';
import { createHub } from './ws/hub.js';
import { migrate } from './config/db.js';

migrate();

const PORT = process.env.PORT || 4000;

// Create the HTTP server first so the WS hub can attach to its 'upgrade' event,
// then create the app with a broadcast function bound to the hub.
const server = http.createServer();
const hub = createHub(server);
const { app } = createApp({ broadcast: hub.broadcast });

server.on('request', app);

server.listen(PORT, () => {
  console.log(`pulse-server listening on :${PORT}`);
  console.log(`  HTTP  http://localhost:${PORT}`);
  console.log(`  WS    ws://localhost:${PORT}/ws`);
});

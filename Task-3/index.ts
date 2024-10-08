require('dotenv').config()

import http from 'http';
import express from 'express';
import cors from 'cors';
import expressBasicAuth from 'express-basic-auth';

import { Server, Room, matchMaker } from 'colyseus';
import socialRoutes from "@colyseus/social/express";
import { monitor } from "@colyseus/monitor";

import { router as hero } from "./controllers/hero";
import { DungeonRoom } from './rooms/DungeonRoom';
import { ChatRoom } from './rooms/ChatRoom';
import { Hero } from './db/Hero';
import { connectDatabase } from '@colyseus/social';
import { Report } from './db/Report';
import { debugLog } from './utils/Debug';

const port = process.env.PORT || 3553;
const app = express();

if (process.env.NODE_ENV !== "production") {
  app.use(cors());
} else {
  var whitelist = ['http://talk.itch.zone'];
  app.use(cors({
    origin: function(origin, callback){
      var originIsWhitelisted = whitelist.indexOf(origin) !== -1;
      callback(null, originIsWhitelisted);
    }
  }))
}

app.use(express.json());

const basicAuth = expressBasicAuth({
  users: { admin: process.env.MONITOR_PASSWORD },
  challenge: true
});

const server = http.createServer(app);
const gameServer = new Server({
  server: server,
  express: app,
  pingInterval: 8000,
  pingMaxRetries: 3,
});

connectDatabase(async () => {
  // ensure players are set as offline when booting up.
  console.log("Let's update online users!");
  const updated = await Hero.updateMany({ online: true }, { $set: { online: false } });
  console.log(updated);
});

gameServer.define('chat', ChatRoom);
gameServer.define('dungeon', DungeonRoom).filterBy(['progress']);
gameServer.define('pvp', DungeonRoom).filterBy(['progress']);
gameServer.define('loot', DungeonRoom).filterBy(['progress']);
gameServer.define('infinite', DungeonRoom).filterBy(['progress']);
gameServer.define('truehell', DungeonRoom).filterBy(['progress']);

// gameServer.define('test-items', DungeonRoom).filterBy(['progress']);
// gameServer.define('test-monsters', DungeonRoom).filterBy(['progress']);

if (process.env.NODE_ENV !== "production") {
  app.use(express.static( __dirname + '/../public' ));

} else {
  app.use(express.static( __dirname + '/../../public' ));
}

// Debugging colyseus Room
(Room.prototype as any).getSerializerDebugData = function() {
  return {
    handshake: Array.from(Uint8Array.from(Buffer.from(this._serializer.handshake && this._serializer.handshake()))),
    fullState: Array.from(Uint8Array.from(Buffer.from(this._serializer.getFullState()))),
  }
}

/**
 * Temporary: error reports from the client!
 */
app.post("/report", async (req, res) => {
  const report = req.body;
  report.timestamp = Date.now();

  if (report.message.indexOf("_schema") >= 0) {
    const remoteCall = await matchMaker.remoteRoomCall(report.roomId, 'getSerializerDebugData');
    if (remoteCall && remoteCall[1]) {
      report.debug = remoteCall[1];
    }
  }

  debugLog(`client-side error: ${report.stack}`);

  const data = await Report.create(report);
  res.json(data);
});

app.use('/', socialRoutes);
app.use('/hero', hero);

app.use('/colyseus', basicAuth, monitor());

server.listen(port);

console.log(`Listening on http://localhost:${ port }`)

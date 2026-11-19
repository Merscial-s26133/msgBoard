const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { WebSocket, WebSocketServer } = require('ws');
const {
  AVATAR_COLORS,
  BASE_STANDS,
  PLAYER_RADIUS,
  STALL_HEIGHT,
  STALL_WIDTH,
  canOccupy,
  getSpawnPosition,
  getStandPosition
} = require('./market-world');
require('dotenv').config();

const PORT = 3000;
const publicDirectory = path.join(__dirname, 'public');
const MAX_AUTHOR_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_REQUEST_SIZE = 8192;
const MAX_PLAYER_NAME_LENGTH = 24;
const MAX_PRODUCTS_LENGTH = 120;
const MAX_CHAT_LENGTH = 280;
const CHAT_COOLDOWN_MS = 800;
const MOVE_COOLDOWN_MS = 50;
const MAX_MOVE_DISTANCE = 80;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function sendToSocket(socket, data) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function sendSocketError(socket, message) {
  sendToSocket(socket, { type: 'error', message });
}

function sanitizeText(value, maxLength, label) {
  const text = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
    : '';

  if (!text || text.length > maxLength) {
    throw new HttpError(400, `${label} must be between 1 and ${maxLength} characters.`);
  }

  return text;
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    color: player.color,
    role: player.role,
    products: player.products,
    standIndex: player.standIndex,
    x: player.x,
    y: player.y,
    facing: player.facing,
    lastMessage: player.lastMessage,
    joinedAt: player.joinedAt
  };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new HttpError(503, 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new HttpError(500, 'SUPABASE_URL must be a valid HTTPS URL.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new HttpError(500, 'SUPABASE_URL must be a valid HTTPS URL.');
  }

  return { url: parsedUrl.origin, key };
}

const players = new Map();
let standCount = BASE_STANDS.length;

function broadcast(data, excludedSocket) {
  for (const player of players.values()) {
    if (player.socket !== excludedSocket) {
      sendToSocket(player.socket, data);
    }
  }
}

function addPlayer(socket, data) {
  if (socket.playerId) {
    sendSocketError(socket, 'You have already joined the market.');
    return;
  }

  const name = sanitizeText(data.name, MAX_PLAYER_NAME_LENGTH, 'Name');
  if (data.role !== 'visitor' && data.role !== 'seller') {
    throw new HttpError(400, 'Choose to join as a visitor or seller.');
  }
  if (data.avatar !== 'girl' && data.avatar !== 'boy') {
    throw new HttpError(400, 'Choose a girl or boy avatar.');
  }
  if (!AVATAR_COLORS.includes(data.color)) {
    throw new HttpError(400, 'Choose an available avatar color.');
  }

  const role = data.role;
  const products = role === 'seller'
    ? sanitizeText(data.products || 'Fresh produce', MAX_PRODUCTS_LENGTH, 'Produce list')
    : '';
  let standIndex = null;

  if (role === 'seller') {
    const occupiedStands = new Set(
      Array.from(players.values())
        .filter((player) => player.role === 'seller')
        .map((player) => player.standIndex)
    );

    standIndex = 0;
    while (occupiedStands.has(standIndex)) {
      standIndex += 1;
    }
    standCount = Math.max(standCount, standIndex + 1);
  }

  const position = getSpawnPosition(role, standIndex);
  if (!canOccupy(position.x, position.y, standCount)) {
    throw new Error('The market could not find a clear place for this player.');
  }

  const player = {
    id: randomUUID(),
    name,
    avatar: data.avatar,
    color: data.color,
    role,
    products,
    standIndex,
    x: position.x,
    y: position.y,
    facing: 'down',
    lastMessage: '',
    joinedAt: Date.now(),
    lastMoveAt: 0,
    lastChatAt: 0,
    socket
  };

  players.set(player.id, player);
  socket.playerId = player.id;

  sendToSocket(socket, {
    type: 'welcome',
    player: serializePlayer(player),
    players: Array.from(players.values(), serializePlayer),
    standCount
  });

  broadcast({ type: 'player_join', player: serializePlayer(player), standCount }, socket);
}

function updatePlayerPosition(socket, data) {
  const player = players.get(socket.playerId);
  const x = Number(data.x);
  const y = Number(data.y);
  const now = Date.now();

  if (!player) {
    sendSocketError(socket, 'Join the market before moving.');
    return;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    sendSocketError(socket, 'The requested position is invalid.');
    return;
  }
  if (now - player.lastMoveAt < MOVE_COOLDOWN_MS) {
    return;
  }

  const distance = Math.hypot(x - player.x, y - player.y);
  if (
    distance > MAX_MOVE_DISTANCE
    || !canOccupy(x, y, standCount)
  ) {
    sendToSocket(socket, {
      type: 'position',
      x: player.x,
      y: player.y
    });
    return;
  }

  player.x = x;
  player.y = y;
  player.facing = ['up', 'down', 'left', 'right'].includes(data.facing)
    ? data.facing
    : player.facing;
  player.lastMoveAt = now;

  broadcast({
    type: 'move',
    playerId: player.id,
    x: player.x,
    y: player.y,
    facing: player.facing
  }, socket);
}

async function postPlayerMessage(socket, data) {
  const player = players.get(socket.playerId);
  if (!player) {
    sendSocketError(socket, 'Join the market before sending a message.');
    return;
  }

  const text = sanitizeText(data.text, MAX_CHAT_LENGTH, 'Message');
  const now = Date.now();
  if (now - player.lastChatAt < CHAT_COOLDOWN_MS) {
    sendSocketError(socket, 'Please wait a moment before sending another message.');
    return;
  }

  player.lastChatAt = now;
  const result = await requestSupabase('messages?select=id,author,text,created_at', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ author: player.name, text })
  });
  const createdMessages = await result.json();
  const message = createdMessages[0];

  if (!message) {
    throw new HttpError(502, 'The message could not be saved.');
  }

  player.lastMessage = text;
  sendToSocket(socket, {
    type: 'message_sent',
    playerId: player.id,
    message
  });
  broadcast({
    type: 'chat',
    playerId: player.id,
    message
  }, socket);
}

async function handleSocketMessage(socket, rawData) {
  let data;
  try {
    data = JSON.parse(rawData.toString());
  } catch {
    sendSocketError(socket, 'Message must be valid JSON.');
    return;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    sendSocketError(socket, 'Message must be a JSON object.');
    return;
  }

  if (data.type === 'join') {
    addPlayer(socket, data);
    return;
  }
  if (data.type === 'move') {
    updatePlayerPosition(socket, data);
    return;
  }
  if (data.type === 'chat') {
    await postPlayerMessage(socket, data);
    return;
  }

  sendSocketError(socket, 'Unknown market action.');
}

async function requestSupabase(endpoint, options = {}) {
  const { url, key } = getSupabaseConfig();
  let response;
  try {
    response = await fetch(`${url}/rest/v1/${endpoint}`, {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  } catch (error) {
    console.error('Could not reach Supabase:', error);
    throw new HttpError(502, 'The message service could not be reached.');
  }

  if (!response.ok) {
    const details = await response.text();
    console.error(`Supabase request failed (${response.status}): ${details}`);
    throw new HttpError(502, 'The message service could not complete the request.');
  }

  return response;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_SIZE) {
      throw new HttpError(413, 'Request body is too large.');
    }
    chunks.push(chunk);
  }

  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const author = typeof data.author === 'string' ? data.author.trim() : '';
  const text = typeof data.text === 'string' ? data.text.trim() : '';

  if (!author || author.length > MAX_AUTHOR_LENGTH) {
    throw new HttpError(400, `Author must be between 1 and ${MAX_AUTHOR_LENGTH} characters.`);
  }

  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError(400, `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`);
  }

  return { author, text };
}

async function handleRequest(request, response) {
  let requestUrl;
  try {
    requestUrl = new URL(request.url, 'http://localhost');
  } catch {
    throw new HttpError(400, 'Bad Request');
  }

  if (requestUrl.pathname === '/api/messages') {
    if (request.method === 'GET') {
      const result = await requestSupabase('messages?select=id,author,text,created_at&order=created_at.desc,id.desc');
      sendJson(response, 200, await result.json());
      return;
    }

    if (request.method === 'POST') {
      const message = await readJsonBody(request);
      const result = await requestSupabase('messages?select=id,author,text,created_at', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(message)
      });
      const createdMessages = await result.json();
      sendJson(response, 201, createdMessages[0]);
      return;
    }

    response.writeHead(405, { Allow: 'GET, POST' });
    response.end('Method Not Allowed');
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end('Method Not Allowed');
    return;
  }

  const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    throw new HttpError(400, 'Bad Request');
  }

  const filePath = path.resolve(publicDirectory, `.${decodedPath}`);
  const relativePath = path.relative(publicDirectory, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new HttpError(403, 'Forbidden');
  }

  let fileContents;
  try {
    fileContents = await fs.promises.readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      throw new HttpError(404, 'Not Found');
    }
    throw error;
  }

  const contentType = contentTypes[path.extname(filePath)] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(fileContents);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    if (error instanceof HttpError) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }

    console.error('Request failed:', error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: 'Internal server error.' });
    } else {
      response.destroy();
    }
  });
});

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on('upgrade', (request, socket, head) => {
  let requestUrl;
  try {
    requestUrl = new URL(request.url, 'http://localhost');
  } catch {
    socket.destroy();
    return;
  }

  if (requestUrl.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit('connection', webSocket, request);
  });
});

webSocketServer.on('connection', (socket) => {
  socket.playerId = null;
  socket.on('message', (data) => {
    handleSocketMessage(socket, data).catch((error) => {
      console.error('Realtime message failed:', error);
      sendSocketError(
        socket,
        error instanceof HttpError ? error.message : 'The market could not process that action.'
      );
    });
  });

  socket.on('close', () => {
    const player = players.get(socket.playerId);
    if (!player) {
      return;
    }

    players.delete(player.id);
    broadcast({ type: 'player_leave', playerId: player.id });
  });

  socket.on('error', (error) => {
    console.error('Realtime connection failed:', error);
  });
});

server.listen(PORT, () => {
  console.log(`Market Meadow is running at http://localhost:${PORT}`);
});
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const pagesOrigin = 'https://merscial-s26133.github.io';

function startServer() {
  const projectDirectory = path.resolve(__dirname, '..');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PORT: '0',
      ALLOWED_ORIGINS: pagesOrigin
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${output}`));
    }, 10000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve({ child, port: Number(match[1]) });
      }
    });

    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}: ${output}`));
      }
    });
  });
}

function sendPreflight(port, origin) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/messages',
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    }, (response) => {
      response.resume();
      resolve(response);
    });

    request.once('error', reject);
    request.end();
  });
}

test('cross-origin API preflight is limited to the configured Pages origin', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());

  const allowed = await sendPreflight(port, pagesOrigin);
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.headers['access-control-allow-origin'], pagesOrigin);
  assert.equal(allowed.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
  assert.equal(allowed.headers['access-control-allow-headers'], 'Content-Type');

  const rejected = await sendPreflight(port, 'https://untrusted.example');
  assert.equal(rejected.statusCode, 403);
  assert.equal(rejected.headers['access-control-allow-origin'], undefined);
});

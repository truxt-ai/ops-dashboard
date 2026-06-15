'use strict';

const http = require('node:http');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function request(app, options) {
  const server = http.createServer(app);
  const port = await listen(server);
  const method = options.method || 'GET';
  const headers = Object.assign({}, options.headers);
  let body = options.body;

  if (body && typeof body !== 'string' && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    headers['content-type'] = headers['content-type'] || 'application/json';
  }

  if (body) {
    headers['content-length'] = Buffer.byteLength(body);
  }

  try {
    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          port,
          method,
          path: options.path,
          headers,
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json;

            try {
              json = text ? JSON.parse(text) : undefined;
            } catch (err) {
              json = undefined;
            }

            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              text,
              json,
            });
          });
        },
      );

      req.on('error', reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  } finally {
    await close(server);
  }
}

module.exports = { request };

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const Module = require('node:module');
const path = require('node:path');

const helperPath = path.join(__dirname, '..', 'src', 'lib', 'health-aggregate.js');
const serverPath = path.join(__dirname, '..', 'src', 'server.js');

function loadHealthAggregate() {
  delete require.cache[helperPath];
  return require(helperPath);
}

function getJson(app, pathname) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: pathname,
          headers: { accept: 'application/json' },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            server.close((closeErr) => {
              if (closeErr) {
                reject(closeErr);
                return;
              }

              const contentType = res.headers['content-type'] || '';
              resolve({
                statusCode: res.statusCode,
                contentType,
                body: contentType.startsWith('application/json') && body ? JSON.parse(body) : null,
                text: body,
              });
            });
          });
        },
      );

      req.on('error', (err) => {
        server.close(() => reject(err));
      });
    });

    server.on('error', reject);
  });
}

function loadServerWithHealthAggregate(fakeAggregate) {
  const originalLoad = Module._load;
  delete require.cache[serverPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (
      request === './lib/health-aggregate' ||
      request === './lib/health-aggregate.js' ||
      request.endsWith('/lib/health-aggregate') ||
      request.endsWith('/lib/health-aggregate.js')
    ) {
      return fakeAggregate;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(serverPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('summarizeChecks counts statuses and marks unhealthy when any check is down or degraded', () => {
  const { summarizeChecks } = loadHealthAggregate();

  assert.deepStrictEqual(
    summarizeChecks([
      { name: 'api', status: 'up' },
      { name: 'queue', status: 'down' },
      { name: 'worker', status: 'degraded' },
      { name: 'cache', status: 'up' },
    ]),
    {
      total: 4,
      up: 2,
      down: 1,
      degraded: 1,
      healthy: false,
    },
  );
});

test('summarizeChecks reports healthy only when every check is up', () => {
  const { summarizeChecks } = loadHealthAggregate();

  assert.deepStrictEqual(
    summarizeChecks([
      { name: 'api', status: 'up' },
      { name: 'cache', status: 'up' },
    ]),
    {
      total: 2,
      up: 2,
      down: 0,
      degraded: 0,
      healthy: true,
    },
  );
});

test('worstStatus gives down precedence over degraded and degraded precedence over up', () => {
  const { worstStatus } = loadHealthAggregate();

  assert.strictEqual(
    worstStatus([
      { name: 'api', status: 'up' },
      { name: 'worker', status: 'degraded' },
    ]),
    'degraded',
  );
  assert.strictEqual(
    worstStatus([
      { name: 'api', status: 'degraded' },
      { name: 'database', status: 'down' },
      { name: 'cache', status: 'up' },
    ]),
    'down',
  );
});

test('empty health checks summarize as healthy with worst status up', () => {
  const { summarizeChecks, worstStatus } = loadHealthAggregate();

  assert.deepStrictEqual(summarizeChecks([]), {
    total: 0,
    up: 0,
    down: 0,
    degraded: 0,
    healthy: true,
  });
  assert.strictEqual(worstStatus([]), 'up');
});

test('GET /api/health/summary returns JSON produced through the shared health aggregate helper', async () => {
  let summarizeInput;
  let worstInput;
  const expectedSummary = {
    total: 3,
    up: 1,
    down: 1,
    degraded: 1,
    healthy: false,
  };
  const fakeAggregate = {
    summarizeChecks(checks) {
      summarizeInput = checks;
      return expectedSummary;
    },
    worstStatus(checks) {
      worstInput = checks;
      return 'down';
    },
  };

  const { app } = loadServerWithHealthAggregate(fakeAggregate);
  const response = await getJson(app, '/api/health/summary');

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.contentType, /^application\/json\b/);
  assert.deepStrictEqual(response.body, {
    summary: expectedSummary,
    worst: 'down',
  });
  assert.ok(Array.isArray(summarizeInput), 'route passes a health check array to summarizeChecks');
  assert.strictEqual(worstInput, summarizeInput, 'route passes the same checks to both helper functions');
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const workflow = yaml.load(readFileSync(process.env.AXIOM_WORKFLOW_FILE ||
  join(__dirname, '../.github/workflows/axiom-audit-on-merge.yml'), 'utf8'));
const job = workflow.jobs['notify-axiom'];
const step = job.steps.find(step => step.name === 'Notify Axiom autopilot');

test('AXM-914: merge notification explicitly denies token permissions', () => {
  assert.deepEqual(workflow.permissions, {}, 'workflow must deny default token permissions');
  assert.deepEqual(job.permissions ?? workflow.permissions, {}, 'job must not grant token permissions');
});

test('AXM-914: event expressions never become shell source', () => {
  for (const step of job.steps) {
    if (step.run) assert.doesNotMatch(step.run, /\$\{\{/, 'run scripts must not interpolate event data');
  }
});

test('merge notification preserves payload values as JSON data', t => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-notify-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const eventPath = join(dir, 'event payload.json');
  const capturePath = join(dir, 'curl-args');
  for (const baseRef of ['master', 'release\'";$(touch injected);`touch injected`']) {
    const event = {
      repository: { full_name: 'synthetic/dashboard' },
      pull_request: { number: 914, merge_commit_sha: 'a'.repeat(40), base: { ref: baseRef } },
    };
    writeFileSync(eventPath, JSON.stringify(event));
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c',
      'curl() { printf \'%s\\0\' "$@" > "$CAPTURE_PATH"; }\n' + step.run], {
      cwd: dir,
      env: { ...process.env, AXIOM_WEBHOOK: 'https://axiom.invalid/hook',
        GITHUB_EVENT_PATH: eventPath, CAPTURE_PATH: capturePath },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const args = readFileSync(capturePath, 'utf8').split('\0').slice(0, -1);
    assert.deepEqual(args.slice(0, -1), ['-sS', '-X', 'POST', 'https://axiom.invalid/hook',
      '-H', 'Content-Type: application/json', '-d']);
    assert.deepEqual(JSON.parse(args.at(-1)), { repo: event.repository.full_name,
      pr_number: 914, merge_commit_sha: 'a'.repeat(40), base_ref: baseRef });
    assert.equal(existsSync(join(dir, 'injected')), false, 'branch text must never execute');
  }
});

test('merge notification retains merge gating and skips an unset webhook', () => {
  assert.deepEqual(workflow.on.pull_request.types, ['closed']);
  assert.equal(job.if, 'github.event.pull_request.merged == true');
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c',
    'curl() { echo unexpected-curl >&2; return 99; }\n' + step.run], {
    env: { ...process.env, AXIOM_WEBHOOK: '', GITHUB_EVENT_PATH: '/nonexistent-event' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /nothing to notify/);
  assert.equal(result.stderr, '');
});

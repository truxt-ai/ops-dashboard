#!/usr/bin/env python3
"""AXM-721 proof helpers. Outputs are local files, never uploaded by this script."""
import argparse
import base64
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import shutil
import signal
import sys
import copy
import tarfile
import tempfile

BASE = 'dff02375d83394d6f03ce2127e35e62fadc269ab'
REPO = 'truxt-ai/ops-dashboard'
WORKFLOW = '.github/workflows/ci.yml'
FIXTURE = 'test/security-dependencies.test.js'
SHA = re.compile('[0-9a-f]{40}')
# Exactly the files this PR changes. The trusted CI workflow is deliberately absent.
SCOPE = {'package.json', 'package-lock.json', FIXTURE, 'docs/security-verification.md',
         'scripts/security-verification.py'}
PR_URL = f'https://github.com/{REPO}/pull/110'
NODE_TEST, NPM_TEST = ['node', '--test', '--test-reporter=tap', FIXTURE], ['npm', 'test', '--', '--test-reporter=tap']
SCANNER_SHA256 = '2c71403eb443d05891c4f268c3ad771cf4f16e5443463fd7851ef8f454d3c7e4'  # osv-scanner 2.6.0 linux-arm64
FIXTURE_SHA256 = 'f578923f51cd99aee74ab676730926b6c9b57fbc1013205723443940bee4890c'  # reviewed fixture, immutable since a48560d
REPORT_KEYS = {'baseline_sha', 'fixture_sha256', 'pr_url', 'baseline_test_url', 'candidate_test_url', 'head_sha',
               'remote_head_sha', 'ci', 'usage'}
# Fixed by BASE's original suite and the reviewed fixture: 49 original tests; 24 fixture tests, 14 failing before the fix.
EXPECTED = {'original': 49, 'fixture': 24, 'fixture_failures': 14}
LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare']
USAGE_KEYS = {'input_tokens', 'output_tokens', 'cached_input_tokens', 'cost_usd', 'scope', 'unrecorded_reason'}
# Lockfile fields that change what npm installs or runs; a target entry must keep BASE's values for them.
INSTALL_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'bin', 'engines',
                  'os', 'cpu', 'hasInstallScript', 'dev', 'optional', 'devOptional', 'link', 'bundleDependencies']
# Every run verify executes, in order: its exact argv and whether it runs in the BASE or the head tree.
RUNS = {'baseline-ci': (['npm', 'ci'], 'baseline'), 'baseline-lint': (['npm', 'run', 'lint'], 'baseline'),
        'baseline-test': (NPM_TEST, 'baseline'), 'final-red': (NODE_TEST, 'baseline'),
        'final-ci': (['npm', 'ci'], 'candidate'), 'final-lint': (['npm', 'run', 'lint'], 'candidate'),
        'final-green': (NODE_TEST, 'candidate'), 'final-test': (NPM_TEST, 'candidate')}
ORIGINALS = [f'test/{name}.test.js' for name in
             ['health', 'health-freshness', 'service-health', 'promo-codes', 'smoke']]
TARGETS = {'proxy-addr': '2.0.8', 'follow-redirects': '1.16.1',
           'cookie': '0.7.2', 'send': '0.19.0'}
SELECTED = {
    'GHSA-jqcg-44mw-7w3h': 'CVE-2026-90711',
    'GHSA-8r9p-f939-6h3c': 'CVE-2026-111755',
    'GHSA-q3jh-wrc6-jgq8': 'CVE-2026-111756',
    'GHSA-pxg6-pf52-xh8x': 'CVE-2024-47764',
    'GHSA-m6fv-jmcg-4jfg': 'CVE-2024-43799',
}


def runner_summary(output):
    pairs = re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', output, re.M)
    assert len(pairs) == len(dict(pairs)), 'duplicate runner summary lines'
    return {k: int(v) for k, v in pairs}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, indent=2) + '\n')


def git(*args, cwd=None):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def record(directory, label, cwd, argv, repo='.', env=None):
    """Run argv in cwd and keep its logs; repo is the checkout whose HEAD is recorded, env the child environment."""
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    assert not (directory / f'{label}.meta.json').exists(), f'refusing to overwrite {label}'
    meta = {'argv': argv, 'cwd': str(Path(cwd).resolve()), 'started_utc': now(),
            'node': subprocess.check_output(['node', '--version'], text=True, env=env, cwd=cwd).strip(),
            'npm': subprocess.check_output(['npm', '--version'], text=True, env=env, cwd=cwd).strip(),
            'checkout_sha': git('rev-parse', 'HEAD', cwd=repo), 'inputs': {}}
    for name in ['package.json', 'package-lock.json', FIXTURE]:
        path = Path(cwd) / name
        if path.exists():
            meta['inputs'][name] = digest(path)
    # Output goes through verifier-owned pipes; the child gets its own process group so leftovers are found.
    with subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True) as child:
        stdout, stderr = child.communicate()
    try:
        os.killpg(child.pid, signal.SIGKILL)
        lingering = True
    except ProcessLookupError:
        lingering = False
    out, err = directory / f'{label}.stdout.txt', directory / f'{label}.stderr.txt'
    out.write_bytes(stdout)
    err.write_bytes(stderr)
    output = stdout.decode(errors='replace')
    meta.update(ended_utc=now(), exit_status=child.returncode, lingering_processes=lingering,
                stdout_sha256=hashlib.sha256(stdout).hexdigest(), stderr_sha256=hashlib.sha256(stderr).hexdigest(),
                runner_summary=runner_summary(output))
    write(directory / f'{label}.meta.json', meta)
    print(json.dumps({'label': label, 'exit_status': child.returncode, 'runner_summary': meta['runner_summary']}))
    return {'exit_status': child.returncode, 'output': output, 'lingering': lingering}


def inventory(root):
    root = Path(root)
    packages = json.loads((root / 'package-lock.json').read_text())['packages']
    copies = []
    for path, item in packages.items():
        name = path.rsplit('node_modules/', 1)[-1]
        if name not in TARGETS:
            continue
        installed = json.loads((root / path / 'package.json').read_text())['version']
        assert installed == item['version'], f'installed/locked mismatch: {path}'
        parents = []
        for parent, spec in packages.items():
            if name not in spec.get('dependencies', {}):
                continue
            directory = parent
            while True:
                candidate = f'{directory}/node_modules/{name}' if directory else f'node_modules/{name}'
                if candidate in packages:
                    if candidate == path:
                        parents.append({'path': parent or '.', 'range': spec['dependencies'][name]})
                    break
                if not directory:
                    break
                directory = directory.rpartition('/node_modules/')[0] if '/node_modules/' in directory else ''
        copies.append({'name': name, 'path': path, 'locked': item['version'],
                       'installed': installed, 'parents': parents})
    assert set(TARGETS) == {c['name'] for c in copies}, 'missing target package'
    installed_paths = []
    for directory, _, files in os.walk(root / 'node_modules'):
        path = Path(directory)
        if path.name in TARGETS and path.parent.name == 'node_modules' and 'package.json' in files:
            installed_paths.append(str(path.relative_to(root)))
    assert set(installed_paths) == {c['path'] for c in copies}, 'installed copies differ from lock inventory'
    return {'lock_sha256': digest(root / 'package-lock.json'),
            'package_count': len(packages) - 1, 'copies': copies}


def allowed(path):
    return path in SCOPE


def check_manifest(manifest, original):
    """CI runs package.json scripts, so the manifest may differ from BASE only by the exact cookie/send overrides."""
    manifest = copy.deepcopy(manifest)
    added = {name: manifest.get('overrides', {}).pop(name, None) for name in ['cookie', 'send']}
    assert added == {name: TARGETS[name] for name in added} and manifest == original, \
        'package.json changed beyond the cookie/send overrides'


def check_lock(lock, original):
    """The lockfile may change only target-package entries, each to its fixed version from the npm registry."""
    assert {k: v for k, v in lock.items() if k != 'packages'} == {k: v for k, v in original.items() if k != 'packages'}, \
        'lockfile header changed'
    shape = lambda entry: {field: entry.get(field) for field in INSTALL_FIELDS}
    name_of = lambda path: path.rsplit('node_modules/', 1)[-1]
    for path in set(lock['packages']) | set(original['packages']):
        new, name = lock['packages'].get(path), name_of(path)
        assert new == original['packages'].get(path) or name in TARGETS and (new is None or (
            new['version'] == TARGETS[name] and new.get('integrity', '').startswith('sha512-')
            and new['resolved'] == f'https://registry.npmjs.org/{name}/-/{name}-{TARGETS[name]}.tgz'
            and shape(new) in [shape(old) for old_path, old in original['packages'].items() if name_of(old_path) == name])), \
            f'lockfile changed beyond the target packages: {path}'


def check_tree(root, installed=None):
    # --no-renames reports both sides of a rename, so moving a file into scope cannot hide its source.
    paths = set(git('diff', '--no-renames', '--name-only', BASE, cwd=root).splitlines())
    paths.update(git('ls-files', '--others', '--exclude-standard', cwd=root).splitlines())
    hashes = {}
    for name in ORIGINALS:
        original = subprocess.check_output(['git', 'show', f'{BASE}:{name}'], cwd=root)
        assert (Path(root) / name).read_bytes() == original, f'original test changed: {name}'
        hashes[name] = hashlib.sha256(original).hexdigest()
    assert all(allowed(p) for p in paths), f'outside allowed scope: {paths}'
    check_manifest(json.loads((Path(root) / 'package.json').read_text()),
                   json.loads(git('show', f'{BASE}:package.json', cwd=root)))
    check_lock(json.loads((Path(root) / 'package-lock.json').read_text()),
               json.loads(git('show', f'{BASE}:package-lock.json', cwd=root)))
    inv = inventory(installed or root)
    for item in inv['copies']:
        assert item['locked'] == TARGETS[item['name']], f'wrong version: {item}'
        assert item['parents'], f'missing parent edges: {item}'
    return {'checked_utc': now(), 'checkout_sha': git('rev-parse', 'HEAD', cwd=root),
            'changed_paths': sorted(paths), 'original_test_hashes': hashes, 'inventory': inv}


def findings(scan, lock):
    lock_hash = digest(lock)
    lock = json.loads(Path(lock).read_text())['packages']
    paths = {}
    for path, item in lock.items():
        if path:
            paths.setdefault((path.rsplit('node_modules/', 1)[-1], item['version']), []).append(path)
    report = json.loads(Path(scan).read_text())
    packages = [p for result in report['results'] for p in result['packages']]
    observed = {(p['package']['name'], p['package']['version']) for p in packages}
    assert observed == set(paths) and len(observed) == len(packages), 'scan does not cover every locked name/version once'
    raw = []
    for p in packages:
        for v in p.get('vulnerabilities', []):
            raw.append({'package': p['package']['name'], 'version': p['package']['version'],
                        'id': v['id'], 'aliases': sorted(set([v['id'], *v.get('aliases', [])])),
                        'modified': v.get('modified'),
                        'paths': paths[(p['package']['name'], p['package']['version'])]})
    return {'packages': len(packages), 'lock_copies': sum(map(len, paths.values())),
            'raw': raw, 'scan_sha256': digest(scan), 'lock_sha256': lock_hash}


def compare(before, after):
    components = []
    for row in before['raw'] + after['raw']:
        aliases = set(row['aliases'])
        matches = [c for c in components if c & aliases]
        for component in matches:
            aliases.update(component)
            components.remove(component)
        components.append(aliases)

    def canonical(rows):
        result = {}
        for row in rows:
            aliases = next(c for c in components if row['id'] in c)
            key = row['package'] + ':' + sorted(aliases)[0]
            result.setdefault(key, {'package': row['package'], 'aliases': sorted(aliases), 'records': []})
            result[key]['records'].append(row)
        return result

    old, new = canonical(before['raw']), canonical(after['raw'])
    removed = [old[k] for k in sorted(old.keys() - new.keys())]
    added = [new[k] for k in sorted(new.keys() - old.keys())]
    remaining = [{'before': old[k], 'after': new[k]} for k in sorted(old.keys() & new.keys())]
    result = {'before': {**before, 'canonical_count': len(old)},
              'after': {**after, 'canonical_count': len(new)},
              'removed': removed, 'remaining': remaining, 'added': added, 'selected': SELECTED}
    validate_comparison(result)
    return result


def validate_comparison(result):
    assert result['selected'] == SELECTED, 'selected alias map missing or changed'
    assert not result['added'] and len(result['removed']) == len(SELECTED), 'findings added or removed beyond the selection'
    for ghsa, cve in SELECTED.items():
        old = [r for r in result['before']['raw'] if ghsa in r['aliases'] or cve in r['aliases']]
        assert old and any({ghsa, cve} <= set(r['aliases']) for r in old), f'missing baseline alias: {ghsa}'
        assert not any(ghsa in r['aliases'] or cve in r['aliases'] for r in result['after']['raw']), f'selected finding remains: {ghsa}'
        assert any({ghsa, cve} <= set(r['aliases']) for r in result['removed']), f'unreconciled selection: {ghsa}'
    assert result['before']['canonical_count'] == len(result['removed']) + len(result['remaining'])
    assert result['after']['canonical_count'] == len(result['added']) + len(result['remaining'])
    for side, records in [('before', result['removed'] + [r['before'] for r in result['remaining']]),
                          ('after', result['added'] + [r['after'] for r in result['remaining']])]:
        flattened = [r for item in records for r in item['records']]
        key = lambda r: json.dumps(r, sort_keys=True)
        assert sorted(map(key, flattened)) == sorted(map(key, result[side]['raw'])), 'incomplete raw reconciliation'
        assert all(r['paths'] for r in flattened), 'missing package-copy paths'


def check_tap(output):
    """Reconcile TAP counters with the result lines themselves; no directive may skip or defer a test."""
    summary = runner_summary(output)
    results = re.findall(r'^\s*(not ok|ok) \d+ - ', output, re.M)
    assert len(results) == summary['tests'] + summary['suites'] and results.count('not ok') == summary['fail'], \
        'TAP counters disagree with the result lines'
    assert summary['tests'] == summary['pass'] + summary['fail'] and not re.search(
        r'^\s*(?:not )?ok \d+ - .*#\s*(?:SKIP|TODO)', output, re.M | re.I), 'TAP output skips, defers or miscounts tests'
    return summary


def check_suite(output):
    summary = check_tap(output)
    assert summary['tests'] > 0 and summary['tests'] == summary['pass'], 'suite did not pass every test'
    assert summary['fail'] == summary['skipped'] == summary['cancelled'] == summary['todo'] == 0, 'suite did not pass every test'
    return summary


def check_red(output):
    blocks = re.findall(r'^not ok .*?(?=^# Subtest:|^1\.\.)', output, re.M | re.S)
    assert blocks, 'missing red failures'
    expected = {
        'GHSA-jqcg-44mw-7w3h': 'untrusted socket must not accept spoofed X-Forwarded-For',
        'GHSA-8r9p-f939-6h3c': 'declared sensitive header must not cross origins',
        'GHSA-q3jh-wrc6-jgq8': 'array-form credential must not cross origins',
        'GHSA-pxg6-pf52-xh8x': 'must reject attribute injection',
        'GHSA-m6fv-jmcg-4jfg': 'untrusted redirect input must not become a clickable javascript link',
    }
    seen = set()
    for block in blocks:
        ghsa = next((g for g in expected if g in block.splitlines()[0]), None)
        assert ghsa and expected[ghsa] in block and "code: 'ERR_ASSERTION'" in block, 'setup or unintended failure'
        seen.add(ghsa)
    assert seen == set(SELECTED), 'missing advisory regression'
    assert not re.search(r'^not ok \d+ - control ', output, re.M), 'benign control failed'
    summary = check_tap(output)
    assert summary['fail'] == len(blocks) and summary['pass'] > 0
    assert summary['cancelled'] == summary['skipped'] == summary['todo'] == 0
    return summary


def github(path):
    """Fresh GitHub REST read through the authenticated gh CLI (GH_TOKEN or `gh auth login`); gh api does not cache."""
    return json.loads(subprocess.check_output(['gh', 'api', '--hostname', 'github.com', path], text=True))


def check_publication(report, comparison, fixture, api=github):
    """Check a publication report's head and CI claims against fresh GitHub reads.

    comparison is the reproduced comparison and fixture the SHA-256 of the reproduced checkout's fixture.
    QA is certified by the host QA gate, which this helper cannot authenticate, so a report carries no QA fields."""
    assert set(report) == REPORT_KEYS and set(report['ci']) == {'conclusion', 'run_url'} and set(report['usage']) == USAGE_KEYS, \
        'report fields differ from the publication schema'
    assert report['baseline_sha'] == BASE, 'report baseline is not BASE'
    validate_comparison(comparison)
    assert report['pr_url'] == PR_URL, 'pr_url is not the AXM-721 pull request'
    number = PR_URL.rsplit('/', 1)[1]
    state = lambda pr: (pr['state'], pr['base']['ref'], pr['base']['repo']['full_name'], pr['head']['sha'],
                        pr['head']['ref'], pr['head']['repo']['full_name'], pr['base']['sha'])
    pr = api(f'repos/{REPO}/pulls/{number}')
    head = pr['head']['sha']
    assert state(pr)[:3] == ('open', 'master', REPO) and pr['head']['repo']['full_name'] == REPO, \
        'not an open same-repository PR into master'
    assert SHA.fullmatch(head) and report['head_sha'] == report['remote_head_sha'] == head, 'stale report: live PR head differs'
    tree = f'https://github.com/{REPO}/tree/'
    assert report['baseline_test_url'] == f'{tree}{BASE}/test', 'baseline test link must identify BASE'
    assert report['candidate_test_url'] == f'{tree}{head}/test', 'candidate test link must identify the live head'
    diff = api(f'repos/{REPO}/compare/{BASE}...{head}')
    assert diff['status'] == 'ahead' and diff['merge_base_commit']['sha'] == BASE, 'live head does not descend from BASE'
    # Scope must hold against BASE and against the PR's own diff with its current base branch.
    pr_files = api(f'repos/{REPO}/pulls/{number}/files?per_page=100')
    for files in [diff['files'], pr_files]:
        assert 0 < len(files) < 100 and all(allowed(f['filename']) and allowed(f.get('previous_filename', f['filename']))
                                            for f in files), 'live PR diff is outside allowed scope'
    blob = lambda ref, path: api(f'repos/{REPO}/contents/{path}?ref={ref}')
    content = lambda ref, path: base64.b64decode(blob(ref, path)['content'])
    sha256 = lambda ref, path: hashlib.sha256(content(ref, path)).hexdigest()
    assert blob(head, WORKFLOW)['sha'] == blob(BASE, WORKFLOW)['sha'], 'CI workflow differs from the trusted baseline'
    check_manifest(json.loads(content(head, 'package.json')), json.loads(content(BASE, 'package.json')))
    assert report['fixture_sha256'] == fixture == sha256(head, FIXTURE) == FIXTURE_SHA256, \
        'fixture is not the reviewed fixture at the checkout and live head'
    assert (comparison['before']['lock_sha256'], comparison['after']['lock_sha256']) == \
        (sha256(BASE, 'package-lock.json'), sha256(head, 'package-lock.json')), 'scanned lockfiles are not BASE and the live head'
    ci = report['ci']
    run_id = re.fullmatch(rf'https://github\.com/{REPO}/actions/runs/([0-9]+)', ci['run_url'])
    assert run_id, 'CI run link must name a GitHub Actions run in this repository'
    run = api(f'repos/{REPO}/actions/runs/{run_id[1]}')
    # A push run checks out exactly head_sha; a pull_request run tests a synthetic merge revision instead.
    assert (run['event'], run['path'], run['head_sha'], run['head_branch'], run['head_repository']['full_name']) == \
        ('push', WORKFLOW, head, pr['head']['ref'], REPO), 'CI run is not a trusted-workflow push run of the live head'
    assert run['status'] == 'completed' and run['conclusion'] == ci['conclusion'] == 'success', 'exact-head CI did not succeed'
    jobs = api(f'repos/{REPO}/actions/runs/{run["id"]}/jobs?per_page=100')
    passed = {step['name'] for job in jobs['jobs'] for step in job['steps'] if step['conclusion'] == 'success'}
    assert jobs['total_count'] == len(jobs['jobs']) > 0 and all(job['conclusion'] == 'success' for job in jobs['jobs']) \
        and {'Install dependencies', 'Lint', 'Test'} <= passed, 'CI jobs did not install, lint and test successfully'
    # The API reports only a run's latest attempt, so any rerun, finished or not, could hide an earlier failure.
    runs_path = f'repos/{REPO}/actions/runs?head_sha={head}&per_page=100'
    runs_state = lambda listing: sorted((r['id'], r['path'], r['status'], r['conclusion'], r['run_attempt'])
                                        for r in listing['workflow_runs'])
    listing = api(runs_path)
    runs = listing['workflow_runs']
    assert listing['total_count'] == len(runs) and run['id'] in {r['id'] for r in runs}, \
        'run list for the live head is incomplete or lacks the cited run'
    assert all(r['status'] == 'completed' and r['conclusion'] == 'success' and r['run_attempt'] == 1
               for r in runs + [run] if r['path'] == WORKFLOW), 'a trusted-workflow run on the live head failed, is running or was rerun'
    for name in ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cost_usd']:
        value = report['usage'][name]
        assert value is None or (type(value) in (int, float) and 0 <= value < float('inf')), f'invalid usage value: {name}'
    assert all(isinstance(report['usage'][k], str) and report['usage'][k].strip() for k in ['scope', 'unrecorded_reason']), \
        'usage scope or unrecorded reason missing'
    assert state(api(f'repos/{REPO}/pulls/{number}')) == state(pr) and runs_state(api(runs_path)) == runs_state(listing), \
        'PR or CI state changed during verification'
    return {'checked_utc': now(), 'pr': int(number), 'head_sha': head, 'ci_run_id': run['id'],
            'changed_paths': sorted(f['filename'] for f in diff['files'])}


def check_checkout(checkout, head):
    assert git('rev-parse', 'HEAD', cwd=checkout) == head and not git('status', '--porcelain', cwd=checkout), \
        'proof checkout is not a clean checkout of the live head'


def scan(lock, output):
    """Run the pinned OSV scanner ($OSV_SCANNER) on one lockfile with the documented flags and an empty config."""
    scanner = Path(os.environ['OSV_SCANNER']).resolve(strict=True)  # hash and execute the same absolute file
    assert digest(scanner) == SCANNER_SHA256, 'OSV_SCANNER is not the pinned osv-scanner binary'
    config = Path(output).parent / 'empty-osv-scanner.toml'
    config.write_text('')
    result = subprocess.run([str(scanner), 'scan', 'source', '--lockfile', str(lock), '--no-ignore', '--no-call-analysis=all',
                             '--no-resolve', '--config', str(config), '--all-packages', '--all-vulns', '--format', 'json',
                             '--output-file', str(output)], capture_output=True, check=False, env=clean_env(Path(output).parent / 'home'))
    found = any(p.get('vulnerabilities') for r in json.loads(Path(output).read_text())['results'] for p in r['packages'])
    assert result.returncode == (1 if found else 0), f'scanner failed: exit {result.returncode}'


def clean_env(home):
    """A minimal child environment: no inherited NODE_OPTIONS, npm configuration or other caller settings."""
    configs = {scope: Path(home) / f'empty-{scope}.npmrc' for scope in ['user', 'global']}  # npm rejects one file for both
    for config in configs.values():
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text('')
    path = os.pathsep.join(entry for entry in os.environ['PATH'].split(os.pathsep) if os.path.isabs(entry))
    return {'PATH': path, 'HOME': str(home), 'LANG': 'C.UTF-8', 'NO_UPDATE_NOTIFIER': '1',
            'NPM_CONFIG_USERCONFIG': str(configs['user']), 'NPM_CONFIG_GLOBALCONFIG': str(configs['global'])}


def materialize(ref, root, repo):
    """Write ref's tree from raw git objects, rehashing every blob, so attributes and replace refs cannot alter it.

    Returns {path: sha256} of every source file written, for check_sources."""
    written = {}
    for entry in filter(None, git('ls-tree', '-r', '-z', ref, cwd=repo).split('\0')):
        info, path = entry.split('\t', 1)
        mode, kind, sha = info.split()
        assert kind == 'blob' and mode in ('100644', '100755'), f'unsupported tree entry: {path}'
        data = subprocess.check_output(['git', 'cat-file', 'blob', sha], cwd=repo)
        assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == sha, f'object does not match its id: {path}'
        target = Path(root) / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(0o755 if mode == '100755' else 0o644)
        written[path] = hashlib.sha256(data).hexdigest()
    return written


def check_sources(root, expected):
    """Every file outside node_modules must be exactly the expected source bytes, with nothing added."""
    present = {}
    for directory, dirs, files in os.walk(root):
        if Path(directory) == Path(root):
            dirs[:] = [d for d in dirs if d != 'node_modules']
        for name in files:
            path = Path(directory) / name
            present[str(path.relative_to(root))] = 'symlink' if path.is_symlink() else digest(path)
    assert present == expected, f'sources differ from git objects under {root}'


def tree_digest(root):
    """Digest every file and symlink under root, node_modules included, without following directory links."""
    rows = []
    for directory, dirs, files in os.walk(root):
        for name in dirs + files:
            path = Path(directory) / name
            if path.is_symlink():
                rows.append(f'{path.relative_to(root)} -> {os.readlink(path)}')
            elif path.is_file():
                rows.append(f'{path.relative_to(root)} {digest(path)}')
    return hashlib.sha256('\n'.join(sorted(rows)).encode()).hexdigest()


def test_names(output):
    return sorted(re.findall(r'^\s*(?:not )?ok \d+ - (.*?)(?: # .*)?$', output, re.M))


def check_runs(outputs, copies):
    """Judge the runs' TAP output against the expected inventory of the pinned suite and fixture.

    copies maps each target's baseline copy path to its candidate copy path; fixture test names carry the path."""
    summaries = {label: check_suite(outputs[label]) for label in ['baseline-test', 'final-green', 'final-test']}
    red = check_red(outputs['final-red'])
    assert (summaries['baseline-test']['tests'], red['tests'], red['fail'], summaries['final-green']['tests'],
            summaries['final-test']['tests']) == (EXPECTED['original'], EXPECTED['fixture'], EXPECTED['fixture_failures'],
                                                  EXPECTED['fixture'], EXPECTED['original'] + EXPECTED['fixture']), \
        'runs did not execute the expected tests'
    names = {label: test_names(outputs[label]) for label in ['baseline-test', 'final-red', 'final-green', 'final-test']}
    relocate = lambda name: re.sub(r'(?<= )(\S+)(?=: )', lambda m: copies.get(m[1], m[1]), name, count=1)
    assert sorted(map(relocate, names['final-red'])) == names['final-green'], 'red and green runs executed different tests'
    assert all(any(f' {path}: ' in name for name in names['final-green']) for path in copies.values()), \
        'a fixed package copy has no fixture test'
    assert names['final-test'] == sorted(names['baseline-test'] + names['final-green']), \
        'full suite is not the original suite plus the fixture'
    return red, summaries


def check_evidence(directory, checkout):
    """Reproduce every result into a new directory from raw git objects of BASE and the checkout's HEAD.

    Nothing recorded earlier is read. Exit codes and output come from verifier-owned pipes. After every run, each
    tree's sources must equal their git objects and its node_modules must equal its state right after npm ci, which
    runs no package code because nothing in either tree has an install script. Returns (result, comparison)."""
    directory, checkout = Path(directory).resolve(), Path(checkout).resolve()
    head = git('rev-parse', 'HEAD', cwd=checkout)
    check_checkout(checkout, head)
    directory.mkdir(parents=True)
    trees = {'baseline': directory / 'baseline', 'candidate': directory / 'candidate'}
    sources = {'baseline': materialize(BASE, trees['baseline'], checkout), 'candidate': materialize(head, trees['candidate'], checkout)}
    assert sources['candidate'][FIXTURE] == FIXTURE_SHA256, 'head fixture is not the reviewed fixture'
    for root in trees.values():
        scripts = json.loads((root / 'package.json').read_text()).get('scripts', {})
        packages = json.loads((root / 'package-lock.json').read_text())['packages'].values()
        assert not set(scripts) & set(LIFECYCLE) and not any(entry.get('hasInstallScript') for entry in packages), \
            'npm ci would run package code'
    outputs, installed = {}, {}
    for label, (argv, side) in RUNS.items():
        if label == 'final-red':  # the original suite has run; now add the reviewed fixture to the BASE tree
            shutil.copyfile(trees['candidate'] / FIXTURE, trees['baseline'] / FIXTURE)
            sources['baseline'][FIXTURE] = FIXTURE_SHA256
        run = record(directory / 'commands', label, trees[side], argv, repo=checkout, env=clean_env(directory / 'home' / label))
        assert run['exit_status'] == (1 if label == 'final-red' else 0) and not run['lingering'], \
            f"{label} exited {run['exit_status']} or left processes running"
        outputs[label] = run['output']
        if argv == ['npm', 'ci']:
            installed[side] = tree_digest(trees[side] / 'node_modules')
        for name, root in trees.items():
            check_sources(root, sources[name])
            assert name not in installed or tree_digest(root / 'node_modules') == installed[name], f'{label} changed installed packages'
    inventories = {side: inventory(root) for side, root in trees.items()}
    assert all(c['locked'] != TARGETS[c['name']] for c in inventories['baseline']['copies']), 'baseline runs had fixed packages'
    copies = {}
    for c in inventories['candidate']['copies']:
        before = [b['path'] for b in inventories['baseline']['copies'] if b['name'] == c['name']]
        after = [a['path'] for a in inventories['candidate']['copies'] if a['name'] == c['name']]
        assert len(before) == len(after) == 1, f"{c['name']} has several copies to match"
        copies[before[0]] = after[0]
    red, summaries = check_runs(outputs, copies)
    scope = check_tree(checkout, installed=trees['candidate'])
    lock = json.loads((trees['candidate'] / 'package-lock.json').read_text())['packages']
    for item in scope['inventory']['copies']:
        published = subprocess.check_output(['npm', 'view', f"{item['name']}@{item['locked']}", 'dist.integrity'],
                                            text=True, env=clean_env(directory / 'home' / 'registry'), cwd=directory).strip()
        assert published == lock[item['path']]['integrity'], f"lockfile integrity is not the registry's: {item['path']}"
    for side in trees:
        scan(trees[side] / 'package-lock.json', directory / f'{side}.osv.json')
    comparison = compare(findings(directory / 'baseline.osv.json', trees['baseline'] / 'package-lock.json'),
                         findings(directory / 'candidate.osv.json', trees['candidate'] / 'package-lock.json'))
    write(directory / 'comparison.json', comparison)
    check_checkout(checkout, head)
    result = {'checked_utc': now(), 'head_sha': head, 'red_summary': red, 'scope': scope,
              'suites': {label: summaries[label] for label in ['baseline-test', 'final-green', 'final-test']},
              'scan_counts': {k: {'packages': comparison[k]['packages'], 'raw': len(comparison[k]['raw']),
                                 'canonical': comparison[k]['canonical_count']} for k in ['before', 'after']}}
    write(directory / 'verification.json', result)
    manifest(directory, checkout)
    return result, copy.deepcopy(comparison)


def publication(report, checkout, directory):
    """Reproduce the proof from a clean checkout, then check the report and the checkout's head against GitHub."""
    evidence, comparison = check_evidence(directory, checkout)
    result = check_publication(json.loads(Path(report).read_text()), comparison, digest(Path(checkout) / FIXTURE))
    assert evidence['head_sha'] == result['head_sha'], 'reproduced checkout is not the live head'
    check_checkout(checkout, result['head_sha'])
    return {**result, 'red_summary': evidence['red_summary'], 'suites': evidence['suites'], 'scan_counts': evidence['scan_counts']}


def selftest(directory):
    directory = Path(directory)
    comparison = json.loads((directory / 'comparison.json').read_text())
    validate_comparison(comparison)
    rejected = []

    def rejects(name, check):
        try:
            check()
        except (AssertionError, KeyError):
            rejected.append(name)
        else:
            raise AssertionError(f'negative control accepted: {name}')

    for name, mutate in [
        ('missing selected aliases', lambda d: d['selected'].pop(next(iter(SELECTED)))),
        ('incomplete reconciliation', lambda d: d['remaining'].pop()),
        ('missing copy path', lambda d: d['after']['raw'][0].update(paths=[])),
        ('added finding', lambda d: d['added'].append(d['remaining'][0]['after'])),
        ('removal beyond the selection', lambda d: d['removed'].append(d['remaining'][0]['before'])),
    ]:
        malformed = copy.deepcopy(comparison)
        mutate(malformed)
        rejects(name, lambda: validate_comparison(malformed))
    passing_output = (directory / 'commands/final-test.stdout.txt').read_text()
    check_suite(passing_output)
    for name, change in [
        ('failing suite', lambda o: re.sub(r'^(\s*)ok (\d+ - )', r'\1not ok \2', o, count=1, flags=re.M)),
        ('inflated test counter', lambda o: re.sub(r'^# tests \d+$', '# tests 999', o, flags=re.M)),
        ('inflated pass counter', lambda o: re.sub(r'^# pass \d+$', '# pass 999', o, flags=re.M)),
        ('skipped test', lambda o: re.sub(r'^(\s*ok \d+ - .*)$', r'\1 # SKIP', o, count=1, flags=re.M)),
        ('empty suite', lambda o: re.sub(r'^\s*(?:not )?ok \d+ - .*\n', '', o, flags=re.M)),
    ]:
        rejects(name, lambda: check_suite(change(passing_output)))
    rejects('forged trailing success counters', lambda: runner_summary(passing_output.replace('# fail 0', '# fail 2') + '# fail 0\n'))
    output = (directory / 'commands/final-red.stdout.txt').read_text()
    check_red(output)
    rejects('setup failure as regression', lambda: check_red(output.replace("code: 'ERR_ASSERTION'", "code: 'ECONNREFUSED'")))
    rejects('red counts that do not add up', lambda: check_red(re.sub(r'^# tests \d+$', '# tests 0', output, flags=re.M)))
    outputs = {label: (directory / f'commands/{label}.stdout.txt').read_text()
               for label in ['baseline-test', 'final-red', 'final-green', 'final-test']}
    copies = {'node_modules/follow-redirects': 'node_modules/axios/node_modules/follow-redirects', 'node_modules/cookie':
              'node_modules/cookie', 'node_modules/proxy-addr': 'node_modules/proxy-addr', 'node_modules/send': 'node_modules/send'}
    check_runs(outputs, copies)
    for name, label, change in [
        ('green run of other tests', 'final-green', lambda o: re.sub(r'^(\s*ok \d+ - ).*$', r'\1a different test', o, count=1, flags=re.M)),
        ('full suite missing an original test', 'final-test', lambda o: re.sub(r'^\s*ok \d+ - .*\n', '', o, count=1, flags=re.M)),
        ('failing full suite', 'final-test', lambda o: o.replace('# fail 0', '# fail 1')),
    ]:
        rejects(name, lambda: check_runs({**outputs, label: change(outputs[label])}, copies))
    rejects('copy path not tested', lambda: check_runs(outputs, {**copies, 'node_modules/extra': 'node_modules/extra'}))
    rejects('red run against another copy', lambda: check_runs(outputs, {**copies, 'node_modules/follow-redirects': 'node_modules/follow-redirects'}))
    with tempfile.TemporaryDirectory(prefix='axm-721-negative-') as temp:
        temp = Path(temp)
        # A tiny synthetic Git repo allows real source-integrity and scope checks.
        subprocess.run(['git', 'init', '-q', str(temp)], check=True)
        for name in ORIGINALS:
            (temp / name).parent.mkdir(parents=True, exist_ok=True)
            (temp / name).write_text('assert(true);\n')
        manifest = {'overrides': {'brace-expansion': '^1.1.21', 'js-yaml': '^4.3.2'}}
        write(temp / 'package.json', manifest)
        (temp / 'src').mkdir()
        (temp / 'src/server.js').write_text('server();\n')
        subprocess.run(['git', '-C', str(temp), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(temp), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                        '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture'], check=True)
        global BASE
        original_base = BASE
        BASE = git('rev-parse', 'HEAD', cwd=temp)
        try:
            check_checkout(temp, BASE)
            rejects('checkout at another head', lambda: check_checkout(temp, 'b' * 40))
            with tempfile.TemporaryDirectory(prefix='axm-721-tree-') as tree:
                materialize(BASE, tree, temp)
                assert (Path(tree) / 'src/server.js').read_text() == 'server();\n' and tree_digest(tree) == tree_digest(tree)
                before = tree_digest(tree)
                (Path(tree) / 'src/server.js').write_text('changed();\n')
                rejects('changed tree', lambda: require(tree_digest(tree) == before))
            write(temp / 'package.json', {**manifest, 'scripts': {'test': 'true'}})
            rejects('dirty checkout', lambda: check_checkout(temp, BASE))
            rejects('changed test script in tree', lambda: check_tree(temp))
            # A valid in-scope manifest change, so each control below can fail only on the check it names.
            manifest['overrides'].update(cookie=TARGETS['cookie'], send=TARGETS['send'])
            write(temp / 'package.json', manifest)
            (temp / ORIGINALS[0]).write_text('assert(false);\n')
            rejects('altered original test', lambda: check_tree(temp))
            (temp / ORIGINALS[0]).write_text('assert(true);\n')
            (temp / 'unexpected.js').write_text('')
            rejects('outside allowed scope', lambda: check_tree(temp))
            (temp / 'unexpected.js').unlink()
            (temp / 'scripts').mkdir()
            subprocess.run(['git', '-C', str(temp), 'mv', 'src/server.js', 'scripts/security-verification.py'], check=True)
            rejects('rename out of scope', lambda: check_tree(temp))
        finally:
            BASE = original_base
    package = lambda name, version: {'version': version, 'resolved': f'https://registry.npmjs.org/{name}/-/{name}-{version}.tgz',
                                     'integrity': 'sha512-fixture'}
    base_lock = {'name': 'fixture', 'lockfileVersion': 3, 'packages': {
        '': {'name': 'fixture'}, 'node_modules/cookie': package('cookie', '0.5.0'),
        'node_modules/follow-redirects': package('follow-redirects', '1.16.0'), 'node_modules/qs': package('qs', '6.11.0')}}
    head_lock = copy.deepcopy(base_lock)
    head_lock['packages']['node_modules/cookie'] = package('cookie', TARGETS['cookie'])
    head_lock['packages']['node_modules/axios/node_modules/follow-redirects'] = head_lock['packages'].pop('node_modules/follow-redirects')
    head_lock['packages']['node_modules/axios/node_modules/follow-redirects'].update(package('follow-redirects', TARGETS['follow-redirects']))
    check_lock(head_lock, base_lock)
    for name, mutate in [
        ('unrelated lockfile upgrade', lambda l: l['packages']['node_modules/qs'].update(version='6.14.0')),
        ('target at an unfixed version', lambda l: l['packages']['node_modules/cookie'].update(version='0.6.0')),
        ('target from another registry', lambda l: l['packages']['node_modules/cookie'].update(resolved='https://example.invalid/c.tgz')),
        ('target without integrity', lambda l: l['packages']['node_modules/cookie'].pop('integrity')),
        ('changed lockfile header', lambda l: l.update(lockfileVersion=2)),
    ]:
        malformed = copy.deepcopy(head_lock)
        mutate(malformed)
        rejects(name, lambda: check_lock(malformed, base_lock))
    base_manifest = {'scripts': {'test': 'node --test', 'lint': 'eslint .'},
                     'overrides': {'brace-expansion': '^1.1.21', 'js-yaml': '^4.3.2'}}
    head_manifest = copy.deepcopy(base_manifest)
    head_manifest['overrides'].update(cookie=TARGETS['cookie'], send=TARGETS['send'])
    check_manifest(head_manifest, base_manifest)
    for name, mutate in [
        ('neutralized npm test script', lambda m: m['scripts'].update(test='true')),
        ('changed existing override', lambda m: m['overrides'].update({'js-yaml': '*'})),
        ('missing selected override', lambda m: m['overrides'].pop('send')),
    ]:
        malformed = copy.deepcopy(head_manifest)
        mutate(malformed)
        rejects(name, lambda: check_manifest(malformed, base_manifest))
    head, pr_path, run_path = 'a' * 40, f'repos/{REPO}/pulls/110', f'repos/{REPO}/actions/runs/1'
    contents = lambda ref, path: f'repos/{REPO}/contents/{path}?ref={ref}'
    encoded = lambda data: {'content': base64.b64encode(data).decode()}
    fixture_bytes, locks = b'fixture bytes\n', {BASE: b'baseline lock\n', head: b'candidate lock\n'}
    scanned = copy.deepcopy(comparison)
    scanned['before']['lock_sha256'], scanned['after']['lock_sha256'] = (hashlib.sha256(locks[ref]).hexdigest() for ref in [BASE, head])
    run = {'id': 1, 'event': 'push', 'path': WORKFLOW, 'head_sha': head, 'head_branch': 'candidate', 'run_attempt': 1,
           'head_repository': {'full_name': REPO}, 'status': 'completed', 'conclusion': 'success',
           'updated_at': '2026-10-29T19:00:00Z'}
    remote = {
        contents(BASE, 'package.json'): encoded(json.dumps(base_manifest).encode()),
        contents(head, 'package.json'): encoded(json.dumps(head_manifest).encode()),
        contents(BASE, 'package-lock.json'): encoded(locks[BASE]),
        contents(head, 'package-lock.json'): encoded(locks[head]),
        pr_path: {'state': 'open', 'user': {'login': 'implementer'}, 'head': {'sha': head, 'ref': 'candidate', 'repo': {'full_name': REPO}},
                  'base': {'ref': 'master', 'sha': BASE, 'repo': {'full_name': REPO}}},
        f'repos/{REPO}/pulls/110/files?per_page=100': [{'filename': 'package.json'}],
        f'repos/{REPO}/actions/runs/1/jobs?per_page=100': {'total_count': 1, 'jobs': [{'conclusion': 'success', 'steps': [
            {'name': step, 'conclusion': 'success'} for step in ['Set up job', 'Install dependencies', 'Lint', 'Test']]}]},
        f'repos/{REPO}/compare/{BASE}...{head}': {'status': 'ahead', 'merge_base_commit': {'sha': BASE},
                                                  'files': [{'filename': 'package.json'}]},
        f'repos/{REPO}/contents/{WORKFLOW}?ref={head}': {'sha': 'trusted'},
        f'repos/{REPO}/contents/{WORKFLOW}?ref={BASE}': {'sha': 'trusted'},
        contents(head, FIXTURE): encoded(fixture_bytes),
        run_path: run,
        f'repos/{REPO}/actions/runs?head_sha={head}&per_page=100': {'total_count': 1, 'workflow_runs': [run]},
    }
    publication = {'baseline_sha': BASE, 'fixture_sha256': hashlib.sha256(fixture_bytes).hexdigest(),
                   'pr_url': PR_URL,
                   'baseline_test_url': f'https://github.com/{REPO}/tree/{BASE}/test',
                   'candidate_test_url': f'https://github.com/{REPO}/tree/{head}/test',
                   'head_sha': head, 'remote_head_sha': head,
                   'ci': {'conclusion': 'success', 'run_url': f'https://github.com/{REPO}/actions/runs/1'},
                   'usage': {'input_tokens': None, 'output_tokens': None, 'cached_input_tokens': None, 'cost_usd': None,
                             'scope': 'synthetic negative control', 'unrecorded_reason': 'synthetic'}}

    runs_path = f'repos/{REPO}/actions/runs?head_sha={head}&per_page=100'

    def add_run(g, **fields):
        g[runs_path]['workflow_runs'].append({**run, 'id': 3, **fields})
        g[runs_path]['total_count'] += 1

    def fake(responses):
        reads = []

        def api(path):  # offline stand-in for github(); a callable value sees how often its path was read
            reads.append(path)
            value = responses[path]
            return copy.deepcopy(value(reads.count(path)) if callable(value) else value)
        return api

    proof_fixture = hashlib.sha256(fixture_bytes).hexdigest()
    global FIXTURE_SHA256
    reviewed_fixture, FIXTURE_SHA256 = FIXTURE_SHA256, proof_fixture  # the stand-in serves synthetic fixture bytes
    check_publication(publication, scanned, proof_fixture, fake(remote))
    unreconciled = copy.deepcopy(scanned)
    unreconciled['remaining'].pop()
    rejects('unreconciled scanned comparison', lambda: check_publication(publication, unreconciled, proof_fixture, fake(remote)))
    rejects('proof fixture differs from the live head', lambda: check_publication(
        {**publication, 'fixture_sha256': '0' * 64}, scanned, '0' * 64, fake(remote)))
    moved = lambda d, g: g.update({pr_path: lambda n, pr=g[pr_path]: pr if n == 1 else {**pr, 'head': {**pr['head'], 'sha': 'b' * 40}}})
    for name, mutate in [
        ('missing CI run link', lambda d, g: d['ci'].pop('run_url')),
        ('invalid CI run link', lambda d, g: d['ci'].update(run_url='synthetic')),
        ('failed CI claim', lambda d, g: d['ci'].update(conclusion='failure')),
        ('stale report head', lambda d, g: g[pr_path]['head'].update(sha='b' * 40)),
        ('stale remote head claim', lambda d, g: d.update(remote_head_sha='b' * 40)),
        ('head moved during verification', moved),
        ('closed pull request', lambda d, g: g[pr_path].update(state='closed')),
        ('fork pull request', lambda d, g: g[pr_path]['head']['repo'].update(full_name='someone/fork')),
        ('CI run for another head', lambda d, g: g[run_path].update(head_sha='b' * 40)),
        ('failed remote CI run', lambda d, g: g[run_path].update(conclusion='failure')),
        ('unfinished remote CI run', lambda d, g: g[run_path].update(status='in_progress', conclusion=None)),
        ('pull_request merge-revision CI run', lambda d, g: g[run_path].update(event='pull_request')),
        ('CI run of another workflow', lambda d, g: g[run_path].update(path='.github/workflows/other.yml')),
        ('another failed run on the head', lambda d, g: add_run(g, conclusion='failure')),
        ('in-progress rerun on the head', lambda d, g: add_run(g, status='in_progress', conclusion=None, run_attempt=2)),
        ('truncated run list', lambda d, g: g[runs_path].update(total_count=101)),
        ('PR into another branch', lambda d, g: g[pr_path]['base'].update(ref='release')),
        ('non-string usage scope', lambda d, g: d['usage'].update(scope=['x'])),
        ('unverified extra report field', lambda d, g: d.update(tests_passed=73)),
        ('QA claim in the report', lambda d, g: d.update(qa={'head_sha': head})),
        ('PR diff outside scope against its base', lambda d, g: g[f'repos/{REPO}/pulls/110/files?per_page=100'].append(
            {'filename': 'src/server.js'})),
        ('CI job failure', lambda d, g: g[f'repos/{REPO}/actions/runs/1/jobs?per_page=100']['jobs'][0].update(conclusion='failure')),
        ('CI without a passing Test step', lambda d, g: g[f'repos/{REPO}/actions/runs/1/jobs?per_page=100']['jobs'][0]['steps'][-1].update(
            conclusion='skipped')),
        ('CI rerun started during verification', lambda d, g: g.update({runs_path: lambda n, listing=g[runs_path]: listing if n == 1 else {
            **listing, 'workflow_runs': [{**listing['workflow_runs'][0], 'status': 'in_progress', 'run_attempt': 2}]}})),
        ('PR closed during verification', lambda d, g: g.update({pr_path: lambda n, pr=g[pr_path]: pr if n == 1 else {**pr, 'state': 'closed'}})),
        ('PR base moved during verification', lambda d, g: g.update({pr_path: lambda n, pr=g[pr_path]: pr if n == 1 else {
            **pr, 'base': {**pr['base'], 'sha': 'c' * 40}}})),
        ('cited run missing from the run list', lambda d, g: g[runs_path].update(total_count=0, workflow_runs=[])),
        ('changed CI workflow', lambda d, g: g[f'repos/{REPO}/contents/{WORKFLOW}?ref={head}'].update(sha='edited')),
        ('live diff outside scope', lambda d, g: g[f'repos/{REPO}/compare/{BASE}...{head}']['files'].append({'filename': 'src/server.js'})),
        ('live rename out of scope', lambda d, g: g[f'repos/{REPO}/compare/{BASE}...{head}']['files'].append(
            {'filename': 'scripts/security-verification.py', 'previous_filename': 'src/server.js'})),
        ('head not descended from BASE', lambda d, g: g[f'repos/{REPO}/compare/{BASE}...{head}'].update(status='diverged')),
        ('fixture hash not at live head', lambda d, g: d.update(fixture_sha256='0' * 64)),
        ('rerun hiding a failed attempt', lambda d, g: g[run_path].update(run_attempt=2)),
        ('neutralized npm test script at the live head', lambda d, g: g.update(
            {contents(head, 'package.json'): encoded(json.dumps({**head_manifest, 'scripts': {'test': 'true'}}).encode())})),
        ('lockfile differs from the scanned lock', lambda d, g: g.update({contents(head, 'package-lock.json'): encoded(b'other\n')})),
        ('scanned baseline lock is not BASE', lambda d, g: g.update({contents(BASE, 'package-lock.json'): encoded(b'other\n')})),
        ('duplicate baseline and candidate links', lambda d, g: d.update(candidate_test_url=d['baseline_test_url'])),
        ('candidate link for wrong revision', lambda d, g: d.update(candidate_test_url=d['candidate_test_url'].replace(head, 'b' * 40))),
        ('baseline link for wrong revision', lambda d, g: d.update(baseline_test_url=d['candidate_test_url'])),
        ('another pull request', lambda d, g: d.update(pr_url=f'https://github.com/{REPO}/pull/1')),
        ('boolean usage value', lambda d, g: d['usage'].update(cost_usd=True)),
    ]:
        malformed, responses = copy.deepcopy(publication), copy.deepcopy(remote)
        mutate(malformed, responses)
        rejects(name, lambda: check_publication(malformed, scanned, proof_fixture, fake(responses)))
    publication.pop('candidate_test_url')
    rejects('incomplete publication report', lambda: check_publication(publication, scanned, proof_fixture, fake(remote)))
    FIXTURE_SHA256 = reviewed_fixture
    return {'negative_controls_rejected': rejected, 'count': len(rejected), 'checked_utc': now()}


def require(condition):
    assert condition


def manifest(directory, repo='.'):
    directory = Path(directory)
    write(directory / 'manifest.json', {'created_utc': now(), 'checkout_sha': git('rev-parse', 'HEAD', cwd=repo),
          'files': {str(p.relative_to(directory)): digest(p) for p in sorted(directory.rglob('*'))
                    if p.is_file() and p.name != 'manifest.json' and 'node_modules' not in p.parts}})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('record')
    p.add_argument('directory'); p.add_argument('label'); p.add_argument('cwd')
    p.add_argument('command', nargs=argparse.REMAINDER)
    p = sub.add_parser('inventory'); p.add_argument('root'); p.add_argument('output')
    p = sub.add_parser('scope'); p.add_argument('root'); p.add_argument('output')
    p = sub.add_parser('compare')
    for name in ['before_scan', 'before_lock', 'after_scan', 'after_lock', 'output']:
        p.add_argument(name)
    p = sub.add_parser('verify'); p.add_argument('checkout'); p.add_argument('directory')
    p = sub.add_parser('selftest'); p.add_argument('directory'); p.add_argument('output')
    p = sub.add_parser('manifest'); p.add_argument('directory')
    p = sub.add_parser('publication'); p.add_argument('report'); p.add_argument('checkout'); p.add_argument('directory')
    args = parser.parse_args()
    os.environ['GIT_NO_REPLACE_OBJECTS'] = '1'
    if not __debug__:
        sys.exit('refusing to run with -O or PYTHONOPTIMIZE: every check is an assert')
    if args.action == 'record':
        sys.exit(record(args.directory, args.label, args.cwd, args.command)['exit_status'])
    if args.action == 'inventory':
        write(args.output, inventory(args.root))
    if args.action == 'scope':
        write(args.output, check_tree(args.root))
    if args.action == 'compare':
        write(args.output, compare(findings(args.before_scan, args.before_lock), findings(args.after_scan, args.after_lock)))
    if args.action == 'verify':
        print(json.dumps(check_evidence(args.directory, args.checkout)[0], indent=2))
    if args.action == 'selftest':
        write(args.output, selftest(args.directory))
    if args.action == 'manifest':
        manifest(args.directory)
    if args.action == 'publication':
        print(json.dumps(publication(args.report, args.checkout, args.directory), indent=2))


if __name__ == '__main__':
    main()

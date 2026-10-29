#!/usr/bin/env python3
"""AXM-721 proof helpers. Outputs are local files, never uploaded by this script."""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
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


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, indent=2) + '\n')


def git(*args, cwd=None):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def record(directory, label, cwd, argv):
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    assert not (directory / f'{label}.meta.json').exists(), f'refusing to overwrite {label}'
    meta = {'argv': argv, 'cwd': str(Path(cwd).resolve()), 'started_utc': now(),
            'node': subprocess.check_output(['node', '--version'], text=True).strip(),
            'npm': subprocess.check_output(['npm', '--version'], text=True).strip(),
            'checkout_sha': git('rev-parse', 'HEAD'),
            'github_sha': os.environ.get('GITHUB_SHA'),
            'candidate_sha': os.environ.get('CANDIDATE_SHA'), 'inputs': {}}
    for name in ['package.json', 'package-lock.json', 'test/security-dependencies.test.js']:
        path = Path(cwd) / name
        if path.exists():
            meta['inputs'][name] = digest(path)
    baseline_lock = subprocess.check_output(['git', 'show', f'{BASE}:package-lock.json'])
    meta['source_sha'] = BASE if meta['inputs'].get('package-lock.json') == hashlib.sha256(baseline_lock).hexdigest() else meta['checkout_sha']
    meta['source_note'] = 'source revision plus explicitly hashed working files; checkout_sha is the recorder repository'
    out, err = directory / f'{label}.stdout.txt', directory / f'{label}.stderr.txt'
    with out.open('wb') as stdout, err.open('wb') as stderr:
        result = subprocess.run(argv, cwd=cwd, stdout=stdout, stderr=stderr, check=False)
    meta.update(ended_utc=now(), exit_status=result.returncode,
                stdout_sha256=digest(out), stderr_sha256=digest(err))
    output = out.read_text(errors='replace')
    meta['runner_summary'] = {k: int(v) for k, v in
                              re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$', output, re.M)}
    write(directory / f'{label}.meta.json', meta)
    print(json.dumps({'label': label, 'exit_status': result.returncode,
                      'runner_summary': meta['runner_summary']}))
    return result.returncode


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


def check_tree(root):
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
    inv = inventory(root)
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
    assert observed == set(paths), 'scan does not cover every locked name/version'
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


def check_record(meta, directory, label):
    assert isinstance(meta['exit_status'], int), 'missing exit status'
    assert meta['argv'] and meta['cwd'] and meta['checkout_sha'] and meta['node'] and meta['npm']
    assert datetime.datetime.fromisoformat(meta['ended_utc']) >= datetime.datetime.fromisoformat(meta['started_utc'])
    for stream in ['stdout', 'stderr']:
        assert digest(Path(directory) / f'{label}.{stream}.txt') == meta[f'{stream}_sha256'], 'log hash mismatch'


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
    summary = {k: int(v) for k, v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$', output, re.M)}
    assert summary['fail'] == len(blocks) and summary['pass'] > 0
    assert summary['cancelled'] == summary['skipped'] == summary['todo'] == 0
    return summary


def check_identity(candidate, observed, parents):
    assert SHA.fullmatch(candidate), 'missing candidate revision'
    assert observed == candidate or candidate in parents, 'CI GITHUB_SHA does not identify candidate or merge parent'


def github(path):
    """Fresh GitHub REST read through the authenticated gh CLI (GH_TOKEN or `gh auth login`); gh api does not cache."""
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def check_evidence_url(url, number):
    match = isinstance(url, str) and re.fullmatch(rf'https://github\.com/{REPO}/pull/{number}#issuecomment-([0-9]+)', url)
    assert match, 'QA evidence must be a comment on this pull request'
    return match[1]


def check_publication(report, comparison, fixture, api=github):
    """Report heads, CI and QA fields are claims; each is checked against fresh GitHub reads.

    comparison and fixture are the proof's comparison.json and fixture-final.json; the lockfiles they
    scanned and the fixture their red/green runs executed must be BASE's and the live head's."""
    assert report['baseline_sha'] == BASE, 'report baseline is not BASE'
    validate_comparison(comparison)
    number = re.fullmatch(rf'https://github\.com/{REPO}/pull/([0-9]+)', report['pr_url'])
    assert number, 'pr_url must name a pull request in this repository'
    number = number[1]
    pr = api(f'repos/{REPO}/pulls/{number}')
    head = pr['head']['sha']
    assert pr['state'] == 'open' and pr['base']['repo']['full_name'] == pr['head']['repo']['full_name'] == REPO, \
        'not an open same-repository pull request'
    assert SHA.fullmatch(head) and report['head_sha'] == report['remote_head_sha'] == head, 'stale report: live PR head differs'
    tree = f'https://github.com/{REPO}/tree/'
    assert report['baseline_test_url'] == f'{tree}{BASE}/test', 'baseline test link must identify BASE'
    assert report['candidate_test_url'] == f'{tree}{head}/test', 'candidate test link must identify the live head'
    diff = api(f'repos/{REPO}/compare/{BASE}...{head}')
    assert diff['status'] == 'ahead' and diff['merge_base_commit']['sha'] == BASE, 'live head does not descend from BASE'
    files = diff['files']
    assert 0 < len(files) < 300 and all(allowed(f['filename']) and allowed(f.get('previous_filename', f['filename']))
                                        for f in files), 'live PR diff is outside allowed scope'
    blob = lambda ref, path: api(f'repos/{REPO}/contents/{path}?ref={ref}')
    content = lambda ref, path: base64.b64decode(blob(ref, path)['content'])
    sha256 = lambda ref, path: hashlib.sha256(content(ref, path)).hexdigest()
    assert blob(head, WORKFLOW)['sha'] == blob(BASE, WORKFLOW)['sha'], 'CI workflow differs from the trusted baseline'
    check_manifest(json.loads(content(head, 'package.json')), json.loads(content(BASE, 'package.json')))
    check_fixture(fixture, sha256(head, FIXTURE))
    assert report['fixture_sha256'] == fixture['sha256'], 'report fixture hash is not the proof fixture'
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
    # The API reports only a run's latest attempt, so a rerun could hide an earlier failure.
    runs = api(f'repos/{REPO}/actions/runs?head_sha={head}&per_page=100')['workflow_runs']
    assert all(r['conclusion'] == 'success' and r['run_attempt'] == 1 for r in runs + [run]
               if r['path'] == WORKFLOW and r['status'] == 'completed'), 'a trusted-workflow run on the live head failed or was rerun'
    comment_id = check_evidence_url(report['qa'].get('evidence_url'), number)
    comment = api(f'repos/{REPO}/issues/comments/{comment_id}')
    assert report['qa']['head_sha'] == head and comment['issue_url'].endswith(f'/repos/{REPO}/issues/{number}') \
        and re.findall(r'^AXM-721 QA: (.*?)\r?$', comment['body'], re.M) == [f'PASS {head}'], \
        'QA comment does not carry one passing verdict for the live head'
    assert comment['created_at'] == comment['updated_at'] and comment['created_at'] >= run['updated_at'], \
        'QA comment was edited or predates the CI result'
    for name in ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cost_usd']:
        value = report['usage'][name]
        assert value is None or (type(value) in (int, float) and 0 <= value < float('inf')), f'invalid usage value: {name}'
    assert report['usage']['scope'] and report['usage']['unrecorded_reason']
    assert api(f'repos/{REPO}/pulls/{number}')['head']['sha'] == head, 'PR head moved during verification'
    return {'checked_utc': now(), 'pr': int(number), 'head_sha': head, 'ci_run_id': run['id'],
            'qa_comment_id': int(comment_id), 'changed_paths': sorted(f['filename'] for f in files)}


def check_fixture(fixture, candidate_sha256):
    assert fixture['sha256'] == fixture['baseline_sha256'] == candidate_sha256, 'fixture hash mismatch'


def check_inventory(observed, recorded):
    assert observed == recorded, 'incomplete copy inventory'


def check_checkout(checkout, head):
    assert git('rev-parse', 'HEAD', cwd=checkout) == head and not git('status', '--porcelain', cwd=checkout), \
        'proof checkout is not a clean checkout of the live head'


def publication(report, proof, checkout):
    """Bind the retained proof to a clean checkout of the live head, then check the report against GitHub."""
    proof = Path(proof)
    evidence = check_evidence(proof, checkout)
    result = check_publication(json.loads(Path(report).read_text()), json.loads((proof / 'comparison.json').read_text()),
                               json.loads((proof / 'fixture-final.json').read_text()))
    check_checkout(checkout, result['head_sha'])
    return {**result, 'red_summary': evidence['red_summary'], 'scan_counts': evidence['scan_counts']}


def check_evidence(directory, candidate):
    directory = Path(directory)
    for p in (directory / 'commands').glob('*.meta.json'):
        check_record(json.loads(p.read_text()), p.parent, p.name.removesuffix('.meta.json'))
    fixture = json.loads((directory / 'fixture-final.json').read_text())
    check_fixture(fixture, digest(Path(candidate) / FIXTURE))
    for label in ['final-red', 'final-green']:
        meta = json.loads((directory / f'commands/{label}.meta.json').read_text())
        assert meta['inputs']['test/security-dependencies.test.js'] == fixture['sha256'], 'executed different fixture'
    red = check_red((directory / 'commands/final-red.stdout.txt').read_text())
    assert json.loads((directory / 'commands/final-red.meta.json').read_text())['exit_status'] == 1
    for label in ['baseline-ci', 'baseline-lint', 'baseline-test', 'final-ci', 'final-lint', 'final-green', 'final-test']:
        meta = json.loads((directory / f'commands/{label}.meta.json').read_text())
        assert meta['exit_status'] == 0, f'command failed: {label}'
        if label in ['baseline-test', 'final-green', 'final-test']:
            summary = meta['runner_summary']
            assert summary['tests'] == summary['pass'] and summary['fail'] == summary['skipped'] == summary['cancelled'] == 0
    comparison = json.loads((directory / 'comparison.json').read_text())
    validate_comparison(comparison)
    expected = compare(findings(directory / 'baseline.osv.json', directory / 'baseline/package-lock.json'),
                       findings(directory / 'candidate.osv.json', Path(candidate) / 'package-lock.json'))
    assert comparison == expected, 'scan/input hashes or reconciliation changed'
    for side, labels in [('before', ['baseline-ci', 'baseline-lint', 'baseline-test', 'final-red']),
                         ('after', ['final-ci', 'final-lint', 'final-green', 'final-test'])]:
        for label in labels:
            meta = json.loads((directory / f'commands/{label}.meta.json').read_text())
            assert meta['inputs']['package-lock.json'] == comparison[side]['lock_sha256'], f'{label} ran on an unscanned lockfile'
    tree = check_tree(candidate)
    check_inventory(tree['inventory'], json.loads((directory / 'candidate-inventory.json').read_text()))
    return {'checked_utc': now(), 'red_summary': red, 'scope': tree,
            'scan_counts': {k: {'packages': comparison[k]['packages'], 'raw': len(comparison[k]['raw']),
                               'canonical': comparison[k]['canonical_count']} for k in ['before', 'after']}}


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
    ]:
        malformed = copy.deepcopy(comparison)
        mutate(malformed)
        rejects(name, lambda: validate_comparison(malformed))
    meta = json.loads((directory / 'commands/final-test.meta.json').read_text())
    meta.pop('exit_status')
    rejects('missing command exit', lambda: check_record(meta, directory / 'commands', 'final-test'))
    rejects('unrelated CI revision', lambda: check_identity('a' * 40, 'b' * 40, []))
    check_identity('a' * 40, 'c' * 40, ['a' * 40, 'b' * 40])
    output = (directory / 'commands/final-red.stdout.txt').read_text()
    check_red(output)
    rejects('setup failure as regression', lambda: check_red(output.replace("code: 'ERR_ASSERTION'", "code: 'ECONNREFUSED'")))
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
    fixture = json.loads((directory / 'fixture-final.json').read_text())
    check_fixture(fixture, fixture['sha256'])
    rejects('mismatched fixtures', lambda: check_fixture({**fixture, 'sha256': '0' * 64}, fixture['baseline_sha256']))
    inv = json.loads((directory / 'candidate-inventory.json').read_text())
    malformed_inventory = copy.deepcopy(inv)
    malformed_inventory['copies'].pop()
    check_inventory(inv, copy.deepcopy(inv))
    rejects('incomplete installed inventory', lambda: check_inventory(malformed_inventory, inv))
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
    head, pr_path, run_path = 'a' * 40, f'repos/{REPO}/pulls/1', f'repos/{REPO}/actions/runs/1'
    contents = lambda ref, path: f'repos/{REPO}/contents/{path}?ref={ref}'
    encoded = lambda data: {'content': base64.b64encode(data).decode()}
    fixture_bytes, locks = b'fixture bytes\n', {BASE: b'baseline lock\n', head: b'candidate lock\n'}
    scanned = copy.deepcopy(comparison)
    scanned['before']['lock_sha256'], scanned['after']['lock_sha256'] = (hashlib.sha256(locks[ref]).hexdigest() for ref in [BASE, head])
    run = {'id': 1, 'event': 'push', 'path': WORKFLOW, 'head_sha': head, 'head_branch': 'candidate', 'run_attempt': 1,
           'head_repository': {'full_name': REPO}, 'status': 'completed', 'conclusion': 'success',
           'updated_at': '2026-10-29T19:00:00Z'}
    comment_path = f'repos/{REPO}/issues/comments/2'
    remote = {
        contents(BASE, 'package.json'): encoded(json.dumps(base_manifest).encode()),
        contents(head, 'package.json'): encoded(json.dumps(head_manifest).encode()),
        contents(BASE, 'package-lock.json'): encoded(locks[BASE]),
        contents(head, 'package-lock.json'): encoded(locks[head]),
        pr_path: {'state': 'open', 'head': {'sha': head, 'ref': 'candidate', 'repo': {'full_name': REPO}},
                  'base': {'repo': {'full_name': REPO}}},
        f'repos/{REPO}/compare/{BASE}...{head}': {'status': 'ahead', 'merge_base_commit': {'sha': BASE},
                                                  'files': [{'filename': 'package.json'}]},
        f'repos/{REPO}/contents/{WORKFLOW}?ref={head}': {'sha': 'trusted'},
        f'repos/{REPO}/contents/{WORKFLOW}?ref={BASE}': {'sha': 'trusted'},
        contents(head, FIXTURE): encoded(fixture_bytes),
        run_path: run,
        f'repos/{REPO}/actions/runs?head_sha={head}&per_page=100': {'workflow_runs': [run]},
        comment_path: {'issue_url': f'https://api.github.com/repos/{REPO}/issues/1',
                       'body': f'Independent review notes\r\nAXM-721 QA: PASS {head}\r\n',
                       'created_at': '2026-10-29T20:00:00Z', 'updated_at': '2026-10-29T20:00:00Z'},
    }
    publication = {'baseline_sha': BASE, 'fixture_sha256': hashlib.sha256(fixture_bytes).hexdigest(),
                   'pr_url': f'https://github.com/{REPO}/pull/1',
                   'baseline_test_url': f'https://github.com/{REPO}/tree/{BASE}/test',
                   'candidate_test_url': f'https://github.com/{REPO}/tree/{head}/test',
                   'head_sha': head, 'remote_head_sha': head,
                   'ci': {'conclusion': 'success', 'run_url': f'https://github.com/{REPO}/actions/runs/1'},
                   'qa': {'head_sha': head, 'evidence_url': f'https://github.com/{REPO}/pull/1#issuecomment-2'},
                   'usage': {'input_tokens': None, 'output_tokens': None, 'cached_input_tokens': None, 'cost_usd': None,
                             'scope': 'synthetic negative control', 'unrecorded_reason': 'synthetic'}}

    def fake(responses):
        reads = []

        def api(path):  # offline stand-in for github(); a callable value sees how often its path was read
            reads.append(path)
            value = responses[path]
            return copy.deepcopy(value(reads.count(path)) if callable(value) else value)
        return api

    proof_fixture = {'sha256': hashlib.sha256(fixture_bytes).hexdigest(), 'baseline_sha256': hashlib.sha256(fixture_bytes).hexdigest()}
    check_publication(publication, scanned, proof_fixture, fake(remote))
    unreconciled = copy.deepcopy(scanned)
    unreconciled['remaining'].pop()
    rejects('unreconciled scanned comparison', lambda: check_publication(publication, unreconciled, proof_fixture, fake(remote)))
    rejects('proof fixture differs from the live head', lambda: check_publication(
        {**publication, 'fixture_sha256': '0' * 64}, scanned, {'sha256': '0' * 64, 'baseline_sha256': '0' * 64}, fake(remote)))
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
        ('another failed run on the head', lambda d, g: g[f'repos/{REPO}/actions/runs?head_sha={head}&per_page=100'][
            'workflow_runs'].append({**run, 'id': 3, 'conclusion': 'failure'})),
        ('changed CI workflow', lambda d, g: g[f'repos/{REPO}/contents/{WORKFLOW}?ref={head}'].update(sha='edited')),
        ('live diff outside scope', lambda d, g: g[f'repos/{REPO}/compare/{BASE}...{head}']['files'].append({'filename': 'src/server.js'})),
        ('live rename out of scope', lambda d, g: g[f'repos/{REPO}/compare/{BASE}...{head}']['files'].append(
            {'filename': 'scripts/security-verification.py', 'previous_filename': 'src/server.js'})),
        ('head not descended from BASE', lambda d, g: g[f'repos/{REPO}/compare/{BASE}...{head}'].update(status='diverged')),
        ('fixture hash not at live head', lambda d, g: d.update(fixture_sha256='0' * 64)),
        ('stale independent QA', lambda d, g: d['qa'].update(head_sha='b' * 40)),
        ('QA comment on another pull request', lambda d, g: g[comment_path].update(
            issue_url=f'https://api.github.com/repos/{REPO}/issues/2')),
        ('QA comment without the live head', lambda d, g: g[comment_path].update(body='AXM-721 QA: PASS')),
        ('QA comment with a failing verdict', lambda d, g: g[comment_path].update(body=f'AXM-721 QA: FAIL {head}')),
        ('status comment naming the head', lambda d, g: g[comment_path].update(body=f'Pushed {head}; QA: PASS pending')),
        ('edited QA comment', lambda d, g: g[comment_path].update(updated_at='2026-10-29T21:00:00Z')),
        ('QA comment before the CI result', lambda d, g: g[comment_path].update(
            created_at='2026-10-29T18:00:00Z', updated_at='2026-10-29T18:00:00Z')),
        ('rerun hiding a failed attempt', lambda d, g: g[run_path].update(run_attempt=2)),
        ('neutralized npm test script at the live head', lambda d, g: g.update(
            {contents(head, 'package.json'): encoded(json.dumps({**head_manifest, 'scripts': {'test': 'true'}}).encode())})),
        ('lockfile differs from the scanned lock', lambda d, g: g.update({contents(head, 'package-lock.json'): encoded(b'other\n')})),
        ('scanned baseline lock is not BASE', lambda d, g: g.update({contents(BASE, 'package-lock.json'): encoded(b'other\n')})),
        ('QA comment with PASS and FAIL verdicts', lambda d, g: g[comment_path].update(
            body=f'AXM-721 QA: PASS {head}\nAXM-721 QA: FAIL {head}')),
        ('QA evidence outside this pull request', lambda d, g: d['qa'].update(evidence_url=f'https://github.com/{REPO}/blob/master/README.md')),
        ('duplicate baseline and candidate links', lambda d, g: d.update(candidate_test_url=d['baseline_test_url'])),
        ('candidate link for wrong revision', lambda d, g: d.update(candidate_test_url=d['candidate_test_url'].replace(head, 'b' * 40))),
        ('baseline link for wrong revision', lambda d, g: d.update(baseline_test_url=d['candidate_test_url'])),
        ('placeholder QA evidence', lambda d, g: d['qa'].update(evidence_url='https://example.com/todo')),
        ('synthetic QA evidence', lambda d, g: d['qa'].update(evidence_url='synthetic')),
        ('localhost QA evidence', lambda d, g: d['qa'].update(evidence_url='https://localhost/evidence')),
        ('http QA evidence', lambda d, g: d['qa'].update(evidence_url=f'http://github.com/{REPO}/pull/1#issuecomment-2')),
        ('boolean usage value', lambda d, g: d['usage'].update(cost_usd=True)),
    ]:
        malformed, responses = copy.deepcopy(publication), copy.deepcopy(remote)
        mutate(malformed, responses)
        rejects(name, lambda: check_publication(malformed, scanned, proof_fixture, fake(responses)))
    publication.pop('candidate_test_url')
    rejects('incomplete publication report', lambda: check_publication(publication, scanned, proof_fixture, fake(remote)))
    return {'negative_controls_rejected': rejected, 'count': len(rejected), 'checked_utc': now()}


def manifest(directory):
    directory = Path(directory)
    write(directory / 'manifest.json', {'created_utc': now(), 'checkout_sha': git('rev-parse', 'HEAD'),
          'github_sha': os.environ.get('GITHUB_SHA'), 'candidate_sha': os.environ.get('CANDIDATE_SHA'),
          'files': {str(p.relative_to(directory)): digest(p) for p in sorted(directory.rglob('*'))
                    if p.is_file() and p.name != 'manifest.json' and 'node_modules' not in p.parts}})


def ci_capture(directory):
    directory = Path(directory).resolve()
    write(directory / 'scope.json', check_tree('.'))
    head = git('rev-parse', 'HEAD')
    observed = os.environ['GITHUB_SHA']
    candidate = os.environ['CANDIDATE_SHA']
    parents = git('show', '-s', '--format=%P', head).split()
    check_identity(candidate, observed, parents)
    assert observed == head, 'checkout is not GITHUB_SHA'
    write(directory / 'provenance.json', {'observed_github_sha': observed, 'checkout_sha': head,
          'candidate_sha': candidate, 'checkout_parents': parents, 'event_name': os.environ.get('GITHUB_EVENT_NAME'),
          'remote_head': 'not read here; the publication check re-reads it from GitHub',
          'scanner': 'not run in CI; equivalent native OSV reports retained separately'})
    with tempfile.TemporaryDirectory(prefix='axm-721-baseline-') as temp:
        temp = Path(temp)
        archive = directory / 'baseline.tar'
        with archive.open('wb') as stream:
            subprocess.run(['git', 'archive', BASE], stdout=stream, check=True)
        with tarfile.open(archive) as stream:
            stream.extractall(temp, filter='data')
        archive.unlink()
        for label, argv in [('baseline-ci', ['npm', 'ci']), ('baseline-lint', ['npm', 'run', 'lint']),
                            ('baseline-test', ['npm', 'test', '--', '--test-reporter=tap'])]:
            assert record(directory, label, temp, argv) == 0
        fixture = 'test/security-dependencies.test.js'
        (temp / fixture).write_bytes(Path(fixture).read_bytes())
        write(directory / 'fixture.json', {'baseline': digest(temp / fixture), 'candidate': digest(fixture)})
        assert record(directory, 'red-security', temp, ['node', '--test', '--test-reporter=tap', fixture]) == 1
        write(directory / 'red-validation.json', check_red((directory / 'red-security.stdout.txt').read_text()))
    assert record(directory, 'green-security', '.', ['node', '--test', '--test-reporter=tap', fixture]) == 0
    manifest(directory)


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
    p = sub.add_parser('verify'); p.add_argument('directory'); p.add_argument('candidate'); p.add_argument('output')
    p = sub.add_parser('selftest'); p.add_argument('directory'); p.add_argument('output')
    p = sub.add_parser('manifest'); p.add_argument('directory')
    p = sub.add_parser('ci-capture'); p.add_argument('directory')
    p = sub.add_parser('publication'); p.add_argument('report'); p.add_argument('proof'); p.add_argument('checkout')
    args = parser.parse_args()
    if not __debug__:
        sys.exit('refusing to run with -O or PYTHONOPTIMIZE: every check is an assert')
    if args.action == 'record':
        sys.exit(record(args.directory, args.label, args.cwd, args.command))
    if args.action == 'inventory':
        write(args.output, inventory(args.root))
    if args.action == 'scope':
        write(args.output, check_tree(args.root))
    if args.action == 'compare':
        write(args.output, compare(findings(args.before_scan, args.before_lock), findings(args.after_scan, args.after_lock)))
    if args.action == 'verify':
        write(args.output, check_evidence(args.directory, args.candidate))
    if args.action == 'selftest':
        write(args.output, selftest(args.directory))
    if args.action == 'manifest':
        manifest(args.directory)
    if args.action == 'ci-capture':
        ci_capture(args.directory)
    if args.action == 'publication':
        print(json.dumps(publication(args.report, args.proof, args.checkout), indent=2))


if __name__ == '__main__':
    main()

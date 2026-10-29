#!/usr/bin/env python3
"""AXM-721 proof helpers. Outputs are local files, never uploaded by this script."""
import argparse
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
from urllib.parse import urlparse

BASE = 'dff02375d83394d6f03ce2127e35e62fadc269ab'
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
    return path in ['package.json', 'package-lock.json', 'test/security-dependencies.test.js',
                    'docs/security-verification.md', '.github/workflows/ci.yml'] or bool(
                        re.fullmatch(r'scripts/security-verification\.[^/]+', path))


def check_tree(root):
    paths = set(git('diff', BASE, '--name-only', cwd=root).splitlines())
    paths.update(git('ls-files', '--others', '--exclude-standard', cwd=root).splitlines())
    hashes = {}
    for name in ORIGINALS:
        original = subprocess.check_output(['git', 'show', f'{BASE}:{name}'], cwd=root)
        assert (Path(root) / name).read_bytes() == original, f'original test changed: {name}'
        hashes[name] = hashlib.sha256(original).hexdigest()
    assert all(allowed(p) for p in paths), f'outside allowed scope: {paths}'
    manifest = json.loads((Path(root) / 'package.json').read_text())
    original = json.loads(git('show', f'{BASE}:package.json', cwd=root))
    for name in ['brace-expansion', 'js-yaml']:
        assert manifest['overrides'][name] == original['overrides'][name], f'override changed: {name}'
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


def check_identity(candidate, remote, observed, parents):
    assert re.fullmatch('[0-9a-f]{40}', candidate), 'missing candidate revision'
    assert candidate == remote, 'stale remote head'
    assert observed == candidate or candidate in parents, 'CI GITHUB_SHA does not identify candidate or merge parent'


def check_evidence_url(url):
    assert isinstance(url, str) and url.startswith('https://'), 'QA evidence url must be https'
    parsed = urlparse(url)
    assert not re.search(r'example|todo|tbd|placeholder|synthetic|localhost|127\.0\.0\.1', url, re.I), 'QA evidence url is a placeholder'
    assert parsed.hostname in ('github.com', 'axiom-stage.truxt.ai') and len(parsed.path.strip('/')) > 0, 'QA evidence url host not expected'
    if parsed.hostname == 'github.com':
        assert parsed.path.startswith('/truxt-ai/ops-dashboard/'), 'QA evidence url is outside the repository'


def check_publication(report):
    assert report['baseline_sha'] == BASE and report['fixture_sha256']
    assert report['pr_url'].startswith('https://github.com/truxt-ai/ops-dashboard/pull/')
    repo = 'https://github.com/truxt-ai/ops-dashboard/tree/'
    assert report['baseline_test_url'] == f'{repo}{BASE}/test', 'baseline test link must identify BASE'
    assert re.fullmatch(re.escape(repo) + r'[0-9a-f]{40}/test', report['candidate_test_url']), 'candidate test link is not immutable'
    assert report['candidate_test_url'] == f"{repo}{report['head_sha']}/test", 'candidate test link must identify the candidate head'
    assert report['candidate_test_url'] != report['baseline_test_url'], 'baseline and candidate test links must differ'
    ci = report['ci']
    assert ci['conclusion'] == 'success' and re.fullmatch(
        r'https://github\.com/truxt-ai/ops-dashboard/actions/runs/[0-9]+', ci['run_url']), 'exact-head CI run/log publication pending'
    check_identity(report['head_sha'], report['remote_head_sha'], ci['github_sha'], ci['parents'])
    assert report['qa']['head_sha'] == report['head_sha'], 'independent QA pending'
    check_evidence_url(report['qa'].get('evidence_url'))
    for name in ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cost_usd']:
        value = report['usage'][name]
        assert value is None or (isinstance(value, (int, float)) and value >= 0)
    assert report['usage']['scope'] and report['usage']['unrecorded_reason']


def check_evidence(directory, candidate):
    directory = Path(directory)
    for p in (directory / 'commands').glob('*.meta.json'):
        check_record(json.loads(p.read_text()), p.parent, p.name.removesuffix('.meta.json'))
    fixture = json.loads((directory / 'fixture-final.json').read_text())
    assert fixture['sha256'] == fixture['baseline_sha256'] == digest(Path(candidate) / 'test/security-dependencies.test.js'), 'fixture hash mismatch'
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
    tree = check_tree(candidate)
    assert tree['inventory'] == json.loads((directory / 'candidate-inventory.json').read_text()), 'incomplete copy inventory'
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
    rejects('stale candidate head', lambda: check_identity('a' * 40, 'b' * 40, 'a' * 40, []))
    rejects('unrelated CI revision', lambda: check_identity('a' * 40, 'a' * 40, 'b' * 40, []))
    check_identity('a' * 40, 'a' * 40, 'c' * 40, ['a' * 40, 'b' * 40])
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
        subprocess.run(['git', '-C', str(temp), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(temp), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                        '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture'], check=True)
        global BASE
        original_base = BASE
        BASE = git('rev-parse', 'HEAD', cwd=temp)
        try:
            (temp / ORIGINALS[0]).write_text('assert(false);\n')
            rejects('altered original test', lambda: check_tree(temp))
            (temp / ORIGINALS[0]).write_text('assert(true);\n')
            (temp / 'unexpected.js').write_text('')
            rejects('outside allowed scope', lambda: check_tree(temp))
        finally:
            BASE = original_base
    fixture = json.loads((directory / 'fixture-final.json').read_text())
    original_hash = fixture['sha256']
    fixture['sha256'] = '0' * 64
    rejects('mismatched fixtures', lambda: require_equal(fixture['sha256'], original_hash))
    inv = json.loads((directory / 'candidate-inventory.json').read_text())
    malformed_inventory = copy.deepcopy(inv)
    malformed_inventory['copies'].pop()
    rejects('incomplete installed inventory', lambda: require_equal(inv, malformed_inventory))
    publication = {'baseline_sha': BASE, 'fixture_sha256': original_hash,
                   'pr_url': 'https://github.com/truxt-ai/ops-dashboard/pull/1',
                   'baseline_test_url': f'https://github.com/truxt-ai/ops-dashboard/tree/{BASE}/test',
                   'candidate_test_url': f"https://github.com/truxt-ai/ops-dashboard/tree/{'a' * 40}/test",
                   'head_sha': 'a' * 40, 'remote_head_sha': 'a' * 40,
                   'ci': {'conclusion': 'success',
                          'run_url': 'https://github.com/truxt-ai/ops-dashboard/actions/runs/1',
                          'github_sha': 'a' * 40, 'parents': []},
                   'qa': {'head_sha': 'a' * 40, 'evidence_url': 'https://github.com/truxt-ai/ops-dashboard/pull/1#issuecomment-1'},
                   'usage': {'input_tokens': None, 'output_tokens': None, 'cached_input_tokens': None, 'cost_usd': None,
                             'scope': 'synthetic negative control', 'unrecorded_reason': 'synthetic'}}
    check_publication(publication)
    for name, mutate in [
        ('missing CI run link', lambda d: d['ci'].pop('run_url')),
        ('invalid CI run link', lambda d: d['ci'].update(run_url='synthetic')),
        ('failed CI run', lambda d: d['ci'].update(conclusion='failure')),
        ('stale independent QA', lambda d: d['qa'].update(head_sha='b' * 40)),
        ('duplicate baseline and candidate links', lambda d: d.update(candidate_test_url=d['baseline_test_url'])),
        ('candidate link for wrong revision', lambda d: d.update(candidate_test_url=d['candidate_test_url'].replace('a' * 40, 'b' * 40))),
        ('baseline link for wrong revision', lambda d: d.update(baseline_test_url=d['candidate_test_url'])),
        ('placeholder QA evidence', lambda d: d['qa'].update(evidence_url='https://example.com/todo')),
        ('synthetic QA evidence', lambda d: d['qa'].update(evidence_url='synthetic')),
        ('localhost QA evidence', lambda d: d['qa'].update(evidence_url='https://localhost/evidence')),
        ('http QA evidence', lambda d: d['qa'].update(evidence_url='http://github.com/truxt-ai/ops-dashboard/pull/1')),
    ]:
        malformed = copy.deepcopy(publication)
        mutate(malformed)
        rejects(name, lambda: check_publication(malformed))
    publication.pop('candidate_test_url')
    rejects('incomplete publication report', lambda: check_publication(publication))
    return {'negative_controls_rejected': rejected, 'count': len(rejected), 'checked_utc': now()}


def require_equal(left, right):
    assert left == right


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
    check_identity(candidate, candidate, observed, parents)
    assert observed == head
    write(directory / 'provenance.json', {'observed_github_sha': observed, 'checkout_sha': head,
          'candidate_sha': candidate, 'checkout_parents': parents, 'event_name': os.environ.get('GITHUB_EVENT_NAME'),
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
    p = sub.add_parser('publication'); p.add_argument('report')
    args = parser.parse_args()
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
        check_publication(json.loads(Path(args.report).read_text()))


if __name__ == '__main__':
    main()

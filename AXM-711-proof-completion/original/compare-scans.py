import hashlib
import json
from pathlib import Path

root = Path(__file__).parent / 'scans'
reports = {name: json.loads((root / f'{name}.json').read_text()) for name in ['baseline', 'final-head']}
parent = {}

def canonical(alias):
    parent.setdefault(alias, alias)
    if parent[alias] != alias:
        parent[alias] = canonical(parent[alias])
    return parent[alias]

for report in reports.values():
    for source in report['results']:
        for package in source['packages']:
            for group in package.get('groups', []):
                aliases = sorted(set(group['ids'] + group.get('aliases', [])))
                for alias in aliases:
                    parent[canonical(alias)] = canonical(aliases[0])

inventories, findings = {}, {}
for name, report in reports.items():
    inventory, groups = [], {}
    assert report['results'], 'No results'
    for source in report['results']:
        for package in source['packages']:
            identity = package['package']
            inventory.append(identity)
            for group in package.get('groups', []):
                aliases = sorted(set(group['ids'] + group.get('aliases', [])))
                key = (identity['ecosystem'], identity['name'], canonical(aliases[0]))
                row = groups.setdefault(key, {'ecosystem': identity['ecosystem'], 'package': identity['name'], 'aliases': [], 'occurrences': []})
                row['aliases'] = sorted(set(row['aliases'] + aliases))
                row['occurrences'].append({'version': identity['version'], 'source': source['source'], 'dependency_groups': package.get('dependency_groups', []), 'severity': group.get('max_severity'), 'ids': group['ids']})
    inventories[name], findings[name] = inventory, groups

before, after = findings['baseline'], findings['final-head']
added = [after[k] for k in sorted(after.keys() - before.keys())]
removed = [before[k] for k in sorted(before.keys() - after.keys())]
retained = [{'before': before[k], 'after': after[k], 'status': 'open'} for k in sorted(before.keys() & after.keys())]
target = {'CVE-2026-90711', 'GHSA-jqcg-44mw-7w3h'}
result = {'scanner': 'OSV 2.6.0', 'database': 'live OSV API', 'package_inventory': inventories,
          'report_sha256': {n: hashlib.sha256((root / f'{n}.json').read_bytes()).hexdigest() for n in reports},
          'counts': {'baseline_packages': len(inventories['baseline']), 'final_packages': len(inventories['final-head']), 'baseline_findings': len(before), 'final_findings': len(after), 'added': len(added), 'removed': len(removed), 'retained': len(retained)},
          'added': added, 'removed': removed, 'retained': retained,
          'target_absent': not any(target & set(row['aliases']) for row in after.values())}
(root / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
lines = ['# Complete scan comparison', '', 'All retained findings below remain open. Full package/version inventories and before/after occurrence details are in [comparison.json](comparison.json).', '', '| Package | Version | Advisory aliases | CVSS | State |', '| --- | --- | --- | --- | --- |']
for row in [after[k] for k in sorted(after)]:
    lines.append('| ' + ' | '.join([row['package'], ', '.join(sorted({o['version'] for o in row['occurrences']})), ', '.join(row['aliases']), ', '.join(sorted({str(o['severity']) for o in row['occurrences']})), 'Open']) + ' |')
(root / 'comparison.md').write_text('\n'.join(lines) + '\n')
print(json.dumps(result['counts'], indent=2))
print('Removed:', json.dumps(removed))
print('Added:', json.dumps(added))
assert len(before) == 50 and len(after) == 49 and len(retained) == 49
assert not added and len(removed) == 1 and target <= set(removed[0]['aliases']) and result['target_absent']
assert len(inventories['baseline']) == len(inventories['final-head']) == 175

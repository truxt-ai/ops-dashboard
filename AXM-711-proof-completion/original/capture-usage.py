import datetime
import json
import os
from pathlib import Path

root = Path(__file__).parent
session_id = '01a1775a-c4e9-7bd3-a862-59685c5c992f'
folder = Path(os.environ['CODEX_HOME']) / 'sessions/2026/10/26'
source = next(p for p in folder.iterdir() if session_id in p.name)
latest, model = None, None
for line in source.open():
    try:
        event = json.loads(line)
    except ValueError:
        continue
    payload = event.get('payload', {})
    if event.get('type') == 'turn_context':
        model = payload.get('model', model)
    if event.get('type') == 'event_msg' and payload.get('type') == 'token_count' and payload.get('info'):
        latest = {'timestamp': event.get('timestamp'), 'total_token_usage': payload['info']['total_token_usage']}
assert latest is not None
totals = latest['total_token_usage']
record = {'captured_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'session_id': session_id, 'agent': 'Security Remediation',
          'agent_id': '1be3dfa3-1e60-490c-921c-4bf25551fa2f', 'model': model,
          'responsible_developer': 'Raunak Poonia', 'source': str(source),
          'native_event': latest,
          'fresh_input_tokens_so_far': totals['input_tokens'] - totals.get('cached_input_tokens', 0),
          'output_tokens_so_far': totals['output_tokens'],
          'cached_input_tokens_so_far': totals.get('cached_input_tokens', 0),
          'execution_cost_usd': None, 'planning_actual_usage': None,
          'estimates_not_actuals': {'fresh_input_output_estimate': '50–200k', 'planning_allowance_usd': 10},
          'limitations': ['In-progress native snapshot, not final run totals.',
                         'Later tool calls and final response are outside this snapshot.',
                         'Native token event contains no billed cost.',
                         'Separate planning usage and independent QA usage are unavailable to this worker.',
                         'Reference AXM-707 usage is not included as AXM-708 usage.']}
(root / 'usage.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))

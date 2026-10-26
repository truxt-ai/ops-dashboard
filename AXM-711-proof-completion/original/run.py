import datetime
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

root = Path(__file__).parent
name, *command = sys.argv[1:]
env = os.environ.copy()
env['PATH'] = str(root / 'tools/node-v20.20.2-linux-arm64/bin') + ':' + env['PATH']
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
log = root / (name + '.txt')
log.parent.mkdir(parents=True, exist_ok=True)
with log.open('w') as output:
    output.write(f'Start: {start}\nRevision: {revision}\nCWD: {os.getcwd()}\nCommand: {shlex.join(command)}\nNode bin: {root}/tools/node-v20.20.2-linux-arm64/bin\n\n')
    output.flush()
    result = subprocess.run(command, env=env, stdout=output, stderr=subprocess.STDOUT)
    end = datetime.datetime.now(datetime.timezone.utc).isoformat()
    output.write(f'\nEnd: {end}\nExit status: {result.returncode}\n')
metadata = dict(command=command, cwd=os.getcwd(), revision=revision, started_at=start, ended_at=end, exit_code=result.returncode, log=str(log))
(root / (name + '.meta.json')).write_text(json.dumps(metadata, indent=2) + '\n')
print(log.read_text())
sys.exit(result.returncode)

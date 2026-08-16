import json
from pathlib import Path

path = Path('/home/ubuntu/xelitesolutions-review/api/data/db/chat-messages.json')
items = json.loads(path.read_text()) if path.exists() else []
keywords = ('Build stopped honestly', 'Live-run evidence', 'liveRun', 'repair', 'project_run', 'Self-fix', 'stopped honestly', 'Phases:')
for item in items:
    text = str(item.get('content', ''))
    if 'run-1786842315641' not in text and item.get('runId') != 'run-1786842315641':
        continue
    print('id=', item.get('_id'), 'session=', item.get('sessionId'), 'role=', item.get('role'), 'created=', item.get('createdAt'), 'runId=', item.get('runId'))
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if any(k.lower() in line.lower() for k in keywords):
            print(f'{i+1}: {line[:1000]}')
            for nearby in lines[max(0, i-2):min(len(lines), i+3)]:
                print('  ', nearby[:1000])
    print('text_len=', len(text))
    print('---')

import json
import subprocess
from copy import deepcopy
from pathlib import Path

from database import get_db
from journey import CATALOG, compile_journey, default_journey, new_bead, guide_view
from skill_guide import GUIDE, NODE_GUIDE, describe_build


def snapshot_db(app):
    with app.app_context():
        return '\n'.join(get_db().iterdump())


def test_preview_is_read_only_and_rejects_bad_version_owner_and_frozen(app, client):
    saved = client.get('/api/journey').get_json()
    before = snapshot_db(app)
    build = {k: deepcopy(saved['state'][k]) for k in ('nodes', 'loadout')}
    build['nodes']['li.core'] = None
    payload = dict(build, revision=saved['revision'], owner_id=None)
    result = client.post('/api/journey/build-preview', json=payload)
    assert result.status_code == 200
    assert result.json['compiled']['skills'][0] is None
    assert snapshot_db(app) == before
    assert client.post('/api/journey/build-preview', json={**payload, 'revision': 99}).status_code == 409
    assert client.post('/api/journey/build-preview', json={**payload, 'owner_id': 4}).status_code == 409
    invalid = deepcopy(payload)
    invalid['nodes']['li.core'] = 'kan.core'
    assert client.post('/api/journey/build-preview', json=invalid).status_code == 400
    assert snapshot_db(app) == before
    started = client.post('/api/journey', json={'action': 'start', 'owner_id': None, 'revision': 0, 'realm_id': 'fire', 'map_id': 'ridge'}).json
    assert client.post('/api/journey/build-preview', json={**payload, 'revision': started['revision']}).status_code == 400


def test_preview_account_csrf_and_isolation(client):
    registered = client.post('/api/auth/register', json={'username': 'guideplayer', 'password': 'password-046'}).json
    data = client.get('/api/journey').json
    payload = {'owner_id': registered['user']['id'], 'revision': data['revision'], 'nodes': data['state']['nodes'], 'loadout': data['state']['loadout']}
    assert client.post('/api/journey/build-preview', json=payload).status_code == 403
    headers = {'X-CSRF-Token': registered['csrf_token']}
    assert client.post('/api/journey/build-preview', json={**payload, 'owner_id': None}, headers=headers).status_code == 409
    assert client.post('/api/journey/build-preview', json=payload, headers=headers).status_code == 200
    assert client.get('/api/journey').json['revision'] == data['revision']


def test_all_guides_and_live_runtime_match():
    assert len(GUIDE) == 8 and len(NODE_GUIDE) == 5
    cases = []
    for palace in GUIDE:
        for level in (1, 2, 3):
            for variant in (None, 'edge', 'flow'):
                state = default_journey()
                state['rank'] = 1
                state['beads'] = [dict(new_bead(k), level=level) for k in CATALOG]
                ids = {palace+'.'+r for r in ('core', 'trace', 'mind')}
                ids.update(('li.core', 'li.mind', 'kan.core', 'kan.mind'))
                if variant:
                    ids.add(palace+'.'+variant)
                state['nodes'] = {k: k if k in ids else None for k in CATALOG}
                state['loadout'] = {'active': [palace, None], 'passive': ['li', 'kan']}
                compiled = compile_journey(state)
                view = describe_build(compiled)['skills'][0]
                assert view['damage'] == compiled['skills'][0]['damage'] + 1 + level
                assert view['cooldown'] == round(1.5*(.95-.05*level), 3)
                assert guide_view(state)['catalog'][palace]['skill'] == view
                cases.append({'compiled': compiled, 'expected': view})
                if level == 1:
                    historical = deepcopy(compiled)
                    historical.pop('mind_levels')
                    assert describe_build(historical)['skills'][0] == view
                    cases.append({'compiled': historical, 'expected': view})
    result = subprocess.run(['node', str(Path(__file__).parent/'helpers/guide-runtime.cjs')], input=json.dumps(cases), text=True, capture_output=True, timeout=20)
    assert result.returncode == 0, result.stderr

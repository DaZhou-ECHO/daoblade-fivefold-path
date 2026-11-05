from copy import deepcopy
import pytest
from app import create_app
from database import get_db
from journey import COMBOS, CONFIG, default_journey, compile_journey, new_bead, trial_layout, MAPS_V2


@pytest.mark.parametrize('recipe', COMBOS, ids=lambda c: c['id'])
def test_ordered_recipe_requires_two_connected_cores(recipe):
    state = default_journey()
    keys = [recipe['main']+'.core', recipe['sub']+'.core']
    state['beads'] = [new_bead(k) for k in keys]
    state['nodes'] = {n['id']: n['id'] if n['id'] in keys else None for n in CONFIG['nodes']}
    state['loadout'] = {'active': [recipe['main'], recipe['sub']], 'passive': [None, None]}
    assert compile_journey(state)['combo'] == recipe
    state['nodes'][keys[1]] = None
    assert compile_journey(state)['combo'] is None
    state['nodes'][keys[1]] = keys[1]
    state['loadout']['active'].reverse()
    assert compile_journey(state)['combo'] is None


def test_practice_is_read_only_and_revision_scoped(tmp_path):
    app = create_app({'TESTING': True, 'SECRET_KEY': '049-test', 'DATABASE': str(tmp_path/'049.sqlite')})
    c = app.test_client()
    current = c.get('/api/journey?save_id=guest').get_json()
    build = deepcopy(current['state'])
    build['loadout']['active'][1] = 'gen'
    payload = {'save_id': 'guest', 'owner_id': None, 'revision': current['revision'],
               'nodes': build['nodes'], 'loadout': build['loadout']}
    result = c.post('/api/journey/practice-preview', json=payload)
    assert result.status_code == 200, result.get_json()
    assert result.get_json()['compiled']['combo']['id'] == 'li-gen'
    assert not result.get_json()['borrowed']
    for recipe in COMBOS:
        borrowed = c.post('/api/journey/practice-preview', json={**payload, 'recipe_id': recipe['id']})
        assert borrowed.status_code == 200
        assert borrowed.get_json()['borrowed']
        assert borrowed.get_json()['compiled']['used'] == 2
    assert c.post('/api/journey/practice-preview', json={**payload, 'revision': 999}).status_code == 409
    assert c.post('/api/journey/practice-preview', json={**payload, 'recipe_id': 'invalid'}).status_code == 400
    after = c.get('/api/journey?save_id=guest').get_json()
    assert after == current
    with app.app_context():
        assert get_db().execute('SELECT count(*) FROM journey_saves').fetchone()[0] == 0
        assert get_db().execute('SELECT count(*) FROM journey_results').fetchone()[0] == 0


def test_new_trial_and_legacy_versions(tmp_path):
    app = create_app({'TESTING': True, 'SECRET_KEY': '049-test', 'DATABASE': str(tmp_path/'049.sqlite')})
    c = app.test_client()
    res = c.post('/api/journey', json={'save_id': 'guest', 'owner_id': None, 'revision': 0,
                 'action': 'start', 'realm_id': 'fire', 'map_id': 'ridge'})
    assert res.status_code == 200
    t = res.get_json()['state']['active_trial']
    assert (t['map_version'], t['combat_version']) == (2, 3)
    assert trial_layout(t) == MAPS_V2['fire:ridge']
    for version in [1, 2]:
        old = {**t, 'map_version': version, 'combat_version': version}
        snapshot = deepcopy(old)
        trial_layout(old)
        assert old == snapshot
    assert c.post('/api/journey/practice-preview', json={'save_id': 'guest', 'owner_id': None,
                  'revision': res.get_json()['revision'], 'recipe_id': 'li-gen'}).status_code == 400

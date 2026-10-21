from copy import deepcopy
import pytest
from journey import default_journey, compile_journey, validate_build, new_bead, CATALOG


def test_eight_palaces_connect_exclusive_and_only_selected_effective():
    state = default_journey()
    state["rank"] = 1
    state["beads"] = [new_bead(k) for k in CATALOG]
    for palace in ("qian", "dui", "zhen", "xun", "li", "kan", "gen", "kun"):
        state["nodes"] = {k: None for k in CATALOG}
        for role in ("core", "trace", "mind"):
            state["nodes"][palace+"."+role] = palace+"."+role
        state["loadout"] = {"active": [palace, None], "passive": [None, None]}
        result = compile_journey(state)
        assert result["skills"][0]["id"] == palace
        assert palace+".mind" not in result["effective_bead_ids"]
        state["loadout"]["passive"][0] = palace
        assert palace in compile_journey(state)["minds"]
        state["nodes"][palace+".core"] = None
        result = compile_journey(state)
        assert result["skills"][0] is None and not result["minds"]
        assert result["inactive"]
    state = default_journey()
    state["nodes"]["kan.core"] = "li.core"
    with pytest.raises(ValueError): validate_build(state)
    state = default_journey();state["loadout"]["active"] = ["li", "li"]
    with pytest.raises(ValueError): validate_build(state)
    state = default_journey();state["beads"].append(new_bead("li.flow"));state["nodes"]["li.flow"]="li.flow"
    with pytest.raises(ValueError): validate_build(state)


def request_api(client):
    data = client.get('/api/journey').get_json()
    def action(action, **extra):
        nonlocal data
        res = client.post('/api/journey', json={"action": action, "revision": data['revision'], "owner_id": None, **extra})
        assert res.status_code == 200, res.get_json()
        data = res.get_json()
        return data
    return action


def test_real_sqlite_five_elements_drops_growth_replay_and_breakthrough(client):
    action = request_api(client)
    for realm in ['fire','wood','earth','metal','water']:
        started=action('start',realm_id=realm,map_id='hollow')
        trial=started['state']['active_trial'];tid=trial['id']
        assert trial['compiled']==started['compiled']
        # API-only simulated wins test transactions, not browser evidence.
        action('altar',trial_id=tid,altar_id='altar-1')
        action('altar',trial_id=tid,altar_id='altar-1')
        result=action('settle',trial_id=tid,win=True,defeated_ids=[f'enemy-{i}' for i in range(1,7)])
        assert result['receipt']['spirit']>=16
        assert result['receipt']['base_spirit']==12 and result['receipt']['branch_spirit']==4
        assert result['receipt']['spirit']==16+result['receipt']['duplicate_spirit']
        for drop in result['receipt']['drops']:
            assert CATALOG[drop['id']]['element']==realm
        replay=action('settle',trial_id=tid,win=True,defeated_ids=[])
        assert replay['replayed'] and replay['state']==result['state'] and replay['revision']==result['revision']
    state=client.get('/api/journey').get_json()['state']
    assert len(state['beads'])==25  # starter edge + 8*3 core/trace/mind
    assert len({b['id'] for b in state['beads']})==len(state['beads'])
    assert state['rank']==0 and state['progress']['spirit']>=24
    start=action('start',realm_id='fire',breakthrough=True)
    tid=start['state']['active_trial']['id'];before=start['state']['progress']['spirit']
    fail=action('settle',trial_id=tid,win=False,defeated_ids=[])
    assert fail['state']['rank']==0 and fail['state']['progress']['spirit']==before
    tid=action('start',realm_id='fire',breakthrough=True)['state']['active_trial']['id']
    win=action('settle',trial_id=tid,win=True,defeated_ids=['enemy-6'])
    assert win['state']['rank']==1 and win['compiled']['capacity']==10
    assert win['state']['progress']['spirit']==before-24 and not win['receipt']['drops']
    state=deepcopy(win['state']);state['nodes']={k:None for k in CATALOG}
    for palace in ['qian','kan','kun','xun']:
        for role in ['core','trace']:
            state['nodes'][palace+'.'+role]=palace+'.'+role
    result=action('build',nodes=state['nodes'],loadout={'active':['qian','kan'],'passive':['kun','xun']})
    assert result['compiled']['used']==8
    assert client.get('/api/journey').get_json()['state']==result['state']


def test_conflicts_owner_and_frozen_build(client):
    action=request_api(client)
    before=client.get('/api/journey').get_json()
    start=action('start',realm_id='wood')
    assert client.post('/api/journey',json={'action':'abandon','trial_id':start['state']['active_trial']['id'],'revision':0,'owner_id':None}).status_code==409
    assert client.post('/api/journey',json={'action':'build','revision':start['revision'],'owner_id':None,'nodes':before['state']['nodes'],'loadout':before['state']['loadout']}).status_code==400
    assert client.post('/api/journey',json={'action':'start','revision':start['revision'],'owner_id':33}).status_code==409
    assert client.post('/api/journey',json={'action':'settle','revision':start['revision'],'owner_id':None,'trial_id':start['state']['active_trial']['id'],'win':True,'defeated_ids':['enemy-6']}).status_code==400
    tid=start['state']['active_trial']['id']
    cp=action('checkpoint',trial_id=tid,defeated_ids=['enemy-1','enemy-2','enemy-3'])
    failed=action('settle',trial_id=tid,win=False,defeated_ids=['enemy-1','enemy-2','enemy-3'])
    assert failed['state']['active_trial']==cp['state']['active_trial']
    assert failed['revision']==cp['revision']
    action('abandon',trial_id=tid)


def test_engine_fixtures_match_server_compiler():
    import json
    from pathlib import Path
    from journey import PALACES
    fixtures=json.loads((Path(__file__).parent/'helpers/journey-builds.json').read_text(encoding='utf-8'))
    for palace, fixture in zip(PALACES,fixtures):
        state=default_journey();state['beads']=[new_bead(k) for k in CATALOG];state['nodes']={k:None for k in CATALOG}
        for role in ['core','trace','mind']:state['nodes'][palace[0]+'.'+role]=palace[0]+'.'+role
        state['loadout']={'active':[palace[0],None],'passive':[palace[0],None]}
        assert compile_journey(state)==fixture


def test_ui_fixture_matches_server_contract():
    import json
    from pathlib import Path
    from journey import CONFIG, response
    fixture=json.loads((Path(__file__).parent/'helpers/journey-ui.json').read_text(encoding='utf-8'))
    assert fixture=={'config':CONFIG, **response(default_journey(),0), 'owner_id':None}

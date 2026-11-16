import json
import pytest
from app import create_app
from database import get_db
from journey import default_journey, MAPS_V2, compile_journey


@pytest.fixture
def game(tmp_path):
    app = create_app({'TESTING': True, 'SECRET_KEY': '048-test', 'DATABASE': str(tmp_path/'048.sqlite3')})
    return app, app.test_client()


def account(client, name='player048'):
    data = client.post('/api/auth/register', json={'username': name, 'password': 'test-password'}).get_json()
    return data['user']['id'], {'X-CSRF-Token': data['csrf_token']}


def create(client, headers, name='山河行'):
    res = client.post('/api/saves', json={'name': name}, headers=headers)
    assert res.status_code == 201, res.get_json()
    return res.get_json()['save_id']


def load(client, save_id='guest'):
    res = client.get('/api/journey', query_string={'save_id': save_id})
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def action(client, current, action_kind, save_id='guest', headers=None, **extra):
    return client.post('/api/journey', json={'save_id': save_id, 'owner_id': current.get('owner_id'),
        'revision': current['revision'], 'action': action_kind, **extra}, headers=headers or {})


def win(client, current, realm='fire', route='ridge', branch=False):
    current = action(client,current,'start',realm_id=realm,map_id=route).get_json()
    trial=current['state']['active_trial']
    if branch:
        current=action(client,current,'altar',trial_id=trial['id'],altar_id='altar-1').get_json()
    layout=MAPS_V2[realm+':'+route]
    payload=dict(trial_id=trial['id'],win=True,defeated_ids=layout['required_ids'],exit_id=layout['exit']['id'])
    res=action(client,current,'settle',**payload)
    assert res.status_code == 200, res.get_json()
    return res.get_json(), current, payload


def test_three_slots_isolate_and_explicit_scope(game):
    app,c=game;owner,h=account(c)
    assert c.get('/api/journey').status_code == 409
    ids=[create(c,h,str(i)) for i in range(3)]
    assert c.post('/api/saves',json={},headers=h).status_code == 409
    first=load(c,ids[0]);changed=action(c,first,'story_read',ids[0],h,key='intro').get_json()
    assert changed['state']['story']['intro_read']
    assert not load(c,ids[1])['state']['story']['intro_read']
    assert not load(c,ids[2])['state']['story']['intro_read']
    other=app.test_client();_,oh=account(other,'other048')
    assert other.get('/api/journey',query_string={'save_id':ids[0]}).status_code==409
    assert action(other,first,'story_read',ids[0],oh,key='intro').status_code==409
    assert c.delete('/api/saves/'+ids[0],json={'revision':0,'version':0,'confirm_name':'0'},headers=h).status_code==409
    assert load(c,ids[0])['revision']==1


def test_old_alias_preserves_trials_and_reward_ledger(game):
    app,c=game;owner,h=account(c)
    state=default_journey();state.pop('story');state['progress']['spirit']=27
    state['active_trial']={'id':'old-trial','realm_id':'fire','map_id':'ridge','map_version':2,'combat_version':2,'checkpoint':None,'breakthrough':False}
    state['active_trial']['compiled']=compile_journey(state)
    with app.app_context():
        db=get_db();db.execute('INSERT INTO journey_saves VALUES(?,?,7)',(f'user:{owner}',json.dumps(state)))
        db.execute('INSERT INTO journey_results VALUES(?,?,?)',(f'user:{owner}','settled','{}'));db.commit()
    slot=c.get('/api/saves').get_json()['saves'][0]
    current=load(c,slot['id'])
    assert current['revision']==7
    assert current['state']['active_trial']['id']=='old-trial'
    assert current['state']['progress']['spirit']==27
    assert current['state']['story']['version']==1
    assert c.delete('/api/saves/'+slot['id'],json={'revision':7,'version':0,'confirm_name':slot['name']},headers=h).status_code==409
    with app.app_context():
        assert get_db().execute('SELECT count(*) FROM journey_results WHERE slot=?',(f'user:{owner}',)).fetchone()[0]==1


def test_guest_import_target_empty_and_deduplicated(game):
    app,c=game
    action(c,load(c),'story_read',key='intro')
    owner,h=account(c);a=create(c,h);b=create(c,h,'第二行')
    url='/api/auth/import-guest'
    imported=c.post(url,json={'save_id':a},headers=h)
    assert imported.status_code==200,imported.get_json()
    assert load(c,a)['state']['story']['intro_read']
    assert c.post(url,json={'save_id':a},headers=h).get_json()['replayed']
    assert c.post(url,json={'save_id':b},headers=h).status_code==409
    assert not load(c,b)['state']['story']['intro_read']
    assert load(app.test_client())['state']['story']['intro_read']


def test_slot_rename_and_exact_delete(game):
    _,c=game;_,h=account(c);a=create(c,h)
    url='/api/saves/'+a
    assert c.patch(url,json={'revision':0,'version':0,'name':'新行'},headers=h).status_code==200
    assert c.patch(url,json={'revision':0,'version':0,'name':'迟到的改名'},headers=h).status_code==409
    assert c.delete(url,json={'revision':0,'version':1,'confirm_name':'错名'},headers=h).status_code==409
    assert c.delete(url,json={'revision':0,'version':1,'confirm_name':'新行'},headers=h).status_code==200
    assert c.get('/api/journey',query_string={'save_id':a}).status_code==409
    assert c.get('/api/saves').get_json()['saves']==[]


@pytest.mark.parametrize('kind,branch,ready',[('clear',False,True),('branch',False,False),('branch',True,True)])
def test_bounty_victory_snapshot_and_repeated_claim(game,kind,branch,ready):
    _,c=game;current=load(c)
    current=action(c,current,'bounty_accept',realm='fire',kind=kind).get_json()
    bounty=current['state']['story']['bounty']['id']
    won,started,payload=win(c,current,branch=branch)
    assert won['state']['story']['bounty']['ready']==ready
    replay=action(c,started,'settle',**payload).get_json()
    assert replay['state']['progress']==won['state']['progress']
    claim=action(c,won,'bounty_claim',bounty_id=bounty)
    if ready:
        claimed=claim.get_json();assert claimed['state']['progress']['spirit']==won['state']['progress']['spirit']+2
        again=action(c,won,'bounty_claim',bounty_id=bounty).get_json()
        assert again['replayed'] and again['state']['progress']==claimed['state']['progress']
    else:
        assert claim.status_code==400


def test_bounty_wrong_region_frozen_and_failure(game):
    _,c=game;current=action(c,load(c),'bounty_accept',realm='wood',kind='clear').get_json()
    started=action(c,current,'start',realm_id='fire').get_json();trial=started['state']['active_trial']
    assert action(c,started,'bounty_cancel').status_code==400
    failed=action(c,started,'settle',trial_id=trial['id'],win=False,defeated_ids=[]).get_json()
    assert not failed['state']['story']['bounty']['ready']
    won,_,_=win(c,failed)
    assert not won['state']['story']['bounty']['ready']
    cancelled=action(c,won,'bounty_cancel').get_json()
    assert cancelled['state']['story']['bounty'] is None


@pytest.mark.parametrize('order',[['water','wood','metal','fire','earth'],['fire','earth','water','wood','metal']])
def test_chapter_free_order_and_explicit_reading(game,order):
    _,c=game;current=load(c)
    assert action(c,current,'story_read',key='ending').status_code==400
    current=action(c,current,'story_read',key='intro').get_json()
    for realm in order:
        current,_,_=win(c,current,realm=realm,route='hollow')
        assert realm not in current['state']['story']['read_clues']
        current=action(c,current,'story_read',key=realm).get_json()
    spirit=current['state']['progress']['spirit']
    ended=action(c,current,'story_read',key='ending').get_json()
    assert ended['state']['story']['completed']
    assert ended['state']['progress']['spirit']==spirit
    assert load(c)['state']['story']['completed']

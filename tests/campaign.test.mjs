import { createClassicGame as createGame, classicWorld } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { applyAction, projectedState } from '../lib/game.mjs';
import { restoreCampaign } from '../lib/campaign.mjs';

function fixture(legacy=false) {
  const r=createGame({id:'OLD123',name:'돌아온 세계',seed:'restore-test',gmName:'이전 GM',gmHash:'old-hash',invite:'old-invite'});
  if(legacy){r.world=classicWorld(r.seed,{width:22,height:14});r.knowledge={god:{},priest:{}};}
  applyAction(r,'god',{type:'create-god',name:'네뷸라',realm:'곤충'});
  applyAction(r,'god',{type:'select-tribe',tribeId:'dawn'});
  applyAction(r,'priest',{type:'create-priest',name:'하루',strength:30,intelligence:40,social:30});
  applyAction(r,'gm',{type:'technology',name:'조선',stage:2});
  applyAction(r,'priest',{type:'request',kind:'탐험',description:'섬으로 건너가기'});
  applyAction(r,'gm',{type:'narrate',audience:'god',message:'신만 아는 비밀'});
  applyAction(r,'gm',{type:'advance',hours:721});
  delete r.invite;
  r.players={gm:{name:'이전 GM'},god:null,priest:null}; // Exact legacy export shape, with no keys.
  return r;
}

test('legacy and large GM exports preserve all campaign state with fresh independent authentication',()=>{
  for(const legacy of [true,false]){
    const data=fixture(legacy), before=structuredClone(data);
    const room=restoreCampaign(data,{id:'NEW123',gmName:'새 GM',gmHash:'fresh-hash',invite:'fresh-invite'});
    for(const field of ['name','seed','createdAt','world','knowledge','god','priest','selectedTribe','actions','logs','day','hour','month','settings'])assert.deepEqual(room[field],data[field],field);
    assert.deepEqual(data,before);
    assert.equal(room.id,'NEW123'); assert.equal(room.revision,0);
    assert.deepEqual(room.players,{gm:{name:'새 GM',tokenHash:'fresh-hash'},god:null,priest:null});
    assert.equal(room.invite,'fresh-invite');
    assert.equal(projectedState(room,'priest').logs.some(l=>l.message==='신만 아는 비밀'),false);
    applyAction(room,'gm',{type:'advance',hours:24});
    assert.equal(room.day,data.day+1);
  }
});

test('import API validates files, creates separate rooms, rotates keys, allows rejoining and persists across restart',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'campaign-import-'));
  let app=await createApp({dataDir:dir});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  let base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const request=async(endpoint,data,key)=>{
    const res=await fetch(base+endpoint,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:res.status,data:await res.json()};
  };
  const campaign=fixture(true);
  let malformedRequests=0;
  for(const mutate of [
    r=>{r.schemaVersion=99;},
    r=>{r.world.tiles.pop();},
    r=>{r.world.tiles[0].terrain='invalid';},
    r=>{r.priest.tileId='999,999';},
    r=>{r.knowledge.priest['0,0']={id:'0,0'};},
    r=>{r.actions[0].status='invalid';},
    r=>{r.settings.workerOutput=-1;},
    r=>{r.world.tiles[0].river=[8];},
    r=>{r.world.tiles[0].altitude=-1;},
    r=>{r.world.tribes[0].technologies=[{name:'bad',stage:9}];},
    r=>{r.world.tribes[0].tileId='missing';},
    r=>{r.logs[0].audience='intruder';},
  ]){
    const broken=structuredClone(campaign);mutate(broken);
    assert.throws(()=>restoreCampaign(broken,{id:'BAD123',gmName:'GM',gmHash:'hash',invite:'invite'}));
    if (malformedRequests++ < 3) {
      const res=await request('/api/rooms/import',{campaign:broken,playerName:'GM'});
      assert.equal(res.status,400,res.data.error);
    }
  }
  assert.deepEqual(await readdir(dir),[]);
  const first=await request('/api/rooms/import',{campaign,playerName:'새 GM'});
  assert.equal(first.status,201); const {id,token,state}=first.data;
  assert.notEqual(id,campaign.id);assert.equal(state.world.width,22);assert.equal(state.world.tiles.length,308);
  const prefix=`/api/rooms/${id}`;
  assert.equal((await request(prefix+'/state',undefined,'old-key')).status,401);
  const god=await request(prefix+'/join',{role:'god',name:'돌아온 신',invite:state.invite});
  assert.equal(god.status,200);assert.equal(god.data.state.god.name,campaign.god.name);
  assert.equal((await request(prefix+'/join',{role:'priest',name:'돌아온 신관',invite:state.invite})).status,200);
  const exported=await request(prefix+'/export',undefined,token);
  assert.deepEqual(exported.data.world,campaign.world);
  const second=await request('/api/rooms/import',{campaign:exported.data,playerName:'복제 GM'});
  assert.equal(second.status,201);assert.notEqual(second.data.id,id);assert.notEqual(second.data.token,token);
  assert.equal((await request(`/api/rooms/${second.data.id}/state`,undefined,token)).status,401);
  assert.equal((await request(prefix+'/state',undefined,token)).status,200);
  const tooBig=await fetch(base+'/api/rooms/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(8*1024*1024)})});
  assert.equal(tooBig.status,413);
  await app.close();app=await createApp({dataDir:dir});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;
  const resumed=await request(prefix+'/state',undefined,token);
  assert.equal(resumed.status,200);assert.equal(resumed.data.priest.name,campaign.priest.name);
  assert.equal(resumed.data.day,campaign.day);
  assert.equal(resumed.data.tribes.find(t=>t.id===campaign.selectedTribe).technologies[0].name,'조선');
});

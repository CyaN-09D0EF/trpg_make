import { createClassicGame as createGame, classicWorld } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, projectedState, capacity, DEFAULT_SETTINGS, joinGame } from '../lib/game.mjs';
import { generateWorld, neighbors, edgeNeighbors, WIDTH, HEIGHT } from '../lib/world.mjs';

function room() { return createGame({ id: 'ABC123', name: '시험 세계', seed: 'test-seed', gmName: '마스터', gmHash: 'secret', invite: 'invite-key' }); }
function started() {
  const r = room();
  joinGame(r, { role: 'god', name: '신', tokenHash: 'god-secret' });
  joinGame(r, { role: 'priest', name: '신관', tokenHash: 'priest-secret' });
  applyAction(r, 'god', { type: 'create-god', name: '네뷸라', realm: '곤충' });
  applyAction(r, 'god', { type: 'select-tribe', tribeId: 'dawn' });
  applyAction(r, 'priest', { type: 'create-priest', name: '하루', strength: 30, intelligence: 40, social: 30 });
  return r;
}

test('seeded world is repeatable, has pre-existing tribes and cylindrical reciprocal neighbors', () => {
  assert.deepEqual(generateWorld('repeat'), generateWorld('repeat'));
  assert.notDeepEqual(generateWorld('repeat'), generateWorld('another'));
  const w=generateWorld('repeat'); assert.equal(w.tiles.length, WIDTH*HEIGHT); assert.equal(w.tribes.length,4);
  assert.ok(neighbors({x:0,y:6}).includes(`${WIDTH-1},6`));
  assert.equal(neighbors({x:0,y:0}).length,4);
  for(const t of w.tiles)for(const id of neighbors(t)){
    const next=w.tiles.find(n=>n.id===id);assert.ok(neighbors(next).includes(t.id));
  }
  for(const tile of w.tiles)for(const edge of tile.river){
    const other=w.tiles.find(t=>t.id===edgeNeighbors(tile)[edge]);
    assert.ok(other.river.includes((edge+3)%6));
  }
});
test('god starts with level 1 and faith 10; priest race comes from existing tribe',()=>{
  const r=started();assert.equal(r.god.level,1);assert.equal(r.god.faith,10);assert.equal(r.priest.race,'인간');
  assert.equal(r.world.tribes[0].followers,0);
  assert.throws(()=>applyAction(r,'god',{type:'select-tribe',tribeId:'moon'}),/한 번/);
});
test('character creation requires exactly 100 points and is role restricted',()=>{
  const r=room();
  assert.throws(()=>applyAction(r,'gm',{type:'create-god',name:'a',realm:'b'}),/신만/);
  applyAction(r,'god',{type:'create-god',name:'a',realm:'b'});
  assert.throws(()=>applyAction(r,'priest',{type:'create-priest',name:'a',strength:30,intelligence:40,social:30}),/부족/);
  applyAction(r,'god',{type:'select-tribe',tribeId:'moon'});
  assert.throws(()=>applyAction(r,'priest',{type:'create-priest',name:'a',strength:50,intelligence:50,social:50}),/100/);
  applyAction(r,'priest',{type:'create-priest',name:'a',strength:50,intelligence:50,social:0,race:'오우거'});
  assert.equal(r.priest.race,'르나르');
});
test('player projections omit secrets, GM world, unseen tiles and the other character sheet',()=>{
  const r=started(), p=projectedState(r,'priest'), g=projectedState(r,'god');
  assert.equal(p.world.tiles.length,7);assert.ok(g.world.tiles.length>p.world.tiles.length);
  assert.equal(projectedState(r,'gm').world.tiles.length,WIDTH*HEIGHT);
  for(const s of [p,g]){
    assert.equal(s.invite,undefined);assert.equal(s.seed,undefined);assert.equal(s.knowledge,undefined);
    for(const player of Object.values(s.players))if(player)assert.equal(player.tokenHash,undefined);
  }
  assert.equal(p.god.faith,undefined);assert.equal(g.priest.strength,undefined);assert.equal(g.priest.tileId,undefined);
  assert.equal(g.tribes.find(t=>t.id==='moon').food,undefined);
});
test('private messages and action requests are visible only to sender, recipient and GM',()=>{
  const r=started();
  applyAction(r,'gm',{type:'narrate',audience:'god',message:'secret-vision'});
  applyAction(r,'god',{type:'chat',audience:'gm',message:'secret-plan'});
  applyAction(r,'god',{type:'request',kind:'기적',description:'private miracle'});
  assert.ok(projectedState(r,'gm').logs.some(l=>l.message==='secret-plan'));
  const p=projectedState(r,'priest');
  assert.equal(p.logs.some(l=>/secret|private miracle/.test(l.message)),false);assert.equal(p.actions.length,0);
  assert.ok(projectedState(r,'god').logs.some(l=>l.message==='secret-plan'));
});
test('GM-only reveal does not share discovery between players',()=>{
  const r=started(), before=Object.keys(r.knowledge.priest).length;
  applyAction(r,'gm',{type:'reveal',role:'god',tileId:'0,0'});
  assert.ok(r.knowledge.god['0,0']);assert.equal(Object.keys(r.knowledge.priest).length,before);
  assert.throws(()=>applyAction(r,'priest',{type:'reveal',role:'priest',tileId:'0,0'}),/GM만/);
});
test('priest can explore adjacent land without sharing position or discoveries',()=>{
  const r=started(); const current=r.world.tiles.find(t=>t.id===r.priest.tileId);
  const destination=neighbors(current).find(id=>{const t=r.world.tiles.find(t=>t.id===id);return !['ocean','coast','lake'].includes(t.terrain)&&t.elevation!=='mountain';});
  const godBefore=structuredClone(r.knowledge.god);
  applyAction(r,'priest',{type:'explore',tileId:destination});
  assert.equal(r.priest.tileId,destination);assert.deepEqual(r.knowledge.god,godBefore);
  assert.throws(()=>applyAction(r,'priest',{type:'explore',tileId:'0,0'}),/인접/);
});
test('GM resolves a miracle once, validates cost and never allows negative faith',()=>{
  const r=started();applyAction(r,'god',{type:'request',kind:'기적',description:'풀을 키운다'});
  const id=r.actions[0].id;
  assert.throws(()=>applyAction(r,'gm',{type:'resolve',actionId:id,status:'approved',cost:11,result:'큰 기적'}),/부족/);
  assert.equal(r.actions[0].status,'pending');assert.equal(r.god.faith,10);
  applyAction(r,'gm',{type:'resolve',actionId:id,status:'approved',cost:3,result:'작은 기적'});
  assert.equal(r.god.faith,7);
  assert.throws(()=>applyAction(r,'gm',{type:'resolve',actionId:id,status:'approved',cost:3,result:'중복'}),/처리/);
});
test('monthly consumption and faith are exact; hour/day boundaries never double-count',()=>{
  const r=started(), t=r.world.tribes[0];
  applyAction(r,'gm',{type:'adjust',field:'followers',value:10});
  const before=Object.values(t.food).reduce((a,b)=>a+b,0);
  applyAction(r,'gm',{type:'advance',hours:1});assert.equal(r.day,1);assert.equal(r.hour,1);assert.equal(r.god.faith,10);
  applyAction(r,'gm',{type:'advance',days:29});assert.equal(r.month,1);
  applyAction(r,'gm',{type:'advance',hours:23});assert.equal(r.day,31);assert.equal(r.hour,0);assert.equal(r.month,2);
  assert.equal(r.god.faith,15);assert.equal(Object.values(t.food).reduce((a,b)=>a+b,0),before-56*30);
  applyAction(r,'gm',{type:'advance',hours:1});assert.equal(r.god.faith,15);
  const p=projectedState(r,'priest');assert.equal(p.logs.filter(l=>l.kind==='month').length,1);
  assert.equal(p.logs.some(l=>l.message.includes('은잎 부족: 생산')),false);
});
test('monthly production respects capacity and finite stocks, and labor cannot exceed population',()=>{
  const r=started(),t=r.world.tribes[0];
  assert.throws(()=>applyAction(r,'priest',{type:'workers',hunt:50,gather:50,farm:0,fish:0}),/인구/);
  applyAction(r,'priest',{type:'workers',hunt:0,gather:0,farm:40,fish:0});
  const before=Object.values(t.food).reduce((a,b)=>a+b,0);
  const home=r.world.tiles.find(x=>x.id===t.tileId);
  const max=neighbors(home).concat(home.id).reduce((n,id)=>n+capacity(r.world.tiles.find(x=>x.id===id),'farm',r.settings),0);
  applyAction(r,'gm',{type:'advance',days:30});
  const after=Object.values(t.food).reduce((a,b)=>a+b,0);
  assert.equal(after,before+Math.min(40*DEFAULT_SETTINGS.workerOutput,max)-56*30);
  assert.ok(r.world.tiles.every(x=>x.wildlife>=0&&x.plants>=0));
});
test('overlapping settlement production uses a shared tile budget',()=>{
  const r=started();const a=r.world.tribes[0],b=r.world.tribes[1];
  b.tileId=a.tileId;a.workers.farm=56;b.workers.farm=42;
  r.settings.workerOutput=1000;r.settings.capacityScale=1;
  const home=r.world.tiles.find(x=>x.id===a.tileId);
  const max=neighbors(home).concat(home.id).reduce((n,id)=>n+capacity(r.world.tiles.find(x=>x.id===id),'farm',r.settings),0);
  const before=a.food.grain+b.food.grain;
  // Set enough fruit to isolate production without grain consumption.
  a.food.fruit=100000;b.food.fruit=100000;
  applyAction(r,'gm',{type:'advance',days:30});
  assert.equal(a.food.grain+b.food.grain-before,max);
});
test('D100 is server generated, applies divine modifier and rejects invalid operands',()=>{
  const r=started();applyAction(r,'priest',{type:'roll',a:30,b:30,divineA:3,label:'신성 보정'});
  const result=r.logs.at(-1);assert.ok(result.roll>=1&&result.roll<=100);assert.equal(result.chance,630/660*100);
  assert.throws(()=>applyAction(r,'god',{type:'roll',a:0,b:0}),/모두/);
  assert.throws(()=>applyAction(r,'god',{type:'roll',a:-1,b:1}),/정수/);
});
test('NPC tribes, resources and wildlife continue to exist without discovery',()=>{
  const r=started();const t=r.world.tiles.find(t=>!r.knowledge.priest[t.id]);
  const before=structuredClone(t);applyAction(r,'gm',{type:'advance',days:30});
  assert.equal(r.knowledge.priest[t.id],undefined);
  assert.notDeepEqual(t,before);
  assert.equal(r.world.tribes.length,4);
});
test('technology stages and trial settings are GM controlled',()=>{
  const r=started();
  assert.throws(()=>applyAction(r,'god',{type:'advance',days:30}),/GM/);
  assert.throws(()=>applyAction(r,'priest',{type:'settings',...DEFAULT_SETTINGS}),/GM/);
  applyAction(r,'gm',{type:'technology',name:'农耕',stage:1});
  applyAction(r,'gm',{type:'technology',name:'农耕',stage:3});
  assert.equal(r.world.tribes[0].technologies.length,1);assert.equal(r.world.tribes[0].technologies[0].stage,3);
});
test('GM environment changes refresh only active observations and never expose remote edits',()=>{
  const r=started();const edit={type:'edit-tile',terrain:'grass',feature:'forest',elevation:'flat',wildlife:20,plants:1,resource:'사슴',reason:'곤충이 풀을 먹었다'};
  const remote=r.world.tiles.find(t=>!r.knowledge.priest[t.id]&&!r.knowledge.god[t.id]);
  applyAction(r,'gm',{...edit,tileId:remote.id});
  assert.equal(r.knowledge.god[remote.id],undefined);assert.equal(r.knowledge.priest[remote.id],undefined);
  const local=r.priest.tileId;applyAction(r,'gm',{...edit,tileId:local});
  assert.equal(r.knowledge.priest[local].plants,1);assert.equal(r.knowledge.god[local].plants,1);
  assert.throws(()=>applyAction(r,'priest',{...edit,tileId:local}),/GM/);
  assert.throws(()=>applyAction(r,'gm',{...edit,tileId:local,terrain:'ocean'}),/정착지/);
});

test('GM water movement requires recorded technology and updates position and observations', () => {
  const r = started();
  const origin = r.world.tiles.find(t => t.id === r.priest.tileId);
  const target = r.world.tiles.find(t => neighbors(origin).includes(t.id));
  target.terrain = 'coast'; target.elevation = 'flat';
  const move = { type: 'gm-move', tileId: target.id, technology: '조선', reason: '시험선을 준비했고 잔잔한 연안 항로를 확인함' };
  assert.throws(() => applyAction(r, 'priest', move), /GM만/);
  assert.throws(() => applyAction(r, 'priest', { type: 'explore', tileId: target.id }), /별도 판정/);
  assert.throws(() => applyAction(r, 'gm', move), /기술의 씨앗/);
  applyAction(r, 'gm', { type: 'technology', name: '조선', stage: 0 });
  assert.throws(() => applyAction(r, 'gm', move), /기술의 씨앗/);
  applyAction(r, 'gm', { type: 'technology', name: '조선', stage: 2 });
  assert.throws(() => applyAction(r, 'gm', { ...move, reason: '' }), /판정 근거/);
  assert.equal(r.priest.tileId, origin.id);
  applyAction(r, 'gm', move);
  assert.equal(r.priest.tileId, target.id);
  assert.ok(projectedState(r, 'priest').world.tiles.some(t => t.id === target.id));
  assert.ok(r.logs.some(l => l.message.includes('조선 (실험)') && l.audience === 'priest'));
  assert.throws(() => applyAction(r, 'priest', { type: 'explore', tileId: origin.id }), /별도 판정/);
  applyAction(r, 'gm', { ...move, tileId: origin.id });
  assert.equal(r.priest.tileId, origin.id);
  assert.throws(() => applyAction(r, 'gm', { ...move, tileId: origin.id }), /인접/);
});

test('technology catalog is complete only for GM, and player projections contain only unlocked nodes and edges', () => {
  const r = started();
  const gm = projectedState(r, 'gm');
  assert.ok(gm.technologyTree.length > 60);
  assert.ok(gm.technologyTree.every(t => t.stage === 0 && t.description));
  for (const role of ['god', 'priest']) assert.deepEqual(projectedState(r, role).technologyTree, []);
  applyAction(r, 'gm', { type: 'technology', name: '核秘密', stage: 0 });
  applyAction(r, 'gm', { type: 'technology', name: '조선', stage: 1 });
  for (const role of ['god', 'priest']) {
    const view = projectedState(r, role);
    assert.deepEqual(view.technologyTree.map(t => t.name), ['조선']);
    assert.deepEqual(view.technologyTree[0].prerequisites, []);
    assert.equal(JSON.stringify(view).includes('核秘密'), false);
    assert.equal(JSON.stringify(view).includes('원자핵'), false);
    assert.deepEqual(view.tribes.find(t => t.id === view.selectedTribe).technologies, [{ name: '조선', stage: 1 }]);
  }
  applyAction(r, 'gm', { type: 'technology', name: '항해', stage: 3 });
  assert.deepEqual(projectedState(r, 'priest').technologyTree.find(t => t.name === '조선').prerequisites, ['항해']);
  applyAction(r, 'gm', { type: 'technology', name: '독자 항법', stage: 2 });
  assert.ok(projectedState(r, 'god').technologyTree.some(t => t.name === '독자 항법'));
  applyAction(r, 'gm', { type: 'technology', name: '조선', stage: 0 });
  assert.equal(projectedState(r, 'priest').technologyTree.some(t => t.name === '조선'), false);
});

test('large maps spread starting tribes and legacy maps retain their own wrap, movement and monthly ecology', () => {
  const large = generateWorld('large-map');
  assert.equal(large.width, 60); assert.equal(large.height, 38);
  assert.equal(large.tiles.length, 2280);
  const homes = large.tribes.map(t => large.tiles.find(tile => tile.id === t.tileId));
  assert.equal(new Set(homes.map(t => t.id)).size, 4);
  for (const home of homes) {
    assert.ok(!['ocean','coast','lake','snow'].includes(home.terrain));
    assert.notEqual(home.elevation,'mountain');
    assert.equal(neighbors(home, large.width, large.height).length, 6);
  }
  const r = started();
  r.world = classicWorld('old-world', {width:22,height:14});
  r.knowledge = {god:{},priest:{}};
  r.priest.tileId = '21,6';
  const target = r.world.tiles.find(t => t.id === '0,6');
  target.terrain = 'plains'; target.elevation = 'flat';
  const origin = r.world.tiles.find(t => t.id === '21,6');
  origin.terrain = 'plains'; origin.elevation = 'flat';
  applyAction(r, 'priest', {type:'explore',tileId:'0,6'});
  assert.equal(r.priest.tileId,'0,6');
  assert.ok(projectedState(r,'priest').world.tiles.some(t => t.id === '21,6'));
  const home = r.world.tribes.find(t=>t.id===r.selectedTribe);
  home.workers.farm=5;
  applyAction(r,'gm',{type:'advance',hours:720});
  assert.equal(r.world.width,22); assert.equal(r.world.height,14); assert.equal(r.world.tiles.length,308);
  assert.ok(r.world.tiles.every(t=>Number.isFinite(t.wildlife) && Number.isFinite(t.plants)));
  assert.ok(home.food.grain>=0);
});

import { createClassicGame as createGame } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, projectedState, capacity } from '../lib/game.mjs';
import { settlementsOf, monthlyConsumption, recommendedStage, cityRegions } from '../lib/settlements.mjs';
import { neighbors } from '../lib/world.mjs';
import { restoreCampaign } from '../lib/campaign.mjs';

function start(){
  const r=createGame({id:'SET123',name:'정착지 시험',seed:'settlements',gmName:'GM',gmHash:'hash',invite:'invite'});
  applyAction(r,'god',{type:'create-god',name:'신',realm:'물'});
  applyAction(r,'god',{type:'select-tribe',tribeId:'dawn'});
  applyAction(r,'priest',{type:'create-priest',name:'신관',strength:30,intelligence:40,social:30});
  return r;
}
function expansion(r,population=10,source=settlementsOf(r.world.tribes[0])[0]){
  const tile=r.world.tiles.find(t=>neighbors(r.world.tiles.find(t=>t.id===source.tileId),r.world.width,r.world.height).includes(t.id)&&!t.settlementId);
  tile.terrain='grass';tile.elevation='flat';tile.feature=null;
  return {type:'settlement',operation:'create',sourceId:source.id,tileId:tile.id,population,name:'강나루',stage:0,density:0,developed:25,reason:'분가와 새 주거지 건설'};
}

test('population composition determines exact food consumption and settlement allocations preserve total population',()=>{
  const r=start(),t=r.world.tribes[0];
  assert.equal(recommendedStage(56),1);assert.equal(recommendedStage(300),2);assert.equal(recommendedStage(50000),5);
  assert.equal(projectedState(r,'gm').tribes[0].settlements[0].stage,1);
  const change={type:'population',groups:[{race:'인간',population:30,consumption:30},{race:'르나르',population:20,consumption:15},{race:'엔트',population:6,consumption:0}],reason:'다종족 정착'};
  assert.throws(()=>applyAction(r,'priest',change),/GM만/);
  applyAction(r,'gm',change);assert.equal(t.population,56);assert.equal(monthlyConsumption(t),1200);
  const before=Object.values(t.food).reduce((n,v)=>n+v,0);
  applyAction(r,'gm',{type:'advance',hours:720});
  assert.equal(Object.values(t.food).reduce((n,v)=>n+v,0),before-1200);
  assert.throws(()=>applyAction(r,'gm',{type:'adjust',field:'population',value:50}),/종족별/);
  assert.throws(()=>applyAction(r,'gm',{...change,groups:[null]}),/형식/);
  assert.throws(()=>applyAction(r,'gm',{...change,groups:[{race:'인간',population:56,consumption:20}]}),/오류/);
  assert.throws(()=>applyAction(r,'gm',{...change,groups:[change.groups[0],change.groups[0]]}),/오류/);
  applyAction(r,'gm',expansion(r));assert.equal(t.population,56);
  assert.deepEqual(t.settlements.map(s=>s.population),[46,10]);
  assert.deepEqual(t.settlements[0].composition.map(({race,population})=>({race,population})),[{race:'인간',population:20},{race:'르나르',population:20},{race:'엔트',population:6}]);
  assert.deepEqual(t.settlements[1].composition.map(({race,population})=>({race,population})),[{race:'인간',population:10}]);
  assert.throws(()=>applyAction(r,'gm',{...change,allocations:t.settlements.map(s=>({id:s.id,population:1}))}),/합계/);
  const groups=[{race:'인간',population:60,consumption:30}];
  applyAction(r,'gm',{...change,groups,allocations:t.settlements.map((s,i)=>({id:s.id,population:i?15:45}))});
  assert.equal(t.population,60);assert.deepEqual(t.settlements.map(s=>s.population),[45,15]);
  assert.equal(t.settlements[0].stage,1); // GM stage decisions do not change automatically.
});

test('settlement expansion validates adjacency, ownership, land and migrants; density and land use affect resources',()=>{
  const r=start(),t=r.world.tribes[0],create=expansion(r),tile=r.world.tiles.find(t=>t.id===create.tileId);
  assert.throws(()=>applyAction(r,'god',create),/GM만/);
  assert.throws(()=>applyAction(r,'gm',{...create,tileId:'0,0'}),/인접/);
  assert.throws(()=>applyAction(r,'gm',{...create,population:57}),/이주 인구/);
  tile.terrain='coast';assert.throws(()=>applyAction(r,'gm',create),/수역/);tile.terrain='grass';
  const before=tile.plants,base=capacity(tile,'farm',r.settings);
  applyAction(r,'gm',create);
  assert.equal(tile.plants,before*.75);assert.equal(capacity(tile,'farm',r.settings),Math.floor(base*.75));
  assert.equal(tile.settlementId,t.id);assert.equal(t.settlements.length,2);
  assert.throws(()=>applyAction(r,'gm',create),/이미/);
  const child=t.settlements[1];
  applyAction(r,'gm',{type:'settlement',operation:'update',id:child.id,name:child.name,stage:2,density:3,developed:100,reason:'고밀도 시설 건설'});
  assert.equal(tile.plants,0);assert.equal(tile.wildlife,0);assert.equal(capacity(tile,'farm',r.settings),0);
  applyAction(r,'gm',{type:'advance',hours:720});assert.equal(tile.plants,0);assert.equal(tile.wildlife,0);
  applyAction(r,'gm',{type:'settlement',operation:'update',id:child.id,name:child.name,stage:1,density:1,developed:0,reason:'시설 철거'});
  assert.equal(tile.plants,0);assert.equal(t.settlements[1].density,1);
});

test('city regions connect only adjacent settlements; overlapping production never multiplies land or labor',()=>{
  const r=start(),t=r.world.tribes[0];applyAction(r,'gm',expansion(r));
  const [a,b]=t.settlements,link={type:'urban-link',operation:'add',a:a.id,b:b.id,reason:'도로 연결'};
  applyAction(r,'gm',link);assert.equal(cityRegions(t).length,1);
  assert.throws(()=>applyAction(r,'gm',link),/이미/);
  assert.throws(()=>applyAction(r,'priest',{...link,operation:'remove'}),/GM만/);
  const production=[...new Set(t.settlements.flatMap(s=>[s.tileId,...neighbors(r.world.tiles.find(t=>t.id===s.tileId),r.world.width,r.world.height)]))];
  const max=production.reduce((sum,id)=>sum+capacity(r.world.tiles.find(t=>t.id===id),'farm',r.settings),0);
  t.workers.farm=56;r.settings.workerOutput=1000;t.food.fruit=100000;
  const grain=t.food.grain;applyAction(r,'gm',{type:'advance',hours:720});
  assert.equal(t.food.grain-grain,Math.min(56000,max));
  applyAction(r,'gm',{...link,operation:'remove'});assert.equal(cityRegions(t).length,0);
});

test('new settlement, mixed population, city link and major NPC records roundtrip through export import',()=>{
  const r=start(),t=r.world.tribes[0];applyAction(r,'gm',expansion(r));
  const [a,b]=t.settlements;
  applyAction(r,'gm',{type:'population',groups:[{race:'인간',population:50,consumption:30},{race:'엔트',population:6,consumption:0}],allocations:[{id:a.id,population:46,composition:[{race:'인간',population:40},{race:'엔트',population:6}]},{id:b.id,population:10,composition:[{race:'인간',population:10}]}],reason:'구성 확인'});
  applyAction(r,'gm',{type:'urban-link',operation:'add',a:a.id,b:b.id,reason:'도시권 통합'});
  const npc={type:'notable-npc',operation:'save',name:'나루지기',race:'인간',title:'대표',settlementId:b.id,notes:'강나루 주민의 대표',reason:'주요 인물 지정'};
  assert.throws(()=>applyAction(r,'god',npc),/GM만/);applyAction(r,'gm',npc);assert.equal(t.population,56);
  const restored=restoreCampaign(r,{id:'NEW123',gmName:'GM',gmHash:'new',invite:'new'});
  assert.deepEqual(restored.world,r.world);
  assert.equal(monthlyConsumption(restored.world.tribes[0]),1500);
  assert.equal(projectedState(restored,'priest').tribes[0].notableNpcs[0].name,'나루지기');
  assert.equal(projectedState(restored,'god').tribes.find(x=>x.id==='leaf').settlements,undefined);
  const corrupt=structuredClone(r);corrupt.world.tribes[0].settlements[0].population=900;
  assert.throws(()=>restoreCampaign(corrupt,{id:'BAD123'}),/인구 합계/);
  applyAction(r,'gm',{...npc,id:t.notableNpcs[0].id,operation:'remove'});assert.equal(t.notableNpcs.length,0);
});

test('a new priest can choose only a mixed tribe member race, while existing characters stay unchanged',()=>{
  const r=start(),t=r.world.tribes[0];
  applyAction(r,'gm',{type:'population',groups:[{race:'인간',population:40,consumption:30},{race:'엔트',population:16,consumption:0}],reason:'구성 확인'});
  assert.equal(r.priest.race,'인간');r.priest=null;
  assert.throws(()=>applyAction(r,'priest',{type:'create-priest',name:'숲',strength:30,intelligence:40,social:30,race:'트롤'}),/구성 종족/);
  applyAction(r,'priest',{type:'create-priest',name:'숲',strength:30,intelligence:40,social:30,race:'엔트'});
  assert.equal(r.priest.race,'엔트');assert.equal(t.population,56);
});

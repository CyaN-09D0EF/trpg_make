import test from 'node:test';
import assert from 'node:assert/strict';
import { FERTILITY_V01, fertilityOf, applyMonthlyBirths, birthForecast } from '../lib/demography.mjs';
import { groupsOf, settlementsOf, monthlyConsumption } from '../lib/settlements.mjs';
import { createGame, applyAction, projectedState } from '../lib/game.mjs';
import { restoreCampaign } from '../lib/campaign.mjs';
const settings={humanBirthRate:.002};
function tribe(race='인간',population=1000,consumption=30){return {id:'dawn',name:'여명',tileId:'5,6',race,population,consumption,food:{fruit:1e8,grain:0,meat:0},workers:{farm:0,hunt:0,gather:0,fish:0}};}
function consistent(t){
  assert.equal(groupsOf(t).reduce((n,g)=>n+g.population,0),t.population);
  assert.equal(settlementsOf(t).reduce((n,s)=>n+s.population,0),t.population);
  for(const g of groupsOf(t))assert.equal(settlementsOf(t).reduce((n,s)=>n+s.composition.filter(c=>c.race===g.race).reduce((n,c)=>n+c.population,0),0),g.population);
}

test('all 17 v0.1 coefficients and fixed-population birth examples match the supplied table',()=>{
  assert.deepEqual(Object.fromEntries(FERTILITY_V01.map(r=>[r.race,r.coefficient])),{'인간':1,'리자드맨':1.5,'프로그맨':2,'놀':1.6,'엘프':.3,'오크':1.4,'르나르':1.5,'오우거':.6,'사티로스':1.1,'트롤':.7,'닉스':.8,'드워프':.65,'코볼트':2.5,'아스타시디안':.8,'미노타우루스':.7,'가루다':.8,'엔트':.05});
  for(const [race,value] of [['인간',2],['코볼트',5],['프로그맨',4],['오크',2.8],['엘프',.6],['엔트',.1]])assert.ok(Math.abs(birthForecast(tribe(race),settings)[0].expected-value)<1e-10);
  assert.equal(fertilityOf('인간(사피엔스)'),1);assert.equal(fertilityOf('새 종족'),null);
});
test('fractional births accumulate without truncation and floating-point loss, including slow-growing ents',()=>{
  const t=tribe('인간',100);
  for(let month=1;month<=4;month++)assert.equal(applyMonthlyBirths(t,settings,month,0).total,0);
  assert.equal(applyMonthlyBirths(t,settings,5,0).total,1);assert.equal(t.population,101);consistent(t);
  const ent=tribe('엔트',1000,0);
  for(let month=1;month<=9;month++)assert.equal(applyMonthlyBirths(ent,settings,month,0).total,0);
  assert.equal(applyMonthlyBirths(ent,settings,10,0).total,1);assert.equal(ent.population,1001);consistent(ent);
});
test('food shortage stops accumulation and blocked births never build an integer backlog',()=>{
  const t=tribe('코볼트',1000,15);t.birthCarries=[{race:'코볼트',remainder:.8}];t.food.fruit=0;
  for(let month=1;month<=6;month++)assert.equal(applyMonthlyBirths(t,settings,month,100).total,0);
  assert.equal(t.birthCarries[0].remainder,.8);
  t.food.fruit=15000;assert.equal(applyMonthlyBirths(t,settings,7,0).total,0);
  assert.ok(t.birthCarries[0].remainder<1); // No food for the newborns next month.
  t.food.fruit=1e8;assert.equal(applyMonthlyBirths(t,settings,8,0).total,5);consistent(t);
});
test('housing, environmental pause and rate zero limit births without deaths or automatic worker changes',()=>{
  const t=tribe();t.housingLimit=1001;t.workers.farm=50;
  assert.equal(applyMonthlyBirths(t,settings,1,0).total,1);assert.equal(t.population,1001);assert.equal(t.workers.farm,50);
  assert.equal(applyMonthlyBirths(t,settings,2,0).total,0);
  t.housingLimit=900;assert.equal(applyMonthlyBirths(t,settings,3,0).total,0);assert.equal(t.population,1001);
  const paused=tribe();paused.birthModifier=0;assert.equal(applyMonthlyBirths(paused,settings,1,0).total,0);
  paused.birthModifier=2;assert.equal(applyMonthlyBirths(paused,{humanBirthRate:0},2,0).total,0);
  assert.equal(applyMonthlyBirths(paused,settings,3,0).total,4);
  const custom=tribe('새 종족');assert.equal(applyMonthlyBirths(custom,settings,1,0).total,0);
});
test('mixed populations receive births proportionally by race and preserve every settlement and tribe total',()=>{
  const t=tribe();t.population=2000;t.populationGroups=[{race:'인간',population:1000,consumption:30},{race:'엔트',population:1000,consumption:0}];
  t.settlements=[{id:'a',name:'본거지',tileId:'5,6',population:750,stage:2,density:1,composition:[{race:'인간',population:250},{race:'엔트',population:500}]},{id:'b',name:'분가',tileId:'6,6',population:1250,stage:3,density:1,composition:[{race:'인간',population:750},{race:'엔트',population:500}]}];
  assert.equal(applyMonthlyBirths(t,settings,1,0).total,2);assert.equal(t.population,2002);
  assert.equal(t.settlements[0].population,751);assert.equal(t.settlements[1].population,1251);
  assert.equal(monthlyConsumption(t),30060);consistent(t);
  assert.equal(t.settlements[0].stage,2);
});
test('real monthly settlement persists carries through import and handles old saves without birth settings',()=>{
  const r=createGame({id:'BIR123',name:'출생 시험',seed:'births',gmName:'GM',gmHash:'hash',invite:'invite'});
  applyAction(r,'god',{type:'create-god',name:'신',realm:'숲'});applyAction(r,'god',{type:'select-tribe',tribeId:'dawn'});
  applyAction(r,'gm',{type:'population',groups:[{race:'인간',population:1000,consumption:30}],reason:'시험 인구'});
  const t=r.world.tribes[0];t.food.fruit=1e8;t.birthCarries=[{race:'인간',remainder:.9}];
  applyAction(r,'gm',{type:'advance',hours:719});assert.equal(t.population,1000);
  applyAction(r,'gm',{type:'advance',hours:1});assert.equal(t.population,1002);
  const restored=restoreCampaign(r,{id:'NEW123',gmName:'GM',gmHash:'new',invite:'new'});
  assert.deepEqual(restored.world.tribes[0].birthCarries,t.birthCarries);
  assert.deepEqual(restored.world.tribes[0].lastBirths,t.lastBirths);
  applyAction(restored,'gm',{type:'advance',hours:720});assert.equal(restored.world.tribes[0].population,1004);consistent(restored.world.tribes[0]);
  const bad=structuredClone(r);bad.world.tribes[0].birthCarries[0].remainder=1;
  assert.throws(()=>restoreCampaign(bad,{id:'BAD123'}),/출생 누적/);
  const old=structuredClone(r);delete old.settings.humanBirthRate;
  const legacy=restoreCampaign(old,{id:'OLD123',gmName:'GM',gmHash:'h',invite:'i'});
  assert.equal(projectedState(legacy,'gm').settings.humanBirthRate,.002);
  assert.throws(()=>applyAction(r,'priest',{type:'birth-policy',modifier:0,housingLimit:null,reason:'권한 시험'}),/GM만/);
});

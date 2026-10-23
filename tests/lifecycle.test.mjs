import { createClassicGame as createGame } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { POPULATION_TRAITS_V03, traitsOf, ageSummary, applyMonthlyAging, naturalDeathProbability, reconcileAges } from '../lib/lifecycle.mjs';
import { applyMonthlyBirths, birthForecast } from '../lib/demography.mjs';
import { applyAction, projectedState } from '../lib/game.mjs';
import { restoreCampaign } from '../lib/campaign.mjs';
import { rngFor } from '../lib/world.mjs';

function fixture(race='코볼트',population=1000,bornMonth=0){
  return {id:'test',name:'시험',race,population,consumption:15,followers:0,mortalityModifier:0,food:{fruit:1e8,meat:0,grain:0},workers:{farm:0,hunt:0,gather:0,fish:0},tileId:'0,0',populationGroups:[{race,population,consumption:15}],settlements:[{id:'home',name:'본거지',tileId:'0,0',stage:1,density:0,population,composition:[{race,population,cohorts:[{bornMonth,population}]}]}]};
}
test('v0.3 stores all 17 independently supplied trait triples exactly',()=>{
  assert.deepEqual(POPULATION_TRAITS_V03.map(t=>[t.race,t.fertility,t.maturityAge,t.lifespan]),[
    ['인간',1,18,75],['리자드맨',1.5,12,65],['프로그맨',2,8,45],['놀',1.6,10,55],['엘프',.3,50,600],['오크',1.4,12,60],['르나르',1.5,10,65],['오우거',.6,20,85],['사티로스',1.1,16,110],['트롤',.7,25,180],['닉스',.8,20,150],['드워프',.65,30,250],['코볼트',2.5,6,40],['아스타시디안',.8,22,90],['미노타우루스',.7,18,80],['가루다',.8,14,120],['엔트',.05,100,1500],
  ]);
  assert.equal(traitsOf('인간(사피엔스)').lifespan,75);
});
test('juveniles cannot reproduce or join labor until the exact species maturity month',()=>{
  for(const race of ['코볼트','인간','엘프','엔트']){
    const t=fixture(race),threshold=traitsOf(race).maturityAge*12;
    assert.equal(ageSummary(t,threshold-1).adult,0);
    assert.equal(birthForecast(t,{humanBirthRate:.002},threshold-1)[0].expected,0);
    assert.equal(applyMonthlyAging(t,threshold-1,()=>.5).matured,0);
    assert.equal(applyMonthlyBirths(t,{humanBirthRate:.002},threshold-1,0).total,0);
    assert.equal(applyMonthlyAging(t,threshold,()=>.5).matured,1000);
    assert.equal(ageSummary(t,threshold).adult,1000);
    const born=applyMonthlyBirths(t,{humanBirthRate:.002},threshold,0).total;
    assert.equal(born,Math.floor(2*traitsOf(race).fertility));
    assert.equal(ageSummary(t,threshold).juvenile,born);
  }
});
test('natural death probability has young-age risk and an old-age tail, with the supplied mean lifespans',()=>{
  for(const lifespan of [40,75,600,1500]){
    assert.ok(naturalDeathProbability(1,lifespan)>0);
    assert.ok(naturalDeathProbability(lifespan,lifespan)>0);
    assert.ok(naturalDeathProbability(lifespan*2,lifespan)<1);
    assert.ok(naturalDeathProbability(lifespan,lifespan)>naturalDeathProbability(1,lifespan));
    let survival=1,mean=0;
    for(let month=0;month<lifespan*5*12;month++){mean+=survival/12;survival*=1-naturalDeathProbability(month/12,lifespan);}
    assert.ok(Math.abs(mean-lifespan)<.1,`${lifespan}: mean ${mean}`);
  }
});
test('probabilistic mortality preserves cohorts, population and age eligibility without a lifespan cutoff',()=>{
  const t=fixture('인간',10000,-150*12);t.mortalityModifier=1;t.workers.farm=10000;
  const report=applyMonthlyAging(t,1,rngFor('old-age'));
  assert.ok(report.deaths>0&&report.deaths<10000);
  assert.equal(t.population,10000-report.deaths);
  assert.equal(t.settlements[0].population,t.population);
  assert.equal(t.populationGroups[0].population,t.population);
  assert.equal(t.workers.farm,t.population);
  assert.equal(report.workersReduced,report.deaths);
});
test('migration and population edits conserve birth dates instead of turning children into adults',()=>{
  const previous=fixture('인간',100).settlements;
  previous[0].composition[0].cohorts=[{bornMonth:-240,population:60},{bornMonth:0,population:40}];
  const next=[{...structuredClone(previous[0]),population:50,composition:[{race:'인간',population:50}]},{id:'next',tileId:'1,0',population:50,composition:[{race:'인간',population:50}]}];
  reconcileAges(previous,next,0);
  for(const s of next)assert.deepEqual(s.composition[0].cohorts,[{bornMonth:-240,population:30},{bornMonth:0,population:20}]);
});
test('GM age edits, monthly maturity and cohort import work through the application without rewriting old histories',()=>{
  const r=createGame({id:'AGE123',name:'연령',seed:'ages',gmName:'GM',gmHash:'h',invite:'i'});
  applyAction(r,'god',{type:'create-god',name:'신',realm:'숲'});applyAction(r,'god',{type:'select-tribe',tribeId:'dawn'});
  const t=r.world.tribes[0],id='dawn-home';t.mortalityModifier=0;
  applyAction(r,'gm',{type:'age-distribution',entries:[{settlementId:id,race:'인간',bornMonth:-(18*12-1),population:56}],reason:'성숙 직전 주민'});
  assert.equal(projectedState(r,'gm').tribes[0].ageSummary.adult,0);
  assert.throws(()=>applyAction(r,'priest',{type:'workers',farm:1,hunt:0,gather:0,fish:0}),/노동자/);
  assert.throws(()=>applyAction(r,'god',{type:'age-distribution',entries:[],reason:'권한 시험'}),/GM만/);
  assert.throws(()=>applyAction(r,'gm',{type:'age-distribution',entries:[{settlementId:id,race:'인간',bornMonth:1,population:56}],reason:'미래'}),/출생 월/);
  applyAction(r,'gm',{type:'advance',hours:720});
  assert.equal(t.lastDemography.matured,56);assert.equal(projectedState(r,'priest').tribes[0].ageSummary.adult,56);
  const imported=restoreCampaign(r,{id:'NEW123',gmName:'GM',gmHash:'n',invite:'i'});
  assert.deepEqual(imported.world.tribes[0].settlements,t.settlements);
  const bad=structuredClone(r);bad.world.tribes[0].settlements[0].composition[0].cohorts[0].population=55;
  assert.throws(()=>restoreCampaign(bad,{id:'BAD123'}),/연령 인구 합계/);
  const old=structuredClone(r);for(const tribe of old.world.tribes)for(const s of tribe.settlements||[])for(const g of s.composition)delete g.cohorts;
  const legacy=restoreCampaign(old,{id:'OLD123',gmName:'GM',gmHash:'n',invite:'i'});
  assert.equal(projectedState(legacy,'gm').tribes[0].ageSummary.adult,56);
});

test('complete natural extinction leaves a valid empty settlement, zero workforce and restorable save',()=>{
  const r=createGame({id:'END123',name:'빈 정착지',seed:'extinction',gmName:'GM',gmHash:'h',invite:'i'});
  applyAction(r,'god',{type:'create-god',name:'신',realm:'숲'});applyAction(r,'god',{type:'select-tribe',tribeId:'dawn'});
  applyAction(r,'gm',{type:'age-distribution',entries:[{settlementId:'dawn-home',race:'인간',bornMonth:-12000000,population:56}],reason:'극한 연령 시험'});
  applyAction(r,'gm',{type:'advance',hours:720});
  const t=r.world.tribes[0];assert.equal(t.population,0);assert.equal(t.lastDemography.deaths,56);assert.deepEqual(t.populationGroups,[]);
  const restored=restoreCampaign(r,{id:'NEW123',gmName:'GM',gmHash:'n',invite:'i'});
  assert.equal(projectedState(restored,'gm').tribes[0].ageSummary.adult,0);
});

test('reproduction participation is a separate setting applied only to mature residents',()=>{
  const t=fixture('인간',1000,-240);t.breedingParticipation=.5;
  assert.equal(birthForecast(t,{humanBirthRate:.002},0)[0].breedingEligible,500);
  assert.equal(applyMonthlyBirths(t,{humanBirthRate:.002},1,0).total,1);
  assert.equal(ageSummary(t,1).juvenile,1);
});

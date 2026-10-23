import { groupsOf, settlementsOf } from './settlements.mjs';

// Three independently authored values. None is derived from another trait.
export const POPULATION_TRAITS_V03 = [
  ['인간',1,18,75],['리자드맨',1.5,12,65],['프로그맨',2,8,45],['놀',1.6,10,55],['엘프',.3,50,600],['오크',1.4,12,60],
  ['르나르',1.5,10,65],['오우거',.6,20,85],['사티로스',1.1,16,110],['트롤',.7,25,180],['닉스',.8,20,150],
  ['드워프',.65,30,250],['코볼트',2.5,6,40],['아스타시디안',.8,22,90],['미노타우루스',.7,18,80],['가루다',.8,14,120],['엔트',.05,100,1500],
].map(([race,fertility,maturityAge,lifespan])=>({race,fertility,maturityAge,lifespan}));
export function traitsOf(race){
  if(['인간 (사피엔스)','인간(사피엔스)','사피엔스'].includes(race))race='인간';
  return POPULATION_TRAITS_V03.find(t=>t.race===race) || null;
}
export function cohortsOf(group,race,clock){
  if(group.cohorts!==undefined)return group.cohorts;
  const maturity=traitsOf(race)?.maturityAge;
  return group.population?[{bornMonth:maturity===undefined?null:clock-maturity*12,population:group.population}]:[];
}
export function mergeCohorts(cohorts){
  const map=new Map();for(const c of cohorts)if(c.population>0)map.set(c.bornMonth,(map.get(c.bornMonth)||0)+c.population);
  return [...map].map(([bornMonth,population])=>({bornMonth,population})).sort((a,b)=>(a.bornMonth ?? Infinity)-(b.bornMonth ?? Infinity));
}
export function splitCohorts(cohorts,count){
  const total=cohorts.reduce((n,c)=>n+c.population,0);
  if(!count)return [[],structuredClone(cohorts)];
  const parts=cohorts.map((c,i)=>({...c,index:i,quota:count*c.population/total}));
  let left=count;
  for(const c of parts){c.take=Math.floor(c.quota);left-=c.take;}
  const order=[...parts].sort((a,b)=>(b.quota-b.take)-(a.quota-a.take)||a.index-b.index);
  for(let i=0;i<left;i++)order[i].take++;
  return [parts.filter(c=>c.take).map(c=>({bornMonth:c.bornMonth,population:c.take})),parts.filter(c=>c.population>c.take).map(c=>({bornMonth:c.bornMonth,population:c.population-c.take}))];
}
export function initializeAges(tribe,clock){
  tribe.settlements=structuredClone(settlementsOf(tribe));
  for(const s of tribe.settlements)for(const g of s.composition)g.cohorts=structuredClone(cohortsOf(g,g.race,clock));
}
export function isMature(race,bornMonth,clock){
  const traits=traitsOf(race);
  return !traits || bornMonth===null || clock-bornMonth>=traits.maturityAge*12;
}
export function ageSummary(tribe,clock){
  const races=groupsOf(tribe).map(g=>({race:g.race,adult:0,juvenile:0}));
  for(const s of settlementsOf(tribe))for(const g of s.composition){
    const row=races.find(r=>r.race===g.race);if(!row)continue;
    for(const c of cohortsOf(g,g.race,clock))row[isMature(g.race,c.bornMonth,clock)?'adult':'juvenile']+=c.population;
  }
  return {adult:races.reduce((n,g)=>n+g.adult,0),juvenile:races.reduce((n,g)=>n+g.juvenile,0),races};
}
export function reconcileAges(previous,next,clock){
  const pools=new Map();
  for(const s of previous)for(const g of s.composition){
    const target=next.find(n=>n.id===s.id)?.composition.find(n=>n.race===g.race);
    const [kept,excess]=splitCohorts(cohortsOf(g,g.race,clock),Math.min(g.population,target?.population || 0));
    if(target)target.cohorts=kept;
    pools.set(g.race,mergeCohorts([...(pools.get(g.race)||[]),...excess]));
  }
  for(const s of next)for(const g of s.composition){
    const kept=g.cohorts || [],need=g.population-kept.reduce((n,c)=>n+c.population,0);
    const pool=pools.get(g.race)||[],available=pool.reduce((n,c)=>n+c.population,0);
    const [moved,left]=splitCohorts(pool,Math.min(need,available));pools.set(g.race,left);
    const extra=need-Math.min(need,available),adult=traitsOf(g.race)?.maturityAge;
    g.cohorts=mergeCohorts([...kept,...moved,...(extra?[{bornMonth:adult===undefined?null:clock-adult*12,population:extra}]:[])]);
  }
}
// Weibull shape 3: mean = scale * Gamma(4/3). This shape is a separate trial rule.
const GAMMA_4_3=.892979511569249;
export function naturalDeathProbability(ageYears,lifespan,modifier=1){
  if(modifier===0)return 0;
  const scale=lifespan/GAMMA_4_3,a=Math.max(0,ageYears),b=a+1/12;
  return -Math.expm1(-modifier*((b/scale)**3-(a/scale)**3));
}
export function binomial(n,p,random){
  if(p<=0)return 0;if(p>=1)return n;
  if(p>.5)return n-binomial(n,1-p,random);
  let count=0,position=-1;const logFailure=Math.log1p(-p);
  while(true){const u=Math.max(Number.EPSILON,Math.min(1-Number.EPSILON,random()));position+=1+Math.floor(Math.log1p(-u)/logFailure);if(position>=n)return count;count++;}
}
export function clampWorkers(tribe,clock){
  const limit=ageSummary(tribe,clock).adult,entries=Object.entries(tribe.workers),total=entries.reduce((n,[,v])=>n+v,0);
  if(total<=limit)return 0;
  const parts=entries.map(([key,value])=>({key,quota:limit*value/total}));let left=limit;
  for(const p of parts){p.count=Math.floor(p.quota);left-=p.count;}
  parts.sort((a,b)=>(b.quota-b.count)-(a.quota-a.count)||a.key.localeCompare(b.key));
  for(let i=0;i<left;i++)parts[i].count++;
  for(const p of parts)tribe.workers[p.key]=p.count;
  return total-limit;
}
export function applyMonthlyAging(tribe,month,random){
  initializeAges(tribe,month-1);
  const races=[];let deaths=0,matured=0;
  for(const s of tribe.settlements)for(const g of s.composition){
    const traits=traitsOf(g.race);let lost=0,grown=0;
    for(const c of g.cohorts){
      const count=traits&&c.bornMonth!==null?binomial(c.population,naturalDeathProbability((month-1-c.bornMonth)/12,traits.lifespan,tribe.mortalityModifier ?? 1),random):0;
      c.population-=count;lost+=count;
      if(!isMature(g.race,c.bornMonth,month-1)&&isMature(g.race,c.bornMonth,month))grown+=c.population;
    }
    g.cohorts=g.cohorts.filter(c=>c.population);g.population-=lost;
    let row=races.find(r=>r.race===g.race);if(!row){row={race:g.race,deaths:0,matured:0};races.push(row);}row.deaths+=lost;row.matured+=grown;deaths+=lost;matured+=grown;
  }
  for(const s of tribe.settlements){s.composition=s.composition.filter(g=>g.population);s.population=s.composition.reduce((n,g)=>n+g.population,0);}
  const counts=new Map();for(const s of tribe.settlements)for(const g of s.composition)counts.set(g.race,(counts.get(g.race)||0)+g.population);
  tribe.populationGroups=groupsOf(tribe).map(g=>({...g,population:counts.get(g.race)||0})).filter(g=>g.population);
  tribe.population=tribe.populationGroups.reduce((n,g)=>n+g.population,0);tribe.followers=Math.min(tribe.followers,tribe.population);
  if(tribe.birthCarries)tribe.birthCarries=tribe.birthCarries.filter(c=>counts.get(c.race)>0);
  const workersReduced=clampWorkers(tribe,month);
  tribe.lastDemography={month,deaths,matured,workersReduced,races};return tribe.lastDemography;
}
export function ageDataProblem(tribe,clock){
  if(tribe.mortalityModifier!==undefined&&(!Number.isFinite(tribe.mortalityModifier)||tribe.mortalityModifier<0||tribe.mortalityModifier>3))return '자연사 환경 배율';
  for(const s of settlementsOf(tribe))for(const g of s.composition)if(g.cohorts!==undefined){
    if(!Array.isArray(g.cohorts)||g.cohorts.length>20000)return '연령 분포';
    if(g.cohorts.some(c=>!c||!Number.isInteger(c.population)||c.population<1||c.population>1000000||(c.bornMonth===null&&traitsOf(g.race)!==null)||(c.bornMonth!==null&&(!Number.isInteger(c.bornMonth)||c.bornMonth < -12000000||c.bornMonth>clock))))return '출생 월';
    if(new Set(g.cohorts.map(c=>c.bornMonth)).size!==g.cohorts.length||g.cohorts.reduce((n,c)=>n+c.population,0)!==g.population)return '연령 인구 합계';
  }
  const d=tribe.lastDemography;
  if(d!==undefined && (!d||!Number.isInteger(d.month)||d.month<1||['deaths','matured','workersReduced'].some(k=>!Number.isInteger(d[k])||d[k]<0||d[k]>1000000)||!Array.isArray(d.races)||d.races.length>30||d.races.some(r=>!r||typeof r.race!=='string'||r.race.length>40||['deaths','matured'].some(k=>!Number.isInteger(r[k])||r[k]<0))||d.races.reduce((n,r)=>n+r.deaths,0)!==d.deaths||d.races.reduce((n,r)=>n+r.matured,0)!==d.matured))return '월간 연령 정산';
  return null;
}

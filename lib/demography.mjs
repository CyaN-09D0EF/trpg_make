import { traitsOf, ageSummary, initializeAges, isMature, mergeCohorts } from './lifecycle.mjs';
import { groupsOf, settlementsOf, monthlyConsumption } from './settlements.mjs';

export const HUMAN_BIRTH_RATE = 0.002;
export const FERTILITY_V01 = [
  ['인간',1,'기준 종족'],['리자드맨',1.5,'난생, 한 번에 여러 알을 낳는 이미지'],['프로그맨',2,'양서류형, 강한 다산성'],
  ['놀',1.6,'포유류형 수인, 비교적 빠른 번식'],['엘프',0.3,'장수종, 낮은 출산 빈도'],['오크',1.4,'빠른 세대교체와 높은 번식력'],
  ['르나르',1.5,'여우형 수인, 다산성'],['오우거',0.6,'대형 종족, 느린 성장과 낮은 출산 빈도'],['사티로스',1.1,'인간형에 가까운 번식 속도'],
  ['트롤',0.7,'대형 장수종으로 가정'],['닉스',0.8,'수생·요정계 종족으로 가정'],['드워프',0.65,'장수종, 비교적 느린 세대교체'],
  ['코볼트',2.5,'소형 난생 종족, 빠른 번식'],['아스타시디안',0.8,'생태 설정 미확정, 임시로 인간보다 낮게 설정'],
  ['미노타우루스',0.7,'대형 포유류형 종족'],['가루다',0.8,'조류형, 산란·육아 주기 고려'],['엔트',0.05,'매우 드문 번식과 긴 성장 기간'],
].map(([race,coefficient,description])=>({race,coefficient,description}));
export function fertilityOf(race) { return traitsOf(race)?.fertility ?? null; }
export const humanBirthRate = settings => settings.humanBirthRate ?? HUMAN_BIRTH_RATE;
export function birthForecast(tribe,settings,clock=0) {
  const modifier=tribe.birthModifier ?? 1,ages=ageSummary(tribe,clock);
  return groupsOf(tribe).map(g=>({race:g.race,coefficient:fertilityOf(g.race),adult:ages.races.find(r=>r.race===g.race)?.adult || 0,juvenile:ages.races.find(r=>r.race===g.race)?.juvenile || 0,breedingEligible:Math.floor((ages.races.find(r=>r.race===g.race)?.adult || 0)*(tribe.breedingParticipation ?? 1)),expected:Math.floor((ages.races.find(r=>r.race===g.race)?.adult || 0)*(tribe.breedingParticipation ?? 1))*humanBirthRate(settings)*(fertilityOf(g.race) || 0)*modifier,carry:tribe.birthCarries?.find(c=>c.race===g.race)?.remainder || 0}));
}

export function demographicDataProblem(tribe) {
  if(tribe.breedingParticipation!==undefined&&(!Number.isFinite(tribe.breedingParticipation)||tribe.breedingParticipation<0||tribe.breedingParticipation>1))return '번식 참여율';
  if(tribe.birthModifier!==undefined && (!Number.isFinite(tribe.birthModifier)||tribe.birthModifier<0||tribe.birthModifier>2))return '출생 환경 배율';
  if(tribe.housingLimit!==undefined && tribe.housingLimit!==null && (!Number.isInteger(tribe.housingLimit)||tribe.housingLimit<0||tribe.housingLimit>1000000))return '주거 인구 한도';
  if(tribe.birthCarries!==undefined){
    if(!Array.isArray(tribe.birthCarries)||tribe.birthCarries.length>30)return '출생 누적';
    const races=new Set(groupsOf(tribe).map(g=>g.race));
    if(new Set(tribe.birthCarries.map(c=>c?.race)).size!==tribe.birthCarries.length || tribe.birthCarries.some(c=>!c||!races.has(c.race)||!Number.isFinite(c.remainder)||c.remainder<0||c.remainder>=1))return '출생 누적';
  }
  if(tribe.lastBirths!==undefined){
    const b=tribe.lastBirths;
    if(!b||!Number.isInteger(b.month)||b.month<1||!Number.isInteger(b.total)||b.total<0||b.total>1000000||typeof b.reason!=='string'||b.reason.length>200||!Array.isArray(b.races)||b.races.length>30)return '월간 출생 기록';
    if(b.races.some(g=>!g||typeof g.race!=='string'||g.race.length>40||!Number.isInteger(g.population)||g.population<1||g.population>1000000)||b.races.reduce((n,g)=>n+g.population,0)!==b.total)return '월간 출생 기록';
  }
  return null;
}

// Run after this month's meals. A full next-month food reserve, including births,
// is required. This is a playtest constraint, independent of provisional city tiers.
export function applyMonthlyBirths(tribe,settings,month,shortage) {
  initializeAges(tribe,month);
  const adults=ageSummary(tribe,month);
  const groups=structuredClone(groupsOf(tribe)),settlements=structuredClone(settlementsOf(tribe));
  const modifier=tribe.birthModifier ?? 1,rate=humanBirthRate(settings);
  const reserve=Object.values(tribe.food).reduce((n,v)=>n+v,0), need=monthlyConsumption(tribe);
  let foodRoom=Math.max(0,reserve-need),room=Math.max(0,Math.min(1000000,tribe.housingLimit ?? 1000000)-tribe.population);
  let reason=shortage>1e-8 || reserve+1e-8<need?'식량 부족 또는 다음 달 비축 부족':room===0?'주거 또는 인구 한도 도달':rate===0 || modifier===0?'GM이 출생 계산을 중지함':'';
  const paused=Boolean(reason),carries=[],born=[];
  for(const g of groups){
    const previous=tribe.birthCarries?.find(c=>c.race===g.race)?.remainder || 0;
    const coefficient=fertilityOf(g.race);
    const mature=adults.races.find(r=>r.race===g.race)?.adult || 0;
    const eligible=Math.floor(mature*(tribe.breedingParticipation ?? 1));
    if(paused || coefficient===null || !eligible){carries.push({race:g.race,remainder:previous});continue;}
    const expected=previous+eligible*rate*coefficient*modifier;
    const whole=Math.floor(expected+1e-10), remainder=Math.max(0,Math.min(1-Number.EPSILON,expected-whole));
    const foodLimit=g.consumption===0?1000000:Math.max(0,Math.floor((foodRoom+1e-8)/g.consumption));
    const count=Math.min(whole,room,foodLimit);
    carries.push({race:g.race,remainder});
    if(count<whole && !reason)reason=room<whole?'주거 또는 인구 한도로 일부 출생 미반영':'다음 달 비축 부족으로 일부 출생 미반영';
    if(!count)continue;
    const candidates=settlements.map(s=>{const group=s.composition.find(c=>c.race===g.race);return {settlement:s,group,adults:group?.cohorts.filter(c=>isMature(g.race,c.bornMonth,month)).reduce((n,c)=>n+c.population,0)||0};}).filter(c=>c.adults>0);
    const quotas=candidates.map(c=>({...c,quota:count*c.adults/mature}));
    let left=count;
    for(const c of quotas){c.births=Math.floor(c.quota);left-=c.births;}
    quotas.sort((a,b)=>(b.quota-b.births)-(a.quota-a.births)||a.settlement.id.localeCompare(b.settlement.id));
    for(let i=0;i<left;i++)quotas[i].births++;
    for(const c of quotas){c.group.population+=c.births;c.settlement.population+=c.births;if(c.births)c.group.cohorts=mergeCohorts([...c.group.cohorts,{bornMonth:month,population:c.births}]);}
    g.population+=count;room-=count;foodRoom-=count*g.consumption;
    born.push({race:g.race,population:count});
  }
  const total=born.reduce((n,g)=>n+g.population,0);
  if(total){tribe.populationGroups=groups;tribe.settlements=settlements;tribe.population+=total;}
  tribe.birthCarries=carries;
  tribe.lastBirths={month,total,races:born,reason};
  return tribe.lastBirths;
}

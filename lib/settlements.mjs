import { neighbors } from './world.mjs';

export const SETTLEMENT_STAGES = [
  {name:'야영지',min:10,max:50},{name:'촌락',min:50,max:300},{name:'마을',min:300,max:1000},
  {name:'소도시',min:1000,max:5000},{name:'도시',min:5000,max:20000},{name:'대도시',min:20000,max:50000},
];
export const DENSITIES = ['낮음','보통','높음','초고밀도'];
export const RACE_CONSUMPTION = {
  '르나르':15,'코볼트':15,'인간':30,'리자드맨':30,'프로그맨':30,'놀':30,'엘프':30,'오크':30,'사티로스':30,'닉스':30,'드워프':30,
  '오우거':60,'트롤':60,'미노타우루스':60,'아스타시디안':60,'가루다':60,'엔트':0,
};
export const recommendedStage = population => Math.max(0,SETTLEMENT_STAGES.findLastIndex(s=>population>=s.min));
export const groupsOf = tribe => tribe.populationGroups || [{race:tribe.race,population:tribe.population,consumption:tribe.consumption}];
export const monthlyConsumption = tribe => groupsOf(tribe).reduce((sum,g)=>sum+g.population*g.consumption,0);
export function settlementsOf(tribe) {
  const all=tribe.settlements || [{id:`${tribe.id}-home`,name:tribe.name,tileId:tribe.tileId,population:tribe.population,stage:recommendedStage(tribe.population),density:0}];
  if(all.every(s=>s.composition!==undefined))return all;
  const remaining=new Map(groupsOf(tribe).map(g=>[g.race,g.population]));
  for(const s of all)for(const g of s.composition || [])remaining.set(g.race,(remaining.get(g.race)||0)-g.population);
  return all.map(s=>{
    if(s.composition!==undefined)return s;
    let left=s.population;const composition=[];
    for(const [race,count] of remaining){const n=Math.min(left,Math.max(0,count));if(n){composition.push({race,population:n});remaining.set(race,count-n);left-=n;}}
    return {...s,composition};
  });
}

export function cityRegions(tribe) {
  const settlements=settlementsOf(tribe), parent=new Map(settlements.map(s=>[s.id,s.id]));
  function root(id){while(parent.get(id)!==id)id=parent.get(id);return id;}
  for(const [a,b] of tribe.urbanLinks || [])if(parent.has(a)&&parent.has(b))parent.set(root(a),root(b));
  const groups=new Map();
  for(const s of settlements){const key=root(s.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
  return [...groups.values()].filter(g=>g.length>1);
}

// Optional fields let old saves retain their existing single-species, single-home state.
export function settlementDataProblem(tribe,world) {
  const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
  const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
  if(tribe.populationGroups!==undefined){
    const groups=tribe.populationGroups;
    if(!Array.isArray(groups)||(!groups.length&&tribe.population!==0)||groups.length>30)return '종족별 구성';
    if(groups.some(g=>!g||!text(g.race,40)||!integer(g.population,1,1000000)||![0,15,30,60].includes(g.consumption)))return '종족별 인구와 소비';
    if(new Set(groups.map(g=>g.race)).size!==groups.length||groups.reduce((s,g)=>s+g.population,0)!==tribe.population)return '종족별 인구 합계';
  }
  if(tribe.settlements!==undefined){
    const all=tribe.settlements;
    if(!Array.isArray(all)||!all.length||all.length>100)return '정착지 목록';
    const byId=new Map(world.tiles.map(t=>[t.id,t]));
    if(all.some(s=>!s||!text(s.id,80)||!text(s.name,60)||!byId.has(s.tileId)||byId.get(s.tileId).settlementId!==tribe.id||['ocean','coast','lake'].includes(byId.get(s.tileId).terrain)||byId.get(s.tileId).elevation==='mountain'||!integer(s.population,0,1000000)||!integer(s.stage,0,5)||!integer(s.density,0,3)))return '정착지 정보';
    if(new Set(all.map(s=>s.id)).size!==all.length||new Set(all.map(s=>s.tileId)).size!==all.length||!all.some(s=>s.tileId===tribe.tileId))return '정착지 위치';
    if(all.reduce((n,s)=>n+s.population,0)!==tribe.population)return '정착지 인구 합계';
  }
  if(tribe.settlements?.some(s=>s.composition!==undefined && (!Array.isArray(s.composition)||s.composition.length>30||s.composition.some(g=>!g||!text(g.race,40)||!integer(g.population,1,1000000)))))return '정착지별 종족 구성';
  const all=settlementsOf(tribe), byId=new Map(all.map(s=>[s.id,s]));
  const counts=new Map(groupsOf(tribe).map(g=>[g.race,0]));
  for(const s of all){
    if(new Set(s.composition.map(g=>g.race)).size!==s.composition.length||s.composition.reduce((n,g)=>n+g.population,0)!==s.population)return '정착지별 종족 인구 합계';
    for(const g of s.composition){if(!counts.has(g.race))return '정착지 종족 연결';counts.set(g.race,counts.get(g.race)+g.population);}
  }
  if(groupsOf(tribe).some(g=>counts.get(g.race)!==g.population))return '정착지별 종족 인구 합계';
  if(tribe.urbanLinks!==undefined){
    if(!Array.isArray(tribe.urbanLinks)||tribe.urbanLinks.length>300)return '도시권 연결';
    const seen=new Set();
    for(const link of tribe.urbanLinks){
      if(!Array.isArray(link)||link.length!==2||link[0]===link[1]||link.some(id=>!byId.has(id)))return '도시권 연결';
      const tile=world.tiles.find(t=>t.id===byId.get(link[0]).tileId);
      if(!neighbors(tile,world.width,world.height).includes(byId.get(link[1]).tileId))return '인접 도시권';
      const key=JSON.stringify([...link].sort());if(seen.has(key))return '중복 도시권 연결';seen.add(key);
    }
  }
  if(tribe.notableNpcs!==undefined){
    if(!Array.isArray(tribe.notableNpcs)||tribe.notableNpcs.length>40)return '주요 NPC';
    if(tribe.notableNpcs.some(n=>!n||!text(n.id,80)||!text(n.name,40)||!text(n.race,40)||!text(n.title,60)||!byId.has(n.settlementId)||typeof n.notes!=='string'||n.notes.length>1000))return '주요 NPC 정보';
    if(new Set(tribe.notableNpcs.map(n=>n.id)).size!==tribe.notableNpcs.length)return '주요 NPC 코드';
  }
  return null;
}

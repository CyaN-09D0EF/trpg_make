export const WIDTH = 60;
export const HEIGHT = 38;
export const TERRAINS = {
  grass: { name: '초원', color: '#657d62', food: [80, 100, 150, 0] },
  plains: { name: '평원', color: '#93916a', food: [60, 70, 120, 0] },
  desert: { name: '사막', color: '#c2a878', food: [10, 5, 0, 0] },
  tundra: { name: '툰드라', color: '#899789', food: [50, 20, 20, 0] },
  snow: { name: '설원', color: '#c5d1cd', food: [20, 0, 0, 0] },
  coast: { name: '해안', color: '#557f89', food: [0, 0, 0, 180] },
  ocean: { name: '해양', color: '#365867', food: [0, 0, 0, 220] },
  lake: { name: '호수', color: '#669ba1', food: [0, 0, 0, 200] },
};
export const FEATURES = {
  forest: { name: '숲', food: [100, 80, -50, 0] },
  rainforest: { name: '열대우림', food: [120, 150, -70, 0] },
  marsh: { name: '습지', food: [40, 80, -60, 80] },
  floodplain: { name: '범람원', food: [0, 30, 150, 0] },
  oasis: { name: '오아시스', food: [0, 100, 80, 0] },
  reef: { name: '산호초', food: [0, 0, 0, 150] },
};
export function rngFor(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => {
    n += 0x6D2B79F5;
    let t = Math.imul(n ^ n >>> 15, 1 | n);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function edgeNeighbors(tile, width = WIDTH, height = HEIGHT) {
  const { x, y } = tile;
  // Polygon edges clockwise: E, SE, SW, W, NW, NE.
  const shifts = y % 2 ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]]
    : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
  return shifts.map(([dx, dy]) => ({ x: (x + dx + width) % width, y: y + dy }))
    .map(p => p.y >= 0 && p.y < height ? `${p.x},${p.y}` : null);
}
export function neighbors(tile, width = WIDTH, height = HEIGHT) {
  return edgeNeighbors(tile, width, height).filter(Boolean);
}
// Candidate lore and habitat preferences are playtest settings, not species restrictions.
export const TRIBE_CATALOG = [
  {id:'dawn',name:'여명 부족',race:'인간',population:56,consumption:30,habitat:'river',description:'강가에 뿌리내린 탐구심 많은 공동체'},
  {id:'leaf',name:'은잎 부족',race:'엘프',population:42,consumption:30,habitat:'forest',description:'오래된 숲의 지혜를 간직한 사람들'},
  {id:'ember',name:'붉은돌 부족',race:'드워프',population:48,consumption:30,habitat:'highland',description:'바위와 불을 벗 삼는 굳센 장인들'},
  {id:'moon',name:'달여울 부족',race:'르나르',population:68,consumption:15,habitat:'forest',description:'계절과 별을 따라 살아가는 민첩한 종족'},
  {id:'reed',name:'갈대비늘 부족',race:'리자드맨',population:60,consumption:30,habitat:'wetland',description:'갈대숲과 물가를 삶의 터전으로 삼는 공동체'},
  {id:'rain',name:'비노래 부족',race:'프로그맨',population:72,consumption:30,habitat:'wetland',description:'습지와 호숫가에서 비의 소식을 전하는 주민들'},
  {id:'fang',name:'황금송곳니 부족',race:'놀',population:64,consumption:30,habitat:'plains',description:'탁 트인 들판에서 무리의 유대를 지키는 사냥꾼들'},
  {id:'iron',name:'철어금니 부족',race:'오크',population:62,consumption:30,habitat:'highland',description:'언덕과 평원 사이에서 힘과 약속을 존중하는 부족'},
  {id:'boulder',name:'큰바위 부족',race:'오우거',population:36,consumption:60,habitat:'highland',description:'바위 언덕의 넓은 터에서 함께 살아가는 거인들'},
  {id:'horn',name:'풀피리 부족',race:'사티로스',population:54,consumption:30,habitat:'forest',description:'숲과 들의 경계에서 음악과 계절을 나누는 주민들'},
  {id:'moss',name:'이끼등 부족',race:'트롤',population:38,consumption:60,habitat:'forest',description:'울창한 숲과 서늘한 언덕을 지키는 공동체'},
  {id:'ripple',name:'물안개 부족',race:'닉스',population:44,consumption:30,habitat:'wetland',description:'잔잔한 물가에서 안개와 물결을 읽는 주민들'},
  {id:'spark',name:'반짝굴 부족',race:'코볼트',population:80,consumption:15,habitat:'highland',description:'바위 틈과 언덕에 작은 작업장을 꾸리는 부족'},
  {id:'shell',name:'푸른갑각 부족',race:'아스타시디안',population:40,consumption:60,habitat:'shore',description:'물과 육지가 만나는 기슭에 둥지를 튼 공동체'},
  {id:'maze',name:'굽은뿔 부족',race:'미노타우루스',population:40,consumption:60,habitat:'plains',description:'넓은 들과 구릉에서 길과 전통을 지켜 온 주민들'},
  {id:'wind',name:'바람깃 부족',race:'가루다',population:46,consumption:60,habitat:'highland',description:'높은 언덕에서 먼 지평선과 바람을 살피는 부족'},
  {id:'root',name:'깊은뿌리 부족',race:'엔트',population:24,consumption:0,habitat:'forest',description:'오래된 나무와 대지의 기억을 간직한 공동체'},
];
export const RACE_CONSUMPTION = Object.fromEntries(TRIBE_CATALOG.map(t => [t.race, t.consumption]));
const WATER = new Set(['ocean','coast','lake']);
const passable = tile => !WATER.has(tile.terrain) && tile.elevation !== 'mountain';

// Smooth value noise wraps in longitude, so the east/west seam is continuous.
function noiseField(random, columns, rows) {
  const grid = Array.from({length:rows + 1}, () => Array.from({length:columns}, random));
  return (x,y) => {
    const px=x*columns, py=Math.min(rows-1e-9,y*rows), ix=Math.floor(px), iy=Math.floor(py);
    const smooth=t=>t*t*(3-2*t), fx=smooth(px-ix), fy=smooth(py-iy);
    const a=grid[iy][ix%columns]*(1-fx)+grid[iy][(ix+1)%columns]*fx;
    const b=grid[iy+1][ix%columns]*(1-fx)+grid[iy+1][(ix+1)%columns]*fx;
    return a*(1-fy)+b*fy;
  };
}
export function hexDistance(a,b,width=WIDTH) {
  const aq=a.x-(a.y-(a.y&1))/2, bq=b.x-(b.y-(b.y&1))/2, dr=a.y-b.y;
  return Math.min(...[-width,0,width].map(w=>{
    const dq=aq-bq+w;return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));
  }));
}
// Integer corner coordinates: scale x by sqrt(3)*size/2 and y by size/2.
// Adjacent hexes share the exact same corner, including across the world seam.
export function hexEdgePoints(tile, edge) {
  const corners=[[1,-1],[1,1],[0,2],[-1,1],[-1,-1],[0,-2]];
  return [corners[edge],corners[(edge+1)%6]].map(([dx,dy])=>({x:2*tile.x+(tile.y&1)+dx,y:3*tile.y+dy}));
}
export function riverVertexId(point,width=WIDTH) {
  return `${((point.x%(2*width))+2*width)%(2*width)},${point.y}`;
}
export function tileAltitude(tile,seed='') {
  if(WATER.has(tile.terrain))return 0;
  const rank={flat:100,hill:400,mountain:800}[tile.elevation];
  // Respect the current elevation category after a GM terrain edit too.
  return Number.isFinite(tile.altitude)&&tile.altitude>=rank&&tile.altitude<rank+300
    ? tile.altitude : rank+Math.floor(rngFor(`${seed}:height:${tile.id}`)()*200);
}
export function regenerateRivers(world,seed) {
  const {tiles,width,height}=world,vertices=new Map(),edges=new Map();
  const byId=new Map(tiles.map(t=>[t.id,t]));
  for(const tile of tiles) {
    tile.river=[];
    for(let edge=0;edge<6;edge++) {
      const points=hexEdgePoints(tile,edge),ids=points.map(p=>riverVertexId(p,width));
      for(const id of ids) {
        if(!vertices.has(id))vertices.set(id,{id,banks:new Set(),edges:[],outlet:false,length:0});
        vertices.get(id).banks.add(tile.id);
      }
      if(!edgeNeighbors(tile,width,height)[edge])continue;
      const key=[...ids].sort().join('|');
      if(!edges.has(key)) {
        const segment={key,a:ids[0],b:ids[1],banks:[]};edges.set(key,segment);
        for(const id of ids)vertices.get(id).edges.push(segment);
      }
      edges.get(key).banks.push({tile,edge});
    }
  }
  for(const vertex of vertices.values()) {
    vertex.tiles=[...vertex.banks].map(id=>byId.get(id));
    vertex.water=vertex.tiles.some(t=>WATER.has(t.terrain));
    vertex.height=vertex.water?0:vertex.tiles.reduce((sum,t)=>sum+tileAltitude(t,seed),0)/vertex.tiles.length;
    // Tiny slopes distinguish equal-height corners without lifting a river uphill.
    vertex.height+=vertex.water?0:rngFor(`${seed}:river-slope:${vertex.id}`)()*.0001;
    vertex.outlet=vertex.water;
  }
  for(const vertex of [...vertices.values()].sort((a,b)=>a.height-b.height)) {
    if(vertex.water)continue;
    const downstream=vertex.edges.map(edge=>({edge,next:vertices.get(edge.a===vertex.id?edge.b:edge.a)}))
      .filter(({next})=>next.outlet&&next.height<vertex.height).sort((a,b)=>a.next.height-b.next.height);
    if(downstream.length) {
      vertex.next=downstream[0];vertex.outlet=true;vertex.length=vertex.next.next.length+1;
    }
  }
  const random=rngFor(`${seed}:rivers:v4`),used=new Set(),sources=[];
  const candidates=[...vertices.values()].filter(v=>!v.water&&v.outlet&&v.length>=4&&v.tiles.length===3&&v.tiles.some(t=>t.elevation!=='flat'&&t.terrain!=='snow'))
    .map(vertex=>({vertex,score:vertex.length*25+vertex.height+random()*150})).sort((a,b)=>b.score-a.score);
  const maximum=Math.max(2,Math.floor(tiles.length/140));
  for(const {vertex:source} of candidates) {
    if(sources.length>=maximum)break;
    if(used.has(source.id)||sources.some(other=>hexDistance(source.tiles[0],other.tiles[0],width)<3))continue;
    const path=[];let vertex=source;
    while(vertex.next&&!used.has(vertex.id)) {path.push(vertex.next.edge);vertex=vertex.next.next;}
    if(path.length<3)continue;
    for(const edge of path) {
      used.add(edge.a);used.add(edge.b);
      for(const bank of edge.banks)if(!bank.tile.river.includes(bank.edge))bank.tile.river.push(bank.edge);
    }
    sources.push(source);
  }
  return sources.length;
}

function habitatScore(spec, tile, nearby) {
  const area=[tile,...nearby];
  const forest=area.filter(t=>['forest','rainforest'].includes(t.feature)).length;
  const hills=area.filter(t=>t.elevation!=='flat').length;
  const water=nearby.some(t=>WATER.has(t.terrain));
  const fresh=tile.river.length || nearby.some(t=>t.terrain==='lake');
  switch(spec.habitat) {
    case 'forest':return forest*2+(tile.feature==='forest'||tile.feature==='rainforest'?5:0);
    case 'highland':return hills*2+(tile.elevation==='hill'?5:0);
    case 'wetland':return (water?7:0)+(fresh?5:0)+area.filter(t=>t.feature==='marsh').length*3;
    case 'shore':return (water?12:0)+(fresh?2:0);
    case 'plains':return area.filter(t=>['plains','grass'].includes(t.terrain)&&t.elevation==='flat').length*2;
    default:return (fresh?8:0)+(['grass','plains'].includes(tile.terrain)?5:0);
  }
}
export function generateWorld(seed, { width = WIDTH, height = HEIGHT } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 22 || height < 14 || width > 128 || height > 80) {
    throw new RangeError('지도 크기는 가로 22~128, 세로 14~80의 정수여야 합니다.');
  }
  const random=rngFor(`${seed}:terrain:v2`);
  const continent=noiseField(random,5,4), detail=noiseField(random,12,9);
  const moisture=noiseField(random,8,6), relief=noiseField(random,10,7);
  // Independent detail keeps the broad geography and tribe draw stable while
  // adding bays, broken climate boundaries and small clearings within forests.
  const irregular=rngFor(`${seed}:terrain-detail:v3`);
  const warpX=noiseField(irregular,7,5), warpY=noiseField(irregular,7,5);
  const coastDetail=noiseField(irregular,Math.ceil(width/2),Math.ceil(height/2));
  const patches=noiseField(irregular,Math.ceil(width/3),Math.ceil(height/3));
  const climate=noiseField(irregular,6,5);
  const wrap=n=>(n%1+1)%1, clamp=n=>Math.max(0,Math.min(1,n));
  const tiles=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const nx=x/width,ny=y/(height-1),latitude=Math.abs(2*ny-1);
    const wx=wrap(nx+(warpX(nx,ny)-.5)*.10), wy=clamp(ny+(warpY(nx,ny)-.5)*.08);
    const altitude=continent(wx,wy)*.68+detail(wx,wy)*.20+coastDetail(nx,ny)*.09+irregular()*.03;
    const patch=patches(nx,ny)-.5;
    const humid=clamp(moisture(wx,wy)+patch*.3+(irregular()-.5)*.10);
    const high=clamp(relief(wx,wy)+patch*.18+(irregular()-.5)*.12);
    const climateLatitude=clamp(latitude+(climate(nx,ny)-.5)*.28+patch*.12+(irregular()-.5)*.06);
    const terrain=climateLatitude>.88?'snow':climateLatitude>.66?'tundra':climateLatitude<.5&&humid<.34?'desert':humid>.5?'grass':'plains';
    const elevation=high>.78?'mountain':high>.58?'hill':'flat';
    let feature=null;
    if(['grass','plains'].includes(terrain)) {
      const forestChance=clamp((humid-.3)*1.7+patch*.25);
      if(irregular()<forestChance)feature=climateLatitude<.3&&humid>.64?'rainforest':'forest';
      else if(humid>.56&&elevation==='flat'&&irregular()<.5)feature='marsh';
    }
    tiles.push({id:`${x},${y}`,x,y,terrain,feature,elevation,river:[],resource:null,wildlife:0,plants:0,ruin:false,settlementId:null,altitude:({flat:100,hill:400,mountain:800}[elevation])+Math.round(altitude*180+high*80),_altitude:altitude});
  }
  const byId=new Map(tiles.map(t=>[t.id,t]));
  const near=tile=>neighbors(tile,width,height).map(id=>byId.get(id));
  // Lowest 35% becomes water; classify connected inland pockets before coasts.
  const wetIds=new Set([...tiles].sort((a,b)=>a._altitude-b._altitude).slice(0,Math.floor(tiles.length*.35)).map(t=>t.id));
  const pending=new Set(wetIds), lakes=new Set();
  while(pending.size) {
    const queue=[byId.get(pending.values().next().value)];pending.delete(queue[0].id);
    let boundary=false;
    for(let i=0;i<queue.length;i++) {
      const tile=queue[i];boundary ||= tile.y===0||tile.y===height-1;
      for(const next of near(tile))if(pending.delete(next.id))queue.push(next);
    }
    if(!boundary&&queue.length<=Math.max(3,Math.floor(tiles.length*.004)))for(const tile of queue)lakes.add(tile.id);
  }
  for(const tile of tiles)if(wetIds.has(tile.id)) {
    tile.terrain=lakes.has(tile.id)?'lake':near(tile).some(t=>!wetIds.has(t.id))?'coast':'ocean';
    tile.elevation='flat';tile.altitude=0;tile.feature=tile.terrain==='coast'&&Math.abs(2*tile.y/(height-1)-1)<.5&&random()<.3?'reef':null;
  }
  regenerateRivers({tiles,width,height},seed);
  for(const tile of tiles) {
    const wet=wetIds.has(tile.id),barren=['snow','desert'].includes(tile.terrain)||tile.elevation==='mountain';
    if(tile.terrain==='plains'&&tile.river.length&&!tile.feature)tile.feature='floodplain';
    if(tile.terrain==='desert'&&tile.elevation==='flat'&&random()<.08)tile.feature='oasis';
    tile.wildlife=Math.floor(wet?70+random()*100:barren?random()*25:30+random()*100);
    tile.plants=wet||tile.elevation==='mountain'?0:Math.floor(barren?random()*35:140+random()*160);
    tile.resource=wet?(random()<.65?'물고기':null):tile.elevation!=='flat'?['석재','구리',null][Math.floor(random()*3)]:['forest','rainforest'].includes(tile.feature)?(random()<.65?'사슴':'목재'):tile.terrain==='desert'||tile.terrain==='snow'?null:['밀','야생 과일','소',null][Math.floor(random()*4)];
    tile.ruin=!wet&&random()<.023;
    delete tile._altitude;
  }
  // Shuffle the whole catalog; take exactly four, without replacement or weights.
  const draw=rngFor(`${seed}:tribe-draw:v2`), pool=[...TRIBE_CATALOG];
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(draw()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const placement=rngFor(`${seed}:tribe-placement:v2`),homes=[];
  const candidates=tiles.filter(t=>t.y>0&&t.y<height-1&&passable(t)&&t.terrain!=='snow'&&near(t).filter(passable).length>=3);
  const preferredDistance=Math.max(3,Math.floor(Math.min(width,height)*.2));
  const tribes=pool.slice(0,4).map(spec=>{
    let eligible=[];
    for(let distance=preferredDistance;distance>=3&&!eligible.length;distance--)eligible=candidates.filter(t=>homes.every(h=>hexDistance(t,h,width)>=distance));
    if(!eligible.length)throw new Error('부족을 배치할 안전한 시작 지형이 부족합니다. 다른 시드를 사용하세요.');
    const ranked=eligible.map(tile=>({tile,score:habitatScore(spec,tile,near(tile))+(homes.length?Math.min(...homes.map(h=>hexDistance(tile,h,width)))*.45:0)+placement()*4}));
    ranked.sort((a,b)=>b.score-a.score);
    const tile=ranked[0].tile;homes.push(tile);tile.settlementId=spec.id;
    const {habitat,...identity}=spec,provisions=spec.population*spec.consumption;
    return {...identity,tileId:tile.id,followers:0,food:{meat:provisions,grain:provisions,fruit:Math.round(provisions/2)},workers:{hunt:0,gather:0,farm:0,fish:0},technologies:[],buildings:[]};
  });
  return {width,height,tiles,tribes};
}

import {test,expect} from '@playwright/test';
import {createGame} from '../../lib/game.mjs';

async function renderedNetwork(page){
  return page.locator('#world-map .river-segment').evaluateAll(paths=>{
    const ids=p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    const pairs=paths.map(path=>[path.getPointAtLength(0),path.getPointAtLength(path.getTotalLength())].map(ids));
    const adjacent=new Map();
    for(const [a,b] of pairs){if(!adjacent.has(a))adjacent.set(a,new Set());if(!adjacent.has(b))adjacent.set(b,new Set());adjacent.get(a).add(b);adjacent.get(b).add(a);}
    const pending=new Set(adjacent.keys()),components=[];
    while(pending.size){const queue=[pending.values().next().value];pending.delete(queue[0]);for(let i=0;i<queue.length;i++)for(const next of adjacent.get(queue[i]))if(pending.delete(next))queue.push(next);components.push(queue);}
    const largest=components.sort((a,b)=>b.length-a.length)[0] || [];
    const points=largest.map(id=>id.split(',').map(Number));
    return {segments:pairs.length,unique:new Set(pairs.map(p=>[...p].sort().join('|'))).size,joined:[...adjacent.values()].filter(v=>v.size>=2).length,largest:largest.length,bounds:points.length?[Math.min(...points.map(p=>p[0]))-65,Math.min(...points.map(p=>p[1]))-65,Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))+130,Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))+130]:null};
  });
}
test('river strokes visibly join on hex sides and GM repairs an existing save through the map controls',async({page,request},testInfo)=>{
  const campaign=createGame({id:'RIV123',name:'이어지는 강',seed:'geography-0',gmName:'GM',gmHash:'old',invite:'old'});
  await page.goto('/');
  const enter=async room=>{
    await page.evaluate(s=>localStorage.setItem('civilization.sessions',JSON.stringify([{id:s.id,token:s.token,role:'gm'}])),room);
    await page.goto(`/r/${room.id}`);
    await expect(page.locator('#world-map')).toBeVisible();
  };
  for(const tile of campaign.world.tiles){tile.river=[];delete tile.altitude;}
  const old=await(await request.post('/api/rooms/import',{data:{campaign,playerName:'GM'}})).json();
  await enter(old);
  await expect(page.locator('#world-map .river-segment')).toHaveCount(0);
  await page.getByRole('button',{name:'강줄기 다시 생성',exact:true}).click();
  await page.getByRole('button',{name:'현재 세계의 강줄기 다시 생성',exact:true}).click();
  await expect(page.locator('.log-list')).toContainText('GM 강줄기 재생성');
  const repaired=await renderedNetwork(page);
  expect(repaired.segments).toBeGreaterThan(20);expect(repaired.unique).toBe(repaired.segments);
  expect(repaired.joined).toBeGreaterThan(repaired.segments/2);expect(repaired.largest).toBeGreaterThan(6);
  const restored=await(await request.get(`/api/rooms/${old.id}/export`,{headers:{Authorization:`Bearer ${old.token}`}})).json();
  expect(restored.world.tribes).toEqual(campaign.world.tribes);
  const landscape=t=>{const {river,feature,...rest}=t;return rest;};
  expect(restored.world.tiles.map(landscape)).toEqual(campaign.world.tiles.map(landscape));
  await page.locator('#world-map').evaluate((node,bounds)=>node.setAttribute('viewBox',bounds.join(' ')),repaired.bounds);
  await page.locator('.map-card').screenshot({path:testInfo.outputPath('connected-downhill-rivers.png')});
});

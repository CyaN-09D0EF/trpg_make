import { assertRiverNetwork } from './river-helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, TRIBE_CATALOG, RACE_CONSUMPTION, neighbors, edgeNeighbors, hexDistance } from '../lib/world.mjs';
import { POPULATION_TRAITS_V03 } from '../lib/lifecycle.mjs';
import { createGame, applyAction, projectedState } from '../lib/game.mjs';
import { restoreCampaign } from '../lib/campaign.mjs';

const wet=t=>['ocean','coast','lake'].includes(t.terrain);

test('four distinct tribes are drawn from the full 17-species catalog; seeds vary and repeat across reloads',()=>{
  assert.equal(TRIBE_CATALOG.length,17);
  assert.equal(new Set(TRIBE_CATALOG.map(t=>t.id)).size,17);
  assert.deepEqual(new Set(TRIBE_CATALOG.map(t=>t.race)),new Set(POPULATION_TRAITS_V03.map(t=>t.race)));
  const seen=new Set(),rosters=new Set();
  for(let i=0;i<30;i++){
    const seed=`roster-${i}`,world=generateWorld(seed);
    assert.equal(world.tribes.length,4);
    assert.equal(new Set(world.tribes.map(t=>t.id)).size,4);
    rosters.add(world.tribes.map(t=>t.id).sort().join(','));
    for(const tribe of world.tribes){
      seen.add(tribe.race);
      assert.equal(tribe.consumption,RACE_CONSUMPTION[tribe.race]);
      assert.equal(Object.values(tribe.food).reduce((a,b)=>a+b,0),tribe.population*tribe.consumption*2.5);
    }
  }
  assert.equal(seen.size,17);
  assert.ok(rosters.size>20);
  assert.deepEqual(generateWorld('roster-7'),generateWorld('roster-7'));
});

test('generated geography has real coasts, inland lakes, connected river mouths and safe separated starts at both map sizes',()=>{
  let lakes=0;
  for(const dimensions of [{width:22,height:14},{width:60,height:38}])for(let i=0;i<12;i++){
    const world=generateWorld(`geography-${i}`,dimensions),{width,height,tiles,tribes}=world;
    const byId=new Map(tiles.map(t=>[t.id,t])),adj=t=>neighbors(t,width,height).map(id=>byId.get(id));
    assert.equal(tiles.filter(wet).length,Math.floor(width*height*.35));
    for(const tile of tiles){
      if(tile.terrain==='coast')assert.ok(adj(tile).some(t=>!wet(t)));
      if(tile.terrain==='ocean')assert.ok(adj(tile).every(wet));
      if(wet(tile)){assert.equal(tile.plants,0);assert.equal(tile.ruin,false);assert.equal(tile.elevation,'flat');}
      if(tile.feature==='reef')assert.equal(tile.terrain,'coast');
      if(tile.terrain==='lake'){lakes++;assert.ok(tile.y>0&&tile.y<height-1);}
      for(const edge of tile.river){const next=byId.get(edgeNeighbors(tile,width,height)[edge]);assert.ok(next?.river.includes((edge+3)%6));}
    }
    assertRiverNetwork(world);
    const homes=tribes.map(t=>byId.get(t.tileId));
    for(let j=0;j<homes.length;j++){
      const tile=homes[j];assert.equal(tile.settlementId,tribes[j].id);assert.ok(!wet(tile));
      assert.notEqual(tile.terrain,'snow');assert.notEqual(tile.elevation,'mountain');
      assert.equal(adj(tile).length,6);assert.ok(adj(tile).filter(t=>!wet(t)&&t.elevation!=='mountain').length>=3);
      for(const other of homes.slice(j+1))assert.ok(hexDistance(tile,other,width)>=3);
    }
  }
  assert.ok(lakes>0,'some seeds should contain inland lakes');
  assert.equal(hexDistance({x:0,y:6},{x:59,y:6},60),1);
});

test('randomized races remain playable, private and unchanged by save import',()=>{
  for(let i=0;i<8;i++){
    const room=createGame({id:'RND123',name:'무작위 부족',seed:`play-${i}`,gmName:'GM',gmHash:'h',invite:'i'});
    const selected=room.world.tribes[0];
    applyAction(room,'god',{type:'create-god',name:'신',realm:'숲'});
    applyAction(room,'god',{type:'select-tribe',tribeId:selected.id});
    applyAction(room,'priest',{type:'create-priest',name:'신관',strength:30,intelligence:40,social:30});
    assert.equal(room.priest.race,selected.race);
    assert.equal(projectedState(room,'priest').world.tiles.length,7);
    assert.equal(projectedState(room,'priest').tribes.length,1);
    const restored=restoreCampaign(room,{id:'NEW123',gmName:'GM',gmHash:'h',invite:'i'});
    assert.deepEqual(restored.world,room.world);
  }
});

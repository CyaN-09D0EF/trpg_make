import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, regenerateRivers, hexEdgePoints, riverVertexId, edgeNeighbors, tileAltitude } from '../lib/world.mjs';
import { createGame, applyAction, observe } from '../lib/game.mjs';
import { restoreCampaign } from '../lib/campaign.mjs';
import { assertRiverNetwork } from './river-helpers.mjs';

test('shared hex sides have identical corner endpoints, including the east/west seam',()=>{
  const world=generateWorld('river-corners');
  for(const tile of world.tiles)for(let edge=0;edge<6;edge++){
    const id=edgeNeighbors(tile,world.width,world.height)[edge];if(!id)continue;
    const next=world.tiles.find(t=>t.id===id);
    const ends=t=>hexEdgePoints(t,t===tile?edge:(edge+3)%6).map(p=>riverVertexId(p,world.width)).sort();
    assert.deepEqual(ends(tile),ends(next));
  }
});

test('rivers join at actual side endpoints, flow downhill and preserve the generated landscape',()=>{
  for(const size of [{width:22,height:14},{width:60,height:38}])for(let i=0;i<10;i++){
    const seed=`river-flow-${i}`,world=generateWorld(seed,size);
    const original=structuredClone(world);
    const sources=regenerateRivers(world,seed),network=assertRiverNetwork(world);
    if(size.width===60){assert.ok(sources>0);assert.ok(network.segments>=sources*3);}
    assert.deepEqual(world,original,'rebuilding a seeded river network must be deterministic and change no other data');
  }
});

test('GM can repair existing rivers without regenerating terrain, settlements, resources or observations',()=>{
  const room=createGame({id:'RIV123',name:'강 수리',seed:'geography-0',gmName:'GM',gmHash:'h',invite:'i'});
  observe(room,'priest',['0,0','10,10']);
  const remote=room.world.tiles.find(t=>t.id==='10,10');remote.resource='GM 비밀 자원';remote.wildlife=9876;
  room.day=4;
  const known=structuredClone(room.knowledge),before=structuredClone(room.world);
  for(const role of ['god','priest'])assert.throws(()=>applyAction(room,role,{type:'regenerate-rivers'}),/GM만/);
  applyAction(room,'gm',{type:'regenerate-rivers'});
  assertRiverNetwork(room.world);
  for(let i=0;i<before.tiles.length;i++){
    const strip=({river,feature,...rest})=>rest;
    assert.deepEqual(strip(room.world.tiles[i]),strip(before.tiles[i]));
    if(before.tiles[i].feature&&before.tiles[i].feature!=='floodplain')assert.equal(room.world.tiles[i].feature,before.tiles[i].feature);
  }
  assert.deepEqual(room.world.tribes,before.tribes);
  for(const role of ['god','priest']){
    assert.deepEqual(Object.keys(room.knowledge[role]),Object.keys(known[role]));
    for(const [id,observation] of Object.entries(room.knowledge[role])){
      const strip=({river,feature,...rest})=>rest;
      assert.deepEqual(strip(observation),strip(known[role][id]));
    }
  }
  assert.notEqual(room.knowledge.priest['10,10'].resource,'GM 비밀 자원');
  const restored=restoreCampaign(room,{id:'NEW123',gmName:'GM',gmHash:'h',invite:'i'});
  assert.deepEqual(restored.world,room.world);
  // Old exports have no numeric heights; rebuilding still uses their existing
  // flat/hill/mountain categories, without rewriting the terrain or save schema.
  for(const tile of room.world.tiles)delete tile.altitude;
  applyAction(room,'gm',{type:'regenerate-rivers'});
  const inspection=structuredClone(room.world);
  for(const tile of inspection.tiles)tile.altitude=tileAltitude(tile,room.seed);
  assertRiverNetwork(inspection);
  assert.deepEqual(restoreCampaign(room,{id:'OLD123',gmName:'GM',gmHash:'h',invite:'i'}).world,room.world);
});

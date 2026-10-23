import assert from 'node:assert/strict';
import {hexEdgePoints,riverVertexId} from '../lib/world.mjs';
const water=t=>['ocean','coast','lake'].includes(t.terrain);

// Reconstruct the physical side/corner network from saved tile arrays, rather
// than treating connected tile centers as proof that the drawn lines connect.
export function assertRiverNetwork(world) {
  const vertices=new Map(),segments=new Map();
  for(const tile of world.tiles)for(let side=0;side<6;side++){
    const ids=hexEdgePoints(tile,side).map(p=>riverVertexId(p,world.width));
    for(const id of ids){
      if(!vertices.has(id))vertices.set(id,{banks:new Map(),adjacent:new Set()});
      vertices.get(id).banks.set(tile.id,tile);
    }
    if(tile.river.includes(side))segments.set([...ids].sort().join('|'),ids);
  }
  for(const [a,b] of segments.values()){vertices.get(a).adjacent.add(b);vertices.get(b).adjacent.add(a);}
  for(const vertex of vertices.values()){
    const banks=[...vertex.banks.values()];
    vertex.water=banks.some(water);
    vertex.height=vertex.water?0:banks.reduce((sum,t)=>sum+t.altitude,0)/banks.length;
  }
  const pending=new Set([...vertices.keys()].filter(id=>vertices.get(id).adjacent.size));
  let components=0;
  while(pending.size){
    const start=pending.values().next().value,queue=[start];pending.delete(start);
    for(let i=0;i<queue.length;i++)for(const next of vertices.get(queue[i]).adjacent)if(pending.delete(next))queue.push(next);
    assert.ok(queue.length>=4,'a river must contain multiple joined side segments');
    const mouths=queue.filter(id=>vertices.get(id).water);
    assert.equal(mouths.length,1,'each river tree must end at one actual water corner');
    const edgeCount=queue.reduce((sum,id)=>sum+vertices.get(id).adjacent.size,0)/2;
    assert.equal(edgeCount,queue.length-1,'rivers must not form loops');
    const upstream=[{id:mouths[0],parent:null}];
    for(let i=0;i<upstream.length;i++){
      const {id,parent}=upstream[i],vertex=vertices.get(id);
      for(const nextId of vertex.adjacent)if(nextId!==parent){
        const next=vertices.get(nextId);
        assert.ok(next.height>=vertex.height-.001,`uphill river: ${nextId} (${next.height}) -> ${id} (${vertex.height})`);
        upstream.push({id:nextId,parent:id});
      }
      if(vertex.adjacent.size===1&&!vertex.water)assert.ok([...vertex.banks.values()].some(t=>t.elevation!=='flat'&&t.terrain!=='snow'),'a river source must adjoin a highland');
    }
    components++;
  }
  return {components,segments:segments.size};
}

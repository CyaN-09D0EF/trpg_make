// Fixed human/elf/dwarf/renard campaigns isolate older gameplay scenarios from
// the new random roster. Production/world-generation tests use real draws.
import { createGame as createGeneratedGame } from '../lib/game.mjs';
import { generateWorld, TRIBE_CATALOG } from '../lib/world.mjs';

export function classicWorld(seed, options) {
  const world=generateWorld(seed,options);
  const original=world.tribes.map(t=>t.id);
  world.tribes=world.tribes.map((tribe,index)=>{
    const {habitat,...identity}=TRIBE_CATALOG[index], provisions=identity.population*identity.consumption;
    return {...tribe,...identity,food:{meat:provisions,grain:provisions,fruit:Math.round(provisions/2)}};
  });
  for(const tile of world.tiles)if(tile.settlementId)tile.settlementId=world.tribes[original.indexOf(tile.settlementId)].id;
  return world;
}
export function createClassicGame(options) {
  const room=createGeneratedGame(options);
  room.world=classicWorld(options.seed);
  for(const knowledge of Object.values(room.knowledge))for(const tile of Object.values(knowledge)) {
    tile.settlementId=room.world.tiles.find(t=>t.id===tile.id)?.settlementId ?? null;
  }
  return room;
}

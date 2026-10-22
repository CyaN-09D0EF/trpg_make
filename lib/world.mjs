export const WIDTH = 22;
export const HEIGHT = 14;
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
export function generateWorld(seed) {
  const random = rngFor(seed);
  const phase = random() * 8;
  const tiles = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const latitude = Math.abs(y - (HEIGHT - 1) / 2) / (HEIGHT / 2);
    const land = Math.sin(x / 3 + phase) + Math.cos(y / 2.6 + phase) * .7 + (random() - .5) * .8;
    const wet = land < -.4;
    const terrain = wet ? (land < -.9 ? 'ocean' : 'coast')
      : latitude > .87 ? 'snow' : latitude > .66 ? 'tundra'
      : latitude < .38 && random() > .7 ? 'desert' : random() > .48 ? 'grass' : 'plains';
    let feature = null;
    if (terrain === 'coast' && random() < .3) feature = 'reef';
    if (terrain === 'grass' || terrain === 'plains') feature = random() < .52 ? 'forest' : random() < .15 ? 'marsh' : null;
    if (terrain === 'desert' && random() < .22) feature = 'oasis';
    if (terrain === 'grass' && latitude < .3 && feature === 'forest') feature = 'rainforest';
    const elevation = wet ? 'flat' : random() < .08 ? 'mountain' : random() < .22 ? 'hill' : 'flat';
    const river = !wet && elevation !== 'mountain' && random() < .25 ? [Math.floor(random() * 6)] : [];
    if (river.length && terrain === 'plains' && !feature) feature = 'floodplain';
    const wildlife = wet ? Math.floor(70 + random() * 100) : Math.floor(10 + random() * 110);
    const resource = wet ? (random() < .65 ? '물고기' : null)
      : feature === 'forest' ? (random() < .65 ? '사슴' : '목재')
      : ['밀', '야생 과일', '석재', '구리', '소', null][Math.floor(random() * 6)];
    tiles.push({ id: `${x},${y}`, x, y, terrain, feature, elevation, river, resource,
      wildlife, plants: 140 + Math.floor(random() * 160), ruin: random() < .023, settlementId: null });
  }
  const specs = [
    ['dawn', '여명 부족', '인간', 56, 30, 5, 6, '강가에 뿌리내린 탐구심 많은 공동체'],
    ['leaf', '은잎 부족', '엘프', 42, 30, 11, 4, '오래된 숲의 지혜를 간직한 사람들'],
    ['ember', '붉은돌 부족', '드워프', 48, 30, 16, 8, '바위와 불을 벗 삼는 굳센 장인들'],
    ['moon', '달여울 부족', '르나르', 68, 15, 9, 10, '계절과 별을 따라 살아가는 민첩한 종족'],
  ];
  const tribes = specs.map(([id, name, race, population, consumption, x, y, description]) => {
    const tile = tiles.find(t => t.x === x && t.y === y);
    Object.assign(tile, { terrain: 'grass', elevation: 'flat', feature: 'forest', river: [1], resource: '사슴', settlementId: id });
    for (const nid of neighbors(tile)) {
      const near = tiles.find(t => t.id === nid);
      if (near.elevation === 'mountain' || ['ocean', 'coast', 'snow'].includes(near.terrain)) {
        Object.assign(near, { terrain: 'plains', elevation: 'flat', feature: null });
      }
    }
    const provisions = population * consumption;
    return { id, name, race, population, consumption, tileId: tile.id, description, followers: 0,
      food: { meat: provisions, grain: provisions, fruit: Math.round(provisions / 2) },
      workers: { hunt: 0, gather: 0, farm: 0, fish: 0 }, technologies: [], buildings: [] };
  });
  const byId = new Map(tiles.map(t => [t.id, t]));
  for (const tile of tiles) {
    tile.river = tile.river.filter(edge => edgeNeighbors(tile)[edge] !== null);
    for (const edge of tile.river) {
      const next = byId.get(edgeNeighbors(tile)[edge]);
      const opposite = (edge + 3) % 6;
      if (!next.river.includes(opposite)) next.river.push(opposite);
    }
  }
  return { width: WIDTH, height: HEIGHT, tiles, tribes };
}

import { randomInt, randomUUID } from 'node:crypto';
import { technologyTree } from './technologies.mjs';
import { generateWorld, neighbors, TERRAINS, FEATURES, rngFor } from './world.mjs';

export const ROLES = ['gm', 'god', 'priest'];
export const ROLE_NAMES = { gm: 'GM', god: '신', priest: '신관' };
export const ACTIVITIES = ['hunt', 'gather', 'farm', 'fish'];
export const TECH_STAGES = ['미발견', '발견', '실험', '실용화', '보급'];
export const DEFAULT_SETTINGS = {
  workerOutput: 75, capacityScale: 4, recoveryRate: .2, eventChance: 25,
};
export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (condition, message, status) => { if (!condition) throw new GameError(message, status); };
function text(value, label, max = 500) {
  fail(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${label}: 1~${max}자로 입력하세요.`);
  return value.trim();
}
function integer(value, min, max, label) {
  fail(Number.isInteger(value) && value >= min && value <= max, `${label}: ${min}~${max}의 정수가 필요합니다.`);
  return value;
}
function log(room, kind, message, audience = 'all', extra = {}) {
  room.logs.push({ id: randomUUID(), at: new Date().toISOString(), day: room.day, kind, message, audience, ...extra });
  if (room.logs.length > 500) room.logs.splice(0, room.logs.length - 500);
}
export function observe(room, role, ids) {
  for (const id of ids) {
    const tile = room.world.tiles.find(t => t.id === id);
    if (tile) room.knowledge[role][id] = { ...structuredClone(tile), observedDay: room.day };
  }
}
function area(room, id) {
  const tile = room.world.tiles.find(t => t.id === id);
  return tile ? [id, ...neighbors(tile, room.world.width, room.world.height)] : [];
}
export function createGame({ id, name, seed, gmName, gmHash, invite }) {
  const room = {
    schemaVersion: 1, id, name: text(name, '방 이름', 50), seed,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 0,
    invite, players: { gm: { name: gmName, tokenHash: gmHash }, god: null, priest: null },
    world: generateWorld(seed), knowledge: { god: {}, priest: {} },
    day: 1, hour: 0, month: 1, selectedTribe: null, god: null, priest: null,
    settings: { ...DEFAULT_SETTINGS }, actions: [], logs: [],
  };
  for (const tribe of room.world.tribes) observe(room, 'god', area(room, tribe.tileId));
  log(room, 'system', '세계가 깨어났습니다. 신이 이름과 소영역을 정하고 시작 부족을 선택하세요.');
  return room;
}
export function joinGame(room, { role, name, tokenHash }) {
  fail(['god', 'priest'].includes(role), '참여할 수 없는 역할입니다.');
  fail(!room.players[role], '이미 참여 중인 역할입니다. 기존 브라우저에서 다시 접속하거나 GM에게 자리 해제를 요청하세요.', 409);
  room.players[role] = { name: text(name, '플레이어 이름', 24), tokenHash };
  log(room, 'system', `${ROLE_NAMES[role]} · ${room.players[role].name} 님이 합류했습니다.`);
}
export function projectedState(room, role, online = []) {
  const gm = role === 'gm';
  const tribe = room.world.tribes.find(t => t.id === room.selectedTribe);
  const tiles = gm ? room.world.tiles.map(t => ({ ...t, observedDay: room.day })) : Object.values(room.knowledge[role]);
  const actions = room.actions.filter(a => gm || a.role === role).map(a => ({ ...a }));
  const visibleTribe = t => {
    const copy = structuredClone(t);
    if (!gm) copy.technologies = copy.technologies.filter(tech => tech.stage > 0);
    return copy;
  };
  return {
    technologyTree: tribe ? technologyTree(tribe.technologies, gm) : [],
    id: room.id, name: room.name, revision: room.revision, role, day: room.day, hour: room.hour || 0, month: room.month,
    createdAt: room.createdAt, updatedAt: room.updatedAt,
    players: Object.fromEntries(ROLES.map(r => [r, room.players[r] ? { name: room.players[r].name, online: online.includes(r) } : null])),
    world: { width: room.world.width, height: room.world.height, tiles },
    tribes: gm ? room.world.tribes.map(visibleTribe) : role === 'god' ? room.world.tribes.map(t =>
      t.id === room.selectedTribe ? visibleTribe(t) : { id: t.id, name: t.name, race: t.race, population: t.population, consumption: t.consumption, tileId: t.tileId, description: t.description }) : tribe ? [visibleTribe(tribe)] : [],
    selectedTribe: room.selectedTribe,
    god: gm || role === 'god' ? structuredClone(room.god) : room.god ? { name: room.god.name, realm: room.god.realm } : null,
    priest: gm || role === 'priest' ? structuredClone(room.priest) : room.priest ? { name: room.priest.name, race: room.priest.race } : null,
    settings: { ...room.settings }, actions,
    logs: room.logs.filter(l => gm || l.audience === 'all' || l.audience === role || l.from === role).map(l => ({ ...l })),
    ...(gm ? { invite: room.invite, seed: room.seed } : {}),
  };
}
export function capacity(tile, activity, settings) {
  const index = ACTIVITIES.indexOf(activity);
  let base = TERRAINS[tile.terrain].food[index];
  if (tile.feature) base += FEATURES[tile.feature]?.food[index] || 0;
  if (tile.elevation === 'mountain') return 0;
  if (tile.elevation === 'hill') base += [40, -20, -40, 0][index];
  if (tile.river.length && activity === 'farm') base += 40;
  if ((activity === 'hunt' && ['사슴', '들소', '멧돼지'].includes(tile.resource)) ||
      (activity === 'gather' && ['야생 과일', '바나나', '포도'].includes(tile.resource)) ||
      (activity === 'farm' && ['밀', '쌀', '옥수수'].includes(tile.resource)) ||
      (activity === 'fish' && ['물고기', '게'].includes(tile.resource))) base += 100;
  return Math.floor(Math.max(0, base) * settings.capacityScale);
}
function produce(room) {
  // One budget per tile/activity, shared by all settlements; never duplicate overlapping yields.
  const budgets = new Map();
  const animals = new Map(room.world.tiles.map(t => [t.id, t.wildlife]));
  const plants = new Map(room.world.tiles.map(t => [t.id, t.plants]));
  for (const tribe of room.world.tribes) {
    const home = room.world.tiles.find(t => t.id === tribe.tileId);
    let produced = 0;
    for (const activity of ACTIVITIES) {
      let demand = tribe.workers[activity] * room.settings.workerOutput;
      const resource = activity === 'gather' ? 'fruit' : activity === 'farm' ? 'grain' : 'meat';
      for (const id of [home.id, ...neighbors(home, room.world.width, room.world.height)]) {
        const tile = room.world.tiles.find(t => t.id === id);
        const key = `${id}:${activity}`;
        if (!budgets.has(key)) budgets.set(key, capacity(tile, activity, room.settings));
        const natural = activity === 'farm' ? Infinity : (activity === 'gather' ? plants : animals).get(id) * 10;
        const amount = Math.min(demand, budgets.get(key), natural);
        demand -= amount; budgets.set(key, budgets.get(key) - amount);
        if (activity !== 'farm') {
          const stock = activity === 'gather' ? plants : animals;
          stock.set(id, Math.max(0, stock.get(id) - amount / 10));
        }
        tribe.food[resource] += amount; produced += amount;
      }
    }
    const consumption = tribe.population * tribe.consumption;
    let remaining = consumption;
    for (const kind of ['fruit', 'meat', 'grain']) {
      const used = Math.min(tribe.food[kind], remaining);
      tribe.food[kind] -= used; remaining -= used;
    }
    const faith = tribe.id === room.selectedTribe && room.god ? tribe.followers * .5 : 0;
    if (faith) room.god.faith += faith;
    const summary = `${tribe.name}: 생산 ${Math.round(produced)} · 소비 ${consumption}${remaining ? ` · 부족 ${Math.round(remaining)} (인구 변화는 GM 판정)` : ''}${faith ? ` · 신앙 +${faith}` : ''}`;
    log(room, 'month', `${room.month}개월 차 정산 · ${summary}`, tribe.id === room.selectedTribe ? 'all' : 'gm');
  }
  const random = rngFor(`${room.seed}:month:${room.month}`);
  const migrated = new Map(room.world.tiles.map(t => [t.id, 0]));
  const tilesById = new Map(room.world.tiles.map(t => [t.id, t]));
  for (const tile of room.world.tiles) {
    const stock = animals.get(tile.id);
    const adjacent = neighbors(tile, room.world.width, room.world.height).map(id => tilesById.get(id))
      .filter(t => ['coast', 'ocean', 'lake'].includes(t.terrain) === ['coast', 'ocean', 'lake'].includes(tile.terrain) && t.elevation !== 'mountain');
    const candidates = [tile, ...adjacent];
    const season = Math.floor((room.month - 1) % 12 / 3);
    const weights = candidates.map(t => {
      const food = plants.get(t.id) / 100;
      const water = t.river.length ? 2 : 0;
      const cover = ['forest', 'rainforest'].includes(t.feature) ? 1.5 : 0;
      const cold = (t.terrain === 'snow' || t.terrain === 'tundra') && season === 3 ? 3 : 0;
      return Math.max(.1, 1 + food + water + cover - cold);
    });
    let pick = random() * weights.reduce((a, b) => a + b, 0), destination = tile;
    for (let i = 0; i < candidates.length; i++) { pick -= weights[i]; if (pick <= 0) { destination = candidates[i]; break; } }
    const moving = Math.floor(stock * .12);
    migrated.set(tile.id, migrated.get(tile.id) + stock - moving);
    migrated.set(destination.id, migrated.get(destination.id) + moving);
  }
  for (const tile of room.world.tiles) {
    tile.wildlife = Math.max(0, Math.min(240, Math.round(migrated.get(tile.id) + room.settings.recoveryRate * 60)));
    tile.plants = Math.min(320, Math.round(plants.get(tile.id) + room.settings.recoveryRate * 100));
  }
  for (const tribe of room.world.tribes) {
    const roll = randomInt(1, 101);
    if (roll <= room.settings.eventChance) {
      const cards = ['새로운 약초의 발견', '낯선 나그네의 방문', '갑작스러운 폭우', '부족 내부의 의견 충돌', '풍요로운 야생 과실'];
      const card = cards[randomInt(cards.length)];
      log(room, 'event', `${tribe.name} · D100 ${roll}: ${card}. 효과는 GM이 결정합니다.`, tribe.id === room.selectedTribe ? 'all' : 'gm');
    }
  }
  room.month++;
}
export function applyAction(room, role, input) {
  fail(input && typeof input === 'object' && !Array.isArray(input), '잘못된 요청입니다.');
  const type = input.type;
  const gm = () => fail(role === 'gm', 'GM만 수행할 수 있습니다.', 403);
  const own = expected => fail(role === expected, `${ROLE_NAMES[expected]}만 수행할 수 있습니다.`, 403);
  const tribe = () => {
    const t = room.world.tribes.find(t => t.id === room.selectedTribe);
    fail(t, '먼저 신이 시작 부족을 선택해야 합니다.'); return t;
  };
  switch (type) {
    case 'chat': {
      const audience = input.audience || 'all';
      fail(['all', 'gm', 'god', 'priest'].includes(audience), '잘못된 수신 대상입니다.');
      log(room, 'chat', text(input.message, '메시지', 1500), audience, { from: role, speaker: room.players[role].name });
      break;
    }
    case 'create-god': {
      own('god'); fail(!room.god, '이미 신이 생성되었습니다.');
      room.god = { name: text(input.name, '신의 이름', 30), realm: text(input.realm, '소영역', 30), appearance: text(input.appearance || '형상을 드러내지 않은 신', '외형', 200), disposition: text(input.disposition || '중립', '성향', 50), level: 1, faith: 10 };
      log(room, 'story', `${room.god.name}, ${room.god.realm}의 신이 눈을 떴습니다.`); break;
    }
    case 'select-tribe': {
      own('god'); fail(room.god, '신을 먼저 생성하세요.'); fail(!room.selectedTribe, '시작 부족은 한 번만 선택할 수 있습니다.');
      const t = room.world.tribes.find(t => t.id === input.tribeId); fail(t, '존재하지 않는 부족입니다.');
      room.selectedTribe = t.id;
      // Faith conversion is adjudicated by GM; selecting a tribe does not convert everyone.
      observe(room, 'god', area(room, t.tileId)); observe(room, 'priest', area(room, t.tileId));
      log(room, 'story', `${room.god.name}의 시선이 ${t.name}에 머물렀습니다. 신관의 종족은 ${t.race}입니다.`); break;
    }
    case 'create-priest': {
      own('priest'); const t = tribe(); fail(!room.priest, '이미 신관이 생성되었습니다.');
      const strength = integer(input.strength, 0, 100, '힘');
      const intelligence = integer(input.intelligence, 0, 100, '지능');
      const social = integer(input.social, 0, 100, '사회성');
      fail(strength + intelligence + social === 100, '능력치 합계는 정확히 100이어야 합니다.');
      room.priest = { name: text(input.name, '신관 이름', 30), race: t.race, strength, intelligence, social, tileId: t.tileId, jobs: [], skills: [] };
      log(room, 'story', `${t.name}의 ${room.priest.name}, 신의 목소리에 귀를 기울입니다.`); break;
    }
    case 'explore': {
      own('priest'); fail(room.priest, '신관을 먼저 생성하세요.');
      const current = room.world.tiles.find(t => t.id === room.priest.tileId);
      fail(neighbors(current, room.world.width, room.world.height).includes(input.tileId), '인접한 타일로만 이동할 수 있습니다.');
      const target = room.world.tiles.find(t => t.id === input.tileId);
      fail(![current, target].some(t => ['ocean', 'coast', 'lake'].includes(t.terrain)) && target.elevation !== 'mountain', '산과 수역 이동은 GM의 별도 판정이 필요합니다. 수면 이동은 기술의 씨앗을 확인한 GM에게 요청하세요.');
      room.priest.tileId = target.id; observe(room, 'priest', area(room, target.id));
      log(room, 'explore', `${room.priest.name}: (${target.x}, ${target.y}) ${TERRAINS[target.terrain].name} 탐험.`, 'priest');
      break;
    }
    case 'gm-move': {
      gm(); fail(room.priest, '신관을 먼저 생성하세요.');
      const current = room.world.tiles.find(t => t.id === room.priest.tileId);
      const target = room.world.tiles.find(t => t.id === input.tileId);
      fail(target && neighbors(current, room.world.width, room.world.height).includes(target.id), '인접한 타일로만 이동할 수 있습니다.');
      const reason = text(input.reason, '이동 판정 근거', 300);
      let evidence = '';
      if ([current, target].some(t => ['ocean', 'coast', 'lake'].includes(t.terrain))) {
        const tech = tribe().technologies.find(t => t.name === input.technology);
        fail(tech && tech.stage > 0, '기술의 씨앗에서 발견 이상의 수면 이동 기술을 선택하세요.');
        evidence = ` · 근거 기술: ${tech.name} (${TECH_STAGES[tech.stage]})`;
      }
      room.priest.tileId = target.id;
      observe(room, 'priest', area(room, target.id));
      log(room, 'judgment', `GM 이동 승인 · ${room.priest.name}: (${target.x}, ${target.y}) ${TERRAINS[target.terrain].name}${evidence} — ${reason}`, 'priest');
      break;
    }
    case 'request': {
      fail(role !== 'gm', 'GM은 판정 도구를 사용하세요.');
      const kind = text(input.kind, '행동 종류', 30);
      const description = text(input.description, '행동 설명', 1000);
      fail(room.actions.filter(a => a.status === 'pending').length < 40, '대기 중인 행동이 너무 많습니다.');
      const action = { id: randomUUID(), role, kind, description, status: 'pending', at: new Date().toISOString() };
      if (role === 'god') fail(room.god && room.god.level > 0, '활동 가능한 신이 필요합니다.');
      if (role === 'priest') fail(room.priest, '신관을 먼저 생성하세요.');
      room.actions.push(action);
      if (room.actions.length > 200) room.actions = room.actions.filter(a => a.status === 'pending').concat(room.actions.filter(a => a.status !== 'pending').slice(-160));
      log(room, 'action', `${ROLE_NAMES[role]}의 행동 요청 · ${kind}: ${description}`, role); break;
    }
    case 'resolve': {
      gm(); const action = room.actions.find(a => a.id === input.actionId);
      fail(action && action.status === 'pending', '처리할 수 없는 행동입니다.');
      fail(['approved', 'rejected'].includes(input.status), '승인 또는 반려를 선택하세요.');
      const cost = integer(input.cost ?? 0, 0, 1000000, '신앙 비용');
      if (input.status === 'approved' && action.role === 'god') {
        fail(room.god && room.god.faith >= cost, '신앙이 부족합니다.'); room.god.faith -= cost;
      } else fail(cost === 0, '신앙 비용은 신의 행동 승인에만 적용됩니다.');
      Object.assign(action, { status: input.status, result: text(input.result, '판정 결과', 1000), cost });
      log(room, 'judgment', `${ROLE_NAMES[action.role]} · ${action.kind} ${input.status === 'approved' ? '승인' : '반려'}${cost ? ` (신앙 −${cost})` : ''}\n${action.result}`, action.role);
      break;
    }
    case 'roll': {
      const a = integer(input.a ?? 1, 0, 1000000, 'A 능력치') + integer(input.divineA ?? 0, 0, 1000, 'A 신성 보정') * 200;
      const b = integer(input.b ?? 1, 0, 1000000, 'B 능력치') + integer(input.divineB ?? 0, 0, 1000, 'B 신성 보정') * 200;
      fail(a + b > 0, 'A와 B가 모두 0일 수 없습니다.');
      const roll = randomInt(1, 101), chance = a / (a + b) * 100;
      log(room, 'dice', `${ROLE_NAMES[role]} · ${text(input.label || '대립 판정', '판정 이름', 60)}: D100 ${roll} / 성공률 ${chance.toFixed(1)}% → ${roll <= chance ? '성공' : '실패'}\n물리적으로 불가능한 격차는 GM이 먼저 판단합니다.`, 'all', { roll, chance });
      break;
    }
    case 'workers': {
      fail(role === 'priest' || role === 'gm', '신관 또는 GM만 노동력을 배치할 수 있습니다.', 403);
      const t = tribe(); const workers = {};
      for (const a of ACTIVITIES) workers[a] = integer(input[a], 0, t.population, '노동자 수');
      fail(Object.values(workers).reduce((a, b) => a + b, 0) <= t.population, '총 노동자는 부족 인구를 넘을 수 없습니다.');
      t.workers = workers; log(room, 'production', `${t.name} 노동 배치: 사냥 ${workers.hunt} · 채집 ${workers.gather} · 농경 ${workers.farm} · 어업 ${workers.fish}`); break;
    }
    case 'advance': {
      gm(); const hours = input.hours !== undefined ? integer(input.hours, 1, 8640, '진행 시간') : integer(input.days, 1, 360, '진행 일수') * 24;
      const oldMonth = Math.floor((room.day - 1) / 30);
      const totalHours = (room.day - 1) * 24 + (room.hour || 0) + hours;
      const targetDay = Math.floor(totalHours / 24) + 1;
      const newMonth = Math.floor((targetDay - 1) / 30);
      for (let m = oldMonth; m < newMonth; m++) { room.day = (m + 1) * 30; produce(room); }
      room.day = targetDay;
      room.hour = totalHours % 24;
      // Only actively observed settlements refresh; remote discoveries retain their observation date.
      if (room.selectedTribe) observe(room, 'god', area(room, tribe().tileId));
      if (room.priest) observe(room, 'priest', area(room, room.priest.tileId));
      log(room, 'time', `${hours % 24 ? `${hours}시간` : `${hours / 24}일`}이 흘렀습니다. 현재 ${room.month}개월 차 ${((room.day - 1) % 30) + 1}일 ${room.hour}시.`); break;
    }
    case 'reveal': {
      gm(); fail(['god', 'priest'].includes(input.role), '공개할 역할을 선택하세요.');
      fail(room.world.tiles.some(t => t.id === input.tileId), '존재하지 않는 타일입니다.');
      observe(room, input.role, area(room, input.tileId));
      log(room, 'explore', `GM이 (${input.tileId}) 주변 정보를 공개했습니다.`, input.role); break;
    }
    case 'narrate': {
      gm(); const audience = input.audience || 'all';
      fail(['all', 'god', 'priest', 'gm'].includes(audience), '잘못된 수신 대상입니다.');
      log(room, 'story', text(input.message, '세계 서술', 2000), audience, { speaker: 'GM' }); break;
    }
    case 'adjust': {
      gm(); const t = tribe();
      const field = input.field;
      if (field === 'faith') {
        fail(room.god, '신을 먼저 생성해야 합니다.');
        room.god.faith = integer(input.value, 0, 1000000, '신앙');
      } else if (field === 'followers') t.followers = integer(input.value, 0, t.population, '신도');
      else if (field === 'population') {
        const value = integer(input.value, 1, 1000000, '인구');
        fail(Object.values(t.workers).reduce((a, b) => a + b, 0) <= value, '인구보다 많은 노동자가 있습니다. 먼저 노동 배치를 조정하세요.');
        t.population = value; t.followers = Math.min(t.followers, value);
      } else if (['meat', 'grain', 'fruit'].includes(field)) t.food[field] = integer(input.value, 0, 100000000, '재고');
      else throw new GameError('조정할 수 없는 항목입니다.');
      log(room, 'judgment', `GM 수치 조정 · ${field}: ${input.value}${input.reason ? ` — ${text(input.reason, '사유', 300)}` : ''}`); break;
    }
    case 'settings': {
      gm();
      room.settings.workerOutput = integer(input.workerOutput, 1, 1000, '노동자 생산량');
      room.settings.capacityScale = integer(input.capacityScale, 1, 20, '지형 생산 한도 배율');
      fail(typeof input.recoveryRate === 'number' && input.recoveryRate >= 0 && input.recoveryRate <= 1, '회복률은 0~1입니다.');
      room.settings.recoveryRate = input.recoveryRate;
      room.settings.eventChance = integer(input.eventChance, 0, 100, '월간 사건 확률');
      log(room, 'system', 'GM이 시험용 균형 설정을 변경했습니다. 확정 소비량 15·30·60은 유지됩니다.'); break;
    }
    case 'technology': {
      gm(); const t = tribe(); const name = text(input.name, '기술 이름', 40);
      const stage = integer(input.stage, 0, 4, '기술 단계');
      let tech = t.technologies.find(x => x.name === name);
      if (!tech) { fail(t.technologies.length < 120, '기술은 최대 120개까지 기록할 수 있습니다.'); tech = { name }; t.technologies.push(tech); }
      tech.stage = stage; log(room, 'research', `${t.name} · ${name}: ${TECH_STAGES[stage]}`, stage === 0 ? 'gm' : 'all'); break;
    }
    case 'edit-tile': {
      gm(); const tile = room.world.tiles.find(t => t.id === input.tileId);
      fail(tile, '존재하지 않는 타일입니다.');
      fail(Object.hasOwn(TERRAINS, input.terrain), '잘못된 지형입니다.');
      fail(input.feature === '' || Object.hasOwn(FEATURES, input.feature), '잘못된 지형 특성입니다.');
      fail(['flat', 'hill', 'mountain'].includes(input.elevation), '잘못된 고도입니다.');
      const water = ['coast', 'lake', 'ocean'].includes(input.terrain);
      fail(!(tile.settlementId || room.priest?.tileId === tile.id) || (!water && input.elevation !== 'mountain'), '정착지나 신관이 있는 타일을 수역·산으로 바꿀 수 없습니다.');
      fail(!water || input.elevation === 'flat', '수역의 고도는 평지여야 합니다.');
      if (input.feature === 'reef') fail(water, '산호초는 수역에만 놓을 수 있습니다.');
      if (input.feature === 'oasis') fail(input.terrain === 'desert', '오아시스는 사막에만 놓을 수 있습니다.');
      const wildlife = integer(input.wildlife, 0, 1000000, '동물 개체군');
      const plants = integer(input.plants, 0, 1000000, '식물 자원량');
      const resource = input.resource ? text(input.resource, '자원', 30) : null;
      const reason = text(input.reason, '변경 사유', 300);
      Object.assign(tile, { terrain: input.terrain, feature: input.feature || null, elevation: input.elevation, wildlife, plants, resource });
      log(room, 'judgment', `GM 타일 조정 (${tile.id}) · ${reason}`, 'gm');
      if (room.selectedTribe) observe(room, 'god', area(room, tribe().tileId));
      if (room.priest) observe(room, 'priest', area(room, room.priest.tileId));
      break;
    }
    case 'release': {
      gm(); fail(['god', 'priest'].includes(input.role), '해제할 역할을 선택하세요.');
      room.players[input.role] = null;
      log(room, 'system', `${ROLE_NAMES[input.role]} 자리가 해제되었습니다. 캐릭터와 세계 기록은 보존됩니다.`); break;
    }
    default: throw new GameError('지원하지 않는 행동입니다.');
  }
  room.updatedAt = new Date().toISOString();
  room.revision++;
  return room;
}

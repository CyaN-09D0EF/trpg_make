import { GameError, DEFAULT_SETTINGS } from './game.mjs';
import { TERRAINS, FEATURES, edgeNeighbors } from './world.mjs';
import { ageDataProblem } from './lifecycle.mjs';
import { demographicDataProblem } from './demography.mjs';
import { settlementsOf, settlementDataProblem } from './settlements.mjs';

export const MAX_CAMPAIGN_BYTES = 8 * 1024 * 1024;
const check = (ok, field) => { if (!ok) throw new GameError(`불러오기 파일의 ${field} 항목이 올바르지 않습니다.`); };
const object = (value, field) => check(value !== null && typeof value === 'object' && !Array.isArray(value), field);
const string = (value, field, max = 100, min = 1) => check(typeof value === 'string' && value.length >= min && value.length <= max, field);
const number = (value, field, min = 0, max = 1e12) => check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, field);
const integer = (value, field, min = 0, max = 1e12) => { number(value, field, min, max); check(Number.isInteger(value), field); };
const list = (value, field, max) => check(Array.isArray(value) && value.length <= max, field);
const oneOf = (value, field, values) => check(values.includes(value), field);
const date = (value, field) => { string(value, field, 40); check(Number.isFinite(Date.parse(value)), field); };
function unique(values, field) { check(new Set(values).size === values.length, field); }

// Only versioned GM exports contain the full world and independent observations.
// Validate before saving, and construct new authentication independently of file contents.
export function restoreCampaign(data, { id, gmName, gmHash, invite }) {
  object(data, '기록');
  // Reject prototype keys, non-finite values and excessive nesting in optional metadata too.
  function safe(value, depth = 0) {
    check(depth < 30, '중첩 구조');
    if (typeof value === 'number') check(Number.isFinite(value), '숫자');
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      check(!['__proto__', 'prototype', 'constructor'].includes(key), '객체 키');
      safe(child, depth + 1);
    }
  }
  safe(data);
  check(data.schemaVersion === 1, '파일 버전');
  string(data.name, '세계 이름', 50); string(data.seed, '시드', 80);
  date(data.createdAt, '생성 시각');
  integer(data.day, '날짜', 1); integer(data.month, '개월', 1);
  integer(data.hour ?? 0, '시간', 0, 23);
  check(data.month === Math.floor((data.day - 1) / 30) + 1, '날짜와 개월');
  object(data.world, '지도');
  const { width, height, tiles, tribes } = data.world;
  integer(width, '지도 가로', 2, 128); integer(height, '지도 세로', 2, 80);
  list(tiles, '지도 타일', width * height); check(tiles.length === width * height, '지도 타일 수');
  const ids = new Set(tiles.map(t => t?.id));
  check(ids.size === tiles.length, '중복 타일');
  function tile(t, observation = false) {
    object(t, '타일'); integer(t.x, '타일 x', 0, width-1); integer(t.y, '타일 y', 0, height-1);
    check(t.id === `${t.x},${t.y}` && ids.has(t.id), '타일 좌표');
    check(Object.hasOwn(TERRAINS, t.terrain), '지형');
    check(t.feature === null || Object.hasOwn(FEATURES, t.feature), '지형 특성');
    oneOf(t.elevation, '고도', ['flat','hill','mountain']);
    if(t.altitude!==undefined)integer(t.altitude,'지형 고도',0,10000);
    list(t.river, '강', 6); unique(t.river, '강 경계');
    for (const edge of t.river) { integer(edge, '강 경계', 0, 5); check(edgeNeighbors(t,width,height)[edge] !== null, '강 경계'); }
    if(t.developed!==undefined)integer(t.developed,'주거·시설 점유율',0,100);
    number(t.wildlife, '동물 자원'); number(t.plants, '식물 자원');
    if (t.resource !== null) string(t.resource, '자원', 100);
    check(typeof t.ruin === 'boolean', '유적');
    if (t.settlementId !== null) string(t.settlementId, '정착지', 80);
    if (observation) integer(t.observedDay, '발견 날짜', 1, data.day);
  }
  tiles.forEach(t => tile(t));
  list(tribes, '부족', 100); check(tribes.length > 0, '부족');
  unique(tribes.map(t=>t.id), '부족 코드'); unique(tribes.map(t=>t.tileId), '부족 위치');
  const byId = new Map(tiles.map(t=>[t.id,t]));
  for (const t of tribes) {
    object(t, '부족'); string(t.id, '부족 코드', 80); string(t.name, '부족 이름', 100);
    string(t.race, '종족', 100); string(t.description, '부족 설명', 1000, 0);
    check(ids.has(t.tileId) && byId.get(t.tileId).settlementId === t.id, '부족 위치');
    integer(t.population, '인구'); number(t.consumption, '소비량'); integer(t.followers, '신도');
    object(t.food, '식량'); for (const key of ['meat','grain','fruit']) number(t.food[key], '식량');
    object(t.workers, '노동'); for (const key of ['hunt','gather','farm','fish']) integer(t.workers[key], '노동');
    list(t.technologies, '기술', 120); unique(t.technologies.map(x=>x.name), '기술 이름');
    for (const tech of t.technologies) { object(tech, '기술'); string(tech.name, '기술 이름', 40); integer(tech.stage, '기술 단계', 0, 4); }
    list(t.buildings, '시설', 1000);
    const problem=settlementDataProblem(t,data.world) || demographicDataProblem(t) || ageDataProblem(t,data.month-1);check(!problem,problem || '정착지');
  }
  check(data.selectedTribe === null || tribes.some(t=>t.id===data.selectedTribe), '선택 부족');
  for (const t of tiles) check(t.settlementId === null || tribes.some(tribe=>tribe.id===t.settlementId && settlementsOf(tribe).some(s=>s.tileId===t.id)), '정착지 연결');
  object(data.knowledge, '발견 정보');
  for (const role of ['god','priest']) {
    object(data.knowledge[role], '역할별 발견');
    check(Object.keys(data.knowledge[role]).length <= ids.size, '발견 타일 수');
    for (const [id,t] of Object.entries(data.knowledge[role])) { check(id===t?.id, '발견 좌표'); tile(t,true); }
  }
  if (data.god !== null) {
    object(data.god, '신'); string(data.god.name, '신 이름', 30); string(data.god.realm, '소영역', 30);
    string(data.god.appearance, '신 외형', 200); string(data.god.disposition, '성향', 50);
    integer(data.god.level, '신성'); number(data.god.faith, '신앙');
  }
  if (data.priest !== null) {
    object(data.priest, '신관'); check(data.selectedTribe !== null, '신관 소속');
    string(data.priest.name, '신관 이름', 30); string(data.priest.race, '신관 종족', 100);
    check(ids.has(data.priest.tileId), '신관 위치');
    for (const key of ['strength','intelligence','social']) integer(data.priest[key], '능력치', 0, 100);
    check(data.priest.strength+data.priest.intelligence+data.priest.social===100, '능력치 합계');
    list(data.priest.jobs, '직업', 100); list(data.priest.skills, '스킬', 100);
  }
  object(data.settings, '설정');
  integer(data.settings.workerOutput, '생산량', 1, 1000); integer(data.settings.capacityScale, '생산 배율', 1, 20);
  number(data.settings.recoveryRate, '회복률', 0, 1); integer(data.settings.eventChance, '사건 확률', 0, 100);
  if(data.settings.humanBirthRate!==undefined)number(data.settings.humanBirthRate,'인간 기준 출생률',0,0.01);
  list(data.actions, '행동', 200); unique(data.actions.map(a=>a.id), '행동 코드');
  for (const a of data.actions) {
    object(a, '행동'); string(a.id, '행동 코드', 100); oneOf(a.role, '행동 역할', ['god','priest']);
    string(a.kind, '행동 종류', 30); string(a.description, '행동 설명', 1000); date(a.at, '행동 시각');
    oneOf(a.status, '행동 상태', ['pending','approved','rejected']);
    if (a.status !== 'pending') { string(a.result, '판정 결과', 1000); integer(a.cost, '신앙 비용', 0, 1000000); }
  }
  check(data.actions.filter(a=>a.status==='pending').length <= 40, '대기 행동 수');
  list(data.logs, '기록', 500);
  for (const l of data.logs) {
    object(l, '기록'); string(l.id, '기록 코드', 100); string(l.kind, '기록 종류', 40);
    string(l.message, '기록 내용', 10000); date(l.at, '기록 시각'); integer(l.day, '기록 날짜', 1, data.day);
    oneOf(l.audience, '기록 공개 범위', ['all','gm','god','priest']);
    if (l.from !== undefined) oneOf(l.from, '기록 작성자', ['gm','god','priest']);
    if (l.speaker !== undefined) string(l.speaker, '발화자', 100);
  }
  // Retain campaign fields but strip authentication and arbitrary top-level metadata.
  const restored = Object.fromEntries(['name','seed','createdAt','day','month','selectedTribe','god','priest','world','knowledge','actions','logs'].map(key=>[key,structuredClone(data[key])]));
  return {
    ...restored, schemaVersion:1, id, hour:data.hour ?? 0, revision:0, updatedAt:new Date().toISOString(),
    settings:Object.fromEntries(Object.keys(DEFAULT_SETTINGS).filter(key=>data.settings[key]!==undefined).map(key=>[key,data.settings[key]])),
    players:{gm:{name:gmName,tokenHash:gmHash},god:null,priest:null}, invite,
  };
}

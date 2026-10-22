import { TERRAINS, FEATURES, generateWorld, neighbors } from '/world.mjs';

const app = document.querySelector('#app');
const dialog = document.querySelector('#modal');
const ROLE = { gm: 'GM', god: '신', priest: '신관' };
const ROLE_ICON = { gm: '◈', god: '✦', priest: '♜' };
const ACTIVITY = { hunt: '사냥', gather: '채집', farm: '농경', fish: '어업' };
const STAGES = ['미발견', '발견', '실험', '실용화', '보급'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = value => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const icon = (name, size = 20) => {
  const paths = {
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15m6-12v15"/>',
    book: '<path d="M12 5C8 2 4 3 2 4v15c4-1 6-1 10 1 4-2 6-2 10-1V4c-3-1-6-2-10 1Zm0 0v15"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 4v2"/>',
    feather: '<path d="M5 21 19 7M8 18c-3-6 0-13 11-15 4 10-4 17-11 15Zm4-4h6M9 17v-6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01"/>',
    link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9c-2 0-3-.5-4-1l-5 2 1-5a9 9 0 1 1 17-5Z"/>',
    food: '<path d="M5 3v6a3 3 0 0 0 6 0V3m-3 0v18m11 0V3c-4 3-4 9 0 9"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    home: '<path d="m3 10 9-7 9 7v11H3Zm6 11v-8h6v8"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sun}</svg>`;
};
let state = null, session = null, selected = null, tab = 'world', logTab = 'all', streamController = null, connected = false;
let zoom = 1, mapView = null, pending = false;
const sessions = () => { try { return JSON.parse(localStorage.getItem('civilization.sessions') || '[]'); } catch { return []; } };
function remember(value) {
  session = value;
  const values = sessions().filter(s => !(s.id === value.id && s.role === value.role));
  values.unshift(value);
  localStorage.setItem('civilization.sessions', JSON.stringify(values.slice(0, 30)));
  sessionStorage.setItem(`civilization.active.${value.id}`, value.role);
}
function toast(message, error = false) {
  const node = document.createElement('div'); node.className = `toast ${error ? 'error' : ''}`;
  node.textContent = message; document.querySelector('#toasts').append(node);
  setTimeout(() => node.remove(), 4500);
}
async function api(path, data, auth = true) {
  const response = await fetch(path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth && session ? { Authorization: `Bearer ${session.token}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || '요청에 실패했습니다.'); error.status = response.status; throw error; }
  return result;
}
async function action(data, { close = true } = {}) {
  if (pending) return;
  pending = true;
  document.querySelectorAll('dialog button[type="submit"]').forEach(b => b.disabled = true);
  try {
    const next = await api(`/api/rooms/${session.id}/actions`, data);
    setState(next);
    if (close && dialog.open) dialog.close();
    return true;
  } catch (e) { toast(e.message, true); return false; }
  finally { pending = false; document.querySelectorAll('dialog button[type="submit"]').forEach(b => b.disabled = false); }
}
function setState(next) {
  if (state && next.revision < state.revision) return;
  state = next;
  if (!selected) selected = next.priest?.tileId || next.tribes.find(t => t.id === next.selectedTribe)?.tileId || next.world.tiles.find(t => t.settlementId)?.id || next.world.tiles[0]?.id;
  renderGame();
}
async function connect() {
  streamController?.abort();
  const controller = new AbortController(); streamController = controller;
  while (!controller.signal.aborted && session) {
    try {
      const response = await fetch(`/api/rooms/${session.id}/events`, { headers: { Authorization: `Bearer ${session.token}` }, signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401) { toast('접속 권한이 해제되었습니다. 초대 링크로 다시 참여하세요.', true); controller.abort(); state = null; renderLanding(); return; }
        throw new Error('연결 실패');
      }
      connected = true; updateConnection();
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (event.startsWith('data: ')) setState(JSON.parse(event.slice(6)));
        }
      }
    } catch (e) { if (controller.signal.aborted) return; }
    connected = false; updateConnection();
    if (!controller.signal.aborted) await new Promise(resolve => setTimeout(resolve, 2500));
  }
}
function updateConnection() {
  const node = document.querySelector('#connection');
  if (node) { node.classList.toggle('offline', !connected); node.innerHTML = `<i></i>${connected ? '실시간 연결됨' : '재연결 중…'}`; }
}
function brand() { return `<a href="/" class="brand"><span class="brand-mark">✧</span><span>신들의 문명<small>CHRONICLES OF DIVINITY</small></span></a>`; }
function showModal(title, content, subtitle = '') {
  dialog.innerHTML = `<div class="modal-heading"><div><span class="eyebrow">CHRONICLES OF DIVINITY</span><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button class="icon-button" data-do="close" aria-label="닫기">${icon('close')}</button></div>${content}`;
  if (!dialog.open) dialog.showModal();
}
function input(label, name, value = '', options = '') {
  return `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${options}></label>`;
}
function textarea(label, name, placeholder = '', max = 1000) {
  return `<label class="field">${label}<textarea name="${name}" required maxlength="${max}" placeholder="${esc(placeholder)}" rows="3"></textarea></label>`;
}
function submit(label) { return `<button class="button primary full" type="submit">${label}${icon('arrow', 18)}</button>`; }

function renderLanding() {
  streamController?.abort();
  const recent = sessions();
  const preview = generateWorld('chronicles-dawn');
  app.innerHTML = `<div class="landing">
    <header class="landing-header">${brand()}<div class="landing-top"><span class="version">RULEBOOK v0.4</span><a class="text-button" href="/rulebook.md" target="_blank" rel="noopener">룰북 열기 ${icon('book', 16)}</a></div></header>
    <main class="landing-main"><div class="landing-copy"><div class="eyebrow"><span class="tiny-line"></span> THREE VOICES. ONE CIVILIZATION.</div>
      <h1>당신의 한 수가,<br>한 문명의 <em>신화가 된다.</em></h1>
      <p class="landing-description">세계를 엮는 GM, 기적을 일으키는 신,<br>그리고 대지를 걷는 신관.<br>서로 다른 시선으로, 하나의 문명을 써 내려가세요.</p>
      <div class="landing-cta"><button class="button primary large" data-do="create">새로운 세계 만들기 ${icon('arrow')}</button><button class="button subtle large" data-do="join">초대받은 세계로</button></div>
      <div class="landing-facts"><span><i></i> 3인 실시간 협동</span><span>시드 기반 육각 세계</span><span>자동 저장</span></div>
    </div><div class="landing-art"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-star star-a">✧</span><span class="art-star star-b">✦</span><div class="preview-map">${renderMap({ width: preview.width, height: preview.height, tiles: preview.tiles }, true)}</div><div class="art-caption"><span class="gold-dot"></span>이름 없는 세계, 아직 쓰이지 않은 이야기<small>WORLD ATLAS / SEED: CHRONICLES-DAWN</small></div><div class="coordinate">N 37° 24′<br>E 126° 58′</div></div></main>
    <section class="roles-intro"><div class="intro-label"><span class="eyebrow">THE THREE ROLES</span><h2>같은 세계,<br>다른 가능성.</h2></div>${[
      ['gm', '이야기의 설계자', '세계를 움직이고, 선택을 판정하며, 모두의 이야기를 연결합니다.'],
      ['god', '하늘 위의 의지', '부족을 선택하고 계시와 기적으로 문명의 운명에 개입합니다.'],
      ['priest', '대지 위의 개척자', '미지의 땅을 탐험하고 연구하며 부족의 내일을 일궈냅니다.'],
    ].map(([r, title, description]) => `<article class="role-intro"><span class="role-symbol ${r}">${ROLE_ICON[r]}</span><div class="role-meta">${ROLE[r]} <span>${r.toUpperCase()}</span></div><h3>${title}</h3><p>${description}</p></article>`).join('')}</section>
    ${recent.length ? `<section class="recent"><div class="section-heading"><h2>이어 쓰는 연대기</h2><span>이 브라우저에 보관된 접속 정보</span></div><div class="recent-grid">${recent.slice(0, 6).map((s, i) => `<button class="recent-card" data-do="resume" data-index="${i}"><span class="role-symbol ${s.role}">${ROLE_ICON[s.role]}</span><div><strong>${esc(s.name || s.id)}</strong><small>${ROLE[s.role]} · ${s.id}</small></div>${icon('arrow', 18)}</button>`).join('')}</div></section>` : ''}
    <footer class="landing-footer"><span>✧ 신들의 문명 TRPG</span><span>함께 만든 선택이, 함께 기억할 역사가 됩니다.</span><span>PLAYTEST 0.1</span></footer></div>`;
  const route = location.pathname.match(/^\/r\/([A-Z0-9]{6})$/);
  if (route) showJoin(route[1]);
}
function showCreate() {
  showModal('새로운 세계 만들기', `<form id="create-form">${input('세계의 이름', 'name', '', 'required maxlength="50" placeholder="예: 여명이 머무는 땅"')}${input('GM 이름', 'playerName', '', 'required maxlength="24" placeholder="당신을 어떻게 부를까요?"')}${input('세계 생성 시드 <span class="muted">선택</span>', 'seed', '', 'maxlength="80" placeholder="비워 두면 새로운 세계가 만들어집니다"')}<div class="notice">${icon('people')}<p>당신은 GM으로 입장합니다. 방을 만든 뒤 신과 신관에게 각각 초대 링크를 보내세요.</p></div>${submit('세계의 첫 장 열기')}</form>`, 'GM 1명, 신 1명, 신관 1명. 이야기가 시작됩니다.');
}
function showJoin(id = '') {
  const hash = new URLSearchParams(location.hash.slice(1));
  showModal('초대받은 세계로', `<form id="join-form">${input('초대 링크', 'link', id ? `${location.origin}/r/${id}${location.hash}` : '', 'required placeholder="GM에게 받은 초대 링크를 붙여넣으세요"')}<label class="field">참여할 역할<div class="role-choice">${['god', 'priest'].map(r => `<label><input type="radio" name="role" value="${r}" ${hash.get('role') === r || !hash.get('role') && r === 'god' ? 'checked' : ''}><span>${ROLE_ICON[r]} ${ROLE[r]}</span></label>`).join('')}</div></label>${input('플레이어 이름', 'name', '', 'required maxlength="24" placeholder="함께할 이들에게 보여줄 이름"')}${submit('이야기에 합류하기')}<p class="form-footnote">접속 정보는 이 브라우저에 저장됩니다. 개인 초대 링크는 신뢰하는 플레이어에게만 공유하세요.</p></form>`);
}
async function enter(result, name) {
  remember({ id: result.id, role: result.role, token: result.token, name: name || result.state.name });
  history.replaceState({}, '', `/r/${result.id}`);
  selected = null; zoom = 1; mapView = null; tab = 'world';
  state = null; setState(result.state); dialog.close(); connect();
}
async function resume(s) {
  session = s;
  try { const next = await api(`/api/rooms/${s.id}/state`); await enter({ ...s, state: next }, s.name); }
  catch (e) { toast(e.message, true); session = null; }
}

function hexPoint(x, y, size = 25) {
  return [size * Math.sqrt(3) * (x + (y % 2) / 2) + 30, y * size * 1.5 + 30];
}
function terrainSymbol(t, cx, cy) {
  if (t.elevation === 'mountain') return `<path d="m${cx - 13} ${cy + 8} 12-23 14 23-12-5Z" fill="#d8ded0" fill-opacity=".63" stroke="#28352d" stroke-width="1"/><path d="m${cx - 5} ${cy - 1} 4-8 5 9-5-3Z" fill="#f0eee3"/>`;
  if (t.feature === 'forest' || t.feature === 'rainforest') return [-7, 5].map((d, i) => `<path d="m${cx + d} ${cy - 12 + i * 3}-7 14h14Z" fill="#233e30" opacity=".8"/><path d="M${cx + d} ${cy + 1 + i * 3}v7" stroke="#29392c" stroke-width="2"/>`).join('');
  if (t.settlementId) return '';
  if (['coast', 'ocean', 'lake'].includes(t.terrain)) return `<path d="M${cx - 9} ${cy - 2}q4-4 8 0t8 0m-16 6q4-4 8 0t8 0" fill="none" stroke="#a4c2c1" stroke-opacity=".3" stroke-width="1.3"/>`;
  if (t.feature === 'oasis') return `<ellipse cx="${cx}" cy="${cy + 3}" rx="10" ry="5" fill="#6e9e91"/><path d="M${cx + 2} ${cy + 3}v-16m-5 5 5-4 6 4" stroke="#4c7144" fill="none" stroke-width="2"/>`;
  return t.elevation === 'hill' ? `<path d="M${cx - 12} ${cy + 5}q7-17 14-3m-3 4q6-15 14-2" fill="none" stroke="#384b37" stroke-opacity=".35" stroke-width="1.3"/>` : '';
}
function renderMap(world, preview = false) {
  const w = world.width * 25 * Math.sqrt(3) + 43, h = world.height * 37.5 + 23;
  const tiles = new Map(world.tiles.map(t => [t.id, t]));
  let shapes = '';
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    const id = `${x},${y}`, t = tiles.get(id), [cx, cy] = hexPoint(x, y);
    const points = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i - Math.PI / 6; return `${cx + 24.4 * Math.cos(a)},${cy + 24.4 * Math.sin(a)}`; }).join(' ');
    const active = !preview && selected === id;
    const stale = t && state && state.day - t.observedDay > 30;
    shapes += `<g class="hex ${t ? '' : 'unexplored'} ${active ? 'selected' : ''}" ${preview ? '' : `data-tile="${id}" tabindex="0" role="button" aria-label="${t ? TERRAINS[t.terrain].name : '미탐사'} (${x}, ${y})"`}>
      <polygon points="${points}" fill="${t ? TERRAINS[t.terrain].color : '#263339'}" stroke="${active ? '#f5d695' : t ? '#273b35' : '#344247'}" stroke-opacity="${active ? 1 : .5}" stroke-width="${active ? 2.8 : .8}"/>
      ${t ? `${terrainSymbol(t, cx, cy)}${t.river?.map(edge => { const a = Math.PI / 3 * edge - Math.PI / 6, b = a + Math.PI / 3; return `<path d="M${cx + 24 * Math.cos(a)} ${cy + 24 * Math.sin(a)} ${cx + 24 * Math.cos(b)} ${cy + 24 * Math.sin(b)}" stroke="#a2ccd0" stroke-width="2.5" stroke-opacity=".85"/>`; }).join('') || ''}${t.settlementId ? `<circle cx="${cx}" cy="${cy}" r="12" fill="#222d27" stroke="#e5c487" stroke-width="1.5"/><path d="m${cx - 6} ${cy - 1}6-6 6 6v7h-12Z" fill="#e5c487"/>` : ''}${t.ruin ? `<text x="${cx}" y="${cy + 7}" text-anchor="middle" fill="#efd8a3" font-size="20">♜</text>` : ''}${!preview && state?.priest?.tileId === id ? `<circle cx="${cx + 13}" cy="${cy - 11}" r="7" fill="#ccc0eb" stroke="#fff" stroke-width="1.5"/>` : ''}${stale ? `<circle cx="${cx - 12}" cy="${cy - 12}" r="3" fill="#d8b27a"/>` : ''}` : `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#526166" font-size="12">·</text>`}
    </g>`;
  }
  const view = !preview && mapView ? mapView : `0 0 ${w} ${h}`;
  return `<svg class="world-svg" ${preview ? 'aria-label="육각 지형 세계의 미리보기"' : 'id="world-map" aria-label="세계 지도"'} viewBox="${view}" data-width="${w}" data-height="${h}" xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`;
}
function selectedTribe() { return state?.tribes.find(t => t.id === state.selectedTribe); }
function dateLabel() { return `${state.month}개월 차 · ${((state.day - 1) % 30) + 1}일${state.hour ? ` ${state.hour}시` : ''}`; }
function renderGame() {
  if (!state) return;
  const focus = document.activeElement;
  const focusId = focus?.id;
  const scrolls = Object.fromEntries([...document.querySelectorAll('[data-scroll]')].map(n => [n.dataset.scroll, n.scrollTop]));
  const oldLogs = document.querySelector('.log-list');
  const stickToBottom = !oldLogs || oldLogs.scrollHeight - oldLogs.scrollTop - oldLogs.clientHeight < 45;
  const draft = document.querySelector('#chat-message')?.value || '';
  const audienceDraft = document.querySelector('#chat-audience')?.value || 'all';
  const start = focus?.selectionStart, end = focus?.selectionEnd;
  const t = selectedTribe();
  const onlineCount = Object.values(state.players).filter(p => p?.online).length;
  app.innerHTML = `<div class="game-layout">
    <aside class="sidebar">${brand()}<div class="room-label"><span class="eyebrow">YOUR CHRONICLE</span><strong>${esc(state.name)}</strong><span class="room-code"># ${state.id} <span class="small-live">LIVE</span></span></div>
      <nav class="main-nav" aria-label="게임 메뉴">${[['world', 'map', '세계 지도'], ['civilization', 'home', '문명 관리'], ['characters', 'people', '신과 신관'], ['journal', 'book', '연대기']].map(([key, ico, title]) => `<button data-do="tab" data-tab="${key}" class="nav-item ${tab === key ? 'active' : ''}">${icon(ico)}${title}${key === 'world' ? '<span class="nav-dot"></span>' : ''}</button>`).join('')}</nav>
      <div class="sidebar-divider"></div><div class="section-tiny">원탁의 동료들 <span>${onlineCount}/3</span></div><div class="party">${Object.keys(ROLE).map(r => `<div class="party-member"><span class="avatar ${r}">${ROLE_ICON[r]}<i class="${state.players[r]?.online ? 'online' : ''}"></i></span><div><strong>${esc(state.players[r]?.name || '기다리는 중…')}${r === state.role ? '<em>나</em>' : ''}</strong><small>${ROLE[r]}${!state.players[r] ? ' · 빈 자리' : ''}</small></div></div>`).join('')}</div>
      <button class="button outline invite-button" data-do="${state.role === 'gm' ? 'invite' : 'connection-info'}">${icon(state.role === 'gm' ? 'link' : 'people', 17)}${state.role === 'gm' ? '플레이어 초대' : '접속 안내'}</button>
      <div class="sidebar-bottom"><div class="quiet-note">“아직 어떤 역사도<br>쓰이지 않은 땅.”<span>THE FIRST AGE</span></div><a href="/rulebook.md" target="_blank" rel="noopener" class="nav-item">${icon('book', 17)}룰북 v0.4 ${icon('arrow', 14)}</a><button data-do="home" class="nav-item">${icon('home', 17)}시작 화면으로</button></div>
    </aside>
    <div class="game-main"><header class="game-header"><div class="breadcrumb">우리의 연대기 <span>/</span> <strong>${{world:'세계 지도',civilization:'문명 관리',characters:'신과 신관',journal:'연대기'}[tab]}</strong></div><div class="header-right">${state.role === 'gm' ? `<button class="icon-button mobile-invite" data-do="invite" aria-label="플레이어 초대">${icon('link',16)}</button>` : ''}<span id="connection" class="connection ${connected ? '' : 'offline'}"><i></i>${connected ? '실시간 연결됨' : '연결 중…'}</span><span class="header-role ${state.role}">${ROLE_ICON[state.role]} ${ROLE[state.role]}의 시선</span></div></header>
      <div class="game-content"><div class="page-heading"><div><div class="eyebrow">${{world:'THE KNOWN WORLD',civilization:'A CIVILIZATION IN THE MAKING',characters:'THE DIVINE & THE MORTAL',journal:'THE LIVING CHRONICLE'}[tab]}</div><h1>${{world:'미지의 땅, 우리의 세계',civilization:t?.name || '문명의 첫걸음',characters:'하늘의 의지와 대지의 목소리',journal:'선택이 역사가 되는 순간'}[tab]}</h1><p>${{world:'안개 너머의 가능성을 발견하고, 문명의 첫 장을 열어보세요.',civilization:'작은 공동체의 오늘이, 내일의 문명이 됩니다.',characters:'서로 다른 힘으로, 같은 미래를 향해.',journal:'세 사람이 함께 남기는, 단 하나의 이야기.'}[tab]}</p></div><div class="date-badge">${icon('sun', 22)}<div><strong>${dateLabel()}</strong><small>여명의 시대</small></div></div></div>
      ${renderSetupBanner()}
      <div class="stats-strip">${stat(icon('people'), '부족 인구', t ? `${num(t.population)}<small>명</small>` : '—', t ? t.race : '시작 부족 미선택')}${stat(icon('sun'), '신앙', state.god?.faith !== undefined ? `${num(state.god.faith)}<small>점</small>` : '—', state.god ? `${esc(state.god.realm)}의 소영역` : '신의 탄생을 기다리는 중')}${stat(icon('food'), '보유 식량', t ? `${num(Object.values(t.food).reduce((a,b) => a+b,0))}<small>단위</small>` : '—', t ? `월간 소비 ${num(t.population * t.consumption)}` : '재고 미확인')}${stat(icon('compass'), '발견한 세계', `${state.role === 'gm' ? '100' : (state.world.tiles.length / (state.world.width * state.world.height) * 100).toFixed(0)}<small>%</small>`, `${state.world.tiles.length} / ${state.world.width * state.world.height} 타일`)}</div>
      ${tab === 'world' ? worldWorkspace() : tab === 'civilization' ? civilizationPage() : tab === 'characters' ? charactersPage() : journalPage()}
      <div class="workspace-footer"><span><span class="gold-dot"></span> ${esc(state.name)} <span class="muted">·</span> 세계는 당신들의 선택을 기억합니다.</span><span id="save-status">${icon('check', 13)} 자동 저장됨 · ${new Date(state.updatedAt).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}</span></div>
      </div></div></div>`;
  for (const node of document.querySelectorAll('[data-scroll]')) if (scrolls[node.dataset.scroll] !== undefined) node.scrollTop = scrolls[node.dataset.scroll];
  const currentLogs = document.querySelector('.log-list');
  if (stickToBottom && currentLogs) currentLogs.scrollTop = currentLogs.scrollHeight;
  const chat = document.querySelector('#chat-message');
  if (chat) { chat.value = draft; document.querySelector('#chat-audience').value = audienceDraft; }
  if (focusId) {
    const next = document.getElementById(focusId);
    if (next) { next.focus({ preventScroll: true }); if (typeof start === 'number' && next.setSelectionRange) next.setSelectionRange(start, end); }
  }
}
function stat(ico, label, value, sub) { return `<div class="stat"><span class="stat-icon">${ico}</span><div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><span class="stat-sub">${sub}</span></div></div>`; }
function renderSetupBanner() {
  let text, button, act;
  if (!state.god) { text = state.role === 'god' ? '첫 번째 신의 이름을 지어주세요. 작은 소영역 하나에서 신화가 시작됩니다.' : '신 플레이어가 이름과 초기 소영역을 정하면 이야기가 시작됩니다.'; button = '신 생성'; act = 'create-god'; }
  else if (!state.selectedTribe) { text = '이미 이 세계를 살아가고 있는 부족 중, 함께할 부족을 신이 선택합니다.'; button = '시작 부족 선택'; act = 'select-tribe'; }
  else if (!state.priest) { text = `${selectedTribe().name}의 일원으로 신관을 만들어주세요. 종족은 ${selectedTribe().race}으로 고정됩니다.`; button = '신관 생성'; act = 'create-priest'; }
  else return `<div class="chapter-line"><span>CHAPTER 01</span><i></i> 신화가 시작되는 곳 <span class="playtest-label">시험 규칙 적용 중</span></div>`;
  const allowed = act === 'create-priest' ? state.role === 'priest' : state.role === 'god';
  return `<div class="setup-banner"><span class="banner-symbol">✧</span><div><strong>이야기의 시작을 준비하고 있어요</strong><p>${esc(text)}</p></div>${allowed ? `<button class="button small gold" data-do="${act}">${button}${icon('arrow',16)}</button>` : `<span class="waiting-tag">${act === 'create-priest' ? '신관' : '신'}의 선택 대기 중</span>`}</div>`;
}
function worldWorkspace() {
  return `<div class="world-workspace"><section class="map-card card"><div class="card-header"><div class="card-title">${icon('map',18)}세계 지도<span class="tag">원통형 세계</span></div><span class="map-meta">육각 타일 · 한 변 2km</span></div><div class="map-container"><div class="map-inner">${renderMap(state.world)}</div><div class="compass-rose"><span>N</span>${icon('compass',34)}</div><div class="map-coordinate">${selected ? `선택 좌표 ${selected.replace(',', ' / ')}` : '미지의 세계'}<small>동서 경계는 서로 연결됩니다</small></div><div class="map-controls"><button class="icon-button" data-do="zoom-in" aria-label="지도 확대">+</button><button class="icon-button" data-do="zoom-reset" aria-label="지도 초기화">⌾</button><button class="icon-button" data-do="zoom-out" aria-label="지도 축소">−</button></div></div><div class="map-legend"><span><i style="--swatch:#657d62"></i>초원·숲</span><span><i style="--swatch:#93916a"></i>평원</span><span><i style="--swatch:#557f89"></i>수역</span><span><i style="--swatch:#c2a878"></i>사막</span><span><i style="--swatch:#263339"></i>미탐사</span><span class="legend-end">${icon('eye',14)}${state.role === 'gm' ? 'GM 전지 시야' : '역할별 독립 시야'}</span></div></section><aside class="tile-card card">${tilePanel()}</aside><section class="log-card card">${logPanel()}</section><aside class="action-card card">${actionPanel()}</aside></div>`;
}
function tilePanel() {
  const tile = state.world.tiles.find(t => t.id === selected);
  if (!tile) return `<div class="card-header"><span class="card-title">${icon('compass',18)}미지의 땅</span></div><div class="unknown-tile"><span>✧</span><h3>안개 너머의 세계</h3><p>아직 이 지역을 알지 못합니다.<br>탐험하거나 GM에게 관찰 정보를 요청하세요.</p>${state.role === 'priest' && state.priest && selected ? `<button class="button outline full" data-do="explore">이곳으로 이동 시도</button>` : ''}</div>`;
  const tribe = state.tribes.find(t => t.id === tile.settlementId);
  const feature = FEATURES[tile.feature]?.name;
  const elevation = {flat:'평지',hill:'언덕',mountain:'산'}[tile.elevation];
  const canMove = state.role === 'priest' && state.priest && neighbors(state.world.tiles.find(t=>t.id === state.priest.tileId) || {x:0,y:0}).includes(tile.id);
  return `<div class="tile-illustration ${tile.terrain}"><span class="tile-coord">TILE ${tile.x.toString().padStart(2,'0')} / ${tile.y.toString().padStart(2,'0')}</span><div class="mini-landscape"><span>${tile.elevation === 'mountain' ? '♧' : feature?.includes('숲') || tile.feature === 'forest' ? '♠ ♠' : ['ocean','coast','lake'].includes(tile.terrain) ? '≈' : '⌁'}</span></div><div class="tile-art-title">${TERRAINS[tile.terrain].name}${feature ? ` · ${feature}` : ''}<small>${elevation}${tile.river.length ? ' · 강 인접' : ''}</small></div></div><div class="tile-info"><div class="section-tiny">선택한 타일 <span>${tile.id}</span></div><h3>${esc(tribe?.name || `${TERRAINS[tile.terrain].name} ${feature || elevation}`)}</h3><div class="tile-tags"><span>${TERRAINS[tile.terrain].name}</span>${feature ? `<span>${feature}</span>` : ''}<span>${elevation}</span></div><div class="tile-detail"><span>풍부한 자원</span><strong>${esc(tile.resource || '발견되지 않음')}</strong></div><div class="tile-detail"><span>동물 개체군</span><strong>${num(tile.wildlife)}</strong></div><div class="tile-detail"><span>식물 자원량</span><strong>${num(tile.plants)}</strong></div>${tile.ruin ? '<div class="tile-detail"><span>발견</span><strong class="gold-text">고대 유적</strong></div>' : ''}<p class="observation">${icon('eye',14)}${tile.observedDay === state.day ? '현재 관찰 정보' : `${tile.observedDay}일 차 관찰 · 오래된 정보일 수 있음`}</p>${canMove ? '<button class="button primary full" data-do="explore">이곳으로 탐험하기 →</button>' : ''}${state.role === 'gm' ? '<div class="button-pair"><button class="button outline small" data-do="reveal" data-role="god">신에게 공개</button><button class="button outline small" data-do="reveal" data-role="priest">신관에게 공개</button></div><button class="text-button edit-tile-button" data-do="edit-tile">타일 환경 편집 ↗</button>' : ''}</div>`;
}
function visibleLogs() {
  return state.logs.filter(l => logTab === 'all' || logTab === 'chat' && l.kind === 'chat' || logTab === 'story' && l.kind !== 'chat');
}
function renderLogs(full = false) {
  const logs = visibleLogs().slice(full ? -500 : -70);
  return logs.length ? logs.map(l => `<article class="log-entry ${l.kind}"><div class="log-avatar ${l.from || (l.kind === 'dice' ? 'god' : 'system')}">${l.kind === 'chat' ? ROLE_ICON[l.from] : l.kind === 'dice' ? '⚄' : l.kind === 'story' ? '✧' : '◇'}</div><div class="log-body"><div class="log-meta"><strong>${esc(l.speaker || {system:'세계의 기록',story:'세계의 서술',time:'시간의 흐름',month:'월말 정산',event:'세계의 사건',dice:'운명의 주사위',explore:'탐험 기록',judgment:'GM 판정',production:'부족의 하루',action:'행동 요청',research:'기술의 진보'}[l.kind] || '세계의 기록')}</strong>${l.audience !== 'all' ? `<span class="private-tag">${ROLE[l.audience]} 비공개</span>` : ''}<time>${l.day}일 차 · ${new Date(l.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time></div><p>${esc(l.message)}</p></div></article>`).join('') : `<div class="empty-state">${icon('feather',28)}<p>아직 남겨진 기록이 없습니다.<br>첫 이야기를 들려주세요.</p></div>`;
}
function chatForm() {
  return `<form id="chat-form" class="chat-form"><select id="chat-audience" aria-label="메시지 수신 대상"><option value="all">모두에게</option>${Object.keys(ROLE).filter(r=>r!==state.role).map(r=>`<option value="${r}">${ROLE[r]}에게만</option>`).join('')}</select><input id="chat-message" name="message" placeholder="이야기를 나누거나, 함께할 선택을 의논하세요…" maxlength="1500" required autocomplete="off" aria-label="채팅 메시지"><button class="send-button" type="submit" aria-label="메시지 보내기">${icon('arrow',18)}</button></form>`;
}
function logPanel() {
  return `<div class="card-header"><div class="card-title">${icon('feather',18)}함께 쓰는 이야기</div><div class="mini-tabs">${[['all','전체'],['chat','대화'],['story','기록']].map(([id,label])=>`<button data-do="log-tab" data-tab="${id}" class="${logTab===id?'active':''}">${label}</button>`).join('')}</div></div><div class="log-list" data-scroll="logs">${renderLogs()}</div>${chatForm()}`;
}
function actionPanel() {
  const count = state.actions.filter(a=>a.status==='pending').length;
  return `<div class="card-header"><span class="card-title">${icon('sun',18)}${ROLE[state.role]}의 행동</span><span class="tiny-tag">${count} 대기</span></div><div class="action-options">${state.role === 'gm' ? `<button data-do="requests">${icon('feather')}<span><strong>행동 판정</strong><small>플레이어의 선택에 응답하기</small></span><span class="action-arrow">${count || '↗'}</span></button><button data-do="narrate">${icon('book')}<span><strong>세계 서술</strong><small>새로운 장면과 사건 전하기</small></span><span class="action-arrow">↗</span></button><button data-do="advance">${icon('sun')}<span><strong>시간 진행</strong><small>일·주·월과 월말 정산</small></span><span class="action-arrow">↗</span></button>` : state.role === 'god' ? `<button data-do="request"><span class="power-icon">✦</span><span><strong>신의 권능</strong><small>기적·축복·강신·계시·창조</small></span><span class="action-arrow">↗</span></button><button data-do="requests">${icon('feather')}<span><strong>나의 행동 기록</strong><small>GM의 응답 확인하기</small></span><span class="action-arrow">↗</span></button>` : `<button data-do="request">${icon('compass')}<span><strong>신관의 행동</strong><small>탐험·연구·제작·외교·전투</small></span><span class="action-arrow">↗</span></button><button data-do="workers">${icon('people')}<span><strong>노동력 배치</strong><small>부족의 식량 생산 관리</small></span><span class="action-arrow">↗</span></button>`}<button data-do="roll">${icon('dice')}<span><strong>D100 대립 판정</strong><small>서버에서 굴리는 운명의 주사위</small></span><span class="action-arrow">↗</span></button></div>${state.role === 'gm' ? `<button class="gm-settings" data-do="settings">${icon('settings',15)}시험 규칙 설정</button>` : '<p class="action-note">자유롭게 행동을 제안하세요.<br>세계의 응답은 GM이 결정합니다.</p>'}`;
}
function civilizationPage() {
  const t = selectedTribe();
  if (!t) return `<section class="card large-empty"><span>⌂</span><h2>아직 첫 부족이 선택되지 않았어요</h2><p>신이 이미 존재하는 부족 중 하나를 선택하면<br>이곳에서 문명의 살림을 관리할 수 있습니다.</p></section>`;
  const total = Object.values(t.food).reduce((a,b)=>a+b,0), consumption = t.population*t.consumption;
  return `<div class="civilization-grid"><section class="card padded"><div class="section-heading"><h2>${icon('home')} ${esc(t.name)}</h2><span class="tag">야영지 · 시험 기준</span></div><p class="description">${esc(t.description)}</p><div class="info-grid">${[['종족',t.race],['인구',`${num(t.population)}명`],['신도',`${num(t.followers)}명`],['월간 기본 신앙',`${num(t.followers*.5)}점`],['종족별 소비',`${t.consumption} / 명 / 월`],['식량 여유',`${(total/consumption).toFixed(1)}개월`]].map(([label,value])=>`<div><small>${label}</small><strong>${value}</strong></div>`).join('')}</div><div class="notice">${icon('eye')}<p>출생·사망·부족 확장과 시설 효과는 GM이 판정합니다. 시작 부족 선택이 곧 전원 개종을 의미하지는 않습니다.</p></div>${state.role==='gm'?'<button class="button outline" data-do="adjust">부족 수치 조정</button>':''}</section>
  <section class="card padded"><div class="section-heading"><h2>${icon('food')} 식량과 노동</h2>${['gm','priest'].includes(state.role)?'<button class="text-button" data-do="workers">노동 배치 →</button>':''}</div><div class="food-stocks">${[['meat','고기','♧'],['grain','곡물','♨'],['fruit','과일','❧']].map(([key,name,symbol])=>`<div><span>${symbol}</span><strong>${num(t.food[key])}</strong><small>${name}</small></div>`).join('')}</div><div class="labor-list">${Object.entries(ACTIVITY).map(([key,name])=>`<div><span>${name}</span><div class="labor-bar"><i style="width:${t.workers[key]/t.population*100}%"></i></div><strong>${t.workers[key]}명</strong></div>`).join('')}</div><p class="helper">노동자 1인 ${state.settings.workerOutput} · 지형 한도 ×${state.settings.capacityScale} (시험용)<br>생산권: 정착지와 인접 6타일. 재고는 자동 저장되며 GM 시간 진행 시 정산됩니다.</p></section>
  <section class="card padded technology-card"><div class="section-heading"><div><span class="eyebrow">KNOWLEDGE & DISCOVERY</span><h2>기술의 씨앗</h2></div>${state.role==='gm'?'<button class="button outline small" data-do="technology">기술 기록 +</button>':''}</div>${t.technologies.length ? `<div class="tech-grid">${t.technologies.map(tech=>`<article class="tech-item"><span class="tech-icon">◇</span><h3>${esc(tech.name)}</h3><div class="tech-steps">${STAGES.map((name,i)=>`<span class="${i<=tech.stage?'done':''}" title="${name}"></span>`).join('')}</div><p>${STAGES[tech.stage]}</p></article>`).join('')}</div>` : '<div class="empty-state">'+icon('feather',30)+'<p>아직 기록된 기술이 없습니다.<br>연구와 경험을 쌓고, GM이 진척을 기록하세요.</p></div>'}<p class="helper">미발견 → 발견 → 실험 → 실용화 → 보급. 기술은 포인트 구매나 발견만으로 자동 보급되지 않습니다.</p></section></div>`;
}
function charactersPage() {
  return `<div class="character-grid"><section class="card character-sheet"><div class="character-banner god"><span>✦</span><small>THE DIVINE</small><h2>${esc(state.god?.name || '이름 없는 신')}</h2><p>${state.god ? `${esc(state.god.realm)}의 소영역` : '아직 세계에 모습을 드러내지 않았습니다.'}</p></div><div class="padded">${state.god ? `<div class="info-grid"><div><small>신성 레벨</small><strong>${state.god.level === undefined ? '비공개' : state.god.level}</strong></div><div><small>신앙</small><strong>${state.god.faith === undefined ? '비공개' : num(state.god.faith)}</strong></div></div>${state.god.appearance ? `<p class="description">${esc(state.god.appearance)} · ${esc(state.god.disposition)}</p>` : ''}<h3>신의 권능</h3><div class="tile-tags">${['기적','축복','강신','계시','피조물 창조'].map(p=>`<span>${p}</span>`).join('')}</div><p class="helper">권능 비용은 종류와 규모에 따라 GM이 판정합니다.<br>신성 레벨과 신앙은 별개의 수치입니다.</p>${state.role==='god'?'<button class="button primary" data-do="request">권능 사용 제안하기 →</button>':''}` : `<p class="description">신 플레이어가 이름, 외형, 성향과 초기 소영역 하나를 정합니다. 신성 레벨 1, 신앙 10으로 시작합니다.</p>${state.role==='god'?'<button class="button primary" data-do="create-god">신 생성하기 →</button>':''}`}</div></section>
  <section class="card character-sheet"><div class="character-banner priest"><span>♜</span><small>THE MORTAL</small><h2>${esc(state.priest?.name || '목소리를 기다리는 자')}</h2><p>${esc(state.priest?.race || selectedTribe()?.race || '부족 선택 후 종족이 결정됩니다.')}</p></div><div class="padded">${state.priest ? `<div class="ability-bars">${[['strength','힘'],['intelligence','지능'],['social','사회성']].map(([key,label])=>`<div><span>${label}</span><div class="labor-bar"><i style="width:${state.priest[key] || 0}%"></i></div><strong>${state.priest[key] ?? '비공개'}</strong></div>`).join('')}</div><p class="description">${esc(selectedTribe()?.name)}의 일원. 현재 위치 ${state.priest.tileId || '비공개'}.</p><h3>직업과 스킬</h3><p class="helper">행동을 통해 얻는 직업·스킬은 GM과 협의하여 연대기에 기록하세요. 세부 경험치 규칙은 미정입니다.</p>${state.role==='priest'?'<button class="button primary" data-do="request">행동 제안하기 →</button>':''}` : `<p class="description">기존 부족의 일원으로 시작합니다. 힘·지능·사회성에 100포인트를 배분하며, 부족 종족을 임의로 바꿀 수 없습니다.</p>${state.role==='priest' && selectedTribe()?'<button class="button primary" data-do="create-priest">신관 생성하기 →</button>':''}`}</div></section></div>`;
}
function journalPage() { return `<div class="journal-grid"><section class="card log-card journal-log">${logPanel()}</section><aside class="card journal-tools">${actionPanel()}${state.role==='gm'?'<div class="padded"><button class="button outline full" data-do="export">'+icon('download',16)+'기록 JSON 내보내기</button><p class="helper">자동 저장본은 서버 data 폴더에 유지됩니다. 내보내기 파일에는 접속 비밀키가 포함되지 않습니다.</p></div>':''}</aside></div>`; }

function showInvite() {
  showModal('동료를 세계로 초대하기', `<div class="invite-links">${['god','priest'].map(role => {
    const link = `${location.origin}/r/${state.id}#invite=${state.invite}&role=${role}`;
    return `<div class="invite-link"><div><span class="role-symbol ${role}">${ROLE_ICON[role]}</span><div><strong>${ROLE[role]} 플레이어</strong><small>${state.players[role] ? `${esc(state.players[role].name)} 참여 중` : '아직 비어 있는 자리'}</small></div></div><div class="copy-row"><input value="${esc(link)}" readonly aria-label="${ROLE[role]} 초대 링크"><button class="button outline small" data-do="copy" data-value="${esc(link)}">복사</button></div>${state.players[role]?`<button class="text-button danger-text" data-do="release" data-role="${role}">자리 해제</button>`:''}</div>`;
  }).join('')}</div><div class="notice">${icon('link')}<p>이 링크로 각 역할의 빈 자리에 참여할 수 있습니다. 신뢰하는 동료에게만 보내세요. 같은 브라우저의 다른 탭에서도 서로 다른 역할로 참여할 수 있습니다.</p></div><p class="helper">다른 컴퓨터에서 접속하려면 모두 같은 서버 주소에 접속해야 합니다. 로컬 개발 서버는 인터넷에 자동 공개되지 않습니다. 원격 플레이 시 HTTPS 접속 주소를 사용하세요.</p>`, '각자 다른 역할로 접속하면 실시간으로 같은 세계를 플레이합니다.');
}
function showGod() {
  showModal('첫 번째 신의 탄생', `<form data-action="create-god">${input('신의 이름','name','','required maxlength="30" placeholder="예: 네뷸라"')}${input('초기 소영역 하나','realm','','required maxlength="30" placeholder="예: 곤충, 샘물, 새벽"')}${input('외형','appearance','','maxlength="200" placeholder="밤하늘의 날개를 두른 작은 신"')}${input('성향','disposition','중립','maxlength="50"')}<div class="notice">✦<p>신성 레벨 1 · 신앙 10 · 초기 소영역 1개로 시작합니다.</p></div>${submit('신화의 첫 이름 새기기')}</form>`);
}
function showTribes() {
  showModal('함께할 부족 선택', `<form data-action="select-tribe"><div class="tribe-choices">${state.tribes.map((t,i)=>`<label class="tribe-choice"><input type="radio" name="tribeId" value="${t.id}" ${i===0?'checked':''}><span class="tribe-choice-content"><span class="tribe-emblem">${['☀','❧','◇','☽'][i]}</span><strong>${esc(t.name)}</strong><small>${esc(t.race)} · 인구 ${t.population}명 · 월간 소비 ${num(t.population*t.consumption)}</small><p>${esc(t.description)}</p></span></label>`).join('')}</div><p class="helper">부족은 세계 생성 단계부터 존재합니다. 선택은 되돌릴 수 없으며 신관의 종족도 이 부족의 종족으로 정해집니다. 종족별 소비 단계 배정은 시험용입니다.</p>${submit('이 부족과 함께하기')}</form>`);
}
function showPriest() {
  const tribe = selectedTribe();
  if (!tribe) { toast('신이 먼저 시작 부족을 선택해야 합니다.', true); return; }
  showModal('신의 목소리를 듣는 자', `<form data-action="create-priest">${input('신관의 이름','name','','required maxlength="30"')}<div class="notice">${icon('people')}<p>${esc(tribe.name)}의 ${esc(tribe.race)}으로 시작합니다. 능력치 100포인트를 배분하세요.</p></div><div class="three-inputs">${input('힘','strength',35,'type="number" min="0" max="100" required')}${input('지능','intelligence',35,'type="number" min="0" max="100" required')}${input('사회성','social',30,'type="number" min="0" max="100" required')}</div><p id="point-total" class="point-total">사용한 포인트 100 / 100</p>${submit('대지 위에 첫걸음 내딛기')}</form>`);
}
function showRequest() {
  const isGod = state.role==='god';
  const kinds = isGod ? ['기적','축복','강신','계시','피조물 창조'] : ['탐험','연구','제작','외교','전투','기타'];
  showModal(isGod ? '신의 권능 제안' : '신관의 행동 제안', `<form data-action="request"><label class="field">행동 종류<select name="kind">${kinds.map(k=>`<option>${k}</option>`).join('')}</select></label>${textarea('어떤 변화를 일으키나요?','description',isGod?'어느 지역에, 어떤 힘으로, 어떤 변화를 일으키고 싶은지 설명하세요.':'무엇을 시도하고, 어떤 자원과 시간을 투입하나요?')}<div class="notice">${icon('feather')}<p>GM이 실행 가능성과 비용을 판정합니다. 신과 신관의 행동 요청 및 결과는 각자와 GM에게만 보이며, 전달할 정보는 채팅이나 계시로 알려주세요.</p></div>${submit('GM에게 행동 제안하기')}</form>`);
}
function showRequests() {
  const actions = [...state.actions].reverse();
  showModal(state.role==='gm'?'행동 판정 대기실':'나의 행동 기록', `<div class="request-list">${actions.length?actions.map(a=>`<article class="request-item"><div class="section-heading"><strong>${ROLE_ICON[a.role]} ${ROLE[a.role]} · ${esc(a.kind)}</strong><span class="status-tag ${a.status}">${{pending:'판정 대기',approved:'승인',rejected:'반려'}[a.status]}</span></div><p>${esc(a.description)}</p>${a.result?`<div class="request-result">${esc(a.result)}${a.cost?`<small>신앙 −${a.cost}</small>`:''}</div>`:''}${state.role==='gm'&&a.status==='pending'?`<button class="button outline small" data-do="resolve" data-id="${a.id}">판정하기 →</button>`:''}</article>`).join(''):'<div class="empty-state">'+icon('feather',30)+'<p>아직 제안된 행동이 없습니다.</p></div>'}</div>`);
}
function showResolve(id) {
  const request = state.actions.find(a=>a.id===id);
  if (!request) return;
  showModal(`${ROLE[request.role]}의 ${request.kind} 판정`, `<form data-action="resolve"><input type="hidden" name="actionId" value="${id}"><div class="notice"><p>${esc(request.description)}</p></div><label class="field">판정<select name="status"><option value="approved">승인</option><option value="rejected">반려</option></select></label>${request.role==='god'?input('신앙 비용 (신의 행동 승인 시에만 차감)','cost',0,'type="number" min="0" max="1000000" required'):''}${textarea('결과와 변화','result','판정 근거와 세계에 일어난 변화를 적어주세요.')}${submit('판정 확정')}</form>`, '서술 외의 수치 변화와 정보 공개는 GM 도구에서 별도로 적용하세요.');
}
function showRoll() {
  showModal('운명의 D100', `<form data-action="roll">${input('판정 이름','label','대립 판정','maxlength="60" required')}<div class="two-inputs">${input('A의 능력치','a',30,'type="number" min="0" max="1000000" required')}${input('B의 능력치','b',30,'type="number" min="0" max="1000000" required')}</div><div class="two-inputs">${input('A 신성 보정 +Dn','divineA',0,'type="number" min="0" max="1000" required')}${input('B 신성 보정 +Dn','divineB',0,'type="number" min="0" max="1000" required')}</div><div class="formula">P(A) = A ÷ (A + B) × 100</div><p class="helper">신성 보정은 능력치에 200 × n을 더합니다. 실제로 불가능한 신체적 격차는 GM이 먼저 판단해야 합니다. 주사위 결과는 서버에서 생성되어 모두에게 공유됩니다.</p>${submit('주사위 굴리기')}</form>`);
}
function showWorkers() {
  const tribe=selectedTribe(); if(!tribe){toast('시작 부족이 필요합니다.',true);return;}
  showModal('부족의 일손 배치', `<form data-action="workers"><div class="notice">${icon('people')}<p>총 ${tribe.population}명. 활동별 노동자를 지정하세요. 합계는 인구를 넘을 수 없습니다.</p></div><div class="two-inputs">${Object.entries(ACTIVITY).map(([key,name])=>input(name,key,tribe.workers[key],`type="number" min="0" max="${tribe.population}" required`)).join('')}</div><p class="helper">월말에 노동량·타일 한도·자연자원 재고 중 가능한 만큼 생산합니다. 1인 생산량 ${state.settings.workerOutput}, 한도 배율 ${state.settings.capacityScale}는 시험 수치입니다. 기본 7타일 생산권이 겹치면 자원을 공유합니다.</p>${submit('노동 배치 저장')}</form>`);
}
function showNarrate() {
  showModal('세계의 목소리', `<form data-action="narrate"><label class="field">공개 대상<select name="audience"><option value="all">모두에게</option><option value="god">신에게만</option><option value="priest">신관에게만</option><option value="gm">GM 비밀 기록</option></select></label>${textarea('세계에 어떤 일이 일어나나요?','message','장면, 인물, 소문과 사건을 서술하세요.',2000)}${submit('세계에 이야기 남기기')}</form>`);
}
function showAdvance() {
  showModal('시간의 흐름', `<form data-action="advance"><label class="field">진행할 시간<select name="hours"><option value="1">1시간 · 긴급 상황</option><option value="24">1일 · 중요한 사건</option><option value="168">1주일 · 사건 대응</option><option value="720" selected>1개월 · 평화로운 일상</option></select></label><div class="notice">${icon('sun')}<p>현재 ${dateLabel()}. 30일 경계마다 식량 생산·소비, 신도 × 0.5 신앙, 동물 이동·자원 회복과 부족별 D100 사건 판정을 처리합니다.</p></div><p class="helper">식량 부족 시 자동으로 인구를 줄이지 않습니다. 출생·사망, 재해 효과 등 미확정 규칙은 GM이 결정하세요. 시간 진행은 되돌릴 수 없습니다.</p>${submit('시간 진행 확정')}</form>`);
}
function showAdjust() {
  if(!selectedTribe()){toast('먼저 시작 부족을 선택하세요.',true);return;}
  showModal('세계의 수치 조정', `<form data-action="adjust"><label class="field">항목<select name="field">${[['faith','신앙'],['followers','신도 수'],['population','부족 인구'],['meat','고기 재고'],['grain','곡물 재고'],['fruit','과일 재고']].map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>${input('변경 후 수치 (증감량이 아닌 최종값)','value',0,'type="number" min="0" max="100000000" required')}${input('변경 사유','reason','','maxlength="300" placeholder="예: 첫 계시를 받아들인 주민 8명"')}${submit('조정 내역 기록')}</form>`);
}
function showSettings() {
  showModal('시험 규칙 설정', `<form data-action="settings"><span class="playtest-label">미확정 수치 · 룰북의 확정 규칙을 변경하지 않습니다</span><div class="two-inputs">${input('노동자 1인 월간 생산량','workerOutput',state.settings.workerOutput,'type="number" min="1" max="1000" required')}${input('원문 지형 생산 한도 배율','capacityScale',state.settings.capacityScale,'type="number" min="1" max="20" required')}${input('자연 회복 계수 (0~1)','recoveryRate',state.settings.recoveryRate,'type="number" min="0" max="1" step="0.01" required')}${input('월간 사건 확률 (%)','eventChance',state.settings.eventChance,'type="number" min="0" max="100" required')}</div><p class="helper">소비량 15·30·60은 고정입니다. 한 달은 시험판에서 30일로 계산합니다. 식량 10단위가 자연 개체군/식물 자원 1단위를 소모하며, 월간 회복은 동물 최대 60 × 계수, 식물 최대 100 × 계수입니다. 제단·목축·인구 증가는 자동화하지 않습니다.</p>${submit('이 세계의 시험 설정 저장')}</form>`);
}
function showTechnology() {
  showModal('기술의 진척 기록', `<form data-action="technology">${input('기술 이름','name','','required maxlength="40" placeholder="예: 관개 농업"')}<label class="field">발전 단계<select name="stage">${STAGES.map((stage,i)=>`<option value="${i}">${stage}</option>`).join('')}</select></label><p class="helper">같은 이름의 기술이 있으면 해당 단계를 갱신합니다. 연구 조건과 진행량은 GM이 판정합니다.</p>${submit('부족의 지식 기록')}</form>`);
}
function showTileEditor() {
  const tile = state.world.tiles.find(t => t.id === selected);
  if (!tile) return;
  showModal(`타일 환경 편집 · ${tile.id}`, `<form data-action="edit-tile"><input type="hidden" name="tileId" value="${tile.id}"><div class="two-inputs"><label class="field">기본 지형<select name="terrain">${Object.entries(TERRAINS).map(([key,value])=>`<option value="${key}" ${tile.terrain===key?'selected':''}>${value.name}</option>`).join('')}</select></label><label class="field">지형 특성<select name="feature"><option value="">없음</option>${Object.entries(FEATURES).map(([key,value])=>`<option value="${key}" ${tile.feature===key?'selected':''}>${value.name}</option>`).join('')}</select></label><label class="field">고도<select name="elevation">${[['flat','평지'],['hill','언덕'],['mountain','산']].map(([key,name])=>`<option value="${key}" ${tile.elevation===key?'selected':''}>${name}</option>`).join('')}</select></label>${input('풍부한 자원','resource',tile.resource||'','maxlength="30" placeholder="없으면 비워두세요"')}${input('동물 개체군','wildlife',tile.wildlife,'type="number" min="0" max="1000000" required')}${input('식물 자원량','plants',tile.plants,'type="number" min="0" max="1000000" required')}</div>${input('변경 사유','reason','','required maxlength="300" placeholder="예: 곤충의 기적으로 풀이 줄어들었다"')}<p class="helper">신과 신관은 현재 관찰 중인 지역만 즉시 갱신됩니다. 멀리 있는 타일의 변화는 별도로 정보를 공개해야 알 수 있습니다. 강은 타일 사이 경계로 유지됩니다.</p>${submit('세계의 변화 적용')}</form>`);
}
function changeZoom(delta) {
  zoom = Math.min(3.2, Math.max(1, zoom+delta));
  const svg=document.querySelector('#world-map');if(!svg)return;
  const w=Number(svg.dataset.width), h=Number(svg.dataset.height);
  const [cx,cy]= selected ? hexPoint(...selected.split(',').map(Number)) : [w/2,h/2];
  const vw=w/zoom,vh=h/zoom;
  mapView=`${Math.max(0,Math.min(w-vw,cx-vw/2))} ${Math.max(0,Math.min(h-vh,cy-vh/2))} ${vw} ${vh}`;
  svg.setAttribute('viewBox',mapView);
}
document.addEventListener('click', async event => {
  const tile=event.target.closest('[data-tile]');
  if(tile){selected=tile.dataset.tile;renderGame();return;}
  const element=event.target.closest('[data-do]');if(!element)return;
  const command=element.dataset.do;
  const handlers={ create:showCreate,join:()=>showJoin(),invite:showInvite,'create-god':showGod,'select-tribe':showTribes,'create-priest':showPriest,request:showRequest,requests:showRequests,roll:showRoll,workers:showWorkers,narrate:showNarrate,advance:showAdvance,adjust:showAdjust,settings:showSettings,technology:showTechnology,'edit-tile':showTileEditor };
  if(handlers[command]){handlers[command]();return;}
  if(command==='close')dialog.close();
  if(command==='tab'){tab=element.dataset.tab;renderGame();}
  if(command==='log-tab'){logTab=element.dataset.tab;renderGame();}
  if(command==='resume')await resume(sessions()[Number(element.dataset.index)]);
  if(command==='home'){state=null;selected=null;history.pushState({},'','/');renderLanding();}
  if(command==='explore')await action({type:'explore',tileId:selected});
  if(command==='reveal')await action({type:'reveal',role:element.dataset.role,tileId:selected});
  if(command==='resolve')showResolve(element.dataset.id);
  if(command==='zoom-in')changeZoom(.4);
  if(command==='zoom-out')changeZoom(-.4);
  if(command==='zoom-reset'){zoom=1;mapView=null;renderGame();}
  if(command==='connection-info')showModal('동료와 함께 접속하기','<p class="description">GM이 공유한 초대 링크로 이 방에 합류했습니다. 같은 역할로 다시 접속하려면 이 브라우저의 시작 화면에서 저장된 연대기를 선택하세요.</p><p class="helper">로그인 키는 브라우저에 저장되어 있습니다. 브라우저 저장소를 지우거나 자리를 해제하면 GM에게 새 초대를 요청해야 합니다.</p>');
  if(command==='copy'){
    try{await navigator.clipboard.writeText(element.dataset.value);toast('초대 링크를 복사했습니다.');}
    catch{const field=element.parentElement.querySelector('input');field?.select();toast('초대 링크를 선택했습니다. 직접 복사해 주세요.');}
  }
  if(command==='release'){
    const role=element.dataset.role;
    showModal(`${ROLE[role]} 자리 해제`, `<p class="description">이 플레이어의 접속 키가 무효화됩니다. 캐릭터와 세계 기록은 보존됩니다.</p><form data-action="release"><input type="hidden" name="role" value="${role}">${submit('자리 해제 확정')}</form>`);
  }
  if(command==='export'){
    try{
      const data=await api(`/api/rooms/${session.id}/export`);
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`campaign-${session.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){toast(e.message,true);}
  }
});
document.addEventListener('keydown', event=>{
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-tile]')){event.preventDefault();selected=event.target.dataset.tile;renderGame();}
});
document.addEventListener('input',event=>{
  if(event.target.closest('[data-action="create-priest"]')){
    const form=event.target.form,total=['strength','intelligence','social'].reduce((n,key)=>n+Number(form.elements[key].value),0);
    const label=document.querySelector('#point-total');label.textContent=`사용한 포인트 ${total} / 100`;label.classList.toggle('danger-text',total!==100);
  }
});
document.addEventListener('submit', async event=>{
  const form=event.target;
  event.preventDefault();
  if(form.dataset.busy)return;
  const data=Object.fromEntries(new FormData(form));
  if(form.id==='create-form'||form.id==='join-form'){
    form.dataset.busy='true';const button=form.querySelector('[type=submit]');button.disabled=true;
    try{
      if(form.id==='create-form'){const result=await api('/api/rooms',data,false);await enter(result);}
      else{
        let link;try{link=new URL(data.link,location.origin);}catch{throw new Error('올바른 초대 링크를 입력하세요.');}
        const id=link.pathname.match(/^\/r\/([A-Z0-9]{6})$/)?.[1];
        const invite=new URLSearchParams(link.hash.slice(1)).get('invite');
        if(!id||!invite)throw new Error('방 코드와 초대 키가 포함된 링크가 필요합니다.');
        if(link.origin!==location.origin)throw new Error('초대 링크의 서버 주소로 먼저 접속해 주세요.');
        const result=await api(`/api/rooms/${id}/join`,{name:data.name,role:data.role,invite},false);await enter(result);
      }
    }catch(e){toast(e.message,true);}
    finally{delete form.dataset.busy;button.disabled=false;}
    return;
  }
  if(form.id==='chat-form'){
    const sent=await action({type:'chat',message:data.message,audience:document.querySelector('#chat-audience').value},{close:false});
    if(sent){const field=document.querySelector('#chat-message');if(field){field.value='';field.focus();}const list=document.querySelector('.log-list');if(list)list.scrollTop=list.scrollHeight;}
    return;
  }
  if(form.dataset.action){
    const numeric=['strength','intelligence','social','a','b','divineA','divineB','cost','hunt','gather','farm','fish','hours','value','workerOutput','capacityScale','recoveryRate','eventChance','stage','wildlife','plants'];
    for(const key of numeric)if(data[key]!==undefined)data[key]=Number(data[key]);
    await action({type:form.dataset.action,...data});
  }
});
window.addEventListener('popstate',()=>boot());
async function boot(){
  streamController?.abort();state=null;selected=null;
  const id=location.pathname.match(/^\/r\/([A-Z0-9]{6})$/)?.[1];
  if(id){
    const desired=new URLSearchParams(location.hash.slice(1)).get('role')||sessionStorage.getItem(`civilization.active.${id}`);
    const stored=sessions().find(s=>s.id===id&&(!desired||s.role===desired));
    if(stored){await resume(stored);if(state)return;}
  }
  renderLanding();
}
boot();

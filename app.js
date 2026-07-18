'use strict';

const LEGACY_STORAGE_KEY = 'dartliga_pwa_state_v1';
const STORAGE_KEY = 'dartliga_pwa_hub_v2';
const APP_VERSION = '1.2.0';
let route = 'home';
let matchFilter = 'all';
let tableGroup = 'all';
let competitionFilter = 'all';
let deferredInstallPrompt = null;
let newCompetitionPanelOpen = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const fmt = n => Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '0.00';

function defaultCompetition(overrides = {}) {
  const now = new Date().toISOString();
  const base = {
    id: uid('c'),
    version: APP_VERSION,
    status: 'active',
    settings: {
      competitionName: 'Lokalna Liga Darta',
      format: 'league',
      startScore: 501,
      legsToWin: 2,
      groupsCount: 2,
      qualifiersPerGroup: 2,
      knockoutLegs: {
        r128: 3,
        r64: 3,
        r32: 3,
        r16: 3,
        qf: 4,
        sf: 5,
        final: 6
      },
      pointsWin: 2,
      pointsDraw: 1,
      pointsLoss: 0,
      doubleOut: true
    },
    players: [],
    matches: [],
    live: null,
    knockout: {
      status: 'waiting',
      qualifiers: [],
      bracketSize: 0,
      championId: null,
      generatedAt: null,
      completedAt: null
    },
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now
  };
  const overrideSettings = overrides.settings || {};
  const settings = {
    ...base.settings,
    ...overrideSettings,
    knockoutLegs: {
      ...base.settings.knockoutLegs,
      ...(overrideSettings.knockoutLegs || {})
    }
  };
  return {
    ...base,
    ...overrides,
    settings,
    players: Array.isArray(overrides.players) ? overrides.players : base.players,
    matches: Array.isArray(overrides.matches) ? overrides.matches : base.matches,
    live: overrides.live || null,
    knockout: {
      ...base.knockout,
      ...(overrides.knockout || {}),
      qualifiers: Array.isArray(overrides.knockout?.qualifiers) ? overrides.knockout.qualifiers : []
    }
  };
}

function defaultHub() {
  const competition = defaultCompetition();
  return {
    version: APP_VERSION,
    activeCompetitionId: competition.id,
    competitions: [competition],
    createdAt: competition.createdAt,
    updatedAt: competition.updatedAt
  };
}

function normalizeCompetition(value = {}) {
  const competition = defaultCompetition({
    ...value,
    id: value.id || uid('c'),
    status: value.status || 'active',
    startedAt: value.startedAt || value.createdAt || new Date().toISOString(),
    completedAt: value.completedAt || null,
    settings: value.settings || {},
    players: Array.isArray(value.players) ? value.players : [],
    matches: [],
    live: value.live || null,
    knockout: value.knockout || {}
  });
  const rawMatches = Array.isArray(value.matches) ? value.matches : [];
  competition.matches = rawMatches.map(match => normalizeMatch(match, competition.settings));
  const bracketRounds = [...new Set(competition.matches.filter(match=>match.bracketRound).map(match=>match.bracketRound))];
  bracketRounds.forEach(round => {
    const roundMatches = competition.matches.filter(match=>match.bracketRound===round);
    const stageKey = stageKeyForSize(Math.max(2, roundMatches.length * 2));
    roundMatches.forEach(match => {
      const rawMatch = rawMatches.find(item=>item.id===match.id) || {};
      if (!match.stageKey) match.stageKey = stageKey;
      if (!Number(rawMatch.legsToWin)) match.legsToWin = knockoutLegsForStage(match.stageKey, competition.settings);
    });
  });
  if (competition.live) {
    const liveMatch = competition.matches.find(match => match.id === competition.live.matchId);
    competition.live = {
      ...competition.live,
      startScore: Number(competition.live.startScore) || matchStartScore(liveMatch, competition.settings),
      legsToWin: Number(competition.live.legsToWin) || matchLegsToWin(liveMatch, competition.settings)
    };
  }
  return competition;
}

function normalizeMatch(match = {}, settings = {}) {
  const bracket = Boolean(match.bracketRound);
  const stageKey = match.stageKey || null;
  return {
    ...match,
    phase: match.phase || (bracket ? 'knockout' : (match.group ? 'group' : 'league')),
    stageKey,
    startScore: Number(match.startScore) || Number(settings.startScore) || 501,
    legsToWin: Number(match.legsToWin) || (bracket ? knockoutLegsForStage(stageKey, settings) : Number(settings.legsToWin) || 2)
  };
}

function loadHub() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const competitions = Array.isArray(parsed.competitions) ? parsed.competitions.map(normalizeCompetition) : [];
      if (competitions.length) {
        const activeCompetitionId = competitions.some(c => c.id === parsed.activeCompetitionId)
          ? parsed.activeCompetitionId
          : competitions[0].id;
        return {
          ...parsed,
          version: APP_VERSION,
          activeCompetitionId,
          competitions
        };
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const competition = normalizeCompetition(legacy);
      return {
        version: APP_VERSION,
        activeCompetitionId: competition.id,
        competitions: [competition],
        createdAt: competition.createdAt,
        updatedAt: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error(error);
  }
  return defaultHub();
}

let hub = loadHub();
let state = hub.competitions.find(c => c.id === hub.activeCompetitionId) || hub.competitions[0];

function saveHub() {
  hub.version = APP_VERSION;
  hub.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hub));
}

saveHub();

function saveState() {
  state.version = APP_VERSION;
  state.updatedAt = new Date().toISOString();
  const index = hub.competitions.findIndex(c => c.id === state.id);
  if (index >= 0) hub.competitions[index] = state;
  else hub.competitions.push(state);
  hub.activeCompetitionId = state.id;
  saveHub();
}

function activateCompetition(id, targetRoute = 'dashboard') {
  const target = hub.competitions.find(c => c.id === id);
  if (!target) return;
  saveState();
  hub.activeCompetitionId = id;
  state = target;
  matchFilter = 'all';
  tableGroup = 'all';
  route = targetRoute;
  progressCompetition();
  saveState();
  render();
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

function player(id) {
  return state.players.find(p => p.id === id);
}

function playerName(id) {
  return player(id)?.name || 'Wolny los';
}

function formatLabel(format) {
  return ({league:'Liga', groups:'Grupy + faza pucharowa', knockout:'Turniej pucharowy'})[format] || format;
}

const KNOCKOUT_STAGE_LABELS = {
  r128: '1/64 finału',
  r64: '1/32 finału',
  r32: '1/16 finału',
  r16: '1/8 finału',
  qf: 'Ćwierćfinał',
  sf: 'Półfinał',
  final: 'Finał'
};

function stageKeyForSize(size) {
  const value = Number(size) || 0;
  if (value <= 2) return 'final';
  if (value <= 4) return 'sf';
  if (value <= 8) return 'qf';
  if (value <= 16) return 'r16';
  if (value <= 32) return 'r32';
  if (value <= 64) return 'r64';
  return 'r128';
}

function knockoutStageLabel(stageKey) {
  return KNOCKOUT_STAGE_LABELS[stageKey] || 'Faza pucharowa';
}

function knockoutLegsForStage(stageKey, settings = state?.settings || {}) {
  const configured = Number(settings.knockoutLegs?.[stageKey]);
  return Math.max(1, configured || Number(settings.legsToWin) || 2);
}

function matchLegsToWin(match, settings = state?.settings || {}) {
  if (!match) return Math.max(1, Number(settings.legsToWin) || 2);
  return Math.max(1, Number(match.legsToWin) || (match.bracketRound ? knockoutLegsForStage(match.stageKey, settings) : Number(settings.legsToWin) || 2));
}

function matchStartScore(match, settings = state?.settings || {}) {
  return Number(match?.startScore) || Number(settings.startScore) || 501;
}

function competitionFormatSummary(competition = state) {
  const settings = competition.settings;
  if (settings.format === 'groups') {
    return `${settings.startScore} · grupy do ${settings.legsToWin} legów · awans ${settings.qualifiersPerGroup} z grupy · puchar z różnymi limitami legów`;
  }
  if (settings.format === 'knockout') {
    return `${settings.startScore} · liczba legów zależna od etapu`; 
  }
  return `${settings.startScore} · do ${settings.legsToWin} wygranych legów`;
}

function statusBadge(status) {
  if (status === 'completed') return '<span class="badge green">Zakończony</span>';
  if (status === 'live') return '<span class="badge red">W trakcie</span>';
  return '<span class="badge blue">Zaplanowany</span>';
}

function competitionState(competition) {
  if (competition.status === 'completed') return 'completed';
  if (competition.live || competition.matches?.some(m => m.status === 'live')) return 'live';
  if (competition.matches?.length || competition.players?.length) return 'active';
  return 'draft';
}

function competitionStatusBadge(competition) {
  const status = competitionState(competition);
  if (status === 'completed') return '<span class="badge green">Zakończona</span>';
  if (status === 'live') return '<span class="badge red">Mecz w trakcie</span>';
  if (status === 'active') return '<span class="badge yellow">W trakcie</span>';
  return '<span class="badge blue">Przygotowanie</span>';
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pl-PL', {dateStyle:'medium', timeStyle:'short'}).format(date);
}

function localDateTimeValue(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0,16);
}

function competitionNumbers(competition) {
  const matches = (competition.matches || []).filter(m => !m.bye);
  const completed = matches.filter(m => m.status === 'completed').length;
  const totalScore = matches.reduce((sum,m) => sum + Object.values(m.stats || {}).reduce((s,stats) => s + Number(stats.totalScore || 0),0),0);
  const totalDarts = matches.reduce((sum,m) => sum + Object.values(m.stats || {}).reduce((s,stats) => s + Number(stats.totalDarts || 0),0),0);
  return {
    players: (competition.players || []).length,
    matches: matches.length,
    completed,
    average: totalDarts ? totalScore / totalDarts * 3 : 0
  };
}

function navButton(id, icon, label) {
  const activeRoute = route === 'scorer' ? 'matches' : route;
  return `<button data-route="${id}" class="${activeRoute === id ? 'active' : ''}"><span class="ico">${icon}</span>${label}</button>`;
}

function render() {
  const app = $('#app');
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <button class="brand brand-button" data-route="home"><div class="logo"></div><div><strong>DartLiga</strong><small>${hub.competitions.length} zapisanych rozgrywek</small></div></button>
        <nav class="nav">
          ${navButton('home','☷','Moje rozgrywki')}
          ${navButton('dashboard','⌂','Pulpit aktywnej')}
          ${navButton('competition','♟','Konfiguracja')}
          ${navButton('matches','◉','Mecze')}
          ${navButton('tables','▦','Tabele')}
          ${navButton('stats','↗','Statystyki')}
          ${navButton('settings','⚙','Ustawienia')}
        </nav>
        <button class="btn primary sidebar-new-competition" data-new-competition>+ Nowa rozgrywka</button>
        <div class="active-competition-card">
          <span class="muted">Aktywna rozgrywka</span>
          <strong>${esc(state.settings.competitionName)}</strong>
          ${competitionStatusBadge(state)}
        </div>
        <div class="sidebar-footer">
          <button id="installBtn" class="btn primary" style="display:none">Zainstaluj aplikację</button>
          <span class="muted" style="font-size:11px;text-align:center">Wersja ${APP_VERSION}</span>
        </div>
      </aside>
      <main class="main">
        <div class="mobile-head">
          <button class="brand brand-button" data-route="home"><div class="logo"></div><div><strong>DartLiga</strong><small>${esc(state.settings.competitionName)}</small></div></button>
          <div class="row-actions"><button class="btn small primary" data-new-competition>+ Nowa</button><button class="btn small" data-route="settings">⚙</button></div>
        </div>
        ${renderRoute()}
      </main>
      <nav class="mobile-nav">
        ${mobileNav('home','☷','Rozgrywki')}
        ${mobileNav('dashboard','⌂','Pulpit')}
        ${mobileNav('matches','◉','Mecze')}
        ${mobileNav('tables','▦','Tabela')}
        ${mobileNav('stats','↗','Stat.')}
      </nav>
    </div>`;

  $$('[data-route]').forEach(btn => btn.addEventListener('click', () => {
    route = btn.dataset.route;
    render();
  }));
  $$('[data-new-competition]').forEach(btn => btn.addEventListener('click', openNewCompetitionCreator));
  bindCurrentPage();
  updateInstallButton();
}

function mobileNav(id, icon, label) {
  const activeRoute = route === 'scorer' ? 'matches' : route;
  return `<button data-route="${id}" class="${activeRoute === id ? 'active' : ''}"><span>${icon}</span>${label}</button>`;
}

function renderRoute() {
  switch (route) {
    case 'home': return renderHome();
    case 'competition': return renderCompetition();
    case 'matches': return renderMatches();
    case 'tables': return renderTables();
    case 'stats': return renderStats();
    case 'settings': return renderSettings();
    case 'scorer': return renderScorer();
    default: return renderDashboard();
  }
}

function pageHeader(eyebrow, title, subtitle, actions = '') {
  return `<div class="topbar"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="top-actions">${actions}</div></div>`;
}

function knockoutLegFields(values = {}, disabled = false) {
  const stages = [
    ['r128','1/64 finału'],
    ['r64','1/32 finału'],
    ['r32','1/16 finału'],
    ['r16','1/8 finału'],
    ['qf','Ćwierćfinał'],
    ['sf','Półfinał'],
    ['final','Finał']
  ];
  return `<div class="knockout-leg-grid">${stages.map(([key,label]) => `<div class="field"><label>${label}</label><input type="number" name="ko_${key}" min="1" max="25" value="${Math.max(1, Number(values[key]) || knockoutLegsForStage(key))}" ${disabled?'disabled':''}></div>`).join('')}</div>`;
}

function renderHome() {
  const filters = [
    ['all','Wszystkie'],
    ['active','W trakcie'],
    ['completed','Zakończone']
  ];
  const defaults = defaultCompetition().settings;
  let competitions = hub.competitions.slice().sort((a,b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
  if (competitionFilter === 'active') competitions = competitions.filter(c => competitionState(c) !== 'completed');
  if (competitionFilter === 'completed') competitions = competitions.filter(c => competitionState(c) === 'completed');
  return `
    ${pageHeader('Archiwum i aktywne sezony', 'Moje rozgrywki', 'Możesz równolegle prowadzić kilka lig, rozgrywek grupowych i turniejów. Każda rozgrywka zachowuje własnych zawodników, mecze, wyniki i statystyki.', `<button class="btn primary" id="showNewCompetition">+ Nowa rozgrywka</button>`)}
    <section class="card new-competition-panel" id="newCompetitionPanel" ${newCompetitionPanelOpen ? '' : 'hidden'}>
      <div class="section-head"><div><h2>Utwórz nową rozgrywkę</h2><p class="muted">Ustal format i zasady przed dodaniem zawodników. Obecne rozgrywki pozostaną zapisane.</p></div><button class="btn small ghost" id="hideNewCompetition">Zamknij</button></div>
      <form id="newCompetitionForm" class="form-grid cols-3">
        <div class="field"><label>Nazwa</label><input name="competitionName" maxlength="80" placeholder="np. Liga Jesienna 2027" required></div>
        <div class="field"><label>Format</label><select name="format" id="newCompetitionFormat"><option value="league">Liga – każdy z każdym</option><option value="groups">Grupy + faza pucharowa</option><option value="knockout">Turniej pucharowy</option></select></div>
        <div class="field"><label>Data rozpoczęcia</label><input type="datetime-local" name="startedAt" value="${localDateTimeValue()}"></div>
        <div class="field"><label>Punkty startowe</label><select name="startScore">${[301,501,701,1001].map(v=>`<option ${v===501?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="field" data-league-groups-field><label>Wygrane legi w lidze / grupach</label><input type="number" name="legsToWin" min="1" max="15" value="${defaults.legsToWin}"></div>
        <div class="field" data-groups-field hidden><label>Liczba grup</label><input type="number" name="groupsCount" min="2" max="12" value="${defaults.groupsCount}"></div>
        <div class="field" data-groups-field hidden><label>Awans z każdej grupy</label><input type="number" name="qualifiersPerGroup" min="1" max="16" value="${defaults.qualifiersPerGroup}"><small class="field-help">Tylu najlepszych zawodników z każdej grupy przejdzie automatycznie do drabinki.</small></div>
        <div class="wide knockout-settings-panel" data-knockout-fields hidden>
          <div class="section-head"><div><h3>Wygrane legi w fazie pucharowej</h3><p class="muted">Każdy etap może mieć inną długość meczu.</p></div></div>
          ${knockoutLegFields(defaults.knockoutLegs)}
        </div>
        <div class="wide"><button class="btn primary" type="submit">Utwórz i przejdź do zawodników</button></div>
      </form>
    </section>
    <div class="tabs competition-tabs">${filters.map(([id,label])=>`<button class="tab ${competitionFilter===id?'active':''}" data-competition-filter="${id}">${label} <span class="muted">${id==='all'?hub.competitions.length:hub.competitions.filter(c=>id==='completed'?competitionState(c)==='completed':competitionState(c)!=='completed').length}</span></button>`).join('')}</div>
    <section class="card competition-library">
      ${competitions.length ? `<div class="competition-list">${competitions.map(competitionRow).join('')}</div>` : empty('Brak rozgrywek w tym widoku','Utwórz nową ligę albo zmień filtr.')}
    </section>`;
}

function competitionRow(competition) {
  const numbers = competitionNumbers(competition);
  const active = competition.id === state.id;
  return `<article class="competition-row ${active?'selected':''}">
    <div class="competition-date"><span>Start</span><strong>${formatDateTime(competition.startedAt || competition.createdAt)}</strong></div>
    <div class="competition-main">
      <div class="competition-title-line"><h3>${esc(competition.settings?.competitionName || 'Rozgrywka bez nazwy')}</h3>${competitionStatusBadge(competition)}${active?'<span class="badge blue">Aktualnie otwarta</span>':''}</div>
      <div class="competition-meta"><span>${formatLabel(competition.settings?.format)}</span><span>${numbers.players} zawodników</span><span>${numbers.completed}/${numbers.matches} meczów</span>${numbers.average?`<span>Śr. ${fmt(numbers.average)}</span>`:''}</div>
    </div>
    <div class="competition-actions">
      <button class="btn small primary open-competition" data-id="${competition.id}">${active?'Otwórz pulpit':'Przełącz i otwórz'}</button>
      <button class="btn small ghost duplicate-competition" data-id="${competition.id}">Nowa na podstawie</button>
      ${competition.status === 'completed'
        ? `<button class="btn small ghost reopen-competition" data-id="${competition.id}">Wznów</button>`
        : `<button class="btn small ghost finish-competition" data-id="${competition.id}">Zakończ</button>`}
    </div>
  </article>`;
}

function renderDashboard() {
  const completed = state.matches.filter(m => m.status === 'completed' && !m.bye);
  const planned = state.matches.filter(m => m.status === 'planned');
  const live = state.matches.filter(m => m.status === 'live');
  const standings = computeStandings('all');
  const leader = standings[0];
  const recent = completed.slice().sort((a,b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 5);
  const next = planned.slice().sort(matchSort).slice(0, 5);
  const knockoutInfo = state.settings.format === 'groups'
    ? (state.matches.some(m=>m.bracketRound)
      ? `Faza pucharowa: ${state.knockout?.status === 'completed' ? 'zakończona' : 'w trakcie'}`
      : 'Faza pucharowa zostanie utworzona po zakończeniu grup')
    : '';
  return `
    ${pageHeader('Centrum rozgrywek', esc(state.settings.competitionName), `${formatLabel(state.settings.format)} · ${competitionFormatSummary(state)} · start ${formatDateTime(state.startedAt)}`, `<button class="btn ghost" data-route="home">Wszystkie rozgrywki</button><button class="btn info" data-new-competition>+ Nowa rozgrywka</button><button class="btn primary" data-route="matches">Rozpocznij mecz</button>`)}
    ${knockoutInfo ? `<div class="note safe-note" style="margin-bottom:16px"><strong>${knockoutInfo}</strong>${state.settings.format==='groups' ? ` · awansuje ${state.settings.qualifiersPerGroup} zawodników z każdej grupy.` : ''}</div>` : ''}
    <div class="grid stats">
      ${statCard('Zawodnicy', state.players.length, 'aktywnych w rozgrywkach')}
      ${statCard('Mecze zakończone', completed.length, `z ${state.matches.filter(m=>!m.bye).length} zaplanowanych`)}
      ${statCard('Do rozegrania', planned.length, live.length ? `${live.length} mecz w trakcie` : 'brak aktywnego meczu')}
      ${statCard('Lider', leader ? esc(playerName(leader.playerId)) : '—', leader ? `${leader.points} pkt · bilans ${signed(leader.diff)}` : 'wygeneruj terminarz')}
    </div>
    <div class="grid two" style="margin-top:16px">
      <section class="card">
        <div class="section-head"><h2>Ostatnie wyniki</h2><button class="btn small ghost" data-route="matches">Wszystkie</button></div>
        ${recent.length ? `<div class="match-list">${recent.map(matchRow).join('')}</div>` : empty('Brak wyników','Po rozegraniu pierwszego meczu wynik pojawi się tutaj.')}
      </section>
      <section class="card">
        <div class="section-head"><h2>Następne mecze</h2><button class="btn small ghost" data-route="competition">Terminarz</button></div>
        ${next.length ? `<div class="match-list">${next.map(matchRow).join('')}</div>` : empty('Brak zaplanowanych meczów','Dodaj zawodników i wygeneruj terminarz.')}
      </section>
    </div>
    ${state.live ? `<section class="card accent" style="margin-top:16px"><div class="section-head"><div><h2>Mecz jest w trakcie</h2><p class="muted">${esc(playerName(state.live.playerA))} kontra ${esc(playerName(state.live.playerB))}</p></div><button class="btn primary" id="resumeLive">Wróć do punktacji</button></div></section>` : ''}
  `;
}

function statCard(label, value, hint) {
  return `<div class="card compact"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-hint">${hint}</div></div>`;
}

function empty(title, text) {
  return `<div class="empty"><strong>${title}</strong>${text}</div>`;
}

function renderCompetition() {
  const groups = groupNames();
  const hasSchedule = state.matches.length > 0;
  const completedMatches = state.matches.filter(m => m.status === 'completed' && !m.bye).length;
  const liveMatches = state.matches.filter(m => m.status === 'live' && !m.bye).length + (state.live ? 1 : 0);
  const canRegenerate = hasSchedule && completedMatches === 0 && liveMatches === 0;
  const format = state.settings.format;
  const structureLocked = hasSchedule;
  return `
    ${pageHeader('Konfiguracja', 'Rozgrywki i zawodnicy', 'Dla formatu grupowego aplikacja automatycznie utworzy fazę pucharową po zakończeniu wszystkich meczów grupowych.', `<button class="btn ghost" data-route="home">Moje rozgrywki</button><button class="btn primary" data-new-competition>+ Nowa rozgrywka</button><button class="btn info" id="loadDemo">Wczytaj dane demo</button>`)}
    ${hasSchedule ? `<div class="note safe-note"><strong>Zasady tej rozgrywki są zablokowane po wygenerowaniu terminarza.</strong> Dzięki temu liczba grup, awansów i limit legów w poszczególnych etapach nie zmieni się w trakcie zawodów.</div>` : ''}
    <div class="grid two" style="margin-top:${hasSchedule ? '16px' : '0'}">
      <section class="card">
        <div class="section-head"><h2>Ustawienia rozgrywki</h2><span class="badge">${formatLabel(format)}</span></div>
        <form id="competitionForm" class="form-grid">
          <div class="field wide"><label>Nazwa ligi lub turnieju</label><input name="competitionName" maxlength="80" value="${esc(state.settings.competitionName)}" required></div>
          <div class="field"><label>Format</label><select name="format" ${structureLocked ? 'disabled' : ''} id="competitionFormat">
            <option value="league" ${format==='league'?'selected':''}>Liga – każdy z każdym</option>
            <option value="groups" ${format==='groups'?'selected':''}>Grupy + faza pucharowa</option>
            <option value="knockout" ${format==='knockout'?'selected':''}>Turniej pucharowy</option>
          </select></div>
          <div class="field"><label>Punkty startowe</label><select name="startScore" ${structureLocked?'disabled':''}>${[301,501,701,1001].map(v=>`<option ${Number(state.settings.startScore)===v?'selected':''}>${v}</option>`).join('')}</select></div>
          <div class="field" data-current-league-groups ${format==='knockout'?'hidden':''}><label>Wygrane legi w lidze / grupach</label><input type="number" name="legsToWin" min="1" max="15" value="${state.settings.legsToWin}" ${structureLocked?'disabled':''}></div>
          <div class="field" data-current-groups ${format==='groups'?'':'hidden'}><label>Liczba grup</label><input type="number" name="groupsCount" min="2" max="12" value="${state.settings.groupsCount}" ${structureLocked?'disabled':''}></div>
          <div class="field" data-current-groups ${format==='groups'?'':'hidden'}><label>Awans z każdej grupy</label><input type="number" name="qualifiersPerGroup" min="1" max="16" value="${state.settings.qualifiersPerGroup}" ${structureLocked?'disabled':''}><small class="field-help">Po zakończeniu grup aplikacja wybierze tyle najwyżej sklasyfikowanych osób z każdej grupy.</small></div>
          <div class="field" data-current-points ${format==='knockout'?'hidden':''}><label>Punkty za zwycięstwo</label><input type="number" name="pointsWin" min="0" max="10" value="${state.settings.pointsWin}"></div>
          <div class="field" data-current-points ${format==='knockout'?'hidden':''}><label>Punkty za remis</label><input type="number" name="pointsDraw" min="0" max="10" value="${state.settings.pointsDraw}"></div>
          <div class="wide knockout-settings-panel" data-current-knockout ${format==='league'?'hidden':''}>
            <div class="section-head"><div><h3>Wygrane legi w fazie pucharowej</h3><p class="muted">Ustaw osobno każdy możliwy etap. Aplikacja wykorzysta tylko etapy potrzebne dla liczby zakwalifikowanych zawodników.</p></div></div>
            ${knockoutLegFields(state.settings.knockoutLegs, structureLocked)}
          </div>
          <div class="wide row-actions"><button class="btn primary" type="submit">Zapisz ustawienia</button><button class="btn ghost" type="button" id="duplicateCurrentCompetition">Utwórz nową na podstawie tej</button></div>
        </form>
      </section>
      <section class="card">
        <div class="section-head"><h2>Zawodnicy</h2><span class="badge green">${state.players.length}</span></div>
        <form id="playerForm" class="inline-form">
          <div class="field"><label>Imię i nazwisko / pseudonim</label><input name="playerName" maxlength="50" placeholder="np. Michał M." required></div>
          ${format === 'groups' ? `<div class="field"><label>Grupa</label><select name="playerGroup"><option value="">Automatycznie</option>${groups.map(g=>`<option>${g}</option>`).join('')}</select></div>` : ''}
          <button class="btn primary" type="submit">Dodaj</button>
        </form>
        <hr>
        ${state.players.length ? `<div class="player-list">${state.players.map((p,i)=>playerRow(p,i,groups)).join('')}</div>` : empty('Brak zawodników','Dodaj co najmniej dwóch zawodników.')}
      </section>
    </div>
    ${format === 'groups' ? `<section class="card compact group-flow-card" style="margin-top:16px"><div class="flow-steps"><div><span>1</span><strong>${state.settings.groupsCount} grup</strong><small>mecze każdy z każdym</small></div><div class="flow-arrow">→</div><div><span>2</span><strong>${state.settings.qualifiersPerGroup} z każdej grupy</strong><small>awans według tabeli</small></div><div class="flow-arrow">→</div><div><span>3</span><strong>Faza pucharowa</strong><small>tworzona automatycznie</small></div></div></section>` : ''}
    <section class="card accent" style="margin-top:16px">
      <div class="section-head"><div><h2>Terminarz tej rozgrywki</h2><p class="muted">Obecnie: ${state.matches.filter(m=>!m.bye).length} meczów, ${completedMatches} zakończonych.</p></div><div class="row-actions">
        ${format==='groups' && !hasSchedule ? '<button class="btn info" id="autoGroups">Rozdziel grupy</button>' : ''}
        ${!hasSchedule
          ? `<button class="btn primary" id="generateSchedule" ${state.players.length<2?'disabled':''}>Generuj terminarz</button>`
          : `<button class="btn" disabled>Terminarz zapisany</button>${canRegenerate ? '<button class="btn danger" id="regenerateSchedule">Przebuduj zaplanowany terminarz</button>' : ''}<button class="btn info" data-new-competition>+ Nowa rozgrywka</button>`}
      </div></div>
      ${!hasSchedule
        ? `<div class="note">${format==='groups' ? 'Najpierw zostanie wygenerowana faza grupowa. Po wpisaniu ostatniego wyniku grupowego drabinka pucharowa powstanie automatycznie.' : 'Wygenerowany terminarz zostanie zapisany tylko w tej rozgrywce.'}</div>`
        : canRegenerate
          ? '<div class="note">Możesz przebudować terminarz, ponieważ żaden mecz nie został jeszcze rozegrany.</div>'
          : '<div class="note safe-note">Terminarz zawiera rozpoczęte lub zakończone mecze, dlatego nie można go nadpisać.</div>'}
    </section>`;
}

function playerRow(p, index, groups) {
  const scheduleLocked = state.matches.length > 0;
  return `<div class="player-row"><div><div class="player-name"><span class="muted">${index+1}.</span> ${esc(p.name)}</div>${state.settings.format==='groups'?`<div class="match-meta">Grupa: ${esc(p.group || 'nieprzypisana')}</div>`:''}</div><div class="row-actions">
    ${state.settings.format==='groups'?`<select class="player-group-select" data-player-id="${p.id}" ${scheduleLocked?'disabled title="Grupy są zablokowane po wygenerowaniu terminarza"':''}><option value="">—</option>${groups.map(g=>`<option ${p.group===g?'selected':''}>${g}</option>`).join('')}</select>`:''}
    <button class="btn small ghost edit-player" data-id="${p.id}">Zmień</button><button class="btn small danger delete-player" data-id="${p.id}">Usuń</button>
  </div></div>`;
}

function renderMatches() {
  const matches = filteredMatches();
  const filters = [
    ['all','Wszystkie'],['planned','Do rozegrania'],['live','W trakcie'],['completed','Wyniki']
  ];
  return `
    ${pageHeader('Terminarz', 'Mecze', 'Rozpocznij punktację 501 albo wpisz wynik ręcznie.', state.live ? '<button class="btn primary" id="resumeLive">Wróć do aktywnego meczu</button>' : '')}
    <div class="tabs">${filters.map(([id,label])=>`<button class="tab ${matchFilter===id?'active':''}" data-match-filter="${id}">${label} <span class="muted">${countFilter(id)}</span></button>`).join('')}</div>
    <section class="card">
      ${matches.length ? `<div class="match-list">${matches.map(matchRow).join('')}</div>` : empty('Brak meczów w tym widoku','Zmień filtr albo wygeneruj terminarz.')}
    </section>`;
}

function matchSort(a, b) {
  const phaseA = a.bracketRound ? 1 : 0;
  const phaseB = b.bracketRound ? 1 : 0;
  return phaseA - phaseB
    || (a.bracketRound || a.round || 0) - (b.bracketRound || b.round || 0)
    || String(a.group || '').localeCompare(String(b.group || ''), 'pl');
}

function filteredMatches() {
  let list = state.matches.filter(m => !m.bye);
  if (matchFilter !== 'all') list = list.filter(m => m.status === matchFilter);
  return list.slice().sort(matchSort);
}

function countFilter(filter) {
  const list = state.matches.filter(m=>!m.bye);
  return filter === 'all' ? list.length : list.filter(m=>m.status===filter).length;
}

function matchRow(m) {
  const a = playerName(m.playerA), b = playerName(m.playerB);
  const roundLabel = m.bracketRound ? knockoutStageLabel(m.stageKey) : `Kolejka ${m.round || 1}`;
  const group = m.group ? ` · Grupa ${esc(m.group)}` : '';
  const target = ` · do ${matchLegsToWin(m)} legów`;
  const result = m.status === 'completed' ? `<span class="score-pill">${m.legsA}:${m.legsB}</span>` : '<span class="muted">vs</span>';
  const startLabel = m.status === 'live' ? 'Wznów' : 'Licz punkty';
  return `<div class="match-row"><div><div class="match-meta">${roundLabel}${group}${target}</div>${statusBadge(m.status)}</div><div class="match-pair"><span class="${m.winnerId===m.playerA?'winner':''}">${esc(a)}</span>${result}<span class="${m.winnerId===m.playerB?'winner':''}">${esc(b)}</span></div><div class="row-actions">
    ${m.status !== 'completed' ? `<button class="btn small primary start-match" data-id="${m.id}">${startLabel}</button><button class="btn small ghost manual-result" data-id="${m.id}">Wpisz wynik</button>` : `<button class="btn small ghost reopen-match" data-id="${m.id}">Popraw</button>`}
  </div></div>`;
}

function renderTables() {
  if (state.settings.format === 'knockout') return renderBracketPage();
  const groups = state.settings.format === 'groups' ? groupNames() : ['all'];
  const selected = state.settings.format === 'groups' ? (groups.includes(tableGroup) ? tableGroup : groups[0] || 'all') : 'all';
  tableGroup = selected;
  const standings = computeStandings(selected);
  const qualifiers = state.settings.format === 'groups' ? Math.max(1, Number(state.settings.qualifiersPerGroup) || 1) : 0;
  const generatedQualifierIds = new Set((state.knockout?.qualifiers || []).filter(q=>q.group===selected).map(q=>q.playerId));
  return `
    ${pageHeader('Klasyfikacja', state.settings.format==='groups'?'Tabele grupowe i drabinka':'Tabela ligi', state.settings.format==='groups' ? 'Najlepsi zawodnicy z każdej grupy zostaną automatycznie przeniesieni do fazy pucharowej.' : 'Tabela aktualizuje się automatycznie po zakończeniu każdego meczu.')}
    ${state.settings.format==='groups' ? `<div class="tabs">${groups.map(g=>`<button class="tab ${selected===g?'active':''}" data-table-group="${esc(g)}">Grupa ${esc(g)}</button>`).join('')}</div>` : ''}
    <section class="card">
      ${standings.length ? standingsTable(standings, {qualifiers, generatedQualifierIds}) : empty('Tabela jest pusta','Dodaj zawodników i rozegraj pierwsze mecze.')}
      ${state.settings.format==='groups' ? `<div class="note qualification-note" style="margin-top:14px"><strong>Awans: ${qualifiers} ${qualifiers===1?'zawodnik':'zawodników'} z grupy ${esc(selected)}.</strong> ${groupStageComplete() ? 'Klasyfikacja grupowa została zamknięta.' : 'Zaznaczone miejsca są na razie miejscami awansowymi; ostateczny skład drabinki powstanie po wszystkich meczach grupowych.'} Przy równej liczbie punktów decydują kolejno: bilans legów, liczba wygranych legów i średnia 3-dart.</div>` : ''}
    </section>
    <section class="card compact" style="margin-top:16px"><div class="kpi-mini"><span class="badge">M = mecze</span><span class="badge">W = wygrane</span><span class="badge">R = remisy</span><span class="badge">P = porażki</span><span class="badge">+/- = bilans legów</span><span class="badge">Śr. = średnia 3-dart</span></div></section>
    ${state.settings.format==='groups' ? renderKnockoutSection(false) : ''}`;
}

function standingsTable(rows, options = {}) {
  const qualifiers = Math.max(0, Number(options.qualifiers) || 0);
  const generatedQualifierIds = options.generatedQualifierIds || new Set();
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Zawodnik</th><th>M</th><th>W</th><th>R</th><th>P</th><th>Legi</th><th>+/-</th><th>Punkty</th><th>Śr.</th></tr></thead><tbody>${rows.map((r,i)=>{
    const qualified = generatedQualifierIds.size ? generatedQualifierIds.has(r.playerId) : i < qualifiers;
    return `<tr class="${qualified?'qualified-row':''}"><td class="pos">${i+1}</td><td><strong>${esc(playerName(r.playerId))}</strong>${qualified?'<span class="badge green qualification-badge">Awans</span>':''}</td><td>${r.played}</td><td class="green">${r.wins}</td><td>${r.draws}</td><td class="red">${r.losses}</td><td>${r.legsFor}:${r.legsAgainst}</td><td class="${r.diff>0?'green':r.diff<0?'red':''}">${signed(r.diff)}</td><td><strong>${r.points}</strong></td><td>${fmt(r.average)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function groupStageComplete() {
  if (state.settings.format !== 'groups') return false;
  const groupMatches = state.matches.filter(m=>!m.bracketRound && m.phase==='group');
  return groupMatches.length > 0 && groupMatches.every(m=>m.status==='completed');
}

function renderKnockoutSection(standalone = false) {
  const rounds = [...new Set(state.matches.filter(m=>m.bracketRound).map(m=>m.bracketRound))].sort((a,b)=>a-b);
  const waiting = state.settings.format === 'groups' && !rounds.length;
  const heading = standalone ? '' : '<div class="section-head"><div><h2>Faza pucharowa</h2><p class="muted">Zawodnicy są dodawani automatycznie na podstawie tabel grupowych.</p></div></div>';
  const champion = state.knockout?.championId ? `<div class="champion-card"><span>🏆</span><div><small>Zwycięzca rozgrywek</small><strong>${esc(playerName(state.knockout.championId))}</strong></div></div>` : '';
  return `<section class="card knockout-section" style="margin-top:${standalone?'0':'16px'}">
    ${heading}
    ${champion}
    ${rounds.length ? `<div class="bracket">${rounds.map(r=>renderBracketRound(r)).join('')}</div>` : waiting
      ? `<div class="empty"><strong>Drabinka jest dołączona i oczekuje na wyniki grup</strong>Po zakończeniu ostatniego meczu grupowego aplikacja wybierze po ${state.settings.qualifiersPerGroup} zawodników z każdej grupy, rozstawi ich w drabince i utworzy pierwszą rundę.</div>`
      : empty('Brak drabinki','Dodaj zawodników i wygeneruj turniej pucharowy.')}
  </section>`;
}

function renderBracketPage() {
  return `
    ${pageHeader('Drabinka', 'Turniej pucharowy', 'Zwycięzcy są automatycznie przenoszeni do kolejnej rundy, a liczba wymaganych legów zależy od etapu.')}
    ${renderKnockoutSection(true)}`;
}

function renderBracketRound(round) {
  const matches = state.matches.filter(m=>m.bracketRound===round);
  const stage = matches[0]?.stageKey;
  const target = matches[0] ? matchLegsToWin(matches[0]) : 0;
  return `<div class="bracket-round"><h3>${knockoutStageLabel(stage)}</h3><div class="bracket-target">do ${target} wygranych legów</div>${matches.map(m=>`<div class="bracket-match"><div class="bracket-line ${m.winnerId===m.playerA?'winner':''}"><span>${esc(playerName(m.playerA))}</span><b>${m.status==='completed'?(m.legsA??''):'–'}</b></div><div class="bracket-line ${m.winnerId===m.playerB?'winner':''}"><span>${esc(playerName(m.playerB))}</span><b>${m.status==='completed'?(m.legsB??''):'–'}</b></div>${m.bye?'<div class="match-meta">Wolny los</div>':''}</div>`).join('')}</div>`;
}

function renderStats() {
  const rows = computePlayerStats();
  return `
    ${pageHeader('Analiza', 'Statystyki zawodników', 'Średnia, wysokie punktacje, checkout i najlepszy leg są liczone z wizyt wpisanych w liczniku.')}
    <section class="card">
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Zawodnik</th><th>Mecze</th><th>Legi W</th><th>Średnia</th><th>100+</th><th>140+</th><th>180</th><th>High Out</th><th>Best Leg</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td class="pos">${i+1}</td><td><strong>${esc(playerName(r.playerId))}</strong></td><td>${r.matches}</td><td>${r.legsWon}</td><td><strong>${fmt(r.average)}</strong></td><td>${r.h100}</td><td>${r.h140}</td><td class="green"><strong>${r.h180}</strong></td><td>${r.highOut || '—'}</td><td>${r.bestLeg || '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Brak statystyk','Statystyki pojawią się po rozegraniu meczu w liczniku.')}
    </section>`;
}

function renderSettings() {
  return `
    ${pageHeader('Dane aplikacji', 'Ustawienia i kopia zapasowa', 'Dane są zapisywane lokalnie w tej przeglądarce. Eksport JSON obejmuje całe archiwum lig i turniejów.')}
    <div class="grid two">
      <section class="card"><h2>Kopia danych</h2><p class="muted">Eksport obejmuje wszystkie aktywne i zakończone rozgrywki, zawodników, terminarze, wyniki i statystyki.</p><div class="row-actions"><button class="btn primary" id="exportData">Eksportuj JSON</button><label class="btn info" for="importData">Importuj JSON</label><input id="importData" type="file" accept="application/json" hidden></div></section>
      <section class="card"><h2>Instalacja PWA</h2><p class="muted">Po uruchomieniu przez HTTPS lub lokalny serwer aplikacja może działać jak program i zachować podstawowe pliki offline.</p><button class="btn primary" id="installBtnPage" ${deferredInstallPrompt?'':'disabled'}>Zainstaluj aplikację</button></section>
    </div>
    <section class="card danger-zone" style="margin-top:16px"><h2 class="red">Strefa niebezpieczna</h2><p class="muted">Usunięcie danych kasuje całe archiwum wszystkich rozgrywek i jest nieodwracalne, chyba że wcześniej wykonano eksport JSON.</p><button class="btn danger" id="resetAll">Usuń całe archiwum</button></section>`;
}

function renderScorer() {
  const live = state.live;
  if (!live) {
    route = 'matches';
    return renderMatches();
  }
  const match = state.matches.find(m=>m.id===live.matchId);
  if (!match) return `<section class="card">${empty('Nie znaleziono meczu','Wróć do terminarza.')}</section>`;
  const statsA = livePlayerStats(live.playerA);
  const statsB = livePlayerStats(live.playerB);
  const visits = live.visits.slice().reverse();
  return `
    ${pageHeader('Licznik X01', `${esc(playerName(live.playerA))} vs ${esc(playerName(live.playerB))}`, `${live.startScore || matchStartScore(match)} · pierwszy do ${live.legsToWin || matchLegsToWin(match)} wygranych legów · ${match.bracketRound ? knockoutStageLabel(match.stageKey) : (match.group ? `Grupa ${match.group}` : 'mecz ligowy')}`, `<button class="btn ghost" data-route="matches">Zapisz i wyjdź</button>`)}
    <div class="scorer">
      <div class="scoreboard">
        ${scorePlayer(live.playerA, statsA)}
        <div class="versus"><div><div class="leg-label">Legi</div><div class="legs-big">${live.legs[live.playerA]} : ${live.legs[live.playerB]}</div><div class="muted">Leg ${live.legNumber}</div></div></div>
        ${scorePlayer(live.playerB, statsB)}
      </div>
      <div class="entry-panel">
        <section class="card accent">
          <div class="section-head"><div><h2>Wynik wizyty</h2><div class="muted">Rzuca: <strong class="green">${esc(playerName(live.currentPlayerId))}</strong></div></div><button class="btn small ghost" id="toggleStarter" ${live.visits.some(v=>v.leg===live.legNumber)?'disabled':''}>Zmień rozpoczynającego</button></div>
          <form id="scoreForm">
            <input id="scoreInput" class="score-input" type="number" inputmode="numeric" min="0" max="180" autocomplete="off" placeholder="0–180" required autofocus>
            <div class="quick-grid">${[26,41,45,60,81,85,100,121,140,180].map(v=>`<button type="button" class="btn quick-score" data-score="${v}">${v}</button>`).join('')}</div>
            <div class="checkout-row"><span class="muted">Przy zejściu do zera liczba użytych lotek:</span><select id="checkoutDarts"><option value="1">1 lotka</option><option value="2">2 lotki</option><option value="3" selected>3 lotki</option></select></div>
            <div class="row-actions" style="margin-top:14px"><button class="btn primary" type="submit">Zatwierdź wynik</button><button class="btn ghost" type="button" id="undoVisit" ${live.undo.length?'':'disabled'}>Cofnij ostatnią wizytę</button></div>
          </form>
          <div class="note" style="margin-top:14px">Bust jest rozpoznawany automatycznie, gdy wynik spadnie poniżej 0 albo pozostanie 1 punkt. Zejście dokładnie do 0 jest traktowane jako poprawny checkout.</div>
        </section>
        <section class="card">
          <div class="section-head"><h2>Historia wizyt</h2><span class="badge">${live.visits.length}</span></div>
          <div class="visit-history">${visits.length ? visits.map(v=>`<div class="visit"><span>${esc(playerName(v.playerId))}${v.checkout?' · checkout':''}${v.bust?' · BUST':''}</span><span class="vscore ${v.bust?'red':''}">${v.bust?'0':v.score}</span><span class="vrem">zostało ${v.remainingAfter}</span></div>`).join('') : empty('Pierwszy rzut','Wpisz sumę punktów z maksymalnie trzech lotek.')}</div>
        </section>
      </div>
    </div>`;
}

function scorePlayer(playerId, stats) {
  const live = state.live;
  return `<div class="score-player ${live.currentPlayerId===playerId?'active':''}"><div class="score-player-name">${esc(playerName(playerId))}</div><div class="remaining">${live.remaining[playerId]}</div><div class="score-stats"><div><b>${fmt(stats.average)}</b><span>średnia</span></div><div><b>${stats.darts}</b><span>lotki</span></div><div><b>${stats.last || '—'}</b><span>ostatnia</span></div></div></div>`;
}

function bindCurrentPage() {
  $('#showNewCompetition')?.addEventListener('click', openNewCompetitionCreator);
  $('#hideNewCompetition')?.addEventListener('click', () => { newCompetitionPanelOpen=false; render(); });
  $('#newCompetitionForm')?.addEventListener('submit', createCompetition);
  $('#newCompetitionFormat')?.addEventListener('change', updateNewCompetitionFields);
  $('#competitionFormat')?.addEventListener('change', updateCurrentCompetitionFields);
  updateNewCompetitionFields();
  $$('[data-competition-filter]').forEach(b=>b.addEventListener('click',()=>{competitionFilter=b.dataset.competitionFilter;render();}));
  $$('.open-competition').forEach(b=>b.addEventListener('click',()=>activateCompetition(b.dataset.id,'dashboard')));
  $$('.finish-competition').forEach(b=>b.addEventListener('click',()=>finishCompetition(b.dataset.id)));
  $$('.reopen-competition').forEach(b=>b.addEventListener('click',()=>reopenCompetition(b.dataset.id)));
  $$('.duplicate-competition').forEach(b=>b.addEventListener('click',()=>duplicateCompetition(b.dataset.id)));
  $('#duplicateCurrentCompetition')?.addEventListener('click',()=>duplicateCompetition(state.id));
  $('#resumeLive')?.addEventListener('click', () => { route='scorer'; render(); });
  $('#competitionForm')?.addEventListener('submit', saveCompetitionSettings);
  $('#playerForm')?.addEventListener('submit', addPlayer);
  $('#generateSchedule')?.addEventListener('click', generateSchedule);
  $('#regenerateSchedule')?.addEventListener('click', regenerateSchedule);
  $('#autoGroups')?.addEventListener('click', autoAssignGroups);
  $('#loadDemo')?.addEventListener('click', loadDemo);
  $$('.delete-player').forEach(b=>b.addEventListener('click',()=>deletePlayer(b.dataset.id)));
  $$('.edit-player').forEach(b=>b.addEventListener('click',()=>editPlayer(b.dataset.id)));
  $$('.player-group-select').forEach(s=>s.addEventListener('change',()=>changePlayerGroup(s.dataset.playerId,s.value)));
  $$('[data-match-filter]').forEach(b=>b.addEventListener('click',()=>{matchFilter=b.dataset.matchFilter;render();}));
  $$('.start-match').forEach(b=>b.addEventListener('click',()=>startMatch(b.dataset.id)));
  $$('.manual-result').forEach(b=>b.addEventListener('click',()=>manualResult(b.dataset.id)));
  $$('.reopen-match').forEach(b=>b.addEventListener('click',()=>reopenMatch(b.dataset.id)));
  $$('[data-table-group]').forEach(b=>b.addEventListener('click',()=>{tableGroup=b.dataset.tableGroup;render();}));
  $('#scoreForm')?.addEventListener('submit', submitScore);
  $$('.quick-score').forEach(b=>b.addEventListener('click',()=>{$('#scoreInput').value=b.dataset.score;$('#scoreInput').focus();}));
  $('#undoVisit')?.addEventListener('click', undoVisit);
  $('#toggleStarter')?.addEventListener('click', toggleLegStarter);
  $('#exportData')?.addEventListener('click', exportData);
  $('#importData')?.addEventListener('change', importData);
  $('#resetAll')?.addEventListener('click', resetAll);
  $('#installBtnPage')?.addEventListener('click', installApp);
  $('#installBtn')?.addEventListener('click', installApp);
}

function updateNewCompetitionFields() {
  const form = $('#newCompetitionForm');
  if (!form) return;
  const format = form.querySelector('[name="format"]')?.value || 'league';
  form.querySelectorAll('[data-groups-field]').forEach(el => el.hidden = format !== 'groups');
  form.querySelectorAll('[data-knockout-fields]').forEach(el => el.hidden = format === 'league');
  form.querySelectorAll('[data-league-groups-field]').forEach(el => el.hidden = format === 'knockout');
}

function updateCurrentCompetitionFields() {
  const form = $('#competitionForm');
  if (!form) return;
  const format = form.querySelector('[name="format"]')?.value || state.settings.format;
  form.querySelectorAll('[data-current-groups]').forEach(el => el.hidden = format !== 'groups');
  form.querySelectorAll('[data-current-knockout]').forEach(el => el.hidden = format === 'league');
  form.querySelectorAll('[data-current-league-groups]').forEach(el => el.hidden = format === 'knockout');
  form.querySelectorAll('[data-current-points]').forEach(el => el.hidden = format === 'knockout');
}

function openNewCompetitionCreator() {
  newCompetitionPanelOpen = true;
  route = 'home';
  render();
  setTimeout(() => {
    const panel = $('#newCompetitionPanel');
    panel?.scrollIntoView({behavior:'smooth', block:'start'});
    panel?.querySelector('input[name="competitionName"]')?.focus();
  }, 120);
}

function clonedPlayers(players) {
  const now = new Date().toISOString();
  return (players || []).map(p => ({
    id: uid('p'),
    name: p.name,
    group: p.group || '',
    createdAt: now
  }));
}

function duplicateCompetition(id) {
  const source = hub.competitions.find(c => c.id === id);
  if (!source) return;
  saveState();
  const competition = defaultCompetition({
    settings: {
      ...source.settings,
      competitionName: `${source.settings.competitionName} – nowa rozgrywka`
    },
    players: clonedPlayers(source.players),
    matches: [],
    live: null,
    status: 'active',
    startedAt: new Date().toISOString()
  });
  hub.competitions.push(competition);
  hub.activeCompetitionId = competition.id;
  state = competition;
  route = 'competition';
  newCompetitionPanelOpen = false;
  matchFilter = 'all';
  tableGroup = 'all';
  saveHub();
  render();
  toast('Utworzono nową, osobną rozgrywkę. Poprzednie wyniki pozostały zapisane.');
}

function knockoutLegsFromForm(data, fallback = state.settings.knockoutLegs || {}) {
  const result = {...fallback};
  Object.keys(KNOCKOUT_STAGE_LABELS).forEach(key => {
    const raw = data.get(`ko_${key}`);
    if (raw !== null && raw !== '') result[key] = Math.max(1, Number(raw) || result[key] || 2);
  });
  return result;
}

function settingsFromForm(data) {
  return {
    ...state.settings,
    competitionName: String(data.get('competitionName') || '').trim() || 'Liga Darta',
    format: String(data.get('format') || state.settings.format || 'league'),
    startScore: Number(data.get('startScore')) || Number(state.settings.startScore) || 501,
    legsToWin: Math.max(1, Number(data.get('legsToWin')) || Number(state.settings.legsToWin) || 2),
    groupsCount: Math.max(2, Number(data.get('groupsCount')) || Number(state.settings.groupsCount) || 2),
    qualifiersPerGroup: Math.max(1, Number(data.get('qualifiersPerGroup')) || Number(state.settings.qualifiersPerGroup) || 1),
    knockoutLegs: knockoutLegsFromForm(data, state.settings.knockoutLegs),
    pointsWin: Math.max(0, Number(data.get('pointsWin') ?? state.settings.pointsWin ?? 2)),
    pointsDraw: Math.max(0, Number(data.get('pointsDraw') ?? state.settings.pointsDraw ?? 1))
  };
}

function createCompetition(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get('competitionName') || '').trim();
  if (!name) return toast('Podaj nazwę rozgrywki');
  const startedRaw = String(data.get('startedAt') || '');
  const startedDate = startedRaw ? new Date(startedRaw) : new Date();
  const competition = defaultCompetition({
    settings: {
      competitionName: name,
      format: String(data.get('format') || 'league'),
      startScore: Number(data.get('startScore')) || 501,
      legsToWin: Math.max(1, Number(data.get('legsToWin')) || 2),
      groupsCount: Math.max(2, Number(data.get('groupsCount')) || 2),
      qualifiersPerGroup: Math.max(1, Number(data.get('qualifiersPerGroup')) || 2),
      knockoutLegs: knockoutLegsFromForm(data, defaultCompetition().settings.knockoutLegs)
    },
    startedAt: Number.isNaN(startedDate.getTime()) ? new Date().toISOString() : startedDate.toISOString()
  });
  saveState();
  hub.competitions.push(competition);
  hub.activeCompetitionId = competition.id;
  state = competition;
  route = 'competition';
  newCompetitionPanelOpen = false;
  matchFilter = 'all';
  tableGroup = 'all';
  saveHub();
  render();
  toast('Nowa rozgrywka utworzona');
}

function finishCompetition(id) {
  const competition = hub.competitions.find(c => c.id === id);
  if (!competition) return;
  if (competition.live && !confirm('W tej rozgrywce jest rozpoczęty mecz. Zakończyć rozgrywkę bez usuwania zapisanego meczu?')) return;
  if (!competition.live && !confirm(`Oznaczyć „${competition.settings.competitionName}” jako zakończoną? Wszystkie wyniki pozostaną w archiwum.`)) return;
  competition.status = 'completed';
  competition.completedAt = new Date().toISOString();
  competition.updatedAt = competition.completedAt;
  if (competition.id === state.id) state = competition;
  saveHub();
  render();
  toast('Rozgrywka przeniesiona do zakończonych');
}

function reopenCompetition(id) {
  const competition = hub.competitions.find(c => c.id === id);
  if (!competition) return;
  competition.status = 'active';
  competition.completedAt = null;
  competition.updatedAt = new Date().toISOString();
  if (competition.id === state.id) state = competition;
  saveHub();
  render();
  toast('Rozgrywka została wznowiona');
}

function ensureCompetitionOpen() {
  if (state.status !== 'completed') return true;
  if (!confirm('Ta rozgrywka jest oznaczona jako zakończona. Wznowić ją, aby wprowadzić zmiany?')) return false;
  state.status = 'active';
  state.completedAt = null;
  saveState();
  return true;
}

function saveCompetitionSettings(event) {
  event.preventDefault();
  if (!ensureCompetitionOpen()) return;
  const data = new FormData(event.currentTarget);
  const requested = settingsFromForm(data);
  const oldFormat = state.settings.format;

  if (oldFormat !== requested.format && state.matches.length) {
    const createNew = confirm('Ta rozgrywka ma już zapisany terminarz. Jej format nie zostanie zmieniony. Utworzyć NOWĄ, osobną rozgrywkę w wybranym formacie i skopiować zawodników?');
    if (!createNew) {
      render();
      return toast('Obecna rozgrywka pozostała bez zmian');
    }
    saveState();
    const competition = defaultCompetition({
      settings: {
        ...requested,
        competitionName: requested.competitionName === state.settings.competitionName
          ? `${requested.competitionName} – ${formatLabel(requested.format)}`
          : requested.competitionName
      },
      players: clonedPlayers(state.players),
      matches: [],
      live: null,
      status: 'active',
      startedAt: new Date().toISOString()
    });
    hub.competitions.push(competition);
    hub.activeCompetitionId = competition.id;
    state = competition;
    route = 'competition';
    saveHub();
    render();
    return toast('Utworzono nową rozgrywkę. Poprzednia i jej wyniki zostały zachowane.');
  }

  state.settings = requested;
  saveState();
  render();
  toast('Ustawienia zapisane');
}

function addPlayer(event) {
  event.preventDefault();
  if (!ensureCompetitionOpen()) return;
  if (state.matches.length) return toast('Nie można dodawać zawodników po wygenerowaniu terminarza');
  const data = new FormData(event.currentTarget);
  const name = String(data.get('playerName')).trim();
  if (!name) return;
  if (state.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return toast('Taki zawodnik już istnieje');
  state.players.push({id:uid('p'),name,group:String(data.get('playerGroup')||''),createdAt:new Date().toISOString()});
  saveState(); render(); toast('Zawodnik dodany');
}

function editPlayer(id) {
  if (!ensureCompetitionOpen()) return;
  const p = player(id); if (!p) return;
  const name = prompt('Nowa nazwa zawodnika:', p.name);
  if (name === null) return;
  const cleaned = name.trim();
  if (!cleaned) return toast('Nazwa nie może być pusta');
  p.name = cleaned;
  saveState(); render();
}

function deletePlayer(id) {
  if (!ensureCompetitionOpen()) return;
  if (state.matches.length) return toast('Nie można usuwać zawodników po wygenerowaniu terminarza');
  const p = player(id); if (!p) return;
  const related = state.matches.filter(m=>m.playerA===id||m.playerB===id).length;
  if (!confirm(`Usunąć zawodnika „${p.name}”?${related ? ' Powiązane mecze także zostaną usunięte.' : ''}`)) return;
  state.players = state.players.filter(x=>x.id!==id);
  state.matches = state.matches.filter(m=>m.playerA!==id&&m.playerB!==id);
  if (state.live && (state.live.playerA===id||state.live.playerB===id)) state.live=null;
  saveState(); render(); toast('Zawodnik usunięty');
}

function changePlayerGroup(id, group) {
  if (!ensureCompetitionOpen()) return;
  if (state.matches.length) return toast('Grupy są zablokowane po wygenerowaniu terminarza');
  const p = player(id); if (!p) return;
  p.group = group;
  saveState();
}

function groupNames() {
  return Array.from({length:Math.max(2,Number(state.settings.groupsCount)||2)},(_,i)=>String.fromCharCode(65+i));
}

function groupNamesFromPlayers() {
  const configured = groupNames();
  return configured.filter(group => state.players.some(player => player.group === group));
}

function autoAssignGroups() {
  if (!ensureCompetitionOpen()) return;
  if (!state.players.length) return;
  autoAssignGroupsSilent();
  saveState(); render(); toast('Zawodnicy zostali równomiernie rozdzieleni do grup');
}

function validateGroupSetup() {
  const groups = groupNames();
  const qualifiers = Math.max(1, Number(state.settings.qualifiersPerGroup) || 1);
  if (state.players.length < groups.length * 2) {
    return `Potrzeba co najmniej ${groups.length * 2} zawodników, aby w każdej z ${groups.length} grup były minimum 2 osoby.`;
  }
  for (const group of groups) {
    const count = state.players.filter(player => player.group === group).length;
    if (count < 2) return `Grupa ${group} ma tylko ${count} zawodników. Każda grupa musi mieć minimum 2 osoby.`;
    if (qualifiers > count) return `Z grupy ${group} nie może awansować ${qualifiers} zawodników, ponieważ grupa ma tylko ${count} osób.`;
  }
  if (groups.length * qualifiers < 2) return 'Do fazy pucharowej musi awansować co najmniej dwóch zawodników.';
  return '';
}

function generateSchedule() {
  if (!ensureCompetitionOpen()) return;
  if (state.players.length < 2) return toast('Dodaj co najmniej dwóch zawodników');
  if (state.matches.length) return toast('Ta rozgrywka ma już terminarz. Utwórz nową rozgrywkę, aby zachować historię.');
  if (state.settings.format === 'groups') {
    if (state.players.some(player=>!player.group || !groupNames().includes(player.group))) autoAssignGroupsSilent();
    const error = validateGroupSetup();
    if (error) return toast(error);
  }
  buildSchedule();
  saveState();
  render();
  toast(state.settings.format === 'groups' ? 'Faza grupowa zapisana. Drabinka powstanie automatycznie po grupach.' : 'Terminarz zapisany w tej rozgrywce');
}

function regenerateSchedule() {
  if (!ensureCompetitionOpen()) return;
  const protectedMatches = state.matches.some(m => m.status === 'completed' || m.status === 'live') || Boolean(state.live);
  if (protectedMatches) return toast('Nie można nadpisać terminarza z wynikami. Utwórz nową rozgrywkę.');
  if (!confirm('Przebudować wyłącznie zaplanowany terminarz tej rozgrywki? Żadne inne ligi ani turnieje nie zostaną zmienione.')) return;
  if (state.settings.format === 'groups') {
    if (state.players.some(player=>!player.group || !groupNames().includes(player.group))) autoAssignGroupsSilent();
    const error = validateGroupSetup();
    if (error) return toast(error);
  }
  state.matches = [];
  state.live = null;
  buildSchedule();
  saveState();
  render();
  toast('Zaplanowany terminarz został przebudowany');
}

function buildSchedule() {
  state.matches = [];
  state.live = null;
  state.knockout = {
    status: 'waiting',
    qualifiers: [],
    bracketSize: 0,
    championId: null,
    generatedAt: null,
    completedAt: null
  };
  if (state.settings.format === 'league') {
    state.matches = roundRobin(state.players.map(p=>p.id), null, 'league');
  } else if (state.settings.format === 'groups') {
    if (state.players.some(p=>!p.group)) autoAssignGroupsSilent();
    groupNames().forEach(group=>{
      const ids=state.players.filter(p=>p.group===group).map(p=>p.id);
      state.matches.push(...roundRobin(ids, group, 'group'));
    });
    state.knockout.status = 'waiting';
  } else {
    createInitialKnockout(shuffle(state.players.map(p=>p.id)), []);
  }
}

function autoAssignGroupsSilent() {
  const groups=groupNames();
  shuffle(state.players.slice()).forEach((p,i)=>p.group=groups[i%groups.length]);
}

function roundRobin(ids, group, phase = group ? 'group' : 'league') {
  const list=ids.slice();
  if (list.length<2) return [];
  if (list.length%2) list.push(null);
  const n=list.length, rounds=[];
  let rotation=list.slice();
  for(let r=0;r<n-1;r++){
    for(let i=0;i<n/2;i++){
      const a=rotation[i], b=rotation[n-1-i];
      if(a&&b) rounds.push(newMatch(r%2===0?a:b,r%2===0?b:a,r+1,group,null,{phase}));
    }
    rotation=[rotation[0],rotation[n-1],...rotation.slice(1,n-1)];
  }
  return rounds;
}

function newMatch(a,b,round=1,group=null,bracketRound=null,options={}) {
  const stageKey = options.stageKey || null;
  const knockout = Boolean(bracketRound);
  return {
    id:uid('m'),
    playerA:a,
    playerB:b,
    round,
    group,
    bracketRound,
    phase:options.phase || (knockout ? 'knockout' : (group ? 'group' : 'league')),
    stageKey,
    startScore:Number(options.startScore) || Number(state.settings.startScore) || 501,
    legsToWin:Math.max(1, Number(options.legsToWin) || (knockout ? knockoutLegsForStage(stageKey) : Number(state.settings.legsToWin) || 2)),
    status:'planned',
    legsA:0,
    legsB:0,
    winnerId:null,
    stats:null,
    createdAt:new Date().toISOString()
  };
}

function nextPowerOfTwo(value) {
  let size = 2;
  while (size < value) size *= 2;
  return size;
}

function standardSeedOrder(size) {
  let order = [1,2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap(seed => [seed, sum - seed]);
  }
  return order;
}

function avoidSameGroupFirstRound(slots, qualifierData = []) {
  if (!qualifierData.length) return slots;
  const groupByPlayer = new Map(qualifierData.map(item=>[item.playerId,item.group]));
  const result = slots.slice();
  const sameGroup = (a,b) => a && b && groupByPlayer.get(a) && groupByPlayer.get(a) === groupByPlayer.get(b);
  for (let i=0;i<result.length;i+=2) {
    const a=result[i], b=result[i+1];
    if (!sameGroup(a,b)) continue;
    let fixed=false;
    for (let j=0;j<result.length;j+=2) {
      if (j===i) continue;
      const c=result[j], d=result[j+1];
      if (d && !sameGroup(a,d) && !sameGroup(c,b)) {
        [result[i+1],result[j+1]]=[result[j+1],result[i+1]];
        fixed=true;
        break;
      }
    }
    if (!fixed) continue;
  }
  return result;
}

function createInitialKnockout(ids, qualifierData = []) {
  const participants = ids.filter(Boolean);
  if (participants.length < 2) return;
  const size = nextPowerOfTwo(participants.length);
  let slots = standardSeedOrder(size).map(seed => participants[seed-1] || null);
  slots = avoidSameGroupFirstRound(slots, qualifierData);
  state.knockout = {
    status: 'active',
    qualifiers: qualifierData,
    bracketSize: size,
    championId: null,
    generatedAt: new Date().toISOString(),
    completedAt: null
  };
  createKnockoutRoundFromSlots(slots, 1);
}

function createKnockoutRoundFromSlots(slots, bracketRound) {
  const normalizedSlots = slots.length && (slots.length & (slots.length - 1)) === 0
    ? slots.slice()
    : [...slots, ...Array(nextPowerOfTwo(slots.length) - slots.length).fill(null)];
  const stageKey = stageKeyForSize(normalizedSlots.length);
  for(let i=0;i<normalizedSlots.length;i+=2){
    const a=normalizedSlots[i] || null;
    const b=normalizedSlots[i+1] || null;
    if (!a && !b) continue;
    const m=newMatch(a,b,bracketRound,null,bracketRound,{
      phase:'knockout',
      stageKey,
      legsToWin:knockoutLegsForStage(stageKey)
    });
    if(!a || !b){
      m.status='completed';
      m.legsA=0;
      m.legsB=0;
      m.winnerId=a || b;
      m.bye=true;
      m.completedAt=new Date().toISOString();
    }
    state.matches.push(m);
  }
  progressKnockout();
}

function progressGroupToKnockout() {
  if(state.settings.format!=='groups') return null;
  if(state.matches.some(m=>m.bracketRound)) return null;
  const groupMatches=state.matches.filter(m=>m.phase==='group' || (m.group && !m.bracketRound));
  if(!groupMatches.length || groupMatches.some(m=>m.status!=='completed')) return null;
  const qualifiersPerGroup=Math.max(1,Number(state.settings.qualifiersPerGroup)||1);
  const qualifierData=[];
  for(const group of groupNames()){
    const rows=computeStandings(group);
    if(rows.length<qualifiersPerGroup) return null;
    rows.slice(0,qualifiersPerGroup).forEach((row,index)=>qualifierData.push({
      playerId:row.playerId,
      group,
      position:index+1,
      points:row.points,
      diff:row.diff,
      legsFor:row.legsFor,
      average:row.average
    }));
  }
  qualifierData.sort((a,b)=>a.position-b.position || b.points-a.points || b.diff-a.diff || b.legsFor-a.legsFor || b.average-a.average || a.group.localeCompare(b.group,'pl'));
  createInitialKnockout(qualifierData.map(item=>item.playerId),qualifierData);
  return 'knockout-created';
}

function progressKnockout() {
  if(!['knockout','groups'].includes(state.settings.format)) return null;
  const rounds=[...new Set(state.matches.filter(m=>m.bracketRound).map(m=>m.bracketRound))];
  if(!rounds.length) return null;
  const latest=Math.max(...rounds);
  const current=state.matches.filter(m=>m.bracketRound===latest);
  if(!current.length||current.some(m=>m.status!=='completed')) return null;
  const winners=current.map(m=>m.winnerId).filter(Boolean);
  if(winners.length===1){
    state.knockout={
      ...(state.knockout||{}),
      status:'completed',
      championId:winners[0],
      completedAt:new Date().toISOString()
    };
    return 'knockout-completed';
  }
  if(state.matches.some(m=>m.bracketRound===latest+1)) return null;
  createKnockoutRoundFromSlots(winners,latest+1);
  return 'next-knockout-round';
}

function progressCompetition() {
  const groupProgress = progressGroupToKnockout();
  if (groupProgress) return groupProgress;
  return progressKnockout();
}

function knockoutRoundLabel(round) {
  const match = state.matches.find(item=>item.bracketRound===round);
  return knockoutStageLabel(match?.stageKey);
}

function shuffle(array) {
  for(let i=array.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[array[i],array[j]]=[array[j],array[i]];}
  return array;
}

function startMatch(id) {
  if (!ensureCompetitionOpen()) return;
  const match=state.matches.find(m=>m.id===id); if(!match) return;
  if(state.live && state.live.matchId!==id && !confirm('Inny mecz jest rozpoczęty. Zastąpić go nowym meczem?')) return;
  if(!state.live || state.live.matchId!==id) state.live=createLive(match);
  match.status='live';
  saveState(); route='scorer'; render();
}

function createLive(match) {
  const startScore = matchStartScore(match);
  const legsToWin = matchLegsToWin(match);
  return {
    matchId:match.id,playerA:match.playerA,playerB:match.playerB,
    initialStarterId:match.playerA,legStarterId:match.playerA,currentPlayerId:match.playerA,
    startScore,legsToWin,
    remaining:{[match.playerA]:startScore,[match.playerB]:startScore},
    legs:{[match.playerA]:0,[match.playerB]:0},legNumber:1,visits:[],legRecords:[],undo:[],startedAt:new Date().toISOString()
  };
}

function manualResult(id) {
  if (!ensureCompetitionOpen()) return;
  const match=state.matches.find(m=>m.id===id); if(!match) return;
  const target=matchLegsToWin(match);
  const a=prompt(`Liczba legów: ${playerName(match.playerA)} (mecz do ${target})`, String(match.legsA||0)); if(a===null)return;
  const b=prompt(`Liczba legów: ${playerName(match.playerB)} (mecz do ${target})`, String(match.legsB||0)); if(b===null)return;
  const la=Number(a),lb=Number(b);
  if(!Number.isInteger(la)||!Number.isInteger(lb)||la<0||lb<0) return toast('Podaj prawidłowe liczby legów');
  if(match.bracketRound){
    if(la===lb) return toast('W fazie pucharowej nie może być remisu');
    if(Math.max(la,lb)!==target || Math.min(la,lb)>=target) return toast(`Zwycięzca tego etapu musi zdobyć dokładnie ${target} legów`);
  }
  match.legsA=la;match.legsB=lb;match.status='completed';match.winnerId=la===lb?null:(la>lb?match.playerA:match.playerB);match.stats=null;match.completedAt=new Date().toISOString();
  if(state.live?.matchId===id) state.live=null;
  const progress=progressCompetition();
  saveState();render();
  if(progress==='knockout-created') toast('Grupy zakończone — utworzono fazę pucharową');
  else if(progress==='knockout-completed') toast(`Turniej wygrywa ${playerName(state.knockout.championId)}`);
  else toast('Wynik zapisany');
}

function reopenMatch(id) {
  if (!ensureCompetitionOpen()) return;
  const match=state.matches.find(m=>m.id===id); if(!match)return;
  if(!confirm('Usunąć wynik i ponownie otworzyć mecz?'))return;
  if(state.settings.format==='groups' && !match.bracketRound && state.matches.some(m=>m.bracketRound)){
    if(!confirm('Zmiana wyniku grupowego usunie wygenerowaną fazę pucharową i utworzy ją ponownie po zamknięciu grup. Kontynuować?'))return;
    state.matches=state.matches.filter(m=>!m.bracketRound);
    state.knockout={status:'waiting',qualifiers:[],bracketSize:0,championId:null,generatedAt:null,completedAt:null};
  } else if(match.bracketRound){
    const later=state.matches.filter(m=>(m.bracketRound||0)>(match.bracketRound||0));
    if(later.length&&!confirm('Zmiana wyniku w drabince usunie wszystkie późniejsze rundy. Kontynuować?'))return;
    state.matches=state.matches.filter(m=>!m.bracketRound || (m.bracketRound||0)<=(match.bracketRound||0));
    state.knockout={...(state.knockout||{}),status:'active',championId:null,completedAt:null};
  }
  match.status='planned';match.legsA=0;match.legsB=0;match.winnerId=null;match.stats=null;delete match.completedAt;
  saveState();render();
}

function snapshotLive() {
  const snap=clone(state.live);delete snap.undo;return snap;
}

function submitScore(event) {
  event.preventDefault();
  const live=state.live;if(!live)return;
  const input=$('#scoreInput');
  const entered=Number(input.value);
  if(!Number.isInteger(entered)||entered<0||entered>180)return toast('Wpisz wynik od 0 do 180');
  const pid=live.currentPlayerId,before=live.remaining[pid],after=before-entered;
  const bust=entered>before||after<0||after===1;
  const checkout=!bust&&after===0;
  if(checkout && live.legs[pid]+1>=Number(live.legsToWin || 2) && !confirm(`Checkout ${before}. Zakończyć mecz zwycięstwem ${playerName(pid)}?`)) return;
  live.undo.push(snapshotLive());
  if(live.undo.length>50)live.undo.shift();
  const darts=checkout?Number($('#checkoutDarts').value||3):3;
  const visit={playerId:pid,score:bust?0:entered,enteredScore:entered,darts,bust,checkout,remainingBefore:before,remainingAfter:bust?before:after,leg:live.legNumber,at:new Date().toISOString()};
  live.visits.push(visit);
  if(!bust)live.remaining[pid]=after;
  if(checkout){
    const winnerDarts=live.visits.filter(v=>v.leg===live.legNumber&&v.playerId===pid).reduce((s,v)=>s+v.darts,0);
    live.legRecords.push({leg:live.legNumber,winnerId:pid,darts:winnerDarts,checkout:before});
    live.legs[pid]++;
    if(live.legs[pid]>=Number(live.legsToWin || 2)){
      finalizeLiveMatch(pid);return;
    }
    live.legNumber++;
    live.remaining[live.playerA]=Number(live.startScore || 501);
    live.remaining[live.playerB]=Number(live.startScore || 501);
    const other=live.initialStarterId===live.playerA?live.playerB:live.playerA;
    live.legStarterId=live.legNumber%2===1?live.initialStarterId:other;
    live.currentPlayerId=live.legStarterId;
    toast(`Leg dla ${playerName(pid)}`);
  }else{
    live.currentPlayerId=pid===live.playerA?live.playerB:live.playerA;
  }
  saveState();render();setTimeout(()=>$('#scoreInput')?.focus(),0);
}

function finalizeLiveMatch(winnerId) {
  const live=state.live;
  const match=state.matches.find(m=>m.id===live.matchId);
  if(!match)return;
  match.legsA=live.legs[live.playerA];match.legsB=live.legs[live.playerB];match.winnerId=winnerId;match.status='completed';match.completedAt=new Date().toISOString();
  match.stats={
    [live.playerA]:summarizeLivePlayer(live.playerA),
    [live.playerB]:summarizeLivePlayer(live.playerB)
  };
  state.live=null;
  const progress=progressCompetition();
  saveState();route='matches';render();
  if(progress==='knockout-created') toast('Mecz zakończony. Grupy zamknięte — utworzono fazę pucharową');
  else if(progress==='knockout-completed') toast(`Turniej wygrywa ${playerName(winnerId)}`);
  else toast(`Mecz wygrywa ${playerName(winnerId)}`);
}

function summarizeLivePlayer(pid) {
  const visits=state.live.visits.filter(v=>v.playerId===pid);
  const totalScore=visits.reduce((s,v)=>s+v.score,0),totalDarts=visits.reduce((s,v)=>s+v.darts,0);
  const outs=visits.filter(v=>v.checkout).map(v=>v.remainingBefore);
  const wonLegs=state.live.legRecords.filter(l=>l.winnerId===pid).map(l=>l.darts);
  return {totalScore,totalDarts,average:totalDarts?totalScore/totalDarts*3:0,h100:visits.filter(v=>v.score>=100&&v.score<140).length,h140:visits.filter(v=>v.score>=140&&v.score<180).length,h180:visits.filter(v=>v.score===180).length,highOut:outs.length?Math.max(...outs):0,bestLeg:wonLegs.length?Math.min(...wonLegs):0};
}

function undoVisit() {
  const live=state.live;if(!live?.undo.length)return;
  const stack=live.undo.slice();const previous=stack.pop();state.live={...previous,undo:stack};saveState();render();toast('Cofnięto ostatnią wizytę');
}

function toggleLegStarter() {
  const live=state.live;if(!live)return;
  if(live.visits.some(v=>v.leg===live.legNumber))return;
  live.legStarterId=live.legStarterId===live.playerA?live.playerB:live.playerA;
  live.currentPlayerId=live.legStarterId;
  if(live.legNumber===1)live.initialStarterId=live.legStarterId;
  saveState();render();
}

function livePlayerStats(pid) {
  const visits=state.live.visits.filter(v=>v.playerId===pid);
  const total=visits.reduce((s,v)=>s+v.score,0),darts=visits.reduce((s,v)=>s+v.darts,0);
  return {average:darts?total/darts*3:0,darts,last:visits.length?(visits.at(-1).bust?'BUST':visits.at(-1).score):null};
}

function computeStandings(group='all') {
  const ids=state.players.filter(p=>group==='all'||p.group===group).map(p=>p.id);
  const rows=new Map(ids.map(id=>[id,{playerId:id,played:0,wins:0,draws:0,losses:0,legsFor:0,legsAgainst:0,diff:0,points:0,totalScore:0,totalDarts:0,average:0}]));
  state.matches.filter(m=>m.status==='completed'&&!m.bye&&(state.settings.format==='knockout'||!m.bracketRound)&&(group==='all'||m.group===group)).forEach(m=>{
    const a=rows.get(m.playerA),b=rows.get(m.playerB);if(!a||!b)return;
    a.played++;b.played++;a.legsFor+=m.legsA;a.legsAgainst+=m.legsB;b.legsFor+=m.legsB;b.legsAgainst+=m.legsA;
    if(m.legsA>m.legsB){a.wins++;b.losses++;a.points+=Number(state.settings.pointsWin);b.points+=Number(state.settings.pointsLoss||0);}else if(m.legsB>m.legsA){b.wins++;a.losses++;b.points+=Number(state.settings.pointsWin);a.points+=Number(state.settings.pointsLoss||0);}else{a.draws++;b.draws++;a.points+=Number(state.settings.pointsDraw);b.points+=Number(state.settings.pointsDraw);}
    [a,b].forEach((r,i)=>{const pid=i?m.playerB:m.playerA;const s=m.stats?.[pid];if(s){r.totalScore+=Number(s.totalScore||0);r.totalDarts+=Number(s.totalDarts||0);}});
  });
  rows.forEach(r=>{r.diff=r.legsFor-r.legsAgainst;r.average=r.totalDarts?r.totalScore/r.totalDarts*3:0;});
  return [...rows.values()].sort((a,b)=>b.points-a.points||b.diff-a.diff||b.legsFor-a.legsFor||b.average-a.average||playerName(a.playerId).localeCompare(playerName(b.playerId),'pl'));
}

function computePlayerStats() {
  const rows=new Map(state.players.map(p=>[p.id,{playerId:p.id,matches:0,legsWon:0,totalScore:0,totalDarts:0,h100:0,h140:0,h180:0,highOut:0,bestLeg:0,average:0}]));
  state.matches.filter(m=>m.status==='completed'&&!m.bye).forEach(m=>{
    [m.playerA,m.playerB].forEach((pid,index)=>{const r=rows.get(pid);if(!r)return;r.matches++;r.legsWon+=index?m.legsB:m.legsA;const s=m.stats?.[pid];if(!s)return;r.totalScore+=Number(s.totalScore||0);r.totalDarts+=Number(s.totalDarts||0);r.h100+=Number(s.h100||0);r.h140+=Number(s.h140||0);r.h180+=Number(s.h180||0);r.highOut=Math.max(r.highOut,Number(s.highOut||0));const best=Number(s.bestLeg||0);if(best&&(!r.bestLeg||best<r.bestLeg))r.bestLeg=best;});
  });
  rows.forEach(r=>r.average=r.totalDarts?r.totalScore/r.totalDarts*3:0);
  return [...rows.values()].sort((a,b)=>b.average-a.average||b.matches-a.matches||playerName(a.playerId).localeCompare(playerName(b.playerId),'pl'));
}

function signed(value) { return value>0?`+${value}`:String(value); }

function loadDemo() {
  if((state.players.length||state.matches.length)&&!confirm('Dane demo zastąpią tylko aktualnie otwartą rozgrywkę. Pozostałe ligi i turnieje pozostaną bez zmian. Kontynuować?'))return;
  const currentId = state.id;
  const currentCreatedAt = state.createdAt;
  const currentStartedAt = state.startedAt;
  state = defaultCompetition({id:currentId,createdAt:currentCreatedAt,startedAt:currentStartedAt,status:'active'});
  state.settings.competitionName='Piątkowa Liga Darta';state.settings.format='league';
  ['Michał','Andrzej','Kamil','Piotr','Łukasz','Tomasz'].forEach(name=>state.players.push({id:uid('p'),name,group:'',createdAt:new Date().toISOString()}));
  state.matches=roundRobin(state.players.map(p=>p.id),null);
  const samples=[[2,0],[2,1],[0,2],[1,2]];
  state.matches.slice(0,4).forEach((m,i)=>{m.legsA=samples[i][0];m.legsB=samples[i][1];m.status='completed';m.winnerId=m.legsA>m.legsB?m.playerA:m.playerB;m.completedAt=new Date(Date.now()-i*3600000).toISOString();m.stats={
    [m.playerA]:{totalScore:1350+i*30,totalDarts:75+i*3,average:54,h100:3+i,h140:1,h180:i===0?1:0,highOut:72+i*4,bestLeg:21+i},
    [m.playerB]:{totalScore:1190+i*25,totalDarts:78+i*3,average:45.7,h100:2,h140:i%2,h180:0,highOut:56+i*3,bestLeg:24+i}
  };});
  saveState();render();toast('Dane demo wczytane do aktualnej rozgrywki');
}

function exportData() {
  saveState();
  const blob=new Blob([JSON.stringify(hub,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`dartliga-archiwum-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);toast('Kopia całego archiwum pobrana');
}

function importData(event) {
  const file=event.target.files?.[0];if(!file)return;
  const reader=new FileReader();reader.onload=()=>{try{
    const imported=JSON.parse(reader.result);
    let nextHub;
    if(Array.isArray(imported.competitions)){
      const competitions=imported.competitions.map(normalizeCompetition);
      if(!competitions.length)throw new Error('format');
      nextHub={...imported,version:APP_VERSION,competitions,activeCompetitionId:competitions.some(c=>c.id===imported.activeCompetitionId)?imported.activeCompetitionId:competitions[0].id};
    }else if(imported.settings&&Array.isArray(imported.players)&&Array.isArray(imported.matches)){
      const competition=normalizeCompetition(imported);
      nextHub={version:APP_VERSION,activeCompetitionId:competition.id,competitions:[competition],createdAt:competition.createdAt,updatedAt:new Date().toISOString()};
    }else throw new Error('format');
    if(!confirm('Import zastąpi całe obecne archiwum rozgrywek. Kontynuować?'))return;
    hub=nextHub;
    state=hub.competitions.find(c=>c.id===hub.activeCompetitionId)||hub.competitions[0];
    progressCompetition();
    saveState();route='home';render();toast('Archiwum danych zaimportowane');
  }catch(e){console.error(e);toast('Nieprawidłowy plik kopii');}};reader.readAsText(file);
}

function resetAll() {
  if(!confirm('Usunąć całe archiwum: wszystkie ligi, turnieje, zawodników i wyniki?'))return;
  if(!confirm('To ostatnie potwierdzenie. Tej operacji nie można cofnąć.'))return;
  hub=defaultHub();state=hub.competitions[0];saveHub();route='home';render();toast('Całe archiwum zostało usunięte');
}

function updateInstallButton() {
  const btn=$('#installBtn');if(btn)btn.style.display=deferredInstallPrompt?'block':'none';
}

async function installApp() {
  if(!deferredInstallPrompt)return toast('Instalacja będzie dostępna po uruchomieniu przez HTTPS lub localhost');
  deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;render();
}

window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;updateInstallButton();});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;toast('Aplikacja została zainstalowana');});

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=1.2.0').catch(console.error));}

if (progressCompetition()) saveState();
render();

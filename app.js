'use strict';

const LEGACY_STORAGE_KEY = 'dartliga_pwa_state_v1';
const STORAGE_KEY = 'dartliga_pwa_hub_v2';
const APP_VERSION = '1.6.1';
let route = 'home';
let matchFilter = 'all';
let tableGroup = 'all';
let competitionFilter = 'all';
let liveFilter = 'all';
let liveSearch = '';
let deferredInstallPrompt = null;
let newCompetitionPanelOpen = false;
let trainingSetupType = null;
let dartbotTimer = null;

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
      setsToWin: 0,
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
    singleMatches: [],
    singleLive: null,
    trainingSessions: [],
    trainingLive: null,
    trainingProfileName: '',
    createdAt: competition.createdAt,
    updatedAt: competition.updatedAt
  };
}

function normalizeSingleLive(value) {
  if (!value || typeof value !== 'object') return null;
  const playerA = value.playerA || uid('single_a');
  const playerB = value.playerB || uid('single_b');
  const startScore = Math.max(2, Number(value.startScore) || 501);
  const legsToWin = Math.max(1, Number(value.legsToWin) || 2);
  const setsToWin = Math.max(0, Number(value.setsToWin) || 0);
  const playerNames = {
    [playerA]: String(value.playerNames?.[playerA] || value.playerAName || 'Gracz 1'),
    [playerB]: String(value.playerNames?.[playerB] || value.playerBName || 'Gracz 2')
  };
  const starter = [playerA, playerB].includes(value.initialStarterId) ? value.initialStarterId : playerA;
  const legs = {
    [playerA]: Math.max(0, Number(value.legs?.[playerA]) || 0),
    [playerB]: Math.max(0, Number(value.legs?.[playerB]) || 0)
  };
  const sets = {
    [playerA]: Math.max(0, Number(value.sets?.[playerA]) || 0),
    [playerB]: Math.max(0, Number(value.sets?.[playerB]) || 0)
  };
  const totalLegs = {
    [playerA]: Math.max(0, Number(value.totalLegs?.[playerA]) || (setsToWin ? 0 : legs[playerA])),
    [playerB]: Math.max(0, Number(value.totalLegs?.[playerB]) || (setsToWin ? 0 : legs[playerB]))
  };
  return {
    ...value,
    mode: 'single',
    matchId: value.matchId || uid('single_match'),
    title: String(value.title || 'Pojedynczy mecz'),
    playerA,
    playerB,
    playerNames,
    initialStarterId: starter,
    legStarterId: [playerA, playerB].includes(value.legStarterId) ? value.legStarterId : starter,
    currentPlayerId: [playerA, playerB].includes(value.currentPlayerId) ? value.currentPlayerId : starter,
    startScore,
    legsToWin,
    setsToWin,
    doubleOut: value.doubleOut !== false,
    remaining: {
      [playerA]: Number(value.remaining?.[playerA]) >= 0 ? Number(value.remaining[playerA]) : startScore,
      [playerB]: Number(value.remaining?.[playerB]) >= 0 ? Number(value.remaining[playerB]) : startScore
    },
    legs,
    sets,
    totalLegs,
    setNumber: Math.max(1, Number(value.setNumber) || 1),
    legNumber: Math.max(1, Number(value.legNumber) || 1),
    visits: Array.isArray(value.visits) ? value.visits : [],
    legRecords: Array.isArray(value.legRecords) ? value.legRecords : [],
    undo: Array.isArray(value.undo) ? value.undo : [],
    pendingDarts: Array.isArray(value.pendingDarts) ? value.pendingDarts : [],
    pendingSegment: Number.isInteger(Number(value.pendingSegment)) && Number(value.pendingSegment) >= 1 && Number(value.pendingSegment) <= 20 ? Number(value.pendingSegment) : null,
    pendingMultiplier: ['S','D','T'].includes(value.pendingMultiplier) ? value.pendingMultiplier : 'S',
    startedAt: value.startedAt || new Date().toISOString()
  };
}

function normalizeSingleMatchRecord(value = {}) {
  return {
    ...value,
    id: value.id || value.matchId || uid('single_result'),
    title: String(value.title || 'Pojedynczy mecz'),
    playerAName: String(value.playerAName || 'Gracz 1'),
    playerBName: String(value.playerBName || 'Gracz 2'),
    startScore: Math.max(2, Number(value.startScore) || 501),
    legsToWin: Math.max(1, Number(value.legsToWin) || 2),
    setsToWin: Math.max(0, Number(value.setsToWin) || 0),
    doubleOut: value.doubleOut !== false,
    legsA: Math.max(0, Number(value.legsA) || 0),
    legsB: Math.max(0, Number(value.legsB) || 0),
    setsA: Math.max(0, Number(value.setsA) || 0),
    setsB: Math.max(0, Number(value.setsB) || 0),
    statsA: value.statsA || {},
    statsB: value.statsB || {},
    startedAt: value.startedAt || value.completedAt || new Date().toISOString(),
    completedAt: value.completedAt || new Date().toISOString()
  };
}


const TRAINING_CATALOG = [
  {
    id: 'bobs27',
    name: 'Bob’s 27',
    category: 'Double',
    duration: '10–15 min',
    goal: 'Skuteczność na wszystkich podwójnych.',
    description: 'Zaczynasz od 27 punktów i przechodzisz kolejno przez D1–D20 oraz Bull.'
  },
  {
    id: 'checkout121',
    name: '121',
    category: 'Checkout',
    duration: '10–20 min',
    goal: 'Kończenie wysokich wyników i reagowanie po nietrafionej pierwszej lotce.',
    description: 'Zamykaj kolejne wyniki w limicie 6 lub 9 lotek, z opcjonalnymi poziomami bezpieczeństwa.'
  },
  {
    id: 'hundred',
    name: '100 lotek na sektor',
    category: 'Punktowanie',
    duration: '10–20 min',
    goal: 'Skupienie lotek i regularność na głównych polach punktowych.',
    description: 'Sektor trafiony singlem daje 1 pkt, doublem 2 pkt, a treblem 3 pkt.'
  },
  {
    id: 'jdc',
    name: 'JDC Challenge',
    category: 'Test kompleksowy',
    duration: '20–30 min',
    goal: 'Połączenie singli, double, trebli i pracy na całej tarczy.',
    description: 'Shanghai 10–15, double 1–20 i Bull, następnie Shanghai 15–20.'
  },
  {
    id: 'halveit',
    name: 'Halve-It',
    category: 'Presja',
    duration: '10–15 min',
    goal: 'Trafianie wskazanego pola wtedy, gdy jest to konieczne.',
    description: 'Brak trafienia w rundzie dzieli dotychczasowy wynik przez dwa.'
  },
  {
    id: 'dartbot',
    name: '501 przeciwko Dartbotowi',
    category: 'Mecz',
    duration: '20–40 min',
    goal: 'Przełożenie punktowania i checkoutów na warunki meczowe.',
    description: 'Rozegraj co najmniej 5 legów przeciwko przeciwnikowi dopasowanemu do swojej średniej.'
  },
  {
    id: 'session45',
    name: 'Optymalny trening 45-minutowy',
    category: 'Plan sesji',
    duration: '45 min',
    goal: 'Kompletna sesja: rozgrzewka, punktowanie, double, checkout i mecz.',
    description: 'Aplikacja prowadzi przez pięć kolejnych bloków i zapisuje wykonanie całej sesji.'
  }
];

const BOBS_TARGETS = [
  ...Array.from({length:20}, (_,index)=>({label:`D${index+1}`, value:(index+1)*2})),
  {label:'Bull', value:50}
];

const HALVE_IT_TARGETS = [
  {label:'20', help:'Punkty zdobyte wyłącznie w sektorze 20.'},
  {label:'19', help:'Punkty zdobyte wyłącznie w sektorze 19.'},
  {label:'18', help:'Punkty zdobyte wyłącznie w sektorze 18.'},
  {label:'Dowolny double', help:'Liczą się wyłącznie trafione pola podwójne.'},
  {label:'17', help:'Punkty zdobyte wyłącznie w sektorze 17.'},
  {label:'16', help:'Punkty zdobyte wyłącznie w sektorze 16.'},
  {label:'Dowolny treble', help:'Liczą się wyłącznie trafione pola potrójne.'},
  {label:'15', help:'Punkty zdobyte wyłącznie w sektorze 15.'},
  {label:'Bull', help:'Outer Bull = 25, Bullseye = 50.'}
];

const SESSION_45_STAGES = [
  {minutes:5, title:'Rozgrzewka', instruction:'Spokojnie rzucaj na duże single i Bull. Skup się na rytmie, postawie oraz powtarzalnym wypuszczeniu lotki.'},
  {minutes:10, title:'Punktowanie', instruction:'Wykonaj 100 lotek na 20 albo wariant ze zmianą sektorów 20–19–18. Zapisz wynik lub najważniejszą obserwację.'},
  {minutes:10, title:'Bob’s 27', instruction:'Przejdź przez kolejne double. Zapisz wynik końcowy, ostatnie pole i łączną liczbę trafień.'},
  {minutes:10, title:'Checkout', instruction:'Ćwicz zakres 61–80 albo zagraj w 121. Reaguj po każdej nietrafionej pierwszej lotce.'},
  {minutes:10, title:'Mecz 501', instruction:'Rozegraj 2–3 legi przeciwko Dartbotowi z pełnym Double Out.'}
];

function trainingDefinition(type) {
  return TRAINING_CATALOG.find(item=>item.id===type) || TRAINING_CATALOG[0];
}

function normalizeTrainingSession(value = {}) {
  const type = TRAINING_CATALOG.some(item=>item.id===value.type) ? value.type : 'bobs27';
  return {
    ...value,
    id: value.id || uid('training'),
    type,
    playerName: String(value.playerName || 'Zawodnik'),
    settings: value.settings && typeof value.settings === 'object' ? value.settings : {},
    summary: value.summary && typeof value.summary === 'object' ? value.summary : {},
    data: value.data && typeof value.data === 'object' ? value.data : {},
    startedAt: value.startedAt || value.completedAt || new Date().toISOString(),
    completedAt: value.completedAt || new Date().toISOString()
  };
}


function normalizeDartbotTrainingData(value = {}, settings = {}) {
  const startScore = Math.max(2, Number(settings.startScore) || Number(value.startScore) || 501);
  const playerA = value.playerA || uid('dartbot_player');
  const playerB = value.playerB || uid('dartbot_bot');
  const legacyVisits = Array.isArray(value.visits) ? value.visits : [];
  const visits = legacyVisits.map((visit, index) => {
    if (visit?.playerId) return visit;
    const playerId = visit?.who === 'bot' ? playerB : playerA;
    const remainingAfter = Number(visit?.remaining);
    const score = Math.max(0, Number(visit?.score) || 0);
    const bust = Boolean(visit?.bust);
    const after = Number.isFinite(remainingAfter) ? remainingAfter : startScore;
    const before = bust ? after : after + score;
    return {
      playerId,
      score,
      enteredScore: score,
      darts: Math.max(1, Math.min(3, Number(visit?.darts) || 3)),
      bust,
      checkout: Boolean(visit?.checkout),
      remainingBefore: before,
      remainingAfter: after,
      throws: Array.isArray(visit?.throws) ? visit.throws : [],
      notation: visit?.notation || String(score),
      leg: Math.max(1, Number(visit?.leg) || 1),
      at: visit?.at || new Date().toISOString(),
      targetAverage: Number(visit?.targetAverage) || null
    };
  });
  const legs = {
    [playerA]: Math.max(0, Number(value.legs?.[playerA] ?? value.playerLegs) || 0),
    [playerB]: Math.max(0, Number(value.legs?.[playerB] ?? value.botLegs) || 0)
  };
  const completedLegs = Math.max(0, Number(value.completedLegs) || legs[playerA] + legs[playerB]);
  const initialStarterId = [playerA, playerB].includes(value.initialStarterId) ? value.initialStarterId : playerA;
  const legacyTurn = value.turn === 'bot' ? playerB : playerA;
  const currentPlayerId = [playerA, playerB].includes(value.currentPlayerId) ? value.currentPlayerId : legacyTurn;
  return {
    ...value,
    mode: 'dartbot-training',
    playerA,
    playerB,
    startScore,
    legsToWin: Math.max(1, Math.ceil((Number(settings.legsCount) || 5) / 2)),
    doubleOut: true,
    initialStarterId,
    legStarterId: [playerA, playerB].includes(value.legStarterId) ? value.legStarterId : initialStarterId,
    currentPlayerId,
    remaining: {
      [playerA]: Number(value.remaining?.[playerA]) >= 0 ? Number(value.remaining[playerA]) : Math.max(0, Number(value.playerRemaining) || startScore),
      [playerB]: Number(value.remaining?.[playerB]) >= 0 ? Number(value.remaining[playerB]) : Math.max(0, Number(value.botRemaining) || startScore)
    },
    legs,
    completedLegs,
    legNumber: Math.max(1, Number(value.legNumber) || completedLegs + 1),
    visits,
    legRecords: Array.isArray(value.legRecords) ? value.legRecords : [],
    undo: Array.isArray(value.undo) ? value.undo : [],
    pendingDarts: Array.isArray(value.pendingDarts) ? value.pendingDarts : [],
    pendingSegment: Number.isInteger(Number(value.pendingSegment)) && Number(value.pendingSegment) >= 1 && Number(value.pendingSegment) <= 20 ? Number(value.pendingSegment) : null,
    pendingMultiplier: ['S','D','T'].includes(value.pendingMultiplier) ? value.pendingMultiplier : 'S',
    botCheckoutDartsLeft: value.botCheckoutDartsLeft === null || value.botCheckoutDartsLeft === undefined ? null : (Number.isFinite(Number(value.botCheckoutDartsLeft)) ? Math.max(0, Number(value.botCheckoutDartsLeft)) : null),
    botCheckoutPlan: Array.isArray(value.botCheckoutPlan) ? value.botCheckoutPlan : [],
    botCheckoutStartedAt: Number(value.botCheckoutStartedAt) || null,
    botTargetAverage: Number(value.botTargetAverage) || Number(settings.botAverage) || 50,
    botThinking: false,
    startedAt: value.startedAt || new Date().toISOString()
  };
}

function normalizeTrainingLive(value) {
  if (!value || typeof value !== 'object') return null;
  const type = TRAINING_CATALOG.some(item=>item.id===value.type) ? value.type : 'bobs27';
  const rawSettings = value.settings && typeof value.settings === 'object' ? value.settings : {};
  const settings = type === 'dartbot' ? {
    ...rawSettings,
    legsCount: Math.max(5, Number(rawSettings.legsCount) || 5),
    startScore: Math.max(2, Number(rawSettings.startScore) || 501),
    botAverage: Math.max(20, Math.min(110, Number(rawSettings.botAverage) || 50)),
    botAdvantagePct: Math.max(0, Math.min(50, Number(rawSettings.botAdvantagePct) || 10)),
    checkoutThreshold: Math.max(2, Math.min(170, Number(rawSettings.checkoutThreshold) || 100)),
    checkoutDarts: Math.max(3, Math.min(30, Number(rawSettings.checkoutDarts) || 9))
  } : rawSettings;
  return {
    ...value,
    id: value.id || uid('training_live'),
    type,
    playerName: String(value.playerName || 'Zawodnik'),
    settings,
    data: type === 'dartbot'
      ? normalizeDartbotTrainingData(value.data || {}, settings)
      : (value.data && typeof value.data === 'object' ? value.data : {}),
    startedAt: value.startedAt || new Date().toISOString()
  };
}
function trainingMetric(session) {
  const summary = session?.summary || {};
  switch (session?.type) {
    case 'bobs27': return {label:'Wynik końcowy', value:Number(summary.finalScore)||0, suffix:' pkt'};
    case 'checkout121': return {label:'Najwyższy wynik', value:Number(summary.highestTarget)||0, suffix:''};
    case 'hundred': return {label:'Wynik', value:Number(summary.score)||0, suffix:' pkt'};
    case 'jdc': return {label:'Wynik JDC', value:Number(summary.score)||0, suffix:' pkt'};
    case 'halveit': return {label:'Wynik końcowy', value:Number(summary.finalScore)||0, suffix:' pkt'};
    case 'dartbot': return {label:'Średnia 3-dart', value:Number(summary.playerAverage)||0, suffix:''};
    case 'session45': return {label:'Wykonane bloki', value:Number(summary.completedStages)||0, suffix:'/5'};
    default: return {label:'Wynik', value:0, suffix:''};
  }
}

function normalizeCompetitionLive(value, match = {}, settings = {}) {
  if (!value || typeof value !== 'object') return null;
  const playerA = value.playerA || match.playerA;
  const playerB = value.playerB || match.playerB;
  if (!playerA || !playerB) return null;
  const startScore = Math.max(2, Number(value.startScore) || Number(match.startScore) || Number(settings.startScore) || 501);
  const legsToWin = Math.max(1, Number(value.legsToWin) || Number(match.legsToWin) || Number(settings.legsToWin) || 2);
  const setsToWin = Math.max(0, Number(value.setsToWin ?? match.setsToWin ?? settings.setsToWin) || 0);
  const starter = [playerA, playerB].includes(value.initialStarterId) ? value.initialStarterId : playerA;
  const legs = {
    [playerA]: Math.max(0, Number(value.legs?.[playerA]) || 0),
    [playerB]: Math.max(0, Number(value.legs?.[playerB]) || 0)
  };
  const sets = {
    [playerA]: Math.max(0, Number(value.sets?.[playerA]) || 0),
    [playerB]: Math.max(0, Number(value.sets?.[playerB]) || 0)
  };
  const totalLegs = {
    [playerA]: Math.max(0, Number(value.totalLegs?.[playerA]) || (setsToWin ? 0 : legs[playerA])),
    [playerB]: Math.max(0, Number(value.totalLegs?.[playerB]) || (setsToWin ? 0 : legs[playerB]))
  };
  return {
    ...value,
    matchId: value.matchId || match.id,
    playerA,
    playerB,
    initialStarterId: starter,
    legStarterId: [playerA, playerB].includes(value.legStarterId) ? value.legStarterId : starter,
    currentPlayerId: [playerA, playerB].includes(value.currentPlayerId) ? value.currentPlayerId : starter,
    startScore,
    legsToWin,
    setsToWin,
    doubleOut: value.doubleOut !== undefined ? value.doubleOut !== false : settings.doubleOut !== false,
    remaining: {
      [playerA]: Number(value.remaining?.[playerA]) >= 0 ? Number(value.remaining[playerA]) : startScore,
      [playerB]: Number(value.remaining?.[playerB]) >= 0 ? Number(value.remaining[playerB]) : startScore
    },
    legs,
    sets,
    totalLegs,
    setNumber: Math.max(1, Number(value.setNumber) || 1),
    legNumber: Math.max(1, Number(value.legNumber) || 1),
    visits: Array.isArray(value.visits) ? value.visits : [],
    legRecords: Array.isArray(value.legRecords) ? value.legRecords : [],
    undo: Array.isArray(value.undo) ? value.undo : [],
    pendingDarts: Array.isArray(value.pendingDarts) ? value.pendingDarts : [],
    pendingSegment: Number.isInteger(Number(value.pendingSegment)) && Number(value.pendingSegment) >= 1 && Number(value.pendingSegment) <= 20 ? Number(value.pendingSegment) : null,
    pendingMultiplier: ['S','D','T'].includes(value.pendingMultiplier) ? value.pendingMultiplier : 'S',
    startedAt: value.startedAt || new Date().toISOString(),
    updatedAt: value.updatedAt || value.startedAt || new Date().toISOString()
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
    competition.live = normalizeCompetitionLive(competition.live, liveMatch || {}, competition.settings);
    if (competition.live && liveMatch) {
      liveMatch.liveData = clone(competition.live);
      liveMatch.status = 'live';
    }
  }
  const fallbackLive = competition.matches.find(match => match.status === 'live' && match.liveData);
  if (!competition.live && fallbackLive) competition.live = clone(fallbackLive.liveData);
  return competition;
}

function normalizeMatch(match = {}, settings = {}) {
  const bracket = Boolean(match.bracketRound);
  const stageKey = match.stageKey || null;
  const normalized = {
    ...match,
    phase: match.phase || (bracket ? 'knockout' : (match.group ? 'group' : 'league')),
    stageKey,
    startScore: Number(match.startScore) || Number(settings.startScore) || 501,
    legsToWin: Number(match.legsToWin) || (bracket ? knockoutLegsForStage(stageKey, settings) : Number(settings.legsToWin) || 2),
    setsToWin: Math.max(0, Number(match.setsToWin ?? settings.setsToWin) || 0),
    legsA: Math.max(0, Number(match.legsA) || 0),
    legsB: Math.max(0, Number(match.legsB) || 0),
    setsA: Math.max(0, Number(match.setsA) || 0),
    setsB: Math.max(0, Number(match.setsB) || 0)
  };
  normalized.liveData = normalizeCompetitionLive(match.liveData, normalized, settings);
  return normalized;
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
          competitions,
          singleMatches: Array.isArray(parsed.singleMatches) ? parsed.singleMatches.map(normalizeSingleMatchRecord) : [],
          singleLive: normalizeSingleLive(parsed.singleLive),
          trainingSessions: Array.isArray(parsed.trainingSessions) ? parsed.trainingSessions.map(normalizeTrainingSession) : [],
          trainingLive: normalizeTrainingLive(parsed.trainingLive),
          trainingProfileName: String(parsed.trainingProfileName || '')
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
        singleMatches: [],
        singleLive: null,
        trainingSessions: [],
        trainingLive: null,
        trainingProfileName: '',
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

function isSingleScorer() {
  return route === 'singleScorer';
}


function isDartbotScorer() {
  return route === 'trainingRun' && hub.trainingLive?.type === 'dartbot';
}
function scorerLive() {
  if (isSingleScorer()) return hub.singleLive;
  if (isDartbotScorer()) return hub.trainingLive?.data || null;
  return state.live;
}
function scorerPlayerName(id) {
  const live = scorerLive();
  if (isSingleScorer()) return live?.playerNames?.[id] || 'Gracz';
  if (isDartbotScorer()) {
    if (id === live?.playerA) return hub.trainingLive?.playerName || 'Zawodnik';
    if (id === live?.playerB) return `Dartbot +${Number(hub.trainingLive?.settings?.botAdvantagePct) || 0}%`;
    return 'Dartbot';
  }
  return playerName(id);
}
function saveScorerState() {
  if (isSingleScorer() || isDartbotScorer()) saveHub();
  else saveState();
}
function scorerDoubleOut(live = scorerLive()) {
  if (isDartbotScorer()) return true;
  if (live?.doubleOut !== undefined) return live.doubleOut !== false;
  return state.settings.doubleOut !== false;
}
function saveHub() {
  hub.version = APP_VERSION;
  hub.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hub));
}

saveHub();

function syncActiveCompetitionLive() {
  if (!state?.live?.matchId) return;
  const match = state.matches.find(item => item.id === state.live.matchId);
  if (!match) return;
  state.live.updatedAt = new Date().toISOString();
  match.liveData = clone(state.live);
  match.status = 'live';
}

function saveState() {
  syncActiveCompetitionLive();
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

function matchSetsToWin(match, settings = state?.settings || {}) {
  return Math.max(0, Number(match?.setsToWin ?? settings.setsToWin) || 0);
}

function liveUsesSets(live) {
  return Math.max(0, Number(live?.setsToWin) || 0) > 0;
}

function matchRuleText(legsToWin, setsToWin = 0) {
  const legs = Math.max(1, Number(legsToWin) || 1);
  const sets = Math.max(0, Number(setsToWin) || 0);
  const legLabel = legs === 1 ? 'wygranego lega' : 'wygranych legów';
  const setLabel = sets === 1 ? 'wygranego seta' : 'wygranych setów';
  return sets > 0
    ? `Pierwszy do ${sets} ${setLabel} · set do ${legs} ${legLabel}`
    : `Pierwszy do ${legs} ${legLabel}`;
}

function matchStartScore(match, settings = state?.settings || {}) {
  return Number(match?.startScore) || Number(settings.startScore) || 501;
}

function competitionFormatSummary(competition = state) {
  const settings = competition.settings;
  const setsToWin = Math.max(0, Number(settings.setsToWin) || 0);
  if (settings.format === 'groups') {
    const rules = setsToWin > 0
      ? `set do ${settings.legsToWin} legów · do ${setsToWin} setów`
      : `do ${settings.legsToWin} legów`;
    return `${settings.startScore} · grupy ${rules} · awans ${settings.qualifiersPerGroup} z grupy · puchar z różnymi limitami legów`;
  }
  if (settings.format === 'knockout') {
    return `${settings.startScore} · liczba legów zależna od etapu${setsToWin > 0 ? ` · do ${setsToWin} setów` : ''}`;
  }
  return setsToWin > 0
    ? `${settings.startScore} · set do ${settings.legsToWin} legów · do ${setsToWin} setów`
    : `${settings.startScore} · do ${settings.legsToWin} wygranych legów`;
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
  const activeRoute = route === 'scorer' ? 'live' : (route === 'singleScorer' ? 'single' : (route === 'trainingRun' || route === 'trainingSetup' ? 'training' : route));
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
          ${navButton('live','●','Na żywo')}
          ${navButton('single','◎','Pojedynczy mecz')}
          ${navButton('training','◈','Trening')}
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
        ${mobileNav('live','●','Live')}
        ${mobileNav('single','◎','1 mecz')}
        ${mobileNav('training','◈','Trening')}
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
  const activeRoute = route === 'scorer' ? 'live' : (route === 'singleScorer' ? 'single' : (route === 'trainingRun' || route === 'trainingSetup' ? 'training' : route));
  return `<button data-route="${id}" class="${activeRoute === id ? 'active' : ''}"><span>${icon}</span>${label}</button>`;
}

function renderRoute() {
  switch (route) {
    case 'home': return renderHome();
    case 'competition': return renderCompetition();
    case 'matches': return renderMatches();
    case 'live': return renderLiveCenter();
    case 'single': return renderSingleMatch();
    case 'singleScorer': return renderScorer();
    case 'training': return renderTraining();
    case 'trainingSetup': return renderTrainingSetup();
    case 'trainingRun': return renderTrainingRun();
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
        <div class="field" data-league-groups-field><label>Wygrane legi w meczu / secie</label><input type="number" name="legsToWin" min="1" max="15" value="${defaults.legsToWin}"><small class="field-help">Przy grze setowej jest to liczba legów potrzebnych do wygrania seta.</small></div>
        <div class="field"><label>Wygrane sety do zwycięstwa</label><input type="number" name="setsToWin" min="0" max="15" value="${defaults.setsToWin || 0}"><small class="field-help">Wpisz 0, aby grać wyłącznie na legi jak dotychczas.</small></div>
        <div class="field" data-groups-field hidden><label>Liczba grup</label><input type="number" name="groupsCount" min="2" max="12" value="${defaults.groupsCount}"></div>
        <div class="field" data-groups-field hidden><label>Awans z każdej grupy</label><input type="number" name="qualifiersPerGroup" min="1" max="16" value="${defaults.qualifiersPerGroup}"><small class="field-help">Tylu najlepszych zawodników z każdej grupy przejdzie automatycznie do drabinki.</small></div>
        <div class="wide knockout-settings-panel" data-knockout-fields hidden>
          <div class="section-head"><div><h3>Wygrane legi w fazie pucharowej</h3><p class="muted">Każdy etap może mieć inną długość. Przy grze setowej podana liczba dotyczy jednego seta.</p></div></div>
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
  const liveMatches = state.matches.filter(m => m.status === 'live' && !m.bye).length;
  const canRegenerate = hasSchedule && completedMatches === 0 && liveMatches === 0;
  const format = state.settings.format;
  const structureLocked = hasSchedule;
  return `
    ${pageHeader('Konfiguracja', 'Rozgrywki i zawodnicy', 'Dla formatu grupowego aplikacja automatycznie utworzy fazę pucharową po zakończeniu wszystkich meczów grupowych.', `<button class="btn ghost" data-route="home">Moje rozgrywki</button><button class="btn primary" data-new-competition>+ Nowa rozgrywka</button><button class="btn info" id="loadDemo">Wczytaj dane demo</button>`)}
    ${hasSchedule ? `<div class="note safe-note"><strong>Zasady tej rozgrywki są zablokowane po wygenerowaniu terminarza.</strong> Dzięki temu liczba grup, awansów, setów i limit legów w poszczególnych etapach nie zmieni się w trakcie zawodów.</div>` : ''}
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
          <div class="field" data-current-league-groups ${format==='knockout'?'hidden':''}><label>Wygrane legi w meczu / secie</label><input type="number" name="legsToWin" min="1" max="15" value="${state.settings.legsToWin}" ${structureLocked?'disabled':''}><small class="field-help">Przy grze setowej jest to liczba legów potrzebnych do wygrania seta.</small></div>
          <div class="field"><label>Wygrane sety do zwycięstwa</label><input type="number" name="setsToWin" min="0" max="15" value="${Math.max(0,Number(state.settings.setsToWin)||0)}" ${structureLocked?'disabled':''}><small class="field-help">0 = mecz wyłącznie na legi. Wartość większa od 0 włącza sety.</small></div>
          <div class="field" data-current-groups ${format==='groups'?'':'hidden'}><label>Liczba grup</label><input type="number" name="groupsCount" min="2" max="12" value="${state.settings.groupsCount}" ${structureLocked?'disabled':''}></div>
          <div class="field" data-current-groups ${format==='groups'?'':'hidden'}><label>Awans z każdej grupy</label><input type="number" name="qualifiersPerGroup" min="1" max="16" value="${state.settings.qualifiersPerGroup}" ${structureLocked?'disabled':''}><small class="field-help">Po zakończeniu grup aplikacja wybierze tyle najwyżej sklasyfikowanych osób z każdej grupy.</small></div>
          <div class="field" data-current-points ${format==='knockout'?'hidden':''}><label>Punkty za zwycięstwo</label><input type="number" name="pointsWin" min="0" max="10" value="${state.settings.pointsWin}"></div>
          <div class="field" data-current-points ${format==='knockout'?'hidden':''}><label>Punkty za remis</label><input type="number" name="pointsDraw" min="0" max="10" value="${state.settings.pointsDraw}"></div>
          <div class="wide knockout-settings-panel" data-current-knockout ${format==='league'?'hidden':''}>
            <div class="section-head"><div><h3>Wygrane legi w fazie pucharowej</h3><p class="muted">Ustaw osobno każdy możliwy etap. Przy grze setowej liczba oznacza legi potrzebne do wygrania jednego seta.</p></div></div>
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

function competitionPlayerName(competition, id) {
  return competition?.players?.find(player => player.id === id)?.name || 'Zawodnik';
}

function genericLiveStats(live, playerId) {
  const visits = (live?.visits || []).filter(visit => visit.playerId === playerId);
  const totalScore = visits.reduce((sum, visit) => sum + Number(visit.score || 0), 0);
  const totalDarts = visits.reduce((sum, visit) => sum + Number(visit.darts || 0), 0);
  const last = visits.length ? (visits.at(-1).bust ? 'BUST' : visits.at(-1).score) : '—';
  return {average: totalDarts ? totalScore / totalDarts * 3 : 0, darts: totalDarts, last};
}

function allLiveEntries() {
  const entries = [];
  (hub.competitions || []).forEach(competition => {
    (competition.matches || []).filter(match => match.status === 'live' && !match.bye).forEach(match => {
      const isCurrent = competition.id === state.id && state.live?.matchId === match.id;
      const live = isCurrent ? state.live : match.liveData;
      if (!live) return;
      const roundLabel = match.bracketRound
        ? knockoutStageLabel(match.stageKey)
        : match.group
          ? `Grupa ${match.group} · kolejka ${match.round || 1}`
          : `Kolejka ${match.round || 1}`;
      entries.push({
        key:`competition:${competition.id}:${match.id}`,
        kind:'competition',
        competitionId:competition.id,
        matchId:match.id,
        title:competition.settings?.competitionName || 'Rozgrywka',
        subtitle:`${formatLabel(competition.settings?.format)} · ${roundLabel}`,
        rules:matchRuleText(live.legsToWin || matchLegsToWin(match, competition.settings), live.setsToWin ?? matchSetsToWin(match, competition.settings)),
        live,
        playerAName:competitionPlayerName(competition, live.playerA),
        playerBName:competitionPlayerName(competition, live.playerB),
        updatedAt:live.updatedAt || competition.updatedAt || live.startedAt
      });
    });
  });
  if (hub.singleLive) {
    const live = hub.singleLive;
    entries.push({
      key:`single:${live.matchId}`,
      kind:'single',
      title:live.title || 'Pojedynczy mecz',
      subtitle:'Pojedynczy mecz',
      rules:matchRuleText(live.legsToWin || 1, live.setsToWin || 0),
      live,
      playerAName:live.playerNames?.[live.playerA] || 'Gracz 1',
      playerBName:live.playerNames?.[live.playerB] || 'Gracz 2',
      updatedAt:live.updatedAt || live.startedAt
    });
  }
  if (hub.trainingLive?.type === 'dartbot' && hub.trainingLive.data) {
    const live = hub.trainingLive.data;
    entries.push({
      key:`dartbot:${hub.trainingLive.id}`,
      kind:'training',
      title:'501 przeciwko Dartbotowi',
      subtitle:'Trening meczowy',
      rules:`Sesja ${Number(hub.trainingLive.settings?.legsCount) || 5} legów`,
      live,
      playerAName:hub.trainingLive.playerName || 'Zawodnik',
      playerBName:`Dartbot +${Number(hub.trainingLive.settings?.botAdvantagePct) || 0}%`,
      updatedAt:live.updatedAt || hub.trainingLive.startedAt
    });
  }
  return entries.sort((a,b)=>String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function liveKindLabel(kind) {
  return kind === 'competition' ? 'Liga / turniej' : kind === 'single' ? 'Pojedynczy mecz' : 'Trening';
}

function liveStarterGraphic() {
  return `<span class="live-starter-graphic" title="Rozpoczynał aktualnego lega" aria-label="Rozpoczynał aktualnego lega">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="2.4"></circle><path d="M5 19L18.2 5.8M14.3 5.8h3.9v3.9"></path></svg>
  </span>`;
}

function liveTurnGraphic() {
  return `<span class="live-turn-graphic" title="Aktualnie rzuca" aria-label="Aktualnie rzuca">
    <svg viewBox="0 0 28 20" aria-hidden="true"><path d="M3 10h15"></path><path d="M14 4l7 6-7 6"></path><path d="M5 6l-3 4 3 4"></path></svg>
  </span>`;
}

function liveOpenGraphic() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16L16 8"></path><path d="M10 8h6v6"></path><path d="M17 13v5H6V7h5"></path></svg>`;
}

function liveCheckoutRoute(live) {
  if (!live?.currentPlayerId) return null;
  const evaluation = evaluatePendingVisit(live);
  if (evaluation.bust) return null;
  if (evaluation.checkout) return (live.pendingDarts || []).map(dart=>dart.label);
  const dartsLeft = Math.max(0, 3 - (live.pendingDarts || []).length);
  if (!dartsLeft) return null;
  return checkoutSuggestion(evaluation.remainingAfter, dartsLeft, live.doubleOut !== false);
}

function liveEntryCard(entry) {
  const live = entry.live;
  const statsA = genericLiveStats(live, live.playerA);
  const statsB = genericLiveStats(live, live.playerB);
  const currentA = live.currentPlayerId === live.playerA;
  const currentB = live.currentPlayerId === live.playerB;
  const starterA = live.legStarterId === live.playerA;
  const starterB = live.legStarterId === live.playerB;
  const setsMode = liveUsesSets(live);
  const checkoutRoute = liveCheckoutRoute(live);
  const action = entry.kind === 'competition'
    ? `<button class="live-open-btn" data-live-competition="${entry.competitionId}" data-live-match="${entry.matchId}" aria-label="Otwórz punktację" title="Otwórz punktację">${liveOpenGraphic()}</button>`
    : entry.kind === 'single'
      ? `<button class="live-open-btn" data-live-single aria-label="Otwórz punktację" title="Otwórz punktację">${liveOpenGraphic()}</button>`
      : `<button class="live-open-btn" data-live-training aria-label="Otwórz trening" title="Otwórz trening">${liveOpenGraphic()}</button>`;
  const row = (playerId, name, stats, current, starter) => `<div class="live-player-row ${setsMode?'with-sets':''} ${current?'throwing':''}">
    <div class="live-player-main">
      <div class="live-player-icons">${starter?liveStarterGraphic():''}${current?liveTurnGraphic():''}</div>
      <div class="live-player-copy"><strong>${esc(name)}</strong><small>śr. ${fmt(stats.average)} · ostatnia ${stats.last}</small></div>
    </div>
    ${setsMode?`<b class="live-set-score">${live.sets?.[playerId] || 0}</b>`:''}
    <b class="live-leg-score">${live.legs?.[playerId] || 0}</b>
    <em class="live-points-score">${live.remaining?.[playerId] ?? live.startScore ?? 501}</em>
  </div>`;
  return `<article class="live-match-card">
    <div class="live-match-head"><div><span class="live-dot">LIVE</span><strong>${esc(entry.rules)}</strong></div><span>${esc(entry.title)}</span></div>
    <div class="live-match-context">
      <span>${esc(entry.subtitle)}</span>
      <div class="live-column-labels ${setsMode?'with-sets':''}">${setsMode?'<small>Sety</small>':''}<small>Legi</small><small>Punkty</small></div>
    </div>
    ${row(live.playerA,entry.playerAName,statsA,currentA,starterA)}
    ${row(live.playerB,entry.playerBName,statsB,currentB,starterB)}
    ${checkoutRoute ? `<div class="live-checkout-hint"><span>Checkout</span><strong>${checkoutRoute.map(esc).join(' · ')}</strong></div>` : ''}
    <div class="live-match-foot"><span>${liveKindLabel(entry.kind)}</span><small>Leg ${live.legNumber || 1}${setsMode?` · Set ${live.setNumber || 1}`:''} · ${formatDateTime(entry.updatedAt)}</small>${action}</div>
  </article>`;
}

function renderLiveCenter() {
  const all = allLiveEntries();
  const filters = [['all','Wszystkie'],['competition','Liga i turniej'],['single','Pojedyncze'],['training','Trening']];
  const phrase = liveSearch.trim().toLocaleLowerCase('pl');
  const entries = all.filter(entry => (liveFilter === 'all' || entry.kind === liveFilter) && (!phrase || `${entry.title} ${entry.subtitle} ${entry.playerAName} ${entry.playerBName}`.toLocaleLowerCase('pl').includes(phrase)));
  const competitions = new Set(all.filter(entry=>entry.kind==='competition').map(entry=>entry.competitionId)).size;
  return `${pageHeader('Centrum wyników', 'Wyniki na żywo', 'Podgląd wszystkich rozpoczętych meczów, bieżących legów, pozostałych punktów oraz średnich zawodników.', `<button class="btn ghost" id="refreshLive">Odśwież</button>`)}
    <div class="grid stats live-stats">
      ${statCard('Mecze LIVE', all.length, all.length===1?'1 aktywna tarcza':'aktywne punktacje')}
      ${statCard('Rozgrywki', competitions, 'z meczami w toku')}
      ${statCard('Zawodnicy', all.length*2, 'obecnie przy tarczach')}
      ${statCard('Tryb', 'Lokalny', 'dane zapisane na tym urządzeniu')}
    </div>
    <section class="card compact live-toolbar">
      <form id="liveSearchForm" class="live-search-form"><input name="search" value="${esc(liveSearch)}" placeholder="Szukaj zawodnika, ligi albo turnieju"><button class="btn info" type="submit">Szukaj</button>${liveSearch?'<button class="btn ghost" type="button" id="clearLiveSearch">Wyczyść</button>':''}</form>
      <div class="tabs live-tabs">${filters.map(([id,label])=>`<button class="tab ${liveFilter===id?'active':''}" data-live-filter="${id}">${label} <span class="muted">${id==='all'?all.length:all.filter(entry=>entry.kind===id).length}</span></button>`).join('')}</div>
    </section>
    ${entries.length ? `<section class="live-board">${entries.map(liveEntryCard).join('')}</section>` : `<section class="card">${empty(all.length?'Brak dopasowanych meczów':'Brak meczów na żywo',all.length?'Zmień filtr albo wyszukiwanie.':'Rozpocznij punktację z terminarza, pojedynczego meczu lub treningu z Dartbotem.')}</section>`}
    <div class="note live-sync-note"><strong>Wiele meczów w jednej rozgrywce:</strong> możesz rozpocząć kolejne spotkanie bez usuwania wcześniejszego. Każdy mecz zachowuje własną punktację i można go otworzyć z tej zakładki. Obecna wersja agreguje dane zapisane na tym urządzeniu; równoczesny podgląd wyników z kilku telefonów lub tabletów wymaga wspólnej bazy Firebase.</div>`;
}

function openCompetitionLive(competitionId, matchId) {
  saveState();
  const competition = hub.competitions.find(item => item.id === competitionId);
  if (!competition) return toast('Nie znaleziono rozgrywki');
  hub.activeCompetitionId = competition.id;
  state = competition;
  const match = state.matches.find(item => item.id === matchId);
  if (!match) return toast('Nie znaleziono meczu');
  state.live = normalizeCompetitionLive(match.liveData || (state.live?.matchId===matchId ? state.live : null), match, state.settings) || createLive(match);
  match.liveData = clone(state.live);
  match.status = 'live';
  saveState();
  route = 'scorer';
  render();
}

function renderMatches() {
  const matches = filteredMatches();
  const filters = [
    ['all','Wszystkie'],['planned','Do rozegrania'],['live','W trakcie'],['completed','Wyniki']
  ];
  return `
    ${pageHeader('Terminarz', 'Mecze', 'Rozpocznij kilka punktacji równolegle albo wpisz wynik ręcznie.', allLiveEntries().some(entry=>entry.kind==='competition') ? '<button class="btn primary" data-route="live">Wyniki na żywo</button>' : '')}
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
  const setsToWin = matchSetsToWin(m);
  const target = ` · ${matchRuleText(matchLegsToWin(m), setsToWin)}`;
  const result = m.status === 'completed'
    ? (setsToWin > 0
      ? `<span class="score-pill score-pill-sets"><strong>${m.setsA||0}:${m.setsB||0}</strong><small>legi ${m.legsA||0}:${m.legsB||0}</small></span>`
      : `<span class="score-pill">${m.legsA}:${m.legsB}</span>`)
    : '<span class="muted">vs</span>';
  const startLabel = m.status === 'live' ? 'Otwórz LIVE' : 'Licz punkty';
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
  const legTarget = matches[0] ? matchLegsToWin(matches[0]) : 0;
  const setTarget = matches[0] ? matchSetsToWin(matches[0]) : 0;
  return `<div class="bracket-round"><h3>${knockoutStageLabel(stage)}</h3><div class="bracket-target">${matchRuleText(legTarget,setTarget)}</div>${matches.map(m=>{
    const setsMode=matchSetsToWin(m)>0;
    const aScore=m.status==='completed'?(setsMode?(m.setsA??0):(m.legsA??0)):'–';
    const bScore=m.status==='completed'?(setsMode?(m.setsB??0):(m.legsB??0)):'–';
    const legInfo=setsMode&&m.status==='completed'?`<div class="match-meta bracket-leg-total">Legi ${m.legsA||0}:${m.legsB||0}</div>`:'';
    return `<div class="bracket-match"><div class="bracket-line ${m.winnerId===m.playerA?'winner':''}"><span>${esc(playerName(m.playerA))}</span><b>${aScore}</b></div><div class="bracket-line ${m.winnerId===m.playerB?'winner':''}"><span>${esc(playerName(m.playerB))}</span><b>${bScore}</b></div>${legInfo}${m.bye?'<div class="match-meta">Wolny los</div>':''}</div>`;
  }).join('')}</div>`;
}

function renderStats() {
  const rows = computePlayerStats();
  return `
    ${pageHeader('Analiza', 'Statystyki zawodników', 'Średnia, wysokie punktacje, checkout i najlepszy leg są liczone z wizyt wpisanych w liczniku.')}
    <section class="card">
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Zawodnik</th><th>Mecze</th><th>Legi W</th><th>Średnia</th><th>100+</th><th>140+</th><th>180</th><th>High Out</th><th>Best Leg</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td class="pos">${i+1}</td><td><strong>${esc(playerName(r.playerId))}</strong></td><td>${r.matches}</td><td>${r.legsWon}</td><td><strong>${fmt(r.average)}</strong></td><td>${r.h100}</td><td>${r.h140}</td><td class="green"><strong>${r.h180}</strong></td><td>${r.highOut || '—'}</td><td>${r.bestLeg || '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Brak statystyk','Statystyki pojawią się po rozegraniu meczu w liczniku.')}
    </section>`;
}

function renderSingleMatch() {
  const live = hub.singleLive;
  const history = (hub.singleMatches || []).slice().sort((a,b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
  return `
    ${pageHeader(
      'Szybka gra',
      'Pojedynczy mecz',
      'Uruchom niezależny licznik bez tworzenia ligi, grup ani terminarza.',
      live ? '<button class="btn primary" id="resumeSingleMatch">Wznów rozpoczęty mecz</button>' : ''
    )}

    ${live ? `<section class="card accent single-live-card">
      <div class="section-head">
        <div>
          <div class="eyebrow">Mecz w trakcie</div>
          <h2>${esc(live.title || 'Pojedynczy mecz')}</h2>
          <p class="muted">${esc(live.playerNames?.[live.playerA] || 'Gracz 1')} vs ${esc(live.playerNames?.[live.playerB] || 'Gracz 2')} · ${live.startScore} · ${matchRuleText(live.legsToWin, live.setsToWin)} · ${live.doubleOut !== false ? 'Double Out' : 'Straight Out'}</p>
        </div>
        <div class="row-actions">
          <button class="btn primary" id="resumeSingleMatchCard">Wróć do licznika</button>
          <button class="btn danger" id="abandonSingleMatch">Usuń rozpoczęty mecz</button>
        </div>
      </div>
      <div class="single-live-score">
        <div><span>${esc(live.playerNames?.[live.playerA] || 'Gracz 1')}</span><strong>${liveUsesSets(live) ? (live.sets?.[live.playerA] || 0) : (live.legs?.[live.playerA] || 0)}</strong><small>${liveUsesSets(live) ? `sety · legi ${live.legs?.[live.playerA] || 0}` : 'legi'} · pozostało ${live.remaining?.[live.playerA] ?? live.startScore}</small></div>
        <div class="single-live-vs">:</div>
        <div><span>${esc(live.playerNames?.[live.playerB] || 'Gracz 2')}</span><strong>${liveUsesSets(live) ? (live.sets?.[live.playerB] || 0) : (live.legs?.[live.playerB] || 0)}</strong><small>${liveUsesSets(live) ? `sety · legi ${live.legs?.[live.playerB] || 0}` : 'legi'} · pozostało ${live.remaining?.[live.playerB] ?? live.startScore}</small></div>
      </div>
    </section>` : ''}

    <div class="grid two" style="margin-top:${live ? '16px' : '0'}">
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Nowy pojedynczy mecz</h2>
            <p class="muted">Nazwy graczy i zasady dotyczą wyłącznie tego meczu.</p>
          </div>
          <span class="badge blue">X01</span>
        </div>

        <form id="singleMatchForm" class="form-grid">
          <div class="field wide">
            <label>Nazwa meczu (opcjonalnie)</label>
            <input name="title" maxlength="80" placeholder="np. Trening wieczorny">
          </div>

          <div class="field">
            <label>Gracz 1</label>
            <input name="playerAName" maxlength="50" placeholder="np. Michał" required>
          </div>

          <div class="field">
            <label>Gracz 2</label>
            <input name="playerBName" maxlength="50" placeholder="np. Andrzej" required>
          </div>

          <div class="field">
            <label>Punkty startowe</label>
            <input type="number" name="startScore" min="2" max="5000" value="501" list="singleScorePresets" required>
            <datalist id="singleScorePresets">
              <option value="50"></option>
              <option value="101"></option>
              <option value="301"></option>
              <option value="501"></option>
              <option value="701"></option>
              <option value="1001"></option>
            </datalist>
            <small class="field-help">Możesz wpisać dowolną wartość, np. 50, 301 albo 501.</small>
          </div>

          <div class="field">
            <label>Wygrane legi w meczu / secie</label>
            <input type="number" name="legsToWin" min="1" max="25" value="3" required>
            <small class="field-help">Przy grze setowej jest to liczba legów potrzebnych do wygrania seta.</small>
          </div>

          <div class="field">
            <label>Wygrane sety do zwycięstwa</label>
            <input type="number" name="setsToWin" min="0" max="15" value="0" required>
            <small class="field-help">0 = mecz rozgrywany tylko na legi.</small>
          </div>

          <div class="field">
            <label>Zasada zakończenia</label>
            <select name="doubleOut">
              <option value="true" selected>Double Out – zakończenie doublem</option>
              <option value="false">Straight Out – dowolne zakończenie</option>
            </select>
          </div>

          <div class="field">
            <label>Rozpoczyna pierwszy leg</label>
            <select name="starter">
              <option value="A">Gracz 1</option>
              <option value="B">Gracz 2</option>
            </select>
          </div>

          <div class="wide">
            <button class="btn primary" type="submit">Rozpocznij pojedynczy mecz</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2>Jak działa ten tryb?</h2>
            <p class="muted">Mecz jest całkowicie niezależny od aktywnej ligi lub turnieju.</p>
          </div>
        </div>
        <div class="single-feature-list">
          <div><span>1</span><div><strong>Wpisujesz graczy i zasady</strong><small>Bez dodawania zawodników do rozgrywek.</small></div></div>
          <div><span>2</span><div><strong>Liczysz lotka po lotce</strong><small>Numer pola, następnie Singiel, Double albo Triple.</small></div></div>
          <div><span>3</span><div><strong>Trzecia lotka zapisuje wizytę</strong><small>Checkout i BUST są rozpoznawane automatycznie.</small></div></div>
          <div><span>4</span><div><strong>Wynik trafia do historii</strong><small>Nie zmienia tabeli ani statystyk ligi.</small></div></div>
        </div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="section-head">
        <div>
          <h2>Historia pojedynczych meczów</h2>
          <p class="muted">Zakończone szybkie mecze zapisane na tym urządzeniu.</p>
        </div>
        <span class="badge green">${history.length}</span>
      </div>
      ${history.length
        ? `<div class="single-history">${history.map(singleHistoryRow).join('')}</div>`
        : empty('Brak zakończonych meczów', 'Pierwszy zakończony pojedynczy mecz pojawi się tutaj.')}
    </section>`;
}

function singleHistoryRow(item) {
  const setsMode = Math.max(0, Number(item.setsToWin) || 0) > 0;
  const winner = item.winnerName || (setsMode
    ? (item.setsA > item.setsB ? item.playerAName : item.playerBName)
    : (item.legsA > item.legsB ? item.playerAName : item.playerBName));
  return `<article class="single-history-row">
    <div class="single-history-date">
      <span>Zakończono</span>
      <strong>${formatDateTime(item.completedAt)}</strong>
    </div>
    <div class="single-history-main">
      <div class="competition-title-line">
        <h3>${esc(item.title || 'Pojedynczy mecz')}</h3>
        <span class="badge green">Zakończony</span>
      </div>
      <div class="single-history-result">
        <span class="${winner===item.playerAName?'winner':''}">${esc(item.playerAName)}</span>
        <strong>${setsMode ? `${item.setsA}:${item.setsB}` : `${item.legsA}:${item.legsB}`}</strong>
        <span class="${winner===item.playerBName?'winner':''}">${esc(item.playerBName)}</span>
      </div>
      <div class="competition-meta">
        <span>${item.startScore} punktów</span>
        <span>${matchRuleText(item.legsToWin, item.setsToWin)}</span>
        ${setsMode ? `<span>Legi łącznie: ${item.legsA}:${item.legsB}</span>` : ''}
        <span>${item.doubleOut !== false ? 'Double Out' : 'Straight Out'}</span>
        <span>Śr. ${fmt(item.statsA?.average)} / ${fmt(item.statsB?.average)}</span>
        <span>180: ${Number(item.statsA?.h180 || 0)} / ${Number(item.statsB?.h180 || 0)}</span>
        <span>High Out: ${Number(item.statsA?.highOut || 0) || '—'} / ${Number(item.statsB?.highOut || 0) || '—'}</span>
      </div>
    </div>
    <div class="competition-actions">
      <button class="btn small primary single-rematch" data-id="${item.id}">Rewanż</button>
      <button class="btn small danger single-delete" data-id="${item.id}">Usuń</button>
    </div>
  </article>`;
}

function renderSettings() {
  return `
    ${pageHeader('Dane aplikacji', 'Ustawienia i kopia zapasowa', 'Dane są zapisywane lokalnie w tej przeglądarce. Eksport JSON obejmuje ligi, turnieje oraz pojedyncze mecze.')}
    <div class="grid two">
      <section class="card"><h2>Kopia danych</h2><p class="muted">Eksport obejmuje wszystkie aktywne i zakończone rozgrywki, pojedyncze mecze, zawodników, terminarze, wyniki i statystyki.</p><div class="row-actions"><button class="btn primary" id="exportData">Eksportuj JSON</button><label class="btn info" for="importData">Importuj JSON</label><input id="importData" type="file" accept="application/json" hidden></div></section>
      <section class="card"><h2>Instalacja PWA</h2><p class="muted">Po uruchomieniu przez HTTPS lub lokalny serwer aplikacja może działać jak program i zachować podstawowe pliki offline.</p><button class="btn primary" id="installBtnPage" ${deferredInstallPrompt?'':'disabled'}>Zainstaluj aplikację</button></section>
    </div>
    <section class="card danger-zone" style="margin-top:16px"><h2 class="red">Strefa niebezpieczna</h2><p class="muted">Usunięcie danych kasuje całe archiwum lig, turniejów i pojedynczych meczów. Operacja jest nieodwracalna, chyba że wcześniej wykonano eksport JSON.</p><button class="btn danger" id="resetAll">Usuń całe archiwum</button></section>`;
}


function trainingSessionsSorted() {
  return (hub.trainingSessions || []).slice().sort((a,b)=>String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
}

function trainingSummaryBadges(session) {
  const summary = session.summary || {};
  switch (session.type) {
    case 'bobs27':
      return `<span class="badge green">${summary.finalScore ?? 0} pkt</span><span class="badge">Double: ${summary.totalHits ?? 0}</span><span class="badge">${esc(summary.failedAt || 'Ukończono')}</span>`;
    case 'checkout121':
      return `<span class="badge green">Najwyżej: ${summary.highestTarget ?? 0}</span><span class="badge">Skuteczność: ${fmt(summary.successRate || 0)}%</span><span class="badge">Próby: ${summary.attempts ?? 0}</span>`;
    case 'hundred':
      return `<span class="badge green">${summary.score ?? 0} pkt</span><span class="badge">Celność: ${fmt(summary.hitRate || 0)}%</span><span class="badge">Lotki: ${summary.totalDarts ?? 0}</span>`;
    case 'jdc':
      return `<span class="badge green">${summary.score ?? 0} pkt</span><span class="badge">Shanghai: ${summary.shanghais ?? 0}</span><span class="badge">Double: ${summary.doublesHit ?? 0}/21</span>`;
    case 'halveit':
      return `<span class="badge green">${summary.finalScore ?? 0} pkt</span><span class="badge">Nietrafione rundy: ${summary.misses ?? 0}</span>`;
    case 'dartbot':
      return `<span class="badge green">Legi ${summary.playerLegs ?? 0}:${summary.botLegs ?? 0}</span><span class="badge">Śr. ${fmt(summary.playerAverage || 0)}</span><span class="badge">Dartbot ${fmt(summary.botAverage || 0)}</span>`;
    case 'session45':
      return `<span class="badge green">${summary.completedStages ?? 0}/5 bloków</span><span class="badge">Ocena: ${summary.rating ?? '—'}/10</span>`;
    default:
      return '';
  }
}

function renderTraining() {
  const live = hub.trainingLive;
  const sessions = trainingSessionsSorted();
  return `
    ${pageHeader(
      'Rozwój umiejętności',
      'Trening',
      'Wybierz ćwiczenie, wykonuj kolejne zadania zgodnie z instrukcją i buduj historię wyników do porównania po trzech miesiącach.',
      live ? '<button class="btn primary" id="resumeTraining">Wznów trening</button>' : ''
    )}

    ${live ? `<section class="card accent training-live-card">
      <div class="section-head">
        <div>
          <div class="eyebrow">Trening w trakcie</div>
          <h2>${esc(trainingDefinition(live.type).name)}</h2>
          <p class="muted">${esc(live.playerName)} · rozpoczęto ${formatDateTime(live.startedAt)}</p>
        </div>
        <div class="row-actions"><button class="btn primary" id="resumeTrainingCard">Kontynuuj</button><button class="btn danger" id="abandonTraining">Usuń rozpoczęty trening</button></div>
      </div>
    </section>` : ''}

    <section class="training-catalog">
      ${TRAINING_CATALOG.map(item=>`<article class="card training-card">
        <div class="training-card-head"><span class="training-icon">${item.id==='bobs27'?'D':item.id==='checkout121'?'121':item.id==='hundred'?'100':item.id==='jdc'?'JDC':item.id==='halveit'?'½':item.id==='dartbot'?'501':'45'}</span><div><span class="badge blue">${esc(item.category)}</span><h2>${esc(item.name)}</h2></div></div>
        <p>${esc(item.goal)}</p>
        <p class="muted">${esc(item.description)}</p>
        <div class="training-card-footer"><span class="badge">${esc(item.duration)}</span><button class="btn primary start-training" data-type="${item.id}">Wybierz trening</button></div>
      </article>`).join('')}
    </section>

    <section class="card" style="margin-top:16px">
      <div class="section-head"><div><h2>Porównanie postępu</h2><p class="muted">Pierwszy wynik jest porównywany z najnowszym oraz z pomiarem wykonanym najbliżej 90. dnia.</p></div></div>
      ${renderTrainingComparisons(sessions)}
    </section>

    <section class="card" style="margin-top:16px">
      <div class="section-head"><div><h2>Historia treningów</h2><p class="muted">Każdy ukończony trening pozostaje zapisany w urządzeniu i w eksporcie JSON.</p></div><span class="badge green">${sessions.length}</span></div>
      ${sessions.length ? `<div class="training-history">${sessions.map(renderTrainingHistoryRow).join('')}</div>` : empty('Brak zapisanych treningów','Ukończ pierwsze ćwiczenie, aby rozpocząć pomiar postępu.')}
    </section>

    <section class="card compact weekly-plan" style="margin-top:16px">
      <div class="section-head"><h2>Proponowany podział 3 treningów tygodniowo</h2></div>
      <div class="weekly-grid"><div><span>Sesja 1</span><strong>Punktowanie</strong><small>Zmiana 20 / 19 / 18</small></div><div><span>Sesja 2</span><strong>Double + checkouty</strong><small>Bob’s 27 oraz 121</small></div><div><span>Sesja 3</span><strong>JDC + mecz</strong><small>Test kompleksowy i 501</small></div></div>
    </section>`;
}

function renderTrainingComparisons(sessions) {
  const groups = TRAINING_CATALOG.map(def=>({def, sessions:sessions.filter(item=>item.type===def.id).slice().sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt)))})).filter(group=>group.sessions.length);
  if (!groups.length) return empty('Brak danych do porównania','Po pierwszym treningu zobaczysz punkt odniesienia. Pomiar trzymiesięczny pojawi się po około 90 dniach.');
  return `<div class="training-comparison-grid">${groups.map(({def,sessions:items})=>{
    const first=items[0];
    const latest=items.at(-1);
    const firstDate=new Date(first.completedAt);
    const targetTime=firstDate.getTime()+90*86400000;
    const after=items.slice(1).filter(item=>new Date(item.completedAt).getTime()>=firstDate.getTime()+75*86400000).sort((a,b)=>Math.abs(new Date(a.completedAt).getTime()-targetTime)-Math.abs(new Date(b.completedAt).getTime()-targetTime))[0] || null;
    const firstMetric=trainingMetric(first);
    const latestMetric=trainingMetric(latest);
    const afterMetric=after?trainingMetric(after):null;
    const daysRemaining=Math.max(0,Math.ceil((targetTime-Date.now())/86400000));
    const delta=latestMetric.value-firstMetric.value;
    return `<div class="training-comparison-card"><div class="section-head"><h3>${esc(def.name)}</h3><span class="badge">${items.length} pomiarów</span></div><div class="comparison-values"><div><span>Pierwszy</span><strong>${fmtTrainingMetric(firstMetric)}</strong><small>${formatDateTime(first.completedAt)}</small></div><div><span>Najnowszy</span><strong>${fmtTrainingMetric(latestMetric)}</strong><small class="${delta>0?'green':delta<0?'red':''}">${delta>0?'+':''}${Number.isInteger(delta)?delta:delta.toFixed(2)}</small></div><div><span>Po 3 miesiącach</span><strong>${afterMetric?fmtTrainingMetric(afterMetric):'—'}</strong><small>${after?formatDateTime(after.completedAt):(daysRemaining?`za około ${daysRemaining} dni`:'wykonaj kolejny pomiar')}</small></div></div></div>`;
  }).join('')}</div>`;
}

function fmtTrainingMetric(metric) {
  const value = Number(metric.value)||0;
  return `${Number.isInteger(value)?value:value.toFixed(2)}${metric.suffix||''}`;
}

function renderTrainingHistoryRow(session) {
  const def=trainingDefinition(session.type);
  return `<article class="training-history-row"><div class="training-history-date"><span>${formatDateTime(session.completedAt)}</span><strong>${esc(session.playerName)}</strong></div><div class="training-history-main"><h3>${esc(def.name)}</h3><div class="training-history-badges">${trainingSummaryBadges(session)}</div></div><div class="row-actions"><button class="btn small ghost repeat-training" data-id="${session.id}">Powtórz</button><button class="btn small danger delete-training" data-id="${session.id}">Usuń</button></div></article>`;
}

function renderTrainingSetup() {
  const type = trainingSetupType || 'bobs27';
  const def = trainingDefinition(type);
  const profile = hub.trainingProfileName || '';
  let options='';
  if (type==='checkout121') options=`<div class="field"><label>Wynik początkowy</label><select name="startTarget"><option value="61">61 — początkujący</option><option value="121" selected>121 — podstawowy</option></select></div><div class="field"><label>Limit lotek na wynik</label><select name="maxDarts"><option value="9" selected>9 lotek</option><option value="6">6 lotek</option></select></div><div class="field wide"><label>Poziomy bezpieczeństwa</label><div class="check-grid"><label><input type="checkbox" name="safe125" value="125"> 125</label><label><input type="checkbox" name="safe130" value="130"> 130</label><label><input type="checkbox" name="safe135" value="135"> 135</label></div><small class="field-help">Po osiągnięciu zaznaczonego poziomu nie spadniesz już poniżej niego.</small></div>`;
  if (type==='hundred') options=`<div class="field wide"><label>Wariant</label><select name="variant"><option value="t20">100 lotek na 20</option><option value="t19">100 lotek na 19</option><option value="bull">100 lotek na Bull</option><option value="switch">40 × 20, 30 × 19, 20 × 18, 10 × Bull</option></select></div>`;
  if (type==='dartbot') options=`
    <div class="field"><label>Liczba legów sesji</label><input type="number" name="legsCount" min="5" max="25" value="5"></div>
    <div class="field"><label>Punkty startowe</label><select name="startScore"><option value="301">301</option><option value="501" selected>501</option><option value="701">701</option></select></div>
    <div class="field"><label>Średnia startowa Dartbota</label><input type="number" name="botAverage" min="20" max="110" step="1" value="50"><small class="field-help">Obowiązuje do chwili, gdy aplikacja policzy Twoją średnią.</small></div>
    <div class="field"><label>Przewaga Dartbota nad Twoją średnią</label><div class="input-suffix"><input type="number" name="botAdvantagePct" min="0" max="50" step="1" value="10"><span>%</span></div><small class="field-help">Przy średniej 60 i przewadze 10% cel Dartbota będzie wynosił 60–66.</small></div>
    <div class="field"><label>Od jakiego wyniku odliczać checkout</label><input type="number" name="checkoutThreshold" min="2" max="170" value="100"><small class="field-help">Po zejściu do tej wartości Dartbot rozpocznie plan zamknięcia lega.</small></div>
    <div class="field"><label>Maksymalna liczba lotek na zamknięcie</label><select name="checkoutDarts"><option value="3">3 lotki</option><option value="6">6 lotek</option><option value="9" selected>9 lotek</option><option value="12">12 lotek</option><option value="15">15 lotek</option><option value="18">18 lotek</option></select></div>
    <div class="wide note dartbot-config-note"><strong>Dynamiczny Dartbot</strong><br>Po każdej Twojej wizycie przeciwnik przelicza cel średniej. Po wejściu w strefę checkoutu realizuje plan zakończenia w ustawionym limicie lotek.</div>`;
  return `${pageHeader('Konfiguracja treningu', def.name, def.goal, '<button class="btn ghost" data-route="training">Wróć</button>')}<section class="card"><form id="trainingSetupForm" class="form-grid"><input type="hidden" name="type" value="${type}"><div class="field wide"><label>Nazwa zawodnika</label><input name="playerName" maxlength="50" value="${esc(profile)}" placeholder="np. Michał" required></div>${options}<div class="wide note"><strong>${esc(def.name)}</strong><br>${esc(def.description)}</div><div class="wide"><button class="btn primary" type="submit">Rozpocznij trening</button></div></form></section>`;
}

function renderTrainingRun() {
  const live=hub.trainingLive;
  if(!live){route='training';return renderTraining();}
  if(live.type==='dartbot') return renderScorer();
  const def=trainingDefinition(live.type);
  const header=pageHeader('Trening w toku',def.name,`${def.goal} · ${esc(live.playerName)}`,`<button class="btn ghost" data-route="training">Zapisz i wyjdź</button><button class="btn danger" id="abandonTrainingRun">Usuń trening</button>`);
  let body='';
  if(live.type==='bobs27') body=renderBobs27(live);
  if(live.type==='checkout121') body=renderCheckout121(live);
  if(live.type==='hundred') body=renderHundred(live);
  if(live.type==='jdc') body=renderJdc(live);
  if(live.type==='halveit') body=renderHalveIt(live);
  if(live.type==='session45') body=renderSession45(live);
  return `${header}<div class="training-run">${body}</div>`;
}
function trainingProgress(current,total,label='Etap') {
  const value=Math.min(100,Math.max(0,total?current/total*100:0));
  return `<div class="training-progress"><div><span>${label}</span><strong>${current}/${total}</strong></div><div class="training-progress-track"><i style="width:${value}%"></i></div></div>`;
}

function renderBobs27(live) {
  const data=live.data;
  const target=BOBS_TARGETS[data.targetIndex||0];
  return `<section class="card accent">${trainingProgress((data.targetIndex||0)+1,BOBS_TARGETS.length,'Pole')}<div class="training-task"><div><span>Aktualny cel</span><strong>${target.label}</strong><small>3 lotki. Trafienie dodaje ${target.value} pkt, brak trafienia odejmuje ${target.value} pkt.</small></div><div class="training-score"><span>Wynik</span><strong>${data.score}</strong><small>Trafione double: ${data.totalHits||0}</small></div></div><form id="bobsForm" class="training-action-form"><div class="field"><label>Liczba trafień w 3 lotkach</label><select name="hits"><option value="0">0 — brak trafienia</option><option value="1">1 trafienie</option><option value="2">2 trafienia</option><option value="3">3 trafienia</option></select></div><button class="btn primary" type="submit">Zapisz rundę i przejdź dalej</button></form></section><section class="card compact"><div class="note">Zaczynasz z 27 punktami. Po wyniku poniżej zera trening kończy się automatycznie i zapisuje pole, na którym odpadłeś.</div></section>`;
}

function renderCheckout121(live) {
  const data=live.data, max=Number(live.settings.maxDarts)||9;
  return `<section class="card accent">${trainingProgress(Math.max(0,(data.current||0)-(Number(live.settings.startTarget)||121)),Math.max(1,(data.highest||0)-(Number(live.settings.startTarget)||121)+1),'Postęp')}<div class="training-task"><div><span>Zamknij wynik</span><strong>${data.current}</strong><small>Maksymalnie ${max} lotek. Po niepowodzeniu wracasz do poziomu ${data.floor}.</small></div><div class="training-score"><span>Najwyżej</span><strong>${data.highest}</strong><small>${data.successes||0} sukcesów / ${data.attempts||0} prób</small></div></div><div class="checkout-training-actions"><span class="muted">Zamknięte w:</span>${Array.from({length:max},(_,i)=>i+1).map(value=>`<button class="btn ${value<=3?'primary':'ghost'} checkout-success" data-darts="${value}">${value} ${value===1?'lotce':'lotkach'}</button>`).join('')}<button class="btn danger" id="checkoutFailed">Nie zamknięto</button></div><div class="row-actions" style="margin-top:16px"><button class="btn ghost" id="finishTrainingNow">Zakończ i zapisz wynik</button></div></section><section class="card compact"><div class="note">Po zamknięciu przechodzisz o jeden punkt wyżej. Zaznaczone poziomy bezpieczeństwa stają się nową dolną granicą.</div></section>`;
}

function hundredSegments(variant) {
  if(variant==='t19') return [{target:'19',limit:100}];
  if(variant==='bull') return [{target:'Bull',limit:100}];
  if(variant==='switch') return [{target:'20',limit:40},{target:'19',limit:30},{target:'18',limit:20},{target:'Bull',limit:10}];
  return [{target:'20',limit:100}];
}

function renderHundred(live) {
  const data=live.data, segments=data.segments||hundredSegments(live.settings.variant), segment=segments[data.segmentIndex||0], remaining=segment.limit-(data.segmentDarts||0), batch=Math.min(10,remaining), bull=segment.target==='Bull';
  return `<section class="card accent">${trainingProgress(data.totalDarts||0,segments.reduce((sum,item)=>sum+item.limit,0),'Lotki')}<div class="training-task"><div><span>Cel bieżącej serii</span><strong>${esc(segment.target)}</strong><small>Wpisz wynik kolejnych maksymalnie ${batch} lotek. Pozostało ${remaining} na ten cel.</small></div><div class="training-score"><span>Punkty</span><strong>${data.points||0}</strong><small>Celne: ${(data.singles||0)+(data.doubles||0)+(data.triples||0)} / ${data.totalDarts||0}</small></div></div><form id="hundredForm" class="training-count-form"><div class="field"><label>${bull?'Outer Bull':'Single'}</label><input type="number" name="single" min="0" max="${batch}" value="0"></div><div class="field"><label>${bull?'Bullseye':'Double'}</label><input type="number" name="double" min="0" max="${batch}" value="0"></div>${bull?'':`<div class="field"><label>Triple</label><input type="number" name="triple" min="0" max="${batch}" value="0"></div>`}<div class="field"><label>Pudło / inny sektor</label><input type="number" name="miss" min="0" max="${batch}" value="${batch}"></div><button class="btn primary" type="submit">Zapisz serię</button></form><div class="note" style="margin-top:14px">Suma wpisanych lotek musi wynosić od 1 do ${batch}. Punktacja: S = 1, D = 2, T = 3; na Bull Outer = 1, Bullseye = 2.</div></section>`;
}

function jdcSequence() {
  return [
    ...Array.from({length:6},(_,i)=>({kind:'shanghai',target:i+10,label:`Shanghai ${i+10}`})),
    ...Array.from({length:20},(_,i)=>({kind:'double',target:i+1,label:`D${i+1}`})),
    {kind:'double',target:25,label:'Bull'},
    ...Array.from({length:6},(_,i)=>({kind:'shanghai',target:i+15,label:`Shanghai ${i+15}`}))
  ];
}

function renderJdc(live) {
  const data=live.data, sequence=data.sequence||jdcSequence(), task=sequence[data.index||0];
  const content=task.kind==='double'?`<div class="jdc-hit-actions"><button class="btn primary jdc-double" data-hit="1">Trafione (+50)</button><button class="btn danger jdc-double" data-hit="0">Pudło</button></div>`:`<form id="jdcShanghaiForm" class="training-count-form"><div class="field"><label>Single</label><input type="number" name="single" min="0" max="3" value="0"></div><div class="field"><label>Double</label><input type="number" name="double" min="0" max="3" value="0"></div><div class="field"><label>Triple</label><input type="number" name="triple" min="0" max="3" value="0"></div><div class="field"><label>Pudło</label><input type="number" name="miss" min="0" max="3" value="3"></div><button class="btn primary" type="submit">Zapisz 3 lotki</button></form>`;
  return `<section class="card accent">${trainingProgress((data.index||0)+1,sequence.length,'Zadanie')}<div class="training-task"><div><span>Aktualne zadanie</span><strong>${esc(task.label)}</strong><small>${task.kind==='double'?'Jedna lotka. Każde trafienie double lub Bull = 50 punktów.':'Trzy lotki. Shanghai to co najmniej jeden single, double i triple — premia 100 punktów.'}</small></div><div class="training-score"><span>Wynik JDC</span><strong>${data.score||0}</strong><small>Shanghai: ${data.shanghais||0} · Double: ${data.doublesHit||0}</small></div></div>${content}</section>`;
}

function renderHalveIt(live) {
  const data=live.data, target=HALVE_IT_TARGETS[data.index||0];
  return `<section class="card accent">${trainingProgress((data.index||0)+1,HALVE_IT_TARGETS.length,'Runda')}<div class="training-task"><div><span>Aktualny cel</span><strong>${esc(target.label)}</strong><small>${esc(target.help)} Masz 3 lotki.</small></div><div class="training-score"><span>Wynik</span><strong>${data.score||0}</strong><small>Połowienia: ${data.misses||0}</small></div></div><form id="halveForm" class="training-action-form"><div class="field"><label>Punkty zdobyte z wyznaczonego pola</label><input type="number" name="points" min="0" max="180" value="0" required></div><button class="btn primary" type="submit">Zapisz rundę</button></form><div class="note" style="margin-top:14px">Wpisz 0, gdy żadna z trzech lotek nie trafiła celu. Aplikacja automatycznie podzieli dotychczasowy wynik przez dwa.</div></section>`;
}

function renderDartbot() {
  return renderScorer();
}
function renderSession45(live) {
  const data=live.data, stage=SESSION_45_STAGES[data.index||0];
  return `<section class="card accent">${trainingProgress((data.index||0)+1,SESSION_45_STAGES.length,'Blok')}<div class="training-task"><div><span>${stage.minutes} minut</span><strong>${esc(stage.title)}</strong><small>${esc(stage.instruction)}</small></div><div class="training-score"><span>Wykonano</span><strong>${data.index||0}/5</strong><small>Łączny plan: 45 minut</small></div></div><form id="session45Form" class="training-action-form"><div class="field"><label>Wynik lub krótka obserwacja z bloku</label><input name="note" maxlength="160" placeholder="np. 42 pkt, D16 niestabilne, dobra koncentracja"></div>${data.index===SESSION_45_STAGES.length-1?'<div class="field"><label>Ocena całej sesji 1–10</label><input type="number" name="rating" min="1" max="10" value="7"></div>':''}<button class="btn primary" type="submit">${data.index===SESSION_45_STAGES.length-1?'Zakończ i zapisz sesję':'Zapisz blok i pokaż następny'}</button></form></section>`;
}


function dartbotAverageRange(training = hub.trainingLive) {
  const data = training?.data;
  if (!training || training.type !== 'dartbot' || !data) return {low:0, high:0, source:'brak danych'};
  const playerStats = livePlayerStats(data.playerA, data);
  const base = Math.max(1, Number(training.settings.botAverage) || 50);
  const low = playerStats.darts ? Math.max(1, playerStats.average) : base;
  const advantage = Math.max(0, Number(training.settings.botAdvantagePct) || 0);
  const high = Math.min(120, low * (1 + advantage / 100));
  return {low, high:Math.max(low, high), source:playerStats.darts ? 'Twoja aktualna średnia' : 'średnia startowa'};
}

function renderDartbotScorerInfo(live) {
  const training = hub.trainingLive;
  const range = dartbotAverageRange(training);
  const threshold = Number(training?.settings?.checkoutThreshold) || 100;
  const limit = Number(training?.settings?.checkoutDarts) || 9;
  const left = live.botCheckoutDartsLeft === null || live.botCheckoutDartsLeft === undefined ? null : (Number.isFinite(Number(live.botCheckoutDartsLeft)) ? Number(live.botCheckoutDartsLeft) : null);
  const windowText = left === null
    ? `Strefa checkoutu: ${threshold} lub mniej · limit ${limit} lotek`
    : `Checkout aktywny: pozostało maks. ${left} ${left===1?'lotka':'lotek'}`;
  return `<div class="dartbot-dynamic-bar"><div><span>Dynamiczny cel średniej</span><strong>${fmt(range.low)}–${fmt(range.high)}</strong><small>${esc(range.source)} + ${Number(training?.settings?.botAdvantagePct)||0}%</small></div><div><span>Plan zakończenia</span><strong>${left===null?`≤ ${threshold}`:`${left} lotek`}</strong><small>${windowText}</small></div><div><span>Postęp sesji</span><strong>${live.completedLegs||0}/${Number(training?.settings?.legsCount)||5}</strong><small>rozegrane legi</small></div></div>`;
}

function renderDartbotTurnHint(live) {
  const range = dartbotAverageRange(hub.trainingLive);
  const left = live.botCheckoutDartsLeft === null || live.botCheckoutDartsLeft === undefined ? null : (Number.isFinite(Number(live.botCheckoutDartsLeft)) ? Number(live.botCheckoutDartsLeft) : null);
  return `<div class="checkout-hint dartbot-turn-hint" aria-live="polite"><span>Dartbot rzuca</span><strong>${live.botThinking?'Przygotowuje wizytę…':'Automatyczny rzut'}</strong><small>Cel ${fmt(range.low)}–${fmt(range.high)}${left===null?'':` · checkout do ${left} lotek`}</small></div>`;
}

function renderScorer() {
  const standalone = isSingleScorer();
  const dartbotTraining = isDartbotScorer();
  const live = scorerLive();
  if (!live) {
    route = standalone ? 'single' : (dartbotTraining ? 'training' : 'matches');
    return standalone ? renderSingleMatch() : (dartbotTraining ? renderTraining() : renderMatches());
  }
  const match = standalone || dartbotTraining ? null : state.matches.find(m=>m.id===live.matchId);
  if (!standalone && !dartbotTraining && !match) return `<section class="card">${empty('Nie znaleziono meczu','Wróć do terminarza.')}</section>`;
  const setMode = !dartbotTraining && liveUsesSets(live);
  const setsToWin = setMode ? Math.max(1, Number(live.setsToWin) || 1) : 0;
  const statsA = livePlayerStats(live.playerA, live);
  const statsB = livePlayerStats(live.playerB, live);
  const visits = (live.visits || []).slice().reverse();
  const evaluation = evaluatePendingVisit(live);
  const pending = live.pendingDarts || [];
  const selectedSegment =
    Number.isInteger(Number(live.pendingSegment)) &&
    Number(live.pendingSegment) >= 1 &&
    Number(live.pendingSegment) <= 20
      ? Number(live.pendingSegment)
      : null;
  const playerCanThrow = !dartbotTraining || (live.currentPlayerId === live.playerA && !live.botThinking);
  const locked = evaluation.bust || evaluation.checkout || pending.length >= 3 || !playerCanThrow;
  const canSubmit = playerCanThrow && (evaluation.bust || evaluation.checkout || pending.length === 3);
  const submitLabel = evaluation.checkout ? 'Zatwierdź checkout' : (evaluation.bust ? 'Zatwierdź BUST' : 'Zatwierdź wizytę');
  const backRoute = standalone ? 'single' : (dartbotTraining ? 'training' : 'live');
  const contextLabel = standalone
    ? `${live.doubleOut !== false ? 'Double Out' : 'Straight Out'} · pojedynczy mecz`
    : dartbotTraining
      ? `trening · ${live.completedLegs||0}/${Number(hub.trainingLive?.settings?.legsCount)||5} legów · pełny Double Out`
      : (match.bracketRound ? knockoutStageLabel(match.stageKey) : (match.group ? `Grupa ${match.group}` : 'mecz ligowy'));
  const headerActions = dartbotTraining
    ? `<button class="btn ghost" data-route="training">Zapisz i wyjdź</button><button class="btn danger" id="abandonTrainingRun">Usuń trening</button>`
    : `<button class="btn ghost" data-route="${backRoute}">Zapisz i wyjdź</button>`;
  return `
    ${pageHeader(
      dartbotTraining ? 'Trening meczowy' : 'Licznik X01',
      `${esc(scorerPlayerName(live.playerA))} vs ${esc(scorerPlayerName(live.playerB))}`,
      `${live.startScore || (standalone ? 501 : (dartbotTraining ? Number(hub.trainingLive?.settings?.startScore)||501 : matchStartScore(match)))} · ${dartbotTraining ? `sesja ${Number(hub.trainingLive?.settings?.legsCount)||5} legów` : matchRuleText(live.legsToWin || (standalone ? 1 : matchLegsToWin(match)), setsToWin)} · ${contextLabel}`,
      headerActions
    )}
    <div class="scorer ${dartbotTraining?'dartbot-scorer':''}">
      ${dartbotTraining ? renderDartbotScorerInfo(live) : ''}
      <div class="scoreboard">
        ${scorePlayer(live.playerA, statsA)}
        <div class="versus"><div class="match-score-center">
          ${setMode ? `<div class="score-center-line"><span>Sety</span><strong>${live.sets?.[live.playerA] || 0} : ${live.sets?.[live.playerB] || 0}</strong></div>` : ''}
          <div class="score-center-line"><span>Legi</span><strong>${live.legs[live.playerA]} : ${live.legs[live.playerB]}</strong></div>
          <div class="muted">${setMode ? `Set ${live.setNumber || 1} · ` : ''}Leg ${live.legNumber}</div>
        </div></div>
        ${scorePlayer(live.playerB, statsB)}
      </div>
      ${dartbotTraining && !playerCanThrow ? renderDartbotTurnHint(live) : renderCheckoutHint(live, evaluation)}
      <div class="entry-panel">
        <section class="card accent ${!playerCanThrow?'scorer-entry-disabled':''}">
          <div class="section-head"><div><h2>${dartbotTraining?'Wynik Twojej wizyty':'Wynik wizyty'}</h2><div class="muted">${playerCanThrow?'Rzuca':'Oczekiwanie'}: <strong class="green">${esc(scorerPlayerName(live.currentPlayerId))}</strong></div></div><button class="btn small ghost" id="toggleStarter" ${live.visits.some(v=>v.leg===live.legNumber)||live.botThinking?'disabled':''}>Zmień rozpoczynającego</button></div>
          <form id="scoreForm">
            <div class="visit-builder">
              <div class="dart-slots">${[0,1,2].map(index=>{
                const dart=pending[index];
                return `<div class="dart-slot ${dart?'filled':''}"><span>Lotka ${index+1}</span><strong>${dart?esc(dart.label):'—'}</strong><small>${dart?`${dart.value} pkt`:'oczekuje'}</small></div>`;
              }).join('')}</div>
              <div class="visit-total ${evaluation.bust?'bust':evaluation.checkout?'checkout':''}">
                <span>${evaluation.bust?'BUST':evaluation.checkout?'CHECKOUT':'Suma wizyty'}</span>
                <strong>${evaluation.bust?0:evaluation.enteredScore}</strong>
                <small>${evaluation.bust?`wynik wróci do ${evaluation.remainingBefore}`:`po zatwierdzeniu zostanie ${evaluation.remainingAfter}`}</small>
              </div>
            </div>

            <div class="dart-step-head"><span>1</span><div><strong>Wybierz numer pola</strong><small>Najpierw kliknij liczbę od 1 do 20.</small></div></div>
            <div class="dart-number-grid" aria-label="Wybierz numer pola">
              ${Array.from({length:20},(_,i)=>i+1).map(value=>`<button type="button" class="dart-number ${selectedSegment===value?'selected':''}" data-segment="${value}" ${locked?'disabled':''}>${value}</button>`).join('')}
            </div>
            <div class="dart-step-head second-step"><span>2</span><div><strong>Wybierz rodzaj trafienia</strong><small>${selectedSegment?`Wybrane pole: ${selectedSegment}`:'Najpierw wybierz numer pola.'}</small></div></div>
            <div class="multiplier-picker" aria-label="Wybierz rodzaj trafienia">
              ${[['S','Singiel',1],['D','Double',2],['T','Triple',3]].map(([code,label,multiplier])=>`<button type="button" class="multiplier-btn" data-multiplier="${code}" ${locked||!selectedSegment?'disabled':''}><b>${code}</b><span>${selectedSegment?`${label}: ${selectedSegment*multiplier} pkt`:label}</span></button>`).join('')}
            </div>
            <div class="dart-special-label">Bull lub pudło</div>
            <div class="dart-special-grid">
              <button type="button" class="dart-special" data-special="S25" ${locked?'disabled':''}><b>25</b><span>Outer Bull</span></button>
              <button type="button" class="dart-special" data-special="DBULL" ${locked?'disabled':''}><b>50</b><span>Bull</span></button>
              <button type="button" class="dart-special miss" data-special="MISS" ${locked?'disabled':''}><b>0</b><span>Pudło</span></button>
            </div>
            <div class="dart-actions">
              <button class="btn primary" type="submit" ${canSubmit?'':'disabled'}>${submitLabel}</button>
              <button class="btn ghost" type="button" id="undoDart" ${(playerCanThrow&&(pending.length||selectedSegment))?'':'disabled'}>Cofnij lotkę</button>
              <button class="btn ghost" type="button" id="clearDarts" ${(playerCanThrow&&(pending.length||selectedSegment))?'':'disabled'}>Wyczyść wizytę</button>
              <button class="btn ghost" type="button" id="undoVisit" ${live.undo.length?'':'disabled'}>Cofnij ostatnią wizytę</button>
            </div>
          </form>
          <div class="note" style="margin-top:14px">${dartbotTraining?'Wprowadź swoje lotki dokładnie tak jak w zwykłym meczu. Po trzeciej lotce wizyta zapisze się automatycznie, a Dartbot odpowie własnym rzutem i dopasuje poziom do Twojej aktualnej średniej.':'Najpierw wybierz numer pola, a następnie Singiel, Double albo Triple. Trzecia lotka automatycznie zapisuje wizytę, odejmuje punkty i przełącza zawodnika. Checkout i BUST również zapisują się automatycznie. Przed trzecią lotką możesz cofnąć lotkę albo wyczyścić wizytę.'}</div>
        </section>
        <section class="card">
          <div class="section-head"><h2>Historia wizyt</h2><span class="badge">${live.visits.length}</span></div>
          <div class="visit-history">${visits.length ? visits.map(v=>`<div class="visit ${v.playerId===live.playerB&&dartbotTraining?'bot-visit':''}"><div class="visit-player"><span>${esc(scorerPlayerName(v.playerId))}${v.checkout?' · checkout':''}${v.bust?' · BUST':''}</span>${visitNotation(v)?`<small>${esc(visitNotation(v))}${v.targetAverage?` · cel śr. ${fmt(v.targetAverage)}`:''}</small>`:''}</div><span class="vscore ${v.bust?'red':''}">${v.bust?'0':v.score}</span><span class="vrem">zostało ${v.remainingAfter}</span></div>`).join('') : empty('Pierwszy rzut','Wybierz trzy lotki, aby zapisać pierwszą wizytę.')}</div>
        </section>
      </div>
    </div>`;
}
function scorePlayer(playerId, stats) {
  const live = scorerLive();
  const current = live.currentPlayerId===playerId;
  const starter = live.legStarterId===playerId;
  return `<div class="score-player ${current?'active':''}">
    <div class="score-player-graphics">${starter?liveStarterGraphic():''}${current?liveTurnGraphic():''}</div>
    <div class="score-player-name">${esc(scorerPlayerName(playerId))}</div>
    <div class="remaining">${live.remaining[playerId]}</div>
    <div class="score-stats"><div><b>${fmt(stats.average)}</b><span>średnia</span></div><div><b>${stats.darts}</b><span>lotki</span></div><div><b>${stats.last ?? '—'}</b><span>ostatnia</span></div></div>
  </div>`;
}

function bindCurrentPage() {
  $('#showNewCompetition')?.addEventListener('click', openNewCompetitionCreator);
  $('#hideNewCompetition')?.addEventListener('click', () => { newCompetitionPanelOpen=false; render(); });
  $('#newCompetitionForm')?.addEventListener('submit', createCompetition);
  $('#newCompetitionFormat')?.addEventListener('change', updateNewCompetitionFields);
  $('#competitionFormat')?.addEventListener('change', updateCurrentCompetitionFields);
  updateNewCompetitionFields();
  $$('.start-training').forEach(b=>b.addEventListener('click',()=>openTrainingSetup(b.dataset.type)));
  $('#trainingSetupForm')?.addEventListener('submit',startTrainingSession);
  $('#resumeTraining')?.addEventListener('click',resumeTraining);
  $('#resumeTrainingCard')?.addEventListener('click',resumeTraining);
  $('#abandonTraining')?.addEventListener('click',abandonTraining);
  $('#abandonTrainingRun')?.addEventListener('click',abandonTraining);
  $$('.repeat-training').forEach(b=>b.addEventListener('click',()=>repeatTraining(b.dataset.id)));
  $$('.delete-training').forEach(b=>b.addEventListener('click',()=>deleteTraining(b.dataset.id)));
  $('#bobsForm')?.addEventListener('submit',submitBobsRound);
  $$('.checkout-success').forEach(b=>b.addEventListener('click',()=>submitCheckoutAttempt(true,Number(b.dataset.darts))));
  $('#checkoutFailed')?.addEventListener('click',()=>submitCheckoutAttempt(false,Number(hub.trainingLive?.settings?.maxDarts)||9));
  $('#finishTrainingNow')?.addEventListener('click',finishOpenTraining);
  $('#hundredForm')?.addEventListener('submit',submitHundredBatch);
  $('#jdcShanghaiForm')?.addEventListener('submit',submitJdcShanghai);
  $$('.jdc-double').forEach(b=>b.addEventListener('click',()=>submitJdcDouble(b.dataset.hit==='1')));
  $('#halveForm')?.addEventListener('submit',submitHalveRound);
  $('#session45Form')?.addEventListener('submit',submitSession45Stage);
  $('#singleMatchForm')?.addEventListener('submit', createSingleMatch);
  $('#resumeSingleMatch')?.addEventListener('click', resumeSingleMatch);
  $('#resumeSingleMatchCard')?.addEventListener('click', resumeSingleMatch);
  $('#abandonSingleMatch')?.addEventListener('click', abandonSingleMatch);
  $$('.single-rematch').forEach(b=>b.addEventListener('click',()=>startSingleRematch(b.dataset.id)));
  $$('.single-delete').forEach(b=>b.addEventListener('click',()=>deleteSingleMatch(b.dataset.id)));
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
  $$('[data-live-filter]').forEach(b=>b.addEventListener('click',()=>{liveFilter=b.dataset.liveFilter;render();}));
  $('#liveSearchForm')?.addEventListener('submit',event=>{event.preventDefault();liveSearch=String(new FormData(event.currentTarget).get('search')||'');render();});
  $('#clearLiveSearch')?.addEventListener('click',()=>{liveSearch='';render();});
  $('#refreshLive')?.addEventListener('click',()=>render());
  $$('[data-live-competition]').forEach(b=>b.addEventListener('click',()=>openCompetitionLive(b.dataset.liveCompetition,b.dataset.liveMatch)));
  $('[data-live-single]')?.addEventListener('click',()=>{route='singleScorer';render();});
  $('[data-live-training]')?.addEventListener('click',()=>{route='trainingRun';render();});
  $$('.start-match').forEach(b=>b.addEventListener('click',()=>startMatch(b.dataset.id)));
  $$('.manual-result').forEach(b=>b.addEventListener('click',()=>manualResult(b.dataset.id)));
  $$('.reopen-match').forEach(b=>b.addEventListener('click',()=>reopenMatch(b.dataset.id)));
  $$('[data-table-group]').forEach(b=>b.addEventListener('click',()=>{tableGroup=b.dataset.tableGroup;render();}));
  $('#scoreForm')?.addEventListener('submit', submitScore);
  $$('.multiplier-btn').forEach(b=>b.addEventListener('click',()=>addPendingDart(b.dataset.multiplier)));
  $$('.dart-number').forEach(b=>b.addEventListener('click',()=>selectDartSegment(Number(b.dataset.segment))));
  $$('.dart-special').forEach(b=>b.addEventListener('click',()=>addSpecialDart(b.dataset.special)));
  $('#undoDart')?.addEventListener('click', undoPendingDart);
  $('#clearDarts')?.addEventListener('click', clearPendingDarts);
  $('#undoVisit')?.addEventListener('click', undoVisit);
  $('#toggleStarter')?.addEventListener('click', toggleLegStarter);
  $('#exportData')?.addEventListener('click', exportData);
  $('#importData')?.addEventListener('change', importData);
  $('#resetAll')?.addEventListener('click', resetAll);
  $('#installBtnPage')?.addEventListener('click', installApp);
  $('#installBtn')?.addEventListener('click', installApp);
  if (isDartbotScorer()) maybeQueueDartbotTurn();
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
    setsToWin: Math.max(0, Number(data.get('setsToWin') ?? state.settings.setsToWin) || 0),
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
      setsToWin: Math.max(0, Number(data.get('setsToWin')) || 0),
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
    setsToWin:Math.max(0, Number(options.setsToWin ?? state.settings.setsToWin) || 0),
    status:'planned',
    legsA:0,
    legsB:0,
    setsA:0,
    setsB:0,
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

function createSingleLive(config = {}) {
  const playerA = uid('single_a');
  const playerB = uid('single_b');
  const startScore = Math.max(2, Number(config.startScore) || 501);
  const legsToWin = Math.max(1, Number(config.legsToWin) || 3);
  const setsToWin = Math.max(0, Number(config.setsToWin) || 0);
  const starter = config.starter === 'B' ? playerB : playerA;
  return {
    mode: 'single',
    matchId: uid('single_match'),
    title: String(config.title || '').trim() || `${config.playerAName} vs ${config.playerBName}`,
    playerA,
    playerB,
    playerNames: {
      [playerA]: String(config.playerAName || 'Gracz 1').trim() || 'Gracz 1',
      [playerB]: String(config.playerBName || 'Gracz 2').trim() || 'Gracz 2'
    },
    initialStarterId: starter,
    legStarterId: starter,
    currentPlayerId: starter,
    startScore,
    legsToWin,
    setsToWin,
    doubleOut: config.doubleOut !== false,
    remaining: {
      [playerA]: startScore,
      [playerB]: startScore
    },
    legs: {
      [playerA]: 0,
      [playerB]: 0
    },
    sets: {
      [playerA]: 0,
      [playerB]: 0
    },
    totalLegs: {
      [playerA]: 0,
      [playerB]: 0
    },
    setNumber: 1,
    legNumber: 1,
    visits: [],
    legRecords: [],
    undo: [],
    pendingDarts: [],
    pendingSegment: null,
    pendingMultiplier: 'S',
    startedAt: new Date().toISOString()
  };
}

function createSingleMatch(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const playerAName = String(data.get('playerAName') || '').trim();
  const playerBName = String(data.get('playerBName') || '').trim();
  if (!playerAName || !playerBName) return toast('Wpisz nazwy obu graczy');
  const startScore = Number(data.get('startScore'));
  const legsToWin = Number(data.get('legsToWin'));
  const setsToWin = Number(data.get('setsToWin'));
  if (!Number.isInteger(startScore) || startScore < 2 || startScore > 5000) return toast('Podaj prawidłową liczbę punktów startowych');
  if (!Number.isInteger(legsToWin) || legsToWin < 1 || legsToWin > 25) return toast('Podaj prawidłową liczbę wygranych legów');
  if (!Number.isInteger(setsToWin) || setsToWin < 0 || setsToWin > 15) return toast('Podaj prawidłową liczbę wygranych setów');
  if (hub.singleLive && !confirm('Pojedynczy mecz jest już rozpoczęty. Usunąć go i rozpocząć nowy?')) return;
  hub.singleLive = createSingleLive({
    title: String(data.get('title') || '').trim(),
    playerAName,
    playerBName,
    startScore,
    legsToWin,
    setsToWin,
    doubleOut: String(data.get('doubleOut')) !== 'false',
    starter: String(data.get('starter') || 'A')
  });
  saveHub();
  route = 'singleScorer';
  render();
  toast('Pojedynczy mecz rozpoczęty');
}

function resumeSingleMatch() {
  if (!hub.singleLive) return toast('Brak rozpoczętego pojedynczego meczu');
  route = 'singleScorer';
  render();
}

function abandonSingleMatch() {
  if (!hub.singleLive) return;
  if (!confirm('Usunąć rozpoczęty pojedynczy mecz? Niezapisanych wyników nie będzie można odzyskać.')) return;
  hub.singleLive = null;
  saveHub();
  render();
  toast('Rozpoczęty mecz został usunięty');
}

function startSingleRematch(id) {
  const item = (hub.singleMatches || []).find(match => match.id === id);
  if (!item) return;
  if (hub.singleLive && !confirm('Pojedynczy mecz jest już rozpoczęty. Zastąpić go rewanżem?')) return;
  hub.singleLive = createSingleLive({
    title: `${item.playerAName} vs ${item.playerBName} – rewanż`,
    playerAName: item.playerAName,
    playerBName: item.playerBName,
    startScore: item.startScore,
    legsToWin: item.legsToWin,
    setsToWin: item.setsToWin || 0,
    doubleOut: item.doubleOut !== false,
    starter: 'B'
  });
  saveHub();
  route = 'singleScorer';
  render();
  toast('Rewanż rozpoczęty');
}

function deleteSingleMatch(id) {
  const item = (hub.singleMatches || []).find(match => match.id === id);
  if (!item) return;
  if (!confirm(`Usunąć z historii mecz „${item.title}”?`)) return;
  hub.singleMatches = (hub.singleMatches || []).filter(match => match.id !== id);
  saveHub();
  render();
  toast('Mecz usunięty z historii');
}

function startMatch(id) {
  if (!ensureCompetitionOpen()) return;
  const match=state.matches.find(m=>m.id===id); if(!match) return;
  syncActiveCompetitionLive();
  state.live = normalizeCompetitionLive(match.liveData || (state.live?.matchId===id ? state.live : null), match, state.settings) || createLive(match);
  match.liveData = clone(state.live);
  match.status='live';
  saveState(); route='scorer'; render();
}

function createLive(match) {
  const startScore = matchStartScore(match);
  const legsToWin = matchLegsToWin(match);
  const setsToWin = matchSetsToWin(match);
  return {
    matchId:match.id,playerA:match.playerA,playerB:match.playerB,
    initialStarterId:match.playerA,legStarterId:match.playerA,currentPlayerId:match.playerA,
    startScore,legsToWin,setsToWin,doubleOut:state.settings.doubleOut!==false,
    remaining:{[match.playerA]:startScore,[match.playerB]:startScore},
    legs:{[match.playerA]:0,[match.playerB]:0},
    sets:{[match.playerA]:0,[match.playerB]:0},
    totalLegs:{[match.playerA]:0,[match.playerB]:0},
    setNumber:1,legNumber:1,visits:[],legRecords:[],undo:[],
    pendingDarts:[],pendingSegment:null,pendingMultiplier:'S',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
}

function manualResult(id) {
  if (!ensureCompetitionOpen()) return;
  const match=state.matches.find(m=>m.id===id); if(!match) return;
  const legTarget=matchLegsToWin(match);
  const setTarget=matchSetsToWin(match);
  let la=0,lb=0,sa=0,sb=0,winnerId=null;

  if(setTarget>0){
    const aSets=prompt(`Liczba setów: ${playerName(match.playerA)} (mecz do ${setTarget})`, String(match.setsA||0)); if(aSets===null)return;
    const bSets=prompt(`Liczba setów: ${playerName(match.playerB)} (mecz do ${setTarget})`, String(match.setsB||0)); if(bSets===null)return;
    sa=Number(aSets);sb=Number(bSets);
    if(!Number.isInteger(sa)||!Number.isInteger(sb)||sa<0||sb<0) return toast('Podaj prawidłowe liczby setów');
    if(sa===sb) return toast('Mecz rozgrywany do wygranych setów nie może zakończyć się remisem');
    if(Math.max(sa,sb)!==setTarget || Math.min(sa,sb)>=setTarget) return toast(`Zwycięzca musi zdobyć dokładnie ${setTarget} setów`);

    const aLegs=prompt(`Łączna liczba wygranych legów: ${playerName(match.playerA)}`, String(match.legsA||0)); if(aLegs===null)return;
    const bLegs=prompt(`Łączna liczba wygranych legów: ${playerName(match.playerB)}`, String(match.legsB||0)); if(bLegs===null)return;
    la=Number(aLegs);lb=Number(bLegs);
    if(!Number.isInteger(la)||!Number.isInteger(lb)||la<0||lb<0) return toast('Podaj prawidłowe liczby legów');
    winnerId=sa>sb?match.playerA:match.playerB;
  }else{
    const a=prompt(`Liczba legów: ${playerName(match.playerA)} (mecz do ${legTarget})`, String(match.legsA||0)); if(a===null)return;
    const b=prompt(`Liczba legów: ${playerName(match.playerB)} (mecz do ${legTarget})`, String(match.legsB||0)); if(b===null)return;
    la=Number(a);lb=Number(b);
    if(!Number.isInteger(la)||!Number.isInteger(lb)||la<0||lb<0) return toast('Podaj prawidłowe liczby legów');
    if(match.bracketRound){
      if(la===lb) return toast('W fazie pucharowej nie może być remisu');
      if(Math.max(la,lb)!==legTarget || Math.min(la,lb)>=legTarget) return toast(`Zwycięzca tego etapu musi zdobyć dokładnie ${legTarget} legów`);
    }
    winnerId=la===lb?null:(la>lb?match.playerA:match.playerB);
  }

  match.legsA=la;match.legsB=lb;match.setsA=sa;match.setsB=sb;match.status='completed';match.winnerId=winnerId;match.stats=null;match.completedAt=new Date().toISOString();match.liveData=null;
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
  match.status='planned';match.legsA=0;match.legsB=0;match.setsA=0;match.setsB=0;match.winnerId=null;match.stats=null;match.liveData=null;delete match.completedAt;
  saveState();render();
}

function snapshotLive() {
  const snap=clone(scorerLive());delete snap.undo;return snap;
}

const checkoutSuggestionCache = new Map();
const preferredFinishes = ['D20','D16','D18','D12','D10','D8','D14','D6','D4','D2','D1','D19','D17','D15','D13','D11','D9','D7','D5','D3','DBULL'];
const checkoutOverrides = {
  170:['T20','T20','DBULL'],167:['T20','T19','DBULL'],164:['T20','T18','DBULL'],161:['T20','T17','DBULL'],
  160:['T20','T20','D20'],157:['T20','T19','D20'],156:['T20','T20','D18'],152:['T20','T20','D16'],
  148:['T20','T16','D20'],144:['T20','T20','D12'],141:['T20','T19','D12'],140:['T20','T16','D16'],
  136:['T20','T20','D8'],132:['T20','T16','D12'],128:['T18','T18','D10'],124:['T20','T16','D8'],
  120:['T20','S20','D20'],116:['T20','S16','D20'],112:['T20','S12','D20'],108:['T20','S8','D20'],
  104:['T18','S10','D20'],100:['T20','D20'],99:['T19','S10','D16'],98:['T20','D19'],97:['T19','D20'],
  96:['T20','D18'],95:['T19','D19'],94:['T18','D20'],93:['T19','D18'],92:['T20','D16'],91:['T17','D20'],
  90:['T18','D18'],89:['T19','D16'],88:['T16','D20'],87:['T17','D18'],86:['T18','D16'],85:['T15','D20'],
  84:['T16','D18'],83:['T17','D16'],82:['T14','D20'],81:['T19','D12'],80:['T16','D16'],79:['T13','D20'],
  78:['T14','D18'],77:['T15','D16'],76:['T20','D8'],75:['T13','D18'],74:['T14','D16'],73:['T19','D8'],
  72:['T16','D12'],71:['T13','D16'],70:['T18','D8'],69:['T19','D6'],68:['T20','D4'],67:['T17','D8'],
  66:['T10','D18'],65:['T19','D4'],64:['T16','D8'],63:['T13','D12'],62:['T10','D16'],61:['T15','D8'],
  60:['S20','D20'],59:['S19','D20'],58:['S18','D20'],57:['S17','D20'],56:['S16','D20'],55:['S15','D20'],
  54:['S14','D20'],53:['S13','D20'],52:['S12','D20'],51:['S11','D20'],50:['DBULL'],49:['S9','D20'],
  48:['S16','D16'],47:['S15','D16'],46:['S14','D16'],45:['S13','D16'],44:['S12','D16'],43:['S11','D16'],
  42:['S10','D16'],41:['S9','D16'],40:['D20'],39:['S7','D16'],38:['D19'],37:['S5','D16'],36:['D18'],
  35:['S3','D16'],34:['D17'],33:['S1','D16'],32:['D16'],31:['S15','D8'],30:['D15'],29:['S13','D8'],
  28:['D14'],27:['S11','D8'],26:['D13'],25:['S9','D8'],24:['D12'],23:['S7','D8'],22:['D11'],
  21:['S5','D8'],20:['D10'],19:['S3','D8'],18:['D9'],17:['S1','D8'],16:['D8'],15:['S7','D4'],
  14:['D7'],13:['S5','D4'],12:['D6'],11:['S3','D4'],10:['D5'],9:['S1','D4'],8:['D4'],
  7:['S3','D2'],6:['D3'],5:['S1','D2'],4:['D2'],3:['S1','D1'],2:['D1']
};

function dartFromParts(segment, multiplier='S') {
  const value = Number(segment);
  const factor = multiplier==='T'?3:(multiplier==='D'?2:1);
  return {segment:value,multiplier,label:`${multiplier}${value}`,value:value*factor};
}

function specialDart(code) {
  if(code==='S25') return {segment:25,multiplier:'S',label:'S25',value:25};
  if(code==='DBULL') return {segment:25,multiplier:'D',label:'DBULL',value:50};
  return {segment:0,multiplier:'M',label:'MISS',value:0};
}

function isDoubleDart(dart) {
  return dart?.multiplier==='D';
}

function evaluatePendingVisit(live=scorerLive()) {
  const pending = Array.isArray(live?.pendingDarts) ? live.pendingDarts : [];
  const pid = live?.currentPlayerId;
  const before = Number(live?.remaining?.[pid] || 0);
  const doubleOut = scorerDoubleOut(live);
  let remaining = before;
  let enteredScore = 0;
  let bust = false;
  let checkout = false;
  for(const dart of pending){
    enteredScore += Number(dart.value || 0);
    const after = remaining - Number(dart.value || 0);
    const invalidFinish = after===0 && doubleOut && !isDoubleDart(dart);
    const impossibleRemainder = doubleOut && after===1;
    if(after<0 || impossibleRemainder || invalidFinish){
      bust = true;
      remaining = before;
      break;
    }
    remaining = after;
    if(after===0){
      checkout = true;
      break;
    }
  }
  return {
    remainingBefore:before,
    remainingAfter:bust?before:remaining,
    enteredScore,
    score:bust?0:enteredScore,
    bust,
    checkout,
    darts:pending.length
  };
}

function checkoutCandidateDarts() {
  const darts=[];
  for(let value=20;value>=1;value--) darts.push(dartFromParts(value,'T'));
  for(let value=20;value>=1;value--) darts.push(dartFromParts(value,'S'));
  for(let value=20;value>=1;value--) darts.push(dartFromParts(value,'D'));
  darts.push(specialDart('S25'),specialDart('DBULL'));
  return darts;
}

function finishingDarts(doubleOut=true) {
  if(!doubleOut) return checkoutCandidateDarts();
  return preferredFinishes.map(label=>label==='DBULL'?specialDart('DBULL'):dartFromParts(Number(label.slice(1)),'D'));
}

function routePenalty(route) {
  const finish = route.at(-1)?.label || '';
  let finishRank = preferredFinishes.indexOf(finish);
  if(finishRank<0) finishRank=50;
  if(finish==='D1') finishRank=50;
  if(finish==='D2') finishRank=35;
  const setupPenalty = route.slice(0,-1).reduce((sum,dart,index)=>{
    let rank=0;
    if(dart.multiplier==='T') rank=20-Number(dart.segment);
    else if(dart.multiplier==='S') rank=24+(20-Number(dart.segment));
    else if(dart.multiplier==='D') rank=50+(20-Number(dart.segment));
    else rank=80;
    return sum + rank*(index+1);
  },0);
  return finishRank*10 + setupPenalty*20;
}

function checkoutSuggestion(score, maxDarts=3, doubleOut=true) {
  score=Number(score);maxDarts=Math.max(0,Math.min(3,Number(maxDarts)||0));
  if(score<=0||maxDarts<=0)return null;
  const key=`${score}|${maxDarts}|${doubleOut?'D':'O'}`;
  if(checkoutSuggestionCache.has(key)) return checkoutSuggestionCache.get(key);
  if(doubleOut && checkoutOverrides[score] && checkoutOverrides[score].length<=maxDarts){
    const result=checkoutOverrides[score].slice();checkoutSuggestionCache.set(key,result);return result;
  }
  const setup=checkoutCandidateDarts();
  const finish=finishingDarts(doubleOut);
  for(let length=1;length<=maxDarts;length++){
    const routes=[];
    if(length===1){
      finish.forEach(last=>{if(last.value===score)routes.push([last]);});
    }else if(length===2){
      for(const first of setup) for(const last of finish) if(first.value+last.value===score)routes.push([first,last]);
    }else{
      for(const first of setup) for(const second of setup){
        const remaining=score-first.value-second.value;
        if(remaining<=0)continue;
        for(const last of finish) if(last.value===remaining)routes.push([first,second,last]);
      }
    }
    if(routes.length){
      routes.sort((a,b)=>routePenalty(a)-routePenalty(b));
      const result=routes[0].map(d=>d.label);
      checkoutSuggestionCache.set(key,result);return result;
    }
  }
  checkoutSuggestionCache.set(key,null);return null;
}

function renderCheckoutHint(live, evaluation) {
  if(evaluation.bust)return '';
  if(evaluation.checkout){
    return `<div class="checkout-hint checkout-ready" aria-live="polite"><span>Checkout</span><strong>${(live.pendingDarts||[]).map(d=>esc(d.label)).join(' · ')}</strong><small>Zamknięcie w ${(live.pendingDarts||[]).length} ${lotkaWord((live.pendingDarts||[]).length)}.</small></div>`;
  }
  const dartsLeft=3-(live.pendingDarts||[]).length;
  const suggestion=checkoutSuggestion(evaluation.remainingAfter,dartsLeft,scorerDoubleOut(live));
  if(!suggestion)return '';
  return `<div class="checkout-hint" aria-live="polite"><span>Podpowiedź checkout</span><strong>${suggestion.map(esc).join(' · ')}</strong><small>${evaluation.remainingAfter} punktów · możliwe w ${suggestion.length} ${lotkaWord(suggestion.length)}.</small></div>`;
}

function lotkaWord(count) {
  return count===1?'lotce':'lotkach';
}

function visitNotation(visit) {
  if(Array.isArray(visit?.throws)&&visit.throws.length) return visit.throws.map(d=>d.label).join(' · ');
  return visit?.notation || '';
}

function selectDartSegment(segment) {
  const live = scorerLive();

  if (!live) return;

  const evaluation = evaluatePendingVisit(live);

  if (
    evaluation.bust ||
    evaluation.checkout ||
    (live.pendingDarts || []).length >= 3
  ) {
    return;
  }

  const value = Number(segment);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 20
  ) {
    return;
  }

  live.pendingSegment = value;

  saveScorerState();
  render();
}

function autoSubmitPendingVisit() {
  const live = scorerLive();

  if (!live) return false;

  const evaluation = evaluatePendingVisit(live);
  const dartsCount = (
    live.pendingDarts || []
  ).length;

  const shouldSubmit =
    evaluation.bust ||
    evaluation.checkout ||
    dartsCount >= 3;

  if (!shouldSubmit) {
    return false;
  }

  /*
   * Zapisujemy trzecią lotkę w pamięci i pokazujemy ją
   * na ekranie. Następnie zatwierdzamy całą wizytę.
   */
  saveScorerState();
  render();

  setTimeout(() => {
    submitScore({
      preventDefault() {}
    });
  }, 0);

  return true;
}

function addPendingDart(multiplier) {
  const live = scorerLive();

  if (
    !live ||
    !['S','D','T'].includes(multiplier)
  ) {
    return;
  }

  const evaluation = evaluatePendingVisit(live);

  if (
    evaluation.bust ||
    evaluation.checkout ||
    (live.pendingDarts || []).length >= 3
  ) {
    return;
  }

  const value = Number(live.pendingSegment);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 20
  ) {
    return toast(
      'Najpierw wybierz numer pola'
    );
  }

  live.pendingDarts =
    live.pendingDarts || [];

  live.pendingDarts.push(
    dartFromParts(value, multiplier)
  );

  live.pendingSegment = null;

  if (autoSubmitPendingVisit()) {
    return;
  }

  saveScorerState();
  render();
}

function addSpecialDart(code) {
  const live = scorerLive();

  if (!live) return;

  const evaluation = evaluatePendingVisit(live);

  if (
    evaluation.bust ||
    evaluation.checkout ||
    (live.pendingDarts || []).length >= 3
  ) {
    return;
  }

  live.pendingDarts =
    live.pendingDarts || [];

  live.pendingSegment = null;

  live.pendingDarts.push(
    specialDart(code)
  );

  if (autoSubmitPendingVisit()) {
    return;
  }

  saveScorerState();
  render();
}

function undoPendingDart() {
  const live = scorerLive();

  if (!live) return;

  if (
    live.pendingSegment !== null &&
    live.pendingSegment !== undefined
  ) {
    live.pendingSegment = null;

    saveScorerState();
    render();

    return;
  }

  if (!live.pendingDarts?.length) {
    return;
  }

  live.pendingDarts.pop();

  saveScorerState();
  render();
}

function clearPendingDarts() {
  const live = scorerLive();

  if (!live) return;

  live.pendingDarts = [];
  live.pendingSegment = null;

  saveScorerState();
  render();
}

function checkoutWouldFinishMatch(live, playerId) {
  if (!live) return false;
  const nextLegs = (live.legs?.[playerId] || 0) + 1;
  if (!liveUsesSets(live)) return nextLegs >= Math.max(1, Number(live.legsToWin) || 1);
  const winsSet = nextLegs >= Math.max(1, Number(live.legsToWin) || 1);
  if (!winsSet) return false;
  const nextSets = (live.sets?.[playerId] || 0) + 1;
  return nextSets >= Math.max(1, Number(live.setsToWin) || 1);
}

function advanceLiveToNextLeg(live) {
  live.legNumber = Math.max(1, Number(live.legNumber) || 1) + 1;
  live.remaining[live.playerA] = Number(live.startScore || 501);
  live.remaining[live.playerB] = Number(live.startScore || 501);
  const other = live.initialStarterId === live.playerA ? live.playerB : live.playerA;
  live.legStarterId = live.legNumber % 2 === 1 ? live.initialStarterId : other;
  live.currentPlayerId = live.legStarterId;
}

function submitScore(event) {
  event.preventDefault();
  const live=scorerLive();if(!live)return;
  const dartbotTraining=isDartbotScorer();
  if(dartbotTraining && live.currentPlayerId!==live.playerA)return;
  live.pendingDarts=Array.isArray(live.pendingDarts)?live.pendingDarts:[];
  if(!live.pendingDarts.length)return toast('Wybierz co najmniej jedną lotkę');
  const evaluation=evaluatePendingVisit(live);
  if(!evaluation.bust&&!evaluation.checkout&&live.pendingDarts.length<3)return toast('Dodaj trzecią lotkę albo wybierz Pudło');
  const pid=live.currentPlayerId;
  if(!dartbotTraining && evaluation.checkout && checkoutWouldFinishMatch(live,pid) && !confirm(`Checkout ${evaluation.remainingBefore}. Zakończyć mecz zwycięstwem ${scorerPlayerName(pid)}?`)) return;
  live.undo.push(snapshotLive());
  if(live.undo.length>50)live.undo.shift();
  const throws=clone(live.pendingDarts);
  const visit={
    playerId:pid,
    score:evaluation.score,
    enteredScore:evaluation.enteredScore,
    darts:evaluation.darts,
    bust:evaluation.bust,
    checkout:evaluation.checkout,
    remainingBefore:evaluation.remainingBefore,
    remainingAfter:evaluation.remainingAfter,
    throws,
    notation:throws.map(d=>d.label).join(' · '),
    set:Math.max(1,Number(live.setNumber)||1),
    leg:live.legNumber,
    at:new Date().toISOString()
  };
  live.visits.push(visit);
  live.pendingDarts=[];
  live.pendingSegment=null;
  live.pendingMultiplier='S';
  live.updatedAt=new Date().toISOString();
  if(!evaluation.bust)live.remaining[pid]=evaluation.remainingAfter;
  if(evaluation.checkout){
    const winnerDarts=live.visits.filter(v=>v.leg===live.legNumber&&v.playerId===pid).reduce((sum,v)=>sum+v.darts,0);
    live.legRecords.push({set:Math.max(1,Number(live.setNumber)||1),leg:live.legNumber,winnerId:pid,darts:winnerDarts,checkout:evaluation.remainingBefore});
    live.totalLegs=live.totalLegs||{[live.playerA]:0,[live.playerB]:0};
    live.totalLegs[pid]=(live.totalLegs[pid]||0)+1;
    live.legs[pid]=(live.legs[pid]||0)+1;

    if(dartbotTraining)return advanceDartbotTrainingLeg(pid);

    if(liveUsesSets(live)){
      const setWon=live.legs[pid]>=Math.max(1,Number(live.legsToWin)||1);
      if(setWon){
        live.sets=live.sets||{[live.playerA]:0,[live.playerB]:0};
        live.sets[pid]=(live.sets[pid]||0)+1;
        if(live.sets[pid]>=Math.max(1,Number(live.setsToWin)||1)){
          finalizeLiveMatch(pid);return;
        }
        live.legs[live.playerA]=0;
        live.legs[live.playerB]=0;
        live.setNumber=Math.max(1,Number(live.setNumber)||1)+1;
        advanceLiveToNextLeg(live);
        toast(`Set dla ${scorerPlayerName(pid)}`);
      }else{
        advanceLiveToNextLeg(live);
        toast(`Leg dla ${scorerPlayerName(pid)}`);
      }
    }else{
      if(live.legs[pid]>=Number(live.legsToWin || 2)){
        finalizeLiveMatch(pid);return;
      }
      advanceLiveToNextLeg(live);
      toast(`Leg dla ${scorerPlayerName(pid)}`);
    }
  }else if(dartbotTraining){
    live.currentPlayerId=live.playerB;
    saveHub();render();maybeQueueDartbotTurn();return;
  }else{
    live.currentPlayerId=pid===live.playerA?live.playerB:live.playerA;
  }
  saveScorerState();render();
}

function finalizeLiveMatch(winnerId) {
  const live=scorerLive();
  if(!live)return;
  if(isDartbotScorer())return finishDartbotTraining(hub.trainingLive);

  const totalLegsA=live.totalLegs?.[live.playerA] ?? live.legs?.[live.playerA] ?? 0;
  const totalLegsB=live.totalLegs?.[live.playerB] ?? live.legs?.[live.playerB] ?? 0;
  const setsA=live.sets?.[live.playerA] || 0;
  const setsB=live.sets?.[live.playerB] || 0;

  if(isSingleScorer()){
    const statsA=summarizeLivePlayer(live.playerA,live);
    const statsB=summarizeLivePlayer(live.playerB,live);
    const completedAt=new Date().toISOString();
    const result=normalizeSingleMatchRecord({
      id:live.matchId,
      title:live.title,
      playerAName:live.playerNames?.[live.playerA] || 'Gracz 1',
      playerBName:live.playerNames?.[live.playerB] || 'Gracz 2',
      startScore:live.startScore,
      legsToWin:live.legsToWin,
      setsToWin:live.setsToWin || 0,
      doubleOut:live.doubleOut!==false,
      initialStarterName:live.playerNames?.[live.initialStarterId] || '',
      legsA:totalLegsA,
      legsB:totalLegsB,
      setsA,
      setsB,
      winnerName:live.playerNames?.[winnerId] || '',
      statsA,
      statsB,
      visits:clone(live.visits),
      legRecords:clone(live.legRecords),
      startedAt:live.startedAt,
      completedAt
    });
    hub.singleMatches=[
      result,
      ...(hub.singleMatches || []).filter(item=>item.id!==result.id)
    ];
    hub.singleLive=null;
    saveHub();
    route='single';
    render();
    toast(`Mecz wygrywa ${result.winnerName}`);
    return;
  }

  const match=state.matches.find(m=>m.id===live.matchId);
  if(!match)return;
  match.legsA=totalLegsA;match.legsB=totalLegsB;match.setsA=setsA;match.setsB=setsB;match.winnerId=winnerId;match.status='completed';match.completedAt=new Date().toISOString();
  match.stats={
    [live.playerA]:summarizeLivePlayer(live.playerA,live),
    [live.playerB]:summarizeLivePlayer(live.playerB,live)
  };
  match.liveData=null;
  state.live=null;
  const progress=progressCompetition();
  saveState();route=allLiveEntries().length?'live':'matches';render();
  if(progress==='knockout-created') toast('Mecz zakończony. Grupy zamknięte — utworzono fazę pucharową');
  else if(progress==='knockout-completed') toast(`Turniej wygrywa ${playerName(winnerId)}`);
  else toast(`Mecz wygrywa ${playerName(winnerId)}`);
}

function summarizeLivePlayer(pid, live=scorerLive()) {
  const visits=(live?.visits || []).filter(v=>v.playerId===pid);
  const totalScore=visits.reduce((s,v)=>s+v.score,0),totalDarts=visits.reduce((s,v)=>s+v.darts,0);
  const outs=visits.filter(v=>v.checkout).map(v=>v.remainingBefore);
  const wonLegs=(live?.legRecords || []).filter(l=>l.winnerId===pid).map(l=>l.darts);
  return {totalScore,totalDarts,average:totalDarts?totalScore/totalDarts*3:0,h100:visits.filter(v=>v.score>=100&&v.score<140).length,h140:visits.filter(v=>v.score>=140&&v.score<180).length,h180:visits.filter(v=>v.score===180).length,highOut:outs.length?Math.max(...outs):0,bestLeg:wonLegs.length?Math.min(...wonLegs):0};
}

function undoVisit() {
  const live=scorerLive();if(!live?.undo.length)return;
  if(dartbotTimer){clearTimeout(dartbotTimer);dartbotTimer=null;}
  const stack=live.undo.slice();const previous=stack.pop();
  if(isSingleScorer()) hub.singleLive={...previous,undo:stack};
  else if(isDartbotScorer()) hub.trainingLive.data={...previous,undo:stack,botThinking:false};
  else state.live={...previous,undo:stack};
  saveScorerState();render();toast('Cofnięto ostatnią wizytę');
}
function toggleLegStarter() {
  const live=scorerLive();if(!live)return;
  if(live.visits.some(v=>v.leg===live.legNumber))return;
  if(dartbotTimer){clearTimeout(dartbotTimer);dartbotTimer=null;}
  live.botThinking=false;
  live.legStarterId=live.legStarterId===live.playerA?live.playerB:live.playerA;
  live.currentPlayerId=live.legStarterId;
  if(live.legNumber===1)live.initialStarterId=live.legStarterId;
  saveScorerState();render();
  if(isDartbotScorer())maybeQueueDartbotTurn();
}
function livePlayerStats(pid, live=scorerLive()) {
  const visits=(live?.visits || []).filter(v=>v.playerId===pid);
  const total=visits.reduce((s,v)=>s+v.score,0),darts=visits.reduce((s,v)=>s+v.darts,0);
  return {average:darts?total/darts*3:0,darts,total,last:visits.length?(visits.at(-1).bust?'BUST':visits.at(-1).score):null};
}

function computeStandings(group='all') {
  const ids=state.players.filter(p=>group==='all'||p.group===group).map(p=>p.id);
  const rows=new Map(ids.map(id=>[id,{playerId:id,played:0,wins:0,draws:0,losses:0,legsFor:0,legsAgainst:0,diff:0,points:0,totalScore:0,totalDarts:0,average:0}]));
  state.matches.filter(m=>m.status==='completed'&&!m.bye&&(state.settings.format==='knockout'||!m.bracketRound)&&(group==='all'||m.group===group)).forEach(m=>{
    const a=rows.get(m.playerA),b=rows.get(m.playerB);if(!a||!b)return;
    a.played++;b.played++;a.legsFor+=m.legsA;a.legsAgainst+=m.legsB;b.legsFor+=m.legsB;b.legsAgainst+=m.legsA;
    if(m.winnerId===m.playerA){a.wins++;b.losses++;a.points+=Number(state.settings.pointsWin);b.points+=Number(state.settings.pointsLoss||0);}else if(m.winnerId===m.playerB){b.wins++;a.losses++;b.points+=Number(state.settings.pointsWin);a.points+=Number(state.settings.pointsLoss||0);}else{a.draws++;b.draws++;a.points+=Number(state.settings.pointsDraw);b.points+=Number(state.settings.pointsDraw);}
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


function openTrainingSetup(type) {
  trainingSetupType=trainingDefinition(type).id;
  route='trainingSetup';
  render();
}

function initialTrainingData(type, settings={}) {
  if(type==='bobs27') return {score:27,targetIndex:0,totalHits:0,rounds:[]};
  if(type==='checkout121') {const start=Number(settings.startTarget)||121;return {current:start,highest:start,floor:start,attempts:0,successes:0,failures:0,attemptLog:[]};}
  if(type==='hundred') return {segments:hundredSegments(settings.variant),segmentIndex:0,segmentDarts:0,totalDarts:0,points:0,singles:0,doubles:0,triples:0,misses:0,rounds:[]};
  if(type==='jdc') return {sequence:jdcSequence(),index:0,score:0,shanghais:0,doublesHit:0,rounds:[]};
  if(type==='halveit') return {index:0,score:0,misses:0,rounds:[]};
  if(type==='dartbot') return normalizeDartbotTrainingData({},settings);
  return {index:0,notes:[],rating:null};
}

function startTrainingSession(event) {
  event.preventDefault();
  if(hub.trainingLive && !confirm('Inny trening jest już rozpoczęty. Usunąć go i rozpocząć nowy?')) return;
  const form=new FormData(event.currentTarget);
  const type=String(form.get('type')||trainingSetupType||'bobs27');
  const playerName=String(form.get('playerName')||'').trim();
  if(!playerName)return toast('Podaj nazwę zawodnika');
  const settings={};
  if(type==='checkout121'){
    settings.startTarget=Number(form.get('startTarget'))||121;
    settings.maxDarts=Number(form.get('maxDarts'))||9;
    settings.safeLevels=[125,130,135].filter(level=>form.get(`safe${level}`));
  }
  if(type==='hundred')settings.variant=String(form.get('variant')||'t20');
  if(type==='dartbot'){
    settings.legsCount=Math.max(5,Math.min(25,Number(form.get('legsCount'))||5));
    settings.botAverage=Math.max(20,Math.min(110,Number(form.get('botAverage'))||50));
    settings.botAdvantagePct=Math.max(0,Math.min(50,Number(form.get('botAdvantagePct'))||0));
    settings.startScore=Math.max(2,Number(form.get('startScore'))||501);
    settings.checkoutThreshold=Math.max(2,Math.min(170,Number(form.get('checkoutThreshold'))||100));
    settings.checkoutDarts=Math.max(3,Math.min(30,Number(form.get('checkoutDarts'))||9));
    if(settings.checkoutDarts===3 && settings.checkoutThreshold>158)return toast('Przy limicie 3 lotek ustaw próg checkoutu maksymalnie na 158');
  }
  hub.trainingProfileName=playerName;
  hub.trainingLive={id:uid('training'),type,playerName,settings,data:initialTrainingData(type,settings),startedAt:new Date().toISOString()};
  saveHub();route='trainingRun';render();toast('Trening rozpoczęty');
}

function resumeTraining(){
  if(!hub.trainingLive)return;
  route='trainingRun';
  render();
}
function abandonTraining(){
  if(!hub.trainingLive)return;
  if(!confirm('Usunąć rozpoczęty trening bez zapisywania wyniku?'))return;
  if(dartbotTimer){clearTimeout(dartbotTimer);dartbotTimer=null;}
  hub.trainingLive=null;saveHub();route='training';render();toast('Rozpoczęty trening usunięty');
}
function repeatTraining(id){
  const session=(hub.trainingSessions||[]).find(item=>item.id===id);if(!session)return;
  trainingSetupType=session.type;hub.trainingProfileName=session.playerName||hub.trainingProfileName;route='trainingSetup';render();
}

function deleteTraining(id){
  const session=(hub.trainingSessions||[]).find(item=>item.id===id);if(!session)return;
  if(!confirm(`Usunąć zapis treningu „${trainingDefinition(session.type).name}”?`))return;
  hub.trainingSessions=(hub.trainingSessions||[]).filter(item=>item.id!==id);saveHub();render();toast('Trening usunięty z historii');
}

function completeTraining(summary={}) {
  const live=hub.trainingLive;if(!live)return;
  const record=normalizeTrainingSession({...clone(live),summary,completedAt:new Date().toISOString()});
  hub.trainingSessions=[record,...(hub.trainingSessions||[]).filter(item=>item.id!==record.id)];
  hub.trainingLive=null;saveHub();route='training';render();toast(`Zapisano trening: ${trainingDefinition(record.type).name}`);
}

function submitBobsRound(event){
  event.preventDefault();const live=hub.trainingLive;if(live?.type!=='bobs27')return;
  const hits=Math.max(0,Math.min(3,Number(new FormData(event.currentTarget).get('hits'))||0));
  const data=live.data,target=BOBS_TARGETS[data.targetIndex||0];
  data.score+=hits?target.value*hits:-target.value;data.totalHits=(data.totalHits||0)+hits;data.rounds.push({target:target.label,hits,score:data.score});
  if(data.score<0)return completeTraining({finalScore:data.score,totalHits:data.totalHits,failedAt:target.label,completedTargets:data.targetIndex});
  if(data.targetIndex>=BOBS_TARGETS.length-1)return completeTraining({finalScore:data.score,totalHits:data.totalHits,failedAt:null,completedTargets:BOBS_TARGETS.length});
  data.targetIndex++;saveHub();render();
}

function updateCheckoutFloor(live){
  const levels=(live.settings.safeLevels||[]).slice().sort((a,b)=>a-b);
  const reached=levels.filter(level=>live.data.highest>=level);
  live.data.floor=reached.length?Math.max(Number(live.settings.startTarget)||121,...reached):Number(live.settings.startTarget)||121;
}

function submitCheckoutAttempt(success,darts){
  const live=hub.trainingLive;if(live?.type!=='checkout121')return;
  const data=live.data;data.attempts++;data.attemptLog.push({target:data.current,success,darts,at:new Date().toISOString()});
  if(success){data.successes++;data.highest=Math.max(data.highest,data.current);data.current++;updateCheckoutFloor(live);}else{data.failures++;data.current=data.floor;}
  saveHub();render();
}

function finishOpenTraining(){
  const live=hub.trainingLive;if(!live)return;
  if(live.type==='checkout121'){
    const d=live.data;return completeTraining({highestTarget:d.highest,attempts:d.attempts,successes:d.successes,failures:d.failures,successRate:d.attempts?d.successes/d.attempts*100:0,safeFloor:d.floor});
  }
}

function submitHundredBatch(event){
  event.preventDefault();const live=hub.trainingLive;if(live?.type!=='hundred')return;
  const form=new FormData(event.currentTarget),data=live.data,segment=data.segments[data.segmentIndex];
  const s=Math.max(0,Number(form.get('single'))||0),d=Math.max(0,Number(form.get('double'))||0),t=segment.target==='Bull'?0:Math.max(0,Number(form.get('triple'))||0),m=Math.max(0,Number(form.get('miss'))||0),count=s+d+t+m,remaining=segment.limit-data.segmentDarts;
  if(count<1||count>Math.min(10,remaining))return toast(`Wpisz od 1 do ${Math.min(10,remaining)} lotek`);
  data.singles+=s;data.doubles+=d;data.triples+=t;data.misses+=m;data.totalDarts+=count;data.segmentDarts+=count;data.points+=s+d*2+t*3;data.rounds.push({target:segment.target,s,d,t,m,points:s+d*2+t*3});
  if(data.segmentDarts>=segment.limit){data.segmentIndex++;data.segmentDarts=0;}
  if(data.segmentIndex>=data.segments.length){const hits=data.singles+data.doubles+data.triples;const maxPoints=data.segments.reduce((sum,item)=>sum+item.limit*(item.target==='Bull'?2:3),0);return completeTraining({score:data.points,totalDarts:data.totalDarts,hitRate:data.totalDarts?hits/data.totalDarts*100:0,maxPoints,singles:data.singles,doubles:data.doubles,triples:data.triples,misses:data.misses});}
  saveHub();render();
}

function submitJdcShanghai(event){
  event.preventDefault();const live=hub.trainingLive;if(live?.type!=='jdc')return;
  const form=new FormData(event.currentTarget),data=live.data,task=data.sequence[data.index];
  const s=Math.max(0,Number(form.get('single'))||0),d=Math.max(0,Number(form.get('double'))||0),t=Math.max(0,Number(form.get('triple'))||0),m=Math.max(0,Number(form.get('miss'))||0);
  if(s+d+t+m!==3)return toast('W rundzie Shanghai zapisz dokładnie 3 lotki');
  const shanghai=s>0&&d>0&&t>0,points=s*task.target+d*task.target*2+t*task.target*3+(shanghai?100:0);
  data.score+=points;if(shanghai)data.shanghais++;data.rounds.push({label:task.label,s,d,t,m,shanghai,points});advanceJdc(live);
}

function submitJdcDouble(hit){
  const live=hub.trainingLive;if(live?.type!=='jdc')return;
  const data=live.data,task=data.sequence[data.index];if(hit){data.score+=50;data.doublesHit++;}data.rounds.push({label:task.label,hit,points:hit?50:0});advanceJdc(live);
}

function advanceJdc(live){
  live.data.index++;
  if(live.data.index>=live.data.sequence.length)return completeTraining({score:live.data.score,shanghais:live.data.shanghais,doublesHit:live.data.doublesHit,totalTasks:live.data.sequence.length});
  saveHub();render();
}

function submitHalveRound(event){
  event.preventDefault();const live=hub.trainingLive;if(live?.type!=='halveit')return;
  const points=Math.max(0,Number(new FormData(event.currentTarget).get('points'))||0),data=live.data,target=HALVE_IT_TARGETS[data.index];
  if(points===0){data.score=Math.floor(data.score/2);data.misses++;}else data.score+=points;
  data.rounds.push({target:target.label,points,score:data.score});data.index++;
  if(data.index>=HALVE_IT_TARGETS.length)return completeTraining({finalScore:data.score,misses:data.misses,rounds:HALVE_IT_TARGETS.length});
  saveHub();render();
}

function normalRandom(mean,sd){
  const u=Math.max(Number.EPSILON,Math.random()),v=Math.max(Number.EPSILON,Math.random());
  return mean+Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*sd;
}

const BOT_VISIT_ROUTE_CACHE = new Map();
const BOT_CHECKOUT_ROUTE_CACHE = new Map();

function botScoringDarts(){
  return [
    ...Array.from({length:20},(_,i)=>dartFromParts(20-i,'T')),
    ...Array.from({length:20},(_,i)=>dartFromParts(20-i,'S')),
    ...Array.from({length:20},(_,i)=>dartFromParts(20-i,'D')),
    specialDart('S25'),specialDart('DBULL'),specialDart('MISS')
  ];
}

function botRoutePenalty(route,score){
  const target=score/3;
  return route.reduce((sum,dart)=>sum+(dart.value===0?120:Math.pow(dart.value-target,2))+(dart.multiplier==='D'?4:0),0);
}

function botRouteForScore(score){
  const value=Math.max(0,Math.min(180,Math.round(Number(score)||0)));
  if(BOT_VISIT_ROUTE_CACHE.has(value))return clone(BOT_VISIT_ROUTE_CACHE.get(value));
  const darts=botScoringDarts(),byValue=new Map();
  darts.forEach(dart=>{const list=byValue.get(dart.value)||[];list.push(dart);byValue.set(dart.value,list);});
  let best=null,bestPenalty=Infinity;
  for(const first of darts){
    for(const second of darts){
      const needed=value-first.value-second.value;
      const thirds=byValue.get(needed)||[];
      for(const third of thirds){
        const route=[first,second,third],penalty=botRoutePenalty(route,value);
        if(penalty<bestPenalty){best=route;bestPenalty=penalty;}
      }
    }
  }
  const result=best||[specialDart('MISS'),specialDart('MISS'),specialDart('MISS')];
  BOT_VISIT_ROUTE_CACHE.set(value,result);return clone(result);
}

function nearestBotVisit(desired,maxScore,before){
  const target=Math.max(0,Math.min(180,Math.round(desired)));
  const upper=Math.max(0,Math.min(180,Math.floor(maxScore)));
  for(let radius=0;radius<=180;radius++){
    for(const score of [target-radius,target+radius]){
      if(score<0||score>upper)continue;
      if(before-score===1)continue;
      const route=botRouteForScore(score);
      if(route.reduce((sum,d)=>sum+d.value,0)===score)return {score,throws:route};
    }
  }
  return {score:0,throws:botRouteForScore(0)};
}

function extendedCheckoutRoute(score,maxDarts){
  const total=Math.max(2,Math.round(Number(score)||0));
  const limit=Math.max(1,Math.min(30,Math.round(Number(maxDarts)||3)));
  const key=`${total}:${limit}`;
  if(BOT_CHECKOUT_ROUTE_CACHE.has(key))return clone(BOT_CHECKOUT_ROUTE_CACHE.get(key));
  const setup=checkoutCandidateDarts().filter(d=>d.value>0);
  const finish=finishingDarts(true);
  const memo=new Map();
  function solve(remaining,dartsLeft){
    const memoKey=`${remaining}:${dartsLeft}`;
    if(memo.has(memoKey))return memo.get(memoKey);
    if(dartsLeft===1){
      const last=finish.find(d=>d.value===remaining)||null;
      const result=last?[last]:null;memo.set(memoKey,result);return result;
    }
    if(remaining<2||remaining>60*dartsLeft){memo.set(memoKey,null);return null;}
    for(const dart of setup){
      const after=remaining-dart.value;
      if(after<2||after===1)continue;
      const rest=solve(after,dartsLeft-1);
      if(rest){const result=[dart,...rest];memo.set(memoKey,result);return result;}
    }
    memo.set(memoKey,null);return null;
  }
  for(let length=1;length<=limit;length++){
    const result=solve(total,length);
    if(result){BOT_CHECKOUT_ROUTE_CACHE.set(key,result);return clone(result);}
  }
  BOT_CHECKOUT_ROUTE_CACHE.set(key,null);return null;
}

function buildBotCheckoutPlan(training){
  const data=training.data,before=data.remaining[data.playerB];
  const limit=Math.max(3,Number(training.settings.checkoutDarts)||9);
  const shortest=extendedCheckoutRoute(before,limit) || extendedCheckoutRoute(before,Math.max(6,limit));
  if(!shortest)return null;
  const range=dartbotAverageRange(training),target=(range.low+range.high)/2;
  const strength=Math.max(0,Math.min(1,(target-25)/75));
  const capacity=Math.max(0,limit-shortest.length);
  const misses=Math.max(0,Math.min(capacity,Math.round(capacity*(1-strength)*(0.45+Math.random()*.5))));
  const plan=[...Array.from({length:misses},()=>specialDart('MISS')),...shortest];
  data.botCheckoutPlan=clone(plan);
  data.botCheckoutDartsLeft=limit;
  data.botCheckoutStartedAt=before;
  return plan;
}

function currentBotTargetAverage(training){
  const data=training.data,range=dartbotAverageRange(training);
  const sampled=range.low+Math.random()*Math.max(0,range.high-range.low);
  data.botTargetAverage=sampled;
  return sampled;
}

function maybeQueueDartbotTurn(delay=650){
  const training=hub.trainingLive;
  if(route!=='trainingRun'||training?.type!=='dartbot')return;
  const data=training.data;
  if(!data||data.currentPlayerId!==data.playerB||dartbotTimer)return;
  data.botThinking=true;saveHub();
  dartbotTimer=setTimeout(()=>{
    dartbotTimer=null;
    const current=hub.trainingLive;
    if(current?.type!=='dartbot'||current.data.currentPlayerId!==current.data.playerB)return;
    current.data.botThinking=false;
    dartbotTurn();
  },delay);
}

function advanceDartbotTrainingLeg(winnerId){
  const training=hub.trainingLive;if(training?.type!=='dartbot')return;
  const data=training.data;
  data.completedLegs=(data.legs[data.playerA]||0)+(data.legs[data.playerB]||0);
  if(data.completedLegs>=Number(training.settings.legsCount||5))return finishDartbotTraining(training);
  data.legNumber=data.completedLegs+1;
  data.remaining[data.playerA]=Number(training.settings.startScore)||501;
  data.remaining[data.playerB]=Number(training.settings.startScore)||501;
  const other=data.initialStarterId===data.playerA?data.playerB:data.playerA;
  data.legStarterId=data.legNumber%2===1?data.initialStarterId:other;
  data.currentPlayerId=data.legStarterId;
  data.pendingDarts=[];data.pendingSegment=null;data.botCheckoutPlan=[];data.botCheckoutDartsLeft=null;data.botCheckoutStartedAt=null;data.botThinking=false;
  saveHub();render();toast(`Leg dla ${scorerPlayerName(winnerId)}`);maybeQueueDartbotTurn();
}

function finishDartbotTraining(live){
  if(dartbotTimer){clearTimeout(dartbotTimer);dartbotTimer=null;}
  const d=live.data,playerStats=summarizeLivePlayer(d.playerA,d),botStats=summarizeLivePlayer(d.playerB,d);
  completeTraining({
    playerLegs:d.legs[d.playerA]||0,
    botLegs:d.legs[d.playerB]||0,
    playerAverage:playerStats.average,
    botAverage:botStats.average,
    totalLegs:d.completedLegs,
    visits:d.visits.length,
    playerHighOut:playerStats.highOut,
    botHighOut:botStats.highOut,
    botAdvantagePct:Number(live.settings.botAdvantagePct)||0,
    checkoutThreshold:Number(live.settings.checkoutThreshold)||100,
    checkoutDarts:Number(live.settings.checkoutDarts)||9
  });
}

function dartbotTurn(){
  const training=hub.trainingLive;if(training?.type!=='dartbot')return;
  const data=training.data;if(data.currentPlayerId!==data.playerB)return;
  const before=Number(data.remaining[data.playerB]);
  const threshold=Number(training.settings.checkoutThreshold)||100;
  let throws=[],targetAverage=currentBotTargetAverage(training);
  if(before<=threshold){
    if(!Array.isArray(data.botCheckoutPlan)||!data.botCheckoutPlan.length)buildBotCheckoutPlan(training);
    throws=(data.botCheckoutPlan||[]).splice(0,3);
    if(!throws.length){
      const fallback=extendedCheckoutRoute(before,3)||botRouteForScore(0);
      throws=Array.isArray(fallback)?fallback.slice(0,3):botRouteForScore(0);
    }
  }else{
    const botStats=livePlayerStats(data.playerB,data);
    const desiredTotal=targetAverage/3*(botStats.darts+3);
    const desiredVisit=desiredTotal-botStats.total+normalRandom(0,Math.max(5,targetAverage*.08));
    const maxScore=Math.min(180,before-2);
    const visit=nearestBotVisit(desiredVisit,maxScore,before);
    throws=visit.throws;
  }
  let score=throws.reduce((sum,d)=>sum+Number(d.value||0),0);
  let after=before-score;
  const last=throws.at(-1),checkout=after===0&&isDoubleDart(last);
  if(after<0||after===1||(after===0&&!checkout)){
    score=0;after=before;throws=botRouteForScore(0);
  }
  const darts=throws.length||3;
  if(data.botCheckoutDartsLeft !== null && data.botCheckoutDartsLeft !== undefined && Number.isFinite(Number(data.botCheckoutDartsLeft)))data.botCheckoutDartsLeft=Math.max(0,Number(data.botCheckoutDartsLeft)-darts);
  data.remaining[data.playerB]=after;
  data.visits.push({
    playerId:data.playerB,score,enteredScore:score,darts,bust:false,checkout,
    remainingBefore:before,remainingAfter:after,throws:clone(throws),notation:throws.map(d=>d.label).join(' · '),
    leg:data.legNumber,at:new Date().toISOString(),targetAverage
  });
  if(checkout){
    const winnerDarts=data.visits.filter(v=>v.leg===data.legNumber&&v.playerId===data.playerB).reduce((sum,v)=>sum+v.darts,0);
    data.legRecords.push({leg:data.legNumber,winnerId:data.playerB,darts:winnerDarts,checkout:before});
    data.legs[data.playerB]++;
    return advanceDartbotTrainingLeg(data.playerB);
  }
  data.currentPlayerId=data.playerA;data.botThinking=false;
  if(after<=threshold&&data.botCheckoutDartsLeft===null)buildBotCheckoutPlan(training);
  saveHub();render();
}

function submitSession45Stage(event){
  event.preventDefault();const live=hub.trainingLive;if(live?.type!=='session45')return;const form=new FormData(event.currentTarget),data=live.data,stage=SESSION_45_STAGES[data.index];
  data.notes.push({stage:stage.title,note:String(form.get('note')||'').trim(),completedAt:new Date().toISOString()});
  if(data.index>=SESSION_45_STAGES.length-1){data.rating=Math.max(1,Math.min(10,Number(form.get('rating'))||7));return completeTraining({completedStages:SESSION_45_STAGES.length,rating:data.rating,notes:data.notes});}
  data.index++;saveHub();render();
}

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
      nextHub={
        ...imported,
        version:APP_VERSION,
        competitions,
        activeCompetitionId:competitions.some(c=>c.id===imported.activeCompetitionId)?imported.activeCompetitionId:competitions[0].id,
        singleMatches:Array.isArray(imported.singleMatches)?imported.singleMatches.map(normalizeSingleMatchRecord):[],
        singleLive:normalizeSingleLive(imported.singleLive),
        trainingSessions:Array.isArray(imported.trainingSessions)?imported.trainingSessions.map(normalizeTrainingSession):[],
        trainingLive:normalizeTrainingLive(imported.trainingLive),
        trainingProfileName:String(imported.trainingProfileName||'')
      };
    }else if(imported.settings&&Array.isArray(imported.players)&&Array.isArray(imported.matches)){
      const competition=normalizeCompetition(imported);
      nextHub={version:APP_VERSION,activeCompetitionId:competition.id,competitions:[competition],singleMatches:[],singleLive:null,trainingSessions:[],trainingLive:null,trainingProfileName:'',createdAt:competition.createdAt,updatedAt:new Date().toISOString()};
    }else throw new Error('format');
    if(!confirm('Import zastąpi całe obecne archiwum lig, turniejów, pojedynczych meczów i treningów. Kontynuować?'))return;
    hub=nextHub;
    state=hub.competitions.find(c=>c.id===hub.activeCompetitionId)||hub.competitions[0];
    progressCompetition();
    saveState();route='home';render();toast('Archiwum danych zaimportowane');
  }catch(e){console.error(e);toast('Nieprawidłowy plik kopii');}};reader.readAsText(file);
}

function resetAll() {
  if(!confirm('Usunąć całe archiwum: wszystkie ligi, turnieje, pojedyncze mecze, treningi, zawodników i wyniki?'))return;
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
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=1.6.1').catch(console.error));}

if (progressCompetition()) saveState();
render();

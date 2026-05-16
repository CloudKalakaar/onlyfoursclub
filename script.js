// ===== STATE =====
let state = {
    mode: null,
    players: [],
    teams: { 1: { name: 'Home', players: [] }, 2: { name: 'Away', players: [] } },
    scores: {},
    overs: 1,
    outRule: 'deduct',
    currentInningIndex: 0,
    currentBatterIndex: 0,
    ballsBowled: 0,
    currentScore: 0,
    currentBowler: null
};

let isNoBallActive = false;
let tossWinnerData = null;
let currentMatchStats = {};
let undoHistory = [];
let coinRotation = 0;

// ===== STORAGE (with file:// fallback) =====
const memStore = {};

function getLocal(key, def) {
    if (def === undefined) def = {};
    try {
        const v = localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : def;
    } catch(e) {
        return key in memStore ? memStore[key] : def;
    }
}

function setLocal(key, val) {
    try {
        localStorage.setItem(key, JSON.stringify(val));
    } catch(e) {
        memStore[key] = val;
    }
}

function getSession(key) {
    try { return sessionStorage.getItem(key); }
    catch(e) { return memStore['_session_' + key] || null; }
}

function setSession(key, val) {
    try { sessionStorage.setItem(key, val); }
    catch(e) { memStore['_session_' + key] = val; }
}

function removeSession(key) {
    try { sessionStorage.removeItem(key); }
    catch(e) { delete memStore['_session_' + key]; }
}

const KEYS = {
    AUTH: 'ofc_auth',
    MATCH: 'ofc_match',
    STATS: 'ofc_stats',
    SQUAD_SINGLE: 'ofc_sq_single',
    SQUAD_MULTI: 'ofc_sq_multi',
    SQUAD_PRACTICE: 'ofc_sq_practice'
};

// ===== INIT =====
window.onload = function() {
    if (getSession(KEYS.AUTH) === 'true') {
        showLoggedInUI();
        resumeOrStart();
    } else {
        showView('login-view');
    }
};

function showLoggedInUI() {
    document.getElementById('main-nav').style.display = 'flex';
    document.getElementById('logout-link').style.display = 'block';
}

function resumeOrStart() {
    const saved = getLocal(KEYS.MATCH, null);
    if (saved && saved.mode) {
        if (confirm('Resume unfinished match?')) {
            state = saved;
            updateScoreboard();
            showView('scoring-view');
        } else {
            setLocal(KEYS.MATCH, null);
            showView('type-view');
        }
    } else {
        showView('type-view');
    }
}

// ===== AUTH =====
function login() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;
    const err  = document.getElementById('login-error');
    if (user === 'admin' && pass === 'password123') {
        setSession(KEYS.AUTH, 'true');
        showLoggedInUI();
        resumeOrStart();
    } else {
        err.textContent = 'ACCESS DENIED — Invalid credentials';
    }
}

function logout() {
    if (!confirm('Log out from current session?')) return;
    removeSession(KEYS.AUTH);
    document.getElementById('main-nav').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'none';
    showView('login-view');
}



// ===== VIEW =====
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ===== PLAYERS =====
function addPlayer(listId, inputId) {
    const inp = document.getElementById(inputId);
    const name = inp.value.trim();
    if (!name) return;
    const li = document.createElement('li');
    li.innerHTML = `<span>${name}</span><span class="remove-btn" onclick="this.parentElement.remove()">❌</span>`;
    document.getElementById(listId).appendChild(li);
    inp.value = '';
    inp.focus();
}

function getPlayers(listId) {
    return Array.from(document.getElementById(listId).querySelectorAll('li'))
        .map(li => li.querySelector('span').textContent);
}

function loadLastSquad() {
    const activeView = document.querySelector('.view.active').id;
    let key, listIds;

    if (activeView === 'single-setup-view') {
        key = KEYS.SQUAD_SINGLE;
        listIds = ['sp-list'];
    } else if (activeView === 'multi-setup-view') {
        key = KEYS.SQUAD_MULTI;
        listIds = ['t1-list', 't2-list'];
    } else if (activeView === 'practice-setup-view') {
        key = KEYS.SQUAD_PRACTICE;
        listIds = ['pr-list'];
    }

    const sq = getLocal(key, null);
    if (!sq) return alert('No saved squad found for this mode.');

    if (activeView === 'multi-setup-view') {
        populateList('t1-list', sq.t1 || []);
        populateList('t2-list', sq.t2 || []);
    } else {
        populateList(listIds[0], sq.players || []);
    }
}

function populateList(listId, players) {
    const ul = document.getElementById(listId);
    ul.innerHTML = '';
    players.forEach(name => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${name}</span><span class="remove-btn" onclick="this.parentElement.remove()">❌</span>`;
        ul.appendChild(li);
    });
}

// ===== STATS =====
function loadStats() {
    const stats = getLocal(KEYS.STATS, {});
    const body = document.getElementById('stats-body');
    const sorted = Object.entries(stats).sort((a,b) => b[1].runs - a[1].runs);
    
    if (!sorted.length) {
        body.innerHTML = '<p style="text-align:center;opacity:0.5;padding:20px">No records yet</p>';
    } else {
        let rows = sorted.map(([p, d]) => {
            const sr = d.balls > 0 ? ((d.runs / d.balls) * 100).toFixed(0) : 0;
            return `
                <tr>
                    <td style="text-align:left; padding:8px 0;">${p}</td>
                    <td style="text-align:right; padding:8px 0;">${d.runs}</td>
                    <td style="text-align:right; padding:8px 0;">${d.bowl_wickets || 0}</td>
                    <td style="text-align:right; padding:8px 0; color:var(--primary); font-weight:800;">${sr}</td>
                </tr>
            `;
        }).join('');

        body.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem; color:var(--text-dim);">
                <thead style="border-bottom:1px solid var(--border);">
                    <tr>
                        <th style="text-align:left; padding-bottom:8px;">MEMBER</th>
                        <th style="text-align:right; padding-bottom:8px;">RUNS</th>
                        <th style="text-align:right; padding-bottom:8px;">WKTS</th>
                        <th style="text-align:right; padding-bottom:8px;">SR</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }
    showView('stats-view');
}

function clearStats() {
    if (!confirm('Purge all records?')) return;
    setLocal(KEYS.STATS, {});
    loadStats();
}

// ===== UNDO =====
function pushUndo() {
    if (undoHistory.length >= 8) undoHistory.shift();
    undoHistory.push({
        state: JSON.stringify(state),
        stats: JSON.stringify(currentMatchStats),
        nb: isNoBallActive
    });
}

function undoLastBall() {
    if (!undoHistory.length) return alert('Nothing to undo');
    const snap = undoHistory.pop();
    state = JSON.parse(snap.state);
    currentMatchStats = JSON.parse(snap.stats);
    isNoBallActive = snap.nb;
    updateScoreboard();
    setLocal(KEYS.MATCH, state);
}

// ===== SINGLE PLAYER START =====
function startSinglePlayer() {
    const players = getPlayers('sp-list');
    if (players.length < 2) return alert('Add at least 2 players');
    // Fisher-Yates shuffle
    for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
    }
    state = {
        mode: 'single', players,
        teams: null, scores: {},
        overs: parseInt(document.getElementById('sp-overs').value) || 1,
        outRule: document.getElementById('sp-rule').value,
        currentInningIndex: 0, currentBatterIndex: 0,
        ballsBowled: 0, currentScore: 0, currentBowler: null
    };
    players.forEach(p => state.scores[p] = 0);
    setLocal(KEYS.SQUAD_SINGLE, { players });
    currentMatchStats = {};
    undoHistory = [];
    beginInning();
}

// ===== MULTIPLAYER TOSS =====
function startMultiplayerToss() {
    const ta = getPlayers('t1-list');
    const tb = getPlayers('t2-list');
    if (ta.length < 1 || tb.length < 1) return alert('Each team needs at least 1 player');

    state.mode = 'multi';
    state.teams[1].players = ta;
    state.teams[2].players = tb;
    state.overs = parseInt(document.getElementById('mp-overs').value) || 1;
    setLocal(KEYS.SQUAD_MULTI, { t1: ta, t2: tb });
    state.scores = { 1: 0, 2: 0 };

    const winner = Math.random() < 0.5 ? 'Home' : 'Away';
    tossWinnerData = { ta, tb, winner, overs: state.overs };

    const shuffler = document.getElementById('toss-shuffler');
    document.getElementById('toss-title').textContent = 'CHOOSING WINNER...';
    document.getElementById('toss-choices').style.display = 'none';
    document.getElementById('toss-modal').classList.add('active');

    let count = 0;
    const names = ['HOME', 'AWAY'];
    const interval = setInterval(() => {
        shuffler.textContent = names[count % 2];
        shuffler.classList.toggle('neon-flash');
        count++;
        if (count > 20) {
            clearInterval(interval);
            shuffler.textContent = winner.toUpperCase();
            shuffler.classList.add('neon-winner');
            document.getElementById('toss-title').textContent = `${winner.toUpperCase()} WON!`;
            document.getElementById('toss-result-text').textContent = `${winner} team wins the toss! What will you do?`;
            document.getElementById('toss-choices').style.display = 'block';
        }
    }, 100);
}

function setTossChoice(choice) {
    document.getElementById('toss-modal').classList.remove('active');
    const { ta, tb, winner, overs } = tossWinnerData;
    let bat, bowl;
    if ((winner === 'Home' && choice === 'bat') || (winner === 'Away' && choice === 'bowl')) {
        bat = { name: 'Home', players: ta };
        bowl = { name: 'Away', players: tb };
    } else {
        bat = { name: 'Away', players: tb };
        bowl = { name: 'Home', players: ta };
    }
    state = {
        mode: 'multi',
        teams: { 1: bat, 2: bowl },
        players: null, scores: { 1: 0, 2: 0 },
        overs, outRule: 'deduct',
        currentInningIndex: 0, currentBatterIndex: 0,
        ballsBowled: 0, currentScore: 0, currentBowler: null
    };
    setLocal(KEYS.SQUAD_MULTI, { t1: ta, t2: tb });
    currentMatchStats = {};
    undoHistory = [];
    beginInning();
}

// ===== INNING SETUP =====
function beginInning() {
    state.ballsBowled = 0;
    state.currentScore = 0;
    state.currentBatterIndex = 0;
    state.currentBowler = null;
    isNoBallActive = false;

    closeAllModals();
    showView('scoring-view');

    // Pre-init stats for all batting players
    const batters = state.mode === 'single'
        ? [state.players[state.currentInningIndex]]
        : state.teams[state.currentInningIndex + 1].players;
    batters.forEach(p => {
        if (!currentMatchStats[p]) currentMatchStats[p] = { runs:0, balls:0, matches:1, bowl_runs:0, bowl_wickets:0 };
    });

    if (state.mode === 'multi') openBatterModal('Next Batter');
    else updateScoreboard();
}

function updateScoreboard() {
    let batter;
    if (state.mode === 'single') {
        batter = state.players[state.currentInningIndex];
    } else {
        batter = state.teams[state.currentInningIndex + 1].players[state.currentBatterIndex];
    }

    document.getElementById('current-batter').textContent = `BAT: ${batter}`;
    document.getElementById('current-bowler').textContent = state.currentBowler
        ? `🎯 BOWL: ${state.currentBowler}`
        : '🎯 SELECT BOWLER';
    document.getElementById('current-score').textContent = String(state.currentScore).padStart(2, '0');

    const ov = Math.floor(state.ballsBowled / 6);
    const bl = state.ballsBowled % 6;
    document.getElementById('overs-info').textContent = `OVR: ${ov}.${bl}/${state.overs}`;

    let tgt = '--';
    if (state.mode === 'multi' && state.currentInningIndex === 1) {
        tgt = (state.scores[1] || 0) + 1;
    } else if (state.mode === 'single') {
        // Find the next person's score to beat in Solo Mode
        const otherScores = Object.entries(state.scores)
            .filter(([name, score]) => name !== batter)
            .map(([name, score]) => ({ name, score }))
            .sort((a, b) => a.score - b.score);
        
        const nextTarget = otherScores.find(s => s.score >= state.currentScore);
        if (nextTarget) {
            tgt = `${nextTarget.score + 1} (${nextTarget.name})`;
        } else if (otherScores.length > 0) {
            tgt = "BEAT ALL";
        }
    }
    document.getElementById('target-info').textContent = `TGT: ${tgt}`;

    setLocal(KEYS.MATCH, state);
}

// ===== SCORING =====
function addScore(runs) {
    if (!state.currentBowler) { openBowlerModal(); return; }
    pushUndo();

    // No extra runs for No Ball in this club - just the runs scored
    const total = runs;
    state.currentScore += total;
    recordStats(runs, false);

    if (runs === 4) triggerAnim('anim-four');

    if (isNoBallActive) {
        deactivateNoBall();
    } else {
        state.ballsBowled++;
    }
    state.currentBowler = null;
    checkOver();
}

function handleOut() {
    if (!state.currentBowler) { openBowlerModal(); return; }

    if (isNoBallActive) {
        alert('NO BALL — wicket does not count!');
        // No extra run for no ball even on wicket
        deactivateNoBall();
        state.currentBowler = null;
        updateScoreboard();
        return;
    }

    pushUndo();
    recordStats(0, true);
    triggerAnim('anim-out');

    if (state.outRule === 'deduct') {
        state.currentScore -= 2;
        state.ballsBowled++;
        state.currentBowler = null;
        updateScoreboard();

        // Check if inning is over before asking for new batter/bowler
        if (state.ballsBowled >= state.overs * 6) {
            return endInning();
        }

        if (state.mode === 'multi') openBatterModal('New Batter');
        else checkOver();
    } else {
        endInning();
    }
}

function toggleNoBall() {
    isNoBallActive = !isNoBallActive;
    document.getElementById('btn-noball').classList.toggle('nb-active', isNoBallActive);
}

function deactivateNoBall() {
    isNoBallActive = false;
    document.getElementById('btn-noball').classList.remove('nb-active');
}

function recordStats(runs, isWicket) {
    const batter = state.mode === 'single'
        ? state.players[state.currentInningIndex]
        : state.teams[state.currentInningIndex + 1].players[state.currentBatterIndex];
    const bowler = state.currentBowler;

    if (!currentMatchStats[batter]) currentMatchStats[batter] = { runs:0, balls:0, matches:1, bowl_runs:0, bowl_wickets:0 };
    if (!currentMatchStats[bowler]) currentMatchStats[bowler] = { runs:0, balls:0, matches:1, bowl_runs:0, bowl_wickets:0 };

    currentMatchStats[batter].runs  += runs;
    currentMatchStats[batter].balls += 1;
    currentMatchStats[bowler].bowl_runs += runs;
    if (isWicket) currentMatchStats[bowler].bowl_wickets += 1;
}

function checkOver() {
    updateScoreboard();
    // Chase win check
    if (state.mode === 'multi' && state.currentInningIndex === 1 && state.currentScore >= state.scores[1] + 1) {
        return endInning();
    }
    if (state.ballsBowled >= state.overs * 6) return endInning();
    // Prompt bowler for next ball
    setTimeout(openBowlerModal, 300);
}

function endInning() {
    if (state.mode === 'single') {
        state.scores[state.players[state.currentInningIndex]] = state.currentScore;
        state.currentInningIndex++;
        if (state.currentInningIndex >= state.players.length) return finishMatch();
    } else {
        state.scores[state.currentInningIndex + 1] = state.currentScore;
        state.currentInningIndex++;
        if (state.currentInningIndex >= 2) return finishMatch();
    }
    alert('Innings complete!');
    beginInning();
}

function finishMatch() {
    // Save career stats
    const global = getLocal(KEYS.STATS, {});
    Object.entries(currentMatchStats).forEach(([p, d]) => {
        if (!global[p]) global[p] = { runs:0, balls:0, matches:0, bowl_runs:0, bowl_wickets:0 };
        global[p].runs    += d.runs;
        global[p].balls   += d.balls;
        global[p].matches += 1;
        global[p].bowl_runs    += d.bowl_runs;
        global[p].bowl_wickets += d.bowl_wickets;
    });
    setLocal(KEYS.STATS, global);
    setLocal(KEYS.MATCH, null);

    // Winner message
    let winner = '';
    if (state.mode === 'single') {
        const sorted = Object.entries(state.scores).sort((a,b) => b[1] - a[1]);
        winner = `${sorted[0][0]} wins with ${sorted[0][1]} runs! 👑`;
    } else {
        const [s1, s2] = [state.scores[1], state.scores[2]];
        const [t1, t2] = [state.teams[1].name, state.teams[2].name];
        if (s1 > s2)      winner = `${t1} wins by ${s1 - s2} runs! 🏆`;
        else if (s2 > s1) winner = `${t2} wins! 🏆`;
        else               winner = "It's a TIE! 🤝";
    }

    const sc = document.getElementById('match-scorecard');
    let rows = Object.entries(currentMatchStats).map(([p,d]) => `
        <tr>
            <td style="text-align:left; padding:8px 0;">${p}</td>
            <td style="text-align:right; padding:8px 0;">${d.runs}(${d.balls})</td>
            <td style="text-align:right; padding:8px 0; color:var(--primary); font-weight:800;">${d.bowl_wickets}W</td>
        </tr>
    `).join('');

    sc.innerHTML = `
        <div class="winner-banner">${winner}</div>
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem; color:var(--text-dim);">
            <thead style="border-bottom:1px solid var(--border);">
                <tr>
                    <th style="text-align:left; padding-bottom:8px;">PLAYER</th>
                    <th style="text-align:right; padding-bottom:8px;">BATTING</th>
                    <th style="text-align:right; padding-bottom:8px;">WICKETS</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    showView('result-view');
}

function resetMatch() {
    state = { mode:null, players:[], teams:{1:{name:'Home',players:[]},2:{name:'Away',players:[]}}, scores:{}, overs:1, outRule:'deduct', currentInningIndex:0, currentBatterIndex:0, ballsBowled:0, currentScore:0, currentBowler:null };
    currentMatchStats = {};
    undoHistory = [];
    showView('type-view');
}

// ===== MODALS =====
function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

function openBatterModal(title) {
    document.getElementById('modal-title').textContent = title;
    const sel = document.getElementById('batter-select');
    sel.innerHTML = state.teams[state.currentInningIndex + 1].players
        .map((p,i) => `<option value="${i}">${p}</option>`).join('');
    document.getElementById('batter-modal').classList.add('active');
}

function retireBatsman() {
    if (state.mode === 'multi') {
        openBatterModal('Swap Batter');
    } else if (state.mode === 'single') {
        // In Solo mode, swap with any other player who hasn't played yet?
        // Actually, just let them pick from the whole list
        const sel = document.getElementById('batter-select');
        sel.innerHTML = state.players.map((p, i) => `<option value="${i}">${p}</option>`).join('');
        document.getElementById('modal-title').textContent = 'Swap Player';
        document.getElementById('batter-modal').classList.add('active');
    }
}

function confirmBatter() {
    state.currentBatterIndex = parseInt(document.getElementById('batter-select').value);
    if (state.mode === 'single') {
        state.currentInningIndex = state.currentBatterIndex;
    }
    document.getElementById('batter-modal').classList.remove('active');
    updateScoreboard();
    setTimeout(openBowlerModal, 400);
}

function openBowlerModal() {
    let options;
    if (state.mode === 'single') {
        options = state.players.filter(p => p !== state.players[state.currentInningIndex]);
    } else {
        // Bowling team is opposite to batting team
        const bowlingTeamIdx = state.currentInningIndex === 0 ? 2 : 1;
        options = state.teams[bowlingTeamIdx].players;
    }
    const sel = document.getElementById('bowler-select');
    sel.innerHTML = options.map(p => `<option value="${p}">${p}</option>`).join('');
    document.getElementById('bowler-modal').classList.add('active');
}

function confirmBowler() {
    state.currentBowler = document.getElementById('bowler-select').value;
    document.getElementById('bowler-modal').classList.remove('active');
    updateScoreboard();
}

// Keep old names for onclick compatibility
function showBowlerModal() { openBowlerModal(); }

function retireBatsman() {
    if (state.mode === 'multi') openBatterModal('Swap Batter');
}

// ===== ANIMATIONS =====
function triggerAnim(id) {
    const el = document.getElementById(id);
    el.classList.add('playing');
    setTimeout(() => el.classList.remove('playing'), 1500);
}

// ===== PRACTICE MODE LOGIC =====
let practiceState = {
    players: [],
    currentIndex: 0,
    limit: 30,
    counts: [],
    finished: []
};

function startPractice() {
    const players = getPlayers('pr-list');
    if (players.length < 1) return alert('Add at least 1 player');
    
    practiceState = {
        players: players,
        currentIndex: 0,
        limit: parseInt(document.getElementById('pr-balls').value) || 30,
        counts: players.map(() => 0),
        finished: players.map(() => false)
    };

    setLocal(KEYS.SQUAD_PRACTICE, { players });
    
    // Switch to view first, then immediately ask who starts
    showView('practice-view');
    setTimeout(openPracticeModal, 400);
}

function openPracticeModal() {
    const sel = document.getElementById('practice-player-select');
    // Filter out finished players unless everyone is finished
    const activeIndices = practiceState.players
        .map((p, i) => i)
        .filter(i => !practiceState.finished[i]);
    
    if (activeIndices.length === 0) {
        return endPractice();
    }

    sel.innerHTML = activeIndices.map(i => `<option value="${i}">${practiceState.players[i]}</option>`).join('');
    document.getElementById('practice-player-modal').classList.add('active');
}

function finishPlayerSession() {
    const idx = practiceState.currentIndex;
    practiceState.finished[idx] = true;
    
    const remaining = practiceState.finished.filter(f => !f).length;
    if (remaining > 0) {
        alert(`${practiceState.players[idx]} finished their session. Please select the next player.`);
        openPracticeModal();
    } else {
        endPractice();
    }
}

function confirmPracticePlayer() {
    practiceState.currentIndex = parseInt(document.getElementById('practice-player-select').value);
    document.getElementById('practice-player-modal').classList.remove('active');
    updatePracticeUI();
}

function countBall() {
    const idx = practiceState.currentIndex;
    if (practiceState.counts[idx] < practiceState.limit) {
        practiceState.counts[idx]++;
        updatePracticeUI();
        
        // Visual feedback
        const ballEl = document.getElementById('pr-ball-count');
        ballEl.style.transform = 'scale(1.2)';
        ballEl.style.color = 'var(--accent)';
        setTimeout(() => {
            ballEl.style.transform = 'scale(1)';
            ballEl.style.color = 'var(--primary)';
        }, 150);

        if (practiceState.counts[idx] === practiceState.limit) {
            alert(`${practiceState.players[idx]} reached the limit!`);
        }
    }
}

function nextPracticePlayer() {
    practiceState.currentIndex = (practiceState.currentIndex + 1) % practiceState.players.length;
    updatePracticeUI();
}

function endPractice() {
    const sc = document.getElementById('match-scorecard');
    let rows = practiceState.players.map((p, i) => `
        <tr>
            <td style="text-align:left; padding:8px 0;">${p}</td>
            <td style="text-align:right; padding:8px 0; color:var(--primary); font-weight:800;">${practiceState.counts[i]} / ${practiceState.limit}</td>
        </tr>
    `).join('');

    sc.innerHTML = `
        <h3 style="color:var(--primary); margin-bottom:15px; text-align:center;">Session Results</h3>
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem; color:var(--text-dim);">
            <thead style="border-bottom:1px solid var(--border);">
                <tr>
                    <th style="text-align:left; padding-bottom:8px;">PLAYER</th>
                    <th style="text-align:right; padding-bottom:8px;">BALLS</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
    
    showView('result-view');
}

function updatePracticeUI() {
    const idx = practiceState.currentIndex;
    const count = practiceState.counts[idx];
    const limit = practiceState.limit;
    const name = practiceState.players[idx];
    
    document.getElementById('pr-player-name').textContent = name;
    document.getElementById('pr-ball-count').textContent = count;
    document.getElementById('pr-limit-text').textContent = `of ${limit} balls`;
    
    const percent = (count / limit) * 100;
    document.getElementById('pr-progress').style.width = `${percent}%`;
}

// ===== PULL TO REFRESH LOGIC =====
let touchStartY = 0;
const PTR_THRESHOLD = 180;

window.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY;
    if (window.scrollY === 0 && diff > 50) {
        document.body.classList.add('ptr-active');
        const indicator = document.getElementById('ptr-indicator');
        if (diff > PTR_THRESHOLD) {
            indicator.innerText = "RELEASE TO UPDATE APP";
            indicator.style.color = "var(--accent)";
        } else {
            indicator.innerText = "PULL TO REFRESH...";
            indicator.style.color = "#fff";
        }
    }
}, { passive: true });

window.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchEndY - touchStartY;
    if (window.scrollY === 0 && diff > PTR_THRESHOLD) {
        // Force a cache-busting reload to get latest GitHub push
        const baseUrl = window.location.origin + window.location.pathname;
        window.location.href = baseUrl + "?v=" + Date.now();
    } else {
        document.body.classList.remove('ptr-active');
    }
    touchStartY = 0;
});

function logout() {
    if (!confirm('Log out?')) return;
    removeSession(KEYS.AUTH);
    const baseUrl = window.location.origin + window.location.pathname;
    window.location.href = baseUrl + "?v=" + Date.now();
}

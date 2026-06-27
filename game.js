// ============================================================
// game.js — Aura 小游戏模块 (AI 驱动)
// 用法：GameModule.open({ chatId, isGroup })
// ============================================================
const GameModule = (() => {

  // ================================================================
  // GameDB — 独立 IndexedDB，持久化游戏记录与积分
  // ================================================================
  const GameDB = (() => {
    let _db = null;
    function _open() {
      return new Promise((res, rej) => {
        const req = indexedDB.open('GameModuleDB_v1', 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('game_records')) db.createObjectStore('game_records', { keyPath: 'id', autoIncrement: true });
          if (!db.objectStoreNames.contains('game_scores')) db.createObjectStore('game_scores', { keyPath: 'id' });
        };
        req.onsuccess = e => { _db = e.target.result; res(); };
        req.onerror = () => rej(req.error);
      });
    }
    function _s(name, mode) { return _db.transaction(name, mode).objectStore(name); }
    const init    = () => _db ? Promise.resolve() : _open();
    const get     = (s, k) => new Promise((r,j) => { const q=_s(s,'readonly').get(k); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
    const getAll  = s     => new Promise((r,j) => { const q=_s(s,'readonly').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });
    const put     = (s,v) => new Promise((r,j) => { const q=_s(s,'readwrite').put(v); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });
    const del     = (s,k) => new Promise((r,j) => { const q=_s(s,'readwrite').delete(k); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });
    return { init, get, getAll, put, del };
  })();

  // ── 注入 CSS（全部 scope 在 #game-root 下）──
  const _injectCSS = () => {
    if (document.getElementById('game-module-style')) return;
    const style = document.createElement('style');
    style.id = 'game-module-style';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Noto+Sans+SC:wght@300;400;700&family=Space+Grotesk:wght@300;400;600&display=swap');

      #game-root {
        --gm-bg: #08080c;
        --gm-text: #f0f0f3;
        --gm-text-sub: #888890;
        --gm-accent: #d4b87a;
        --gm-accent2: #7ec8a0;
        --gm-surface: rgba(20,20,28,0.92);
        --gm-glass: rgba(15,15,22,0.85);
        --gm-border: rgba(255,255,255,0.08);
        --gm-font-en: 'Cinzel', serif;
        --gm-font-zh: 'Noto Sans SC', sans-serif;

        position: fixed; inset: 0; z-index: 1100;
        background: var(--gm-bg);
        color: var(--gm-text);
        font-family: var(--gm-font-zh);
        overflow: hidden;
        transform: translateY(100%);
        transition: transform 0.45s cubic-bezier(0.19,1,0.22,1);
        pointer-events: none;
      }
      #game-root.gm-open { transform: translateY(0); pointer-events: auto; }

      #game-root * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      #game-root ::-webkit-scrollbar { display: none; }

      /* 噪点 */
      #gm-noise { position: absolute; inset: 0; pointer-events: none; z-index: 9999; opacity: 0.03;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }

      /* view 切换 */
      #game-root .gm-view {
        position: absolute; inset: 0; overflow-y: auto; padding-bottom: 40px;
        opacity: 0; pointer-events: none; transition: opacity 0.35s ease; z-index: 10;
      }
      #game-root .gm-view.active { opacity: 1; pointer-events: auto; }

      /* ── 通用 ── */
      #game-root .gm-header { display:flex; align-items:center; justify-content:space-between; padding:calc(env(safe-area-inset-top, 0px) + 20px) 20px 15px; position:sticky; top:0; z-index:20; background:linear-gradient(to bottom,rgba(8,8,12,1) 30%,rgba(8,8,12,0) 100%); }
      #game-root .gm-back-btn { font-size:1.4rem; color:var(--gm-text); cursor:pointer; padding:8px; margin-left:-8px; transition:color 0.3s; background:none; border:none; }
      #game-root .gm-back-btn:active { color:var(--gm-text-sub); }
      #game-root .gm-title-en { font-family:var(--gm-font-en); font-size:1.5rem; letter-spacing:3px; font-weight:400; text-transform:uppercase; }
      #game-root .gm-title-sm { font-family:var(--gm-font-en); font-size:1.1rem; letter-spacing:2px; font-weight:400; }
      #game-root .gm-text-sub { color:var(--gm-text-sub); font-size:0.8rem; font-weight:300; letter-spacing:1px; }
      #game-root .gm-ctx-badge { font-size:0.65rem; padding:4px 10px; border:1px solid var(--gm-border); border-radius:20px; color:var(--gm-text-sub); letter-spacing:1px; font-family:var(--gm-font-en); }
      #game-root .gm-ctx-row { line-height:1.8; }
      #game-root .gm-player-tag { display:inline-block; padding:2px 10px; margin:2px 4px; border:1px solid var(--gm-border); border-radius:14px; color:var(--gm-text-sub); cursor:pointer; font-size:0.7rem; transition:all 0.2s; }
      #game-root .gm-player-tag.active { background:var(--gm-accent); color:#1a1a1a; border-color:var(--gm-accent); font-weight:600; }
      #game-root .gm-player-tag:active { transform:scale(0.95); }
      #game-root .gm-player-bar { display:flex; align-items:center; gap:6px; padding:8px 20px; overflow-x:auto; -webkit-overflow-scrolling:touch; }
      #game-root .gm-player-bar-label { font-size:0.6rem; color:var(--gm-text-sub); letter-spacing:1px; flex-shrink:0; white-space:nowrap; }
      #game-root .gm-player-bar .gm-player-tag { flex-shrink:0; white-space:nowrap; }

      /* 按钮 */
      #game-root .gm-btn-primary {
        display:block; width:100%; padding:14px; border-radius:30px;
        background:var(--gm-accent); color:#1a1a1a; border:none;
        font-family:var(--gm-font-zh); font-size:1rem; font-weight:500; letter-spacing:2px;
        cursor:pointer; transition:all 0.3s;
      }
      #game-root .gm-btn-primary:active { transform:scale(0.97); opacity:0.85; }
      #game-root .gm-btn-ghost {
        display:block; width:100%; padding:12px; border-radius:30px;
        background:transparent; border:1px solid var(--gm-border); color:var(--gm-text);
        font-family:var(--gm-font-zh); font-size:0.95rem; letter-spacing:1px;
        cursor:pointer; transition:all 0.3s;
      }
      #game-root .gm-btn-ghost:active { background:rgba(255,255,255,0.05); }
      #game-root .gm-btn-sm {
        padding:8px 18px; border-radius:20px; font-size:0.85rem; letter-spacing:1px;
        background:transparent; border:1px solid var(--gm-border); color:var(--gm-text);
        cursor:pointer; transition:all 0.2s;
      }
      #game-root .gm-btn-sm:active { background:rgba(255,255,255,0.08); }

      /* 输入 */
      #game-root input[type="text"] {
        background:rgba(255,255,255,0.04); border:1px solid var(--gm-border); border-radius:12px;
        color:var(--gm-text); padding:12px 16px; font-family:var(--gm-font-zh);
        outline:none; width:100%; font-size:1rem; transition:border-color 0.3s;
      }
      #game-root input[type="text"]:focus { border-color:var(--gm-accent); }
      #game-root input[type="text"]::placeholder { color:rgba(255,255,255,0.15); }

      /* ── 游戏大厅 ── */
      #game-root .gm-lobby-scroll { padding:0 20px 80px; }
      #game-root .gm-lobby-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:30px; }
      #game-root .gm-game-card {
        position:relative; border-radius:16px; overflow:hidden; cursor:pointer;
        border:1px solid var(--gm-border); background:var(--gm-surface);
        padding:20px 16px; display:flex; flex-direction:column; gap:10px;
        transition:all 0.3s; min-height:150px;
      }
      #game-root .gm-game-card:active { transform:scale(0.96); border-color:var(--gm-accent); }
      #game-root .gm-game-card.coming-soon { opacity:0.4; pointer-events:none; }
      #game-root .gm-card-icon { font-size:2rem; }
      #game-root .gm-card-name { font-family:var(--gm-font-en); font-size:0.95rem; letter-spacing:2px; }
      #game-root .gm-card-desc { font-size:0.7rem; color:var(--gm-text-sub); line-height:1.4; }
      #game-root .gm-card-badge {
        position:absolute; top:12px; right:12px; font-size:0.55rem; padding:3px 8px;
        border-radius:10px; background:rgba(255,255,255,0.06); color:var(--gm-text-sub);
        letter-spacing:1px; font-family:var(--gm-font-en);
      }

      /* 积分榜 / 最近游戏 */
      #game-root .gm-section-title { font-family:var(--gm-font-en); font-size:0.85rem; letter-spacing:3px; color:var(--gm-text-sub); margin-bottom:12px; }
      #game-root .gm-recent-item {
        display:flex; align-items:center; justify-content:space-between;
        padding:12px 16px; border-radius:12px; background:var(--gm-surface);
        border:1px solid var(--gm-border); margin-bottom:8px;
      }
      #game-root .gm-recent-left { display:flex; align-items:center; gap:10px; }
      #game-root .gm-recent-icon { font-size:1.3rem; }
      #game-root .gm-recent-info { display:flex; flex-direction:column; }
      #game-root .gm-recent-name { font-size:0.85rem; letter-spacing:1px; }
      #game-root .gm-recent-meta { font-size:0.65rem; color:var(--gm-text-sub); }
      #game-root .gm-recent-result { font-size:0.8rem; font-family:var(--gm-font-en); letter-spacing:1px; }
      #game-root .gm-recent-result.win { color:var(--gm-accent); }
      #game-root .gm-recent-result.lose { color:#d4787a; }
      #game-root .gm-recent-result.draw { color:var(--gm-text-sub); }

      #game-root .gm-empty-state { text-align:center; padding:30px; color:var(--gm-text-sub); font-size:0.85rem; }

      /* ── 猜词 ── */
      #game-root .gm-wg-clue-card {
        background:var(--gm-surface); border:1px solid var(--gm-border); border-radius:16px;
        padding:25px 20px; margin-bottom:20px; text-align:center;
      }
      #game-root .gm-wg-clue-label { font-family:var(--gm-font-en); font-size:0.7rem; letter-spacing:3px; color:var(--gm-accent); margin-bottom:12px; }
      #game-root .gm-wg-clue-text { font-size:1.05rem; line-height:1.7; color:var(--gm-text); letter-spacing:1px; }
      #game-root .gm-wg-word-display { text-align:center; font-size:1.6rem; letter-spacing:6px; font-family:var(--gm-font-en); color:var(--gm-accent); margin:15px 0; }
      #game-root .gm-wg-input-row { display:flex; gap:10px; margin-bottom:15px; }
      #game-root .gm-wg-input-row input { flex:1; }
      #game-root .gm-wg-input-row button { flex-shrink:0; width:auto; }
      #game-root .gm-wg-hints { display:flex; flex-direction:column; gap:6px; margin-bottom:20px; }
      #game-root .gm-wg-hint-item {
        display:flex; align-items:center; gap:8px; padding:10px 14px;
        border-radius:10px; background:rgba(255,255,255,0.03); border:1px solid var(--gm-border);
        font-size:0.9rem;
      }
      #game-root .gm-wg-hint-icon { font-size:1rem; flex-shrink:0; }
      #game-root .gm-wg-hint-icon.correct { color:var(--gm-accent2); }
      #game-root .gm-wg-hint-icon.wrong { color:#d4787a; }
      #game-root .gm-wg-score { display:flex; justify-content:center; gap:30px; margin:15px 0; }
      #game-root .gm-wg-score-item { text-align:center; }
      #game-root .gm-wg-score-num { font-family:var(--gm-font-en); font-size:1.6rem; }
      #game-root .gm-wg-score-label { font-size:0.7rem; color:var(--gm-text-sub); letter-spacing:1px; }

      /* ── 海龟汤 ── */
      #game-root .gm-ts-story-card {
        background:var(--gm-surface); border:1px solid var(--gm-border); border-radius:16px;
        padding:25px 20px; margin-bottom:20px; position:relative;
      }
      #game-root .gm-ts-story-label { font-family:var(--gm-font-en); font-size:0.7rem; letter-spacing:3px; color:var(--gm-accent); margin-bottom:12px; text-align:center; }
      #game-root .gm-ts-story-text { font-size:1rem; line-height:1.8; letter-spacing:1px; }
      #game-root .gm-ts-qa-list { display:flex; flex-direction:column; gap:6px; margin-bottom:20px; max-height:35vh; overflow-y:auto; }
      #game-root .gm-ts-qa-item {
        padding:10px 14px; border-radius:10px; font-size:0.85rem; line-height:1.5;
      }
      #game-root .gm-ts-qa-item.question { background:rgba(212,184,122,0.08); border:1px solid rgba(212,184,122,0.15); align-self:flex-end; text-align:right; }
      #game-root .gm-ts-qa-item.answer-yes { background:rgba(126,200,160,0.08); border:1px solid rgba(126,200,160,0.15); }
      #game-root .gm-ts-qa-item.answer-no { background:rgba(212,120,122,0.08); border:1px solid rgba(212,120,122,0.15); }
      #game-root .gm-ts-qa-item.answer-irrelevant { background:rgba(255,255,255,0.03); border:1px solid var(--gm-border); color:var(--gm-text-sub); }
      #game-root .gm-ts-input-row { display:flex; gap:10px; margin-bottom:12px; }
      #game-root .gm-ts-input-row input { flex:1; }
      #game-root .gm-ts-input-row button { flex-shrink:0; width:auto; }

      /* ── 真心话大冒险 ── */
      #game-root .gm-td-spin-area { display:flex; flex-direction:column; align-items:center; margin:30px 0; }
      #game-root .gm-td-wheel {
        width:180px; height:180px; border-radius:50%; position:relative;
        display:flex; align-items:center; justify-content:center;
        border:3px solid var(--gm-accent);
        box-shadow:0 0 40px rgba(212,184,122,0.15);
        transition:transform 0.8s cubic-bezier(0.2,0.8,0.3,1);
        cursor:pointer;
      }
      #game-root .gm-td-wheel.spinning { animation:gm-spin 1.2s cubic-bezier(0.2,0.8,0.3,1); }
      #game-root .gm-td-wheel-text { font-family:var(--gm-font-en); font-size:1.3rem; letter-spacing:3px; text-align:center; }
      #game-root .gm-td-prompt-card {
        background:var(--gm-surface); border:1px solid var(--gm-border); border-radius:16px;
        padding:25px 20px; margin:20px 0; text-align:center; min-height:100px;
        display:flex; align-items:center; justify-content:center;
      }
      #game-root .gm-td-prompt-text { font-size:1.1rem; line-height:1.7; letter-spacing:1px; }
      #game-root .gm-td-type-badge {
        display:inline-block; padding:6px 16px; border-radius:15px; font-family:var(--gm-font-en);
        font-size:0.8rem; letter-spacing:2px; margin-bottom:15px;
      }
      #game-root .gm-td-type-badge.truth { background:rgba(126,200,160,0.15); color:var(--gm-accent2); border:1px solid rgba(126,200,160,0.3); }
      #game-root .gm-td-type-badge.dare { background:rgba(212,120,122,0.15); color:#d4787a; border:1px solid rgba(212,120,122,0.3); }

      /* ── 你画我猜 ── */
      #game-root .gm-dg-canvas-wrap {
        position:relative; width:100%; aspect-ratio:1/1; max-height:50vh;
        background:#fff; border-radius:16px; overflow:hidden; border:2px solid var(--gm-border);
        margin-bottom:15px; touch-action:none;
      }
      #game-root .gm-dg-canvas { width:100%; height:100%; display:block; cursor:crosshair; }
      #game-root .gm-dg-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px; justify-content:center; }
      #game-root .gm-dg-color { width:28px; height:28px; border-radius:50%; border:2px solid transparent; cursor:pointer; transition:all 0.2s; flex-shrink:0; }
      #game-root .gm-dg-color.active { border-color:var(--gm-accent); transform:scale(1.2); }
      #game-root .gm-dg-brush-btn { padding:6px 10px; border-radius:15px; font-size:0.75rem; border:1px solid var(--gm-border); background:transparent; color:var(--gm-text); cursor:pointer; }
      #game-root .gm-dg-brush-btn.active { background:rgba(255,255,255,0.1); border-color:var(--gm-accent); }
      #game-root .gm-dg-word-hint { text-align:center; font-family:var(--gm-font-en); font-size:1.4rem; letter-spacing:6px; color:var(--gm-accent); margin:8px 0; }
      #game-root .gm-dg-input-row { display:flex; gap:10px; }

      /* ── 结果弹窗 ── */
      #game-root .gm-overlay {
        position:absolute; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(10px);
        display:flex; align-items:center; justify-content:center; z-index:100;
        opacity:0; pointer-events:none; transition:opacity 0.3s;
      }
      #game-root .gm-overlay.active { opacity:1; pointer-events:auto; }
      #game-root .gm-result-card {
        background:var(--gm-surface); border:1px solid var(--gm-border); border-radius:20px;
        padding:30px 25px; width:85%; max-width:340px; text-align:center;
        animation:gm-popIn 0.4s cubic-bezier(0.2,0.8,0.2,1);
      }
      #game-root .gm-result-icon { font-size:3rem; margin-bottom:12px; }
      #game-root .gm-result-title { font-family:var(--gm-font-en); font-size:1.4rem; letter-spacing:3px; margin-bottom:8px; }
      #game-root .gm-result-detail { font-size:0.9rem; color:var(--gm-text-sub); margin-bottom:25px; line-height:1.5; }
      #game-root .gm-result-actions { display:flex; flex-direction:column; gap:10px; }

      /* 动画 */
      @keyframes gm-spin {
        0% { transform:rotate(0deg); }
        20% { transform:rotate(720deg); }
        40% { transform:rotate(1380deg); }
        60% { transform:rotate(2000deg); }
        80% { transform:rotate(2600deg); }
        100% { transform:rotate(2880deg); }
      }
      @keyframes gm-popIn { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
      @keyframes gm-fadeUp { from{opacity:0;transform:translateY(15px)} to{opacity:1;transform:translateY(0)} }
      #game-root .gm-fade-up { animation:gm-fadeUp 0.5s ease forwards; opacity:0; }
    `;
    document.head.appendChild(style);
  };

  // ── 注入 HTML ──
  const _injectHTML = () => {
    if (document.getElementById('game-root')) return;
    const root = document.createElement('div');
    root.id = 'game-root';
    root.innerHTML = `
      <div id="gm-noise"></div>

      <!-- 游戏大厅 -->
      <div id="gm-view-lobby" class="gm-view active">
        <div class="gm-header">
          <button class="gm-back-btn" id="gm-btn-close"><i class="ph ph-x"></i></button>
          <span class="gm-title-en">Arcade</span>
          <span class="gm-ctx-badge" id="gm-ctx-badge">—</span>
        </div>
        <div class="gm-ctx-row" id="gm-ctx-info" style="text-align:center;font-size:0.75rem;color:var(--gm-text-sub);padding:6px 20px 0;letter-spacing:1px;"></div>
        <div class="gm-lobby-scroll">
          <div class="gm-lobby-grid" id="gm-lobby-grid">
            <!-- 动态渲染 -->
          </div>
          <div class="gm-section-title">RECENT GAMES</div>
          <div id="gm-recent-list"><div class="gm-empty-state">No games played yet</div></div>
        </div>
      </div>

      <!-- 猜词 -->
      <div id="gm-view-wordguess" class="gm-view">
        <div class="gm-header">
          <button class="gm-back-btn" id="gm-wg-back"><i class="ph ph-arrow-left"></i></button>
          <span class="gm-title-sm">Word Guess</span>
          <span class="gm-ctx-badge gm-ctx-badge" style="font-size:0.7rem;" id="gm-wg-round">ROUND 1</span>
        </div>
        <div class="gm-player-bar" id="gm-wg-player-bar" style="display:none;"></div>
        <div style="padding:10px 20px 80px;">
          <div class="gm-wg-clue-card">
            <div class="gm-wg-clue-label">AI'S CLUES</div>
            <div class="gm-wg-clue-text" id="gm-wg-clue">正在生成线索...</div>
          </div>
          <div class="gm-wg-word-display" id="gm-wg-display">_ _ _ _</div>
          <div class="gm-wg-input-row">
            <input type="text" id="gm-wg-input" placeholder="输入你的猜测..." maxlength="30">
            <button class="gm-btn-sm" id="gm-wg-submit" style="flex-shrink:0;">猜</button>
          </div>
          <div class="gm-wg-hints" id="gm-wg-hints"></div>
          <div class="gm-wg-score">
            <div class="gm-wg-score-item"><div class="gm-wg-score-num" id="gm-wg-correct">0</div><div class="gm-wg-score-label">猜对</div></div>
            <div class="gm-wg-score-item"><div class="gm-wg-score-num" id="gm-wg-total">0</div><div class="gm-wg-score-label">总轮数</div></div>
          </div>
          <button class="gm-btn-ghost" id="gm-wg-new">换一个词</button>
        </div>
      </div>

      <!-- 海龟汤 -->
      <div id="gm-view-turtlesoup" class="gm-view">
        <div class="gm-header">
          <button class="gm-back-btn" id="gm-ts-back"><i class="ph ph-arrow-left"></i></button>
          <span class="gm-title-sm">Turtle Soup</span>
          <span class="gm-ctx-badge" style="font-size:0.7rem;" id="gm-ts-q-count">Q:0</span>
        </div>
        <div class="gm-player-bar" id="gm-ts-player-bar" style="display:none;"></div>
        <div style="padding:10px 20px 80px;">
          <div class="gm-ts-story-card">
            <div class="gm-ts-story-label">— THE MYSTERY —</div>
            <div class="gm-ts-story-text" id="gm-ts-story">加载中...</div>
          </div>
          <div class="gm-ts-qa-list" id="gm-ts-qa-list"></div>
          <div class="gm-ts-input-row">
            <input type="text" id="gm-ts-input" placeholder="提出你的问题（是/否问题）..." maxlength="80">
            <button class="gm-btn-sm" id="gm-ts-ask" style="flex-shrink:0;">提问</button>
          </div>
          <button class="gm-btn-ghost" id="gm-ts-reveal" style="margin-top:6px;">我推理出来了，还原故事</button>
        </div>
      </div>

      <!-- 真心话大冒险 -->
      <div id="gm-view-truthdare" class="gm-view">
        <div class="gm-header">
          <button class="gm-back-btn" id="gm-td-back"><i class="ph ph-arrow-left"></i></button>
          <span class="gm-title-sm">Truth or Dare</span>
          <span class="gm-ctx-badge" style="font-size:0.7rem;" id="gm-td-round">#1</span>
        </div>
        <div class="gm-player-bar" id="gm-td-player-bar" style="display:none;"></div>
        <div style="padding:10px 20px 80px;display:flex;flex-direction:column;align-items:center;">
          <div class="gm-td-spin-area">
            <div class="gm-td-wheel" id="gm-td-wheel">
              <span class="gm-td-wheel-text" id="gm-td-wheel-text">TAP TO<br>SPIN</span>
            </div>
          </div>
          <div id="gm-td-result" style="display:none;width:100%;text-align:center;">
            <div class="gm-td-type-badge" id="gm-td-badge">TRUTH</div>
            <div class="gm-td-prompt-card">
              <div class="gm-td-prompt-text" id="gm-td-prompt">生成题目中...</div>
            </div>
          </div>
          <button class="gm-btn-primary" id="gm-td-new" style="margin-top:10px;">再来一轮</button>
        </div>
      </div>

      <!-- 你画我猜 -->
      <div id="gm-view-drawguess" class="gm-view">
        <div class="gm-header">
          <button class="gm-back-btn" id="gm-dg-back"><i class="ph ph-arrow-left"></i></button>
          <span class="gm-title-sm">Draw & Guess</span>
          <span class="gm-ctx-badge" style="font-size:0.7rem;" id="gm-dg-round">ROUND 1</span>
        </div>
        <div class="gm-player-bar" id="gm-dg-player-bar" style="display:none;"></div>
        <div style="padding:10px 20px 60px;">
          <div class="gm-dg-canvas-wrap" id="gm-dg-canvas-wrap">
            <canvas class="gm-dg-canvas" id="gm-dg-canvas"></canvas>
          </div>
          <div class="gm-dg-tools">
            <div class="gm-dg-color active" style="background:#1a1a1a;" data-color="#1a1a1a"></div>
            <div class="gm-dg-color" style="background:#d4787a;" data-color="#d4787a"></div>
            <div class="gm-dg-color" style="background:#7ec8a0;" data-color="#7ec8a0"></div>
            <div class="gm-dg-color" style="background:#6baed6;" data-color="#6baed6"></div>
            <div class="gm-dg-color" style="background:#d4b87a;" data-color="#d4b87a"></div>
            <div class="gm-dg-color" style="background:#f0f0f3;" data-color="#f0f0f3"></div>
            <button class="gm-dg-brush-btn active" data-size="3">细</button>
            <button class="gm-dg-brush-btn" data-size="8">中</button>
            <button class="gm-dg-brush-btn" data-size="16">粗</button>
            <button class="gm-dg-brush-btn" id="gm-dg-eraser"><i class="ph ph-eraser"></i></button>
            <button class="gm-dg-brush-btn" id="gm-dg-clear"><i class="ph ph-trash"></i></button>
          </div>
          <div class="gm-dg-word-hint" id="gm-dg-word">???</div>
          <div class="gm-dg-input-row">
            <input type="text" id="gm-dg-input" placeholder="猜猜画的是什么..." maxlength="30">
            <button class="gm-btn-sm" id="gm-dg-submit" style="flex-shrink:0;">猜</button>
          </div>
          <button class="gm-btn-ghost" id="gm-dg-new" style="margin-top:8px;">换一个词 / Reveal</button>
        </div>
      </div>

      <!-- 结果弹窗 -->
      <div class="gm-overlay" id="gm-result-overlay">
        <div class="gm-result-card">
          <div class="gm-result-icon" id="gm-result-icon"></div>
          <h3 class="gm-result-title" id="gm-result-title"></h3>
          <p class="gm-result-detail" id="gm-result-detail"></p>
          <div class="gm-result-actions">
            <button class="gm-btn-primary" id="gm-result-again">再来一局</button>
            <button class="gm-btn-ghost" id="gm-result-done">返回大厅</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
  };

  // ── 状态 ──
  let _initialized = false;
  let _dbReady = false;
  let _currentView = 'lobby';
  let _contextChatId = null;
  let _contextIsGroup = false;
  let _contextCharName = '';       // 私聊：角色名
  let _contextCharPersona = '';    // 私聊：角色人设
  let _contextCharAvatar = '';     // 私聊：角色头像
  let _contextGroupMembers = [];   // 群聊：[{ id, name }]
  let _contextCurrentPlayer = null; // 群聊：当前玩家

  // 猜词状态
  let _wgWord = '';
  let _wgClues = '';
  let _wgGuesses = [];
  let _wgCorrect = 0;
  let _wgTotal = 0;

  // 海龟汤状态
  let _tsStory = '';
  let _tsTruth = '';
  let _tsQA = [];
  let _tsQCount = 0;

  // 真心话状态
  let _tdRound = 0;

  // 你画我猜状态
  let _dgWord = '';
  let _dgColor = '#1a1a1a';
  let _dgBrushSize = 3;
  let _dgIsErasing = false;
  let _dgIsDrawing = false;

  const _$ = id => document.getElementById(id);

  // ================================================================
  // GameDB 辅助
  // ================================================================
  async function _ensureDB() {
    if (_dbReady) return;
    await GameDB.init();
    _dbReady = true;
  }

  async function _saveRecord(rec) {
    await _ensureDB();
    await GameDB.put('game_records', rec);
  }

  async function _getRecentRecords(limit = 10) {
    await _ensureDB();
    const all = await GameDB.getAll('game_records');
    return all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, limit);
  }

  // ================================================================
  // LLM 调用辅助
  // ================================================================
  async function _callLLM(systemPrompt, userMessage) {
    try {
      // 复用全局 ApiHelper
      if (typeof window.ApiHelper !== 'undefined' && window.ApiHelper.chatCompletion) {
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ];
        const resp = await window.ApiHelper.chatCompletion(messages, { temperature: 0.8, max_tokens: 300 });
        return resp?.content || resp?.text || resp?.choices?.[0]?.message?.content || '';
      }
      // fallback: 直接用 fetch 调 /v1/chat/completions
      if (typeof window.ApiModule !== 'undefined' && window.ApiModule.getActiveProfile) {
        const profile = window.ApiModule.getActiveProfile();
        if (profile) {
          const resp = await fetch(profile.baseURL + '/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${profile.apiKey}` },
            body: JSON.stringify({
              model: profile.model || 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ],
              temperature: 0.8, max_tokens: 300
            })
          });
          const data = await resp.json();
          return data.choices?.[0]?.message?.content || '';
        }
      }
    } catch (e) {
      console.warn('[GameModule] LLM 调用失败:', e);
    }
    return null;
  }

  // ================================================================
  // 视图切换
  // ================================================================
  function _switchView(viewId) {
    document.querySelectorAll('#game-root .gm-view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(viewId);
    if (el) el.classList.add('active');
    _currentView = viewId.replace('gm-view-', '');
  }

  // ================================================================
  // 结果弹窗
  // ================================================================
  function _showResult(icon, title, detail, onAgain, onDone) {
    _$('gm-result-icon').textContent = icon;
    _$('gm-result-title').textContent = title;
    _$('gm-result-detail').textContent = detail;
    _$('gm-result-overlay').classList.add('active');
    _$('gm-result-again').onclick = () => {
      _$('gm-result-overlay').classList.remove('active');
      if (onAgain) onAgain();
    };
    _$('gm-result-done').onclick = () => {
      _$('gm-result-overlay').classList.remove('active');
      if (onDone) onDone(); else _switchView('gm-view-lobby');
    };
  }

  // ── 群聊切换玩家 ──
  async function _switchPlayer(pid) {
    const found = _contextGroupMembers.find(m => String(m.id) === String(pid));
    if (found) {
      _contextCurrentPlayer = found;
      // 刷新所有可见的玩家选择栏
      _refreshAllPlayerBars();
      if (typeof Toast !== 'undefined') Toast.show('当前玩家：' + found.name);
    }
  }

  // ── 角色感知的系统提示词 ──
  function _charAwarePrompt(basePrompt) {
    if (!_contextIsGroup && _contextCharName) {
      return `你正在扮演「${_contextCharName}」与玩家玩游戏。\n角色人设：${_contextCharPersona || '一个有趣的朋友'}\n\n${basePrompt}\n\n请以「${_contextCharName}」的口吻回复，保持角色性格一致。`;
    }
    return basePrompt;
  }

  // ── 当前玩家名（群聊用）──
  function _currentPlayerName() {
    return _contextCurrentPlayer?.name || '玩家';
  }

  // ── 渲染玩家选择栏（群聊时在所有游戏页面顶部显示）──
  function _renderPlayerBar(barId) {
    if (!_contextIsGroup || !_contextGroupMembers.length) return;
    const bar = document.getElementById(barId);
    if (!bar) return;
    bar.style.display = 'flex';
    bar.innerHTML = '<span class="gm-player-bar-label">👥 谁在玩：</span>' +
      _contextGroupMembers.map(m =>
        `<span class="gm-player-tag${_contextCurrentPlayer?.id === m.id ? ' active' : ''}" data-pid="${m.id}" onclick="GameModule._switchPlayer('${m.id}')">${m.name}</span>`
      ).join('');
  }

  // ── 刷新所有可见的玩家选择栏 ──
  function _refreshAllPlayerBars() {
    ['gm-wg-player-bar', 'gm-ts-player-bar', 'gm-td-player-bar', 'gm-dg-player-bar'].forEach(id => {
      const bar = document.getElementById(id);
      if (bar && bar.style.display !== 'none') _renderPlayerBar(id);
    });
  }

  // ================================================================
  // 游戏大厅
  // ================================================================
  const GAME_DEFS = [
    { id: 'wordguess', icon: '🔤', name: 'Word Guess', desc: '三条线索猜词，与角色智力对决', cls: '' },
    { id: 'turtlesoup', icon: '🐢', name: 'Turtle Soup', desc: '离奇谜题，向角色提问还原真相', cls: '' },
    { id: 'truthdare', icon: '🎭', name: 'Truth or Dare', desc: '角色出题，真心话还是大冒险？', cls: '' },
    { id: 'drawguess', icon: '🎨', name: 'Draw & Guess', desc: '画出来让大家猜，看谁更懂', cls: '' },
  ];

  function _renderLobby() {
    // 渲染游戏卡片
    const grid = _$('gm-lobby-grid');
    if (!grid) return;
    grid.innerHTML = '';
    GAME_DEFS.forEach(g => {
      const card = document.createElement('div');
      card.className = 'gm-game-card gm-fade-up ' + g.cls;
      card.style.animationDelay = (GAME_DEFS.indexOf(g) * 0.08) + 's';
      card.innerHTML = `
        <div class="gm-card-icon">${g.icon}</div>
        <div class="gm-card-name">${g.name}</div>
        <div class="gm-card-desc">${g.desc}</div>
      `;
      if (!g.cls) {
        card.onclick = () => _launchGame(g.id);
      } else {
        card.innerHTML += '<div class="gm-card-badge">SOON</div>';
      }
      grid.appendChild(card);
    });

    // 渲染最近游戏
    _renderRecentGames();

    // 上下文：私聊 vs 群聊
    const badge = _$('gm-ctx-badge');
    const ctxInfo = _$('gm-ctx-info');
    if (_contextIsGroup) {
      if (badge) badge.textContent = 'GROUP · ' + _contextGroupMembers.length + '人';
      if (ctxInfo) ctxInfo.innerHTML = '<span style="font-size:0.6rem;color:var(--gm-text-sub);">点击名字加入游戏 ↓</span><br>' +
        _contextGroupMembers.map(m =>
          `<span class="gm-player-tag${_contextCurrentPlayer?.id === m.id ? ' active' : ''}" data-pid="${m.id}" onclick="GameModule._switchPlayer('${m.id}')">${m.name}</span>`
        ).join(' ');
    } else if (_contextCharName) {
      if (badge) badge.textContent = 'VS';
      if (ctxInfo) ctxInfo.textContent = '对手：' + _contextCharName;
    } else {
      if (badge) badge.textContent = '';
      if (ctxInfo) ctxInfo.textContent = '';
    }
  }

  async function _renderRecentGames() {
    const container = _$('gm-recent-list');
    if (!container) return;
    const records = await _getRecentRecords(8);
    if (!records.length) {
      container.innerHTML = '<div class="gm-empty-state">No games played yet</div>';
      return;
    }
    container.innerHTML = '';
    const icons = { wordguess: '🔤', turtlesoup: '🐢', truthdare: '🎭', drawguess: '🎨' };
    records.forEach(r => {
      const el = document.createElement('div');
      el.className = 'gm-recent-item gm-fade-up';
      const resultClass = r.winner === 'player' ? 'win' : (r.winner === 'draw' ? 'draw' : 'lose');
      const resultText = r.winner === 'player' ? 'WIN' : (r.winner === 'draw' ? 'DRAW' : 'LOSE');
      el.innerHTML = `
        <div class="gm-recent-left">
          <span class="gm-recent-icon">${icons[r.gameType] || '🎮'}</span>
          <div class="gm-recent-info">
            <span class="gm-recent-name">${r.gameName || r.gameType}</span>
            <span class="gm-recent-meta">${r.detail || ''}</span>
          </div>
        </div>
        <span class="gm-recent-result ${resultClass}">${resultText}</span>
      `;
      container.appendChild(el);
    });
  }

  function _launchGame(gameType) {
    switch (gameType) {
      case 'wordguess': _startWordGuess(); break;
      case 'turtlesoup': _startTurtleSoup(); break;
      case 'truthdare': _startTruthDare(); break;
      case 'drawguess': _startDrawGuess(); break;
    }
  }

  // ================================================================
  // 猜词 Word Guess
  // ================================================================
  const WORD_POOL = [
    '月亮','星星','彩虹','风筝','蝴蝶','钢琴','灯塔','沙漠','冰川','火山',
    '樱花','竹子','荷花','灯笼','饺子','筷子','长城','故宫','熊猫','凤凰',
    '钢琴','吉他','小提琴','口琴','风车','帆船','热气球','潜水艇','火箭','卫星',
    '向日葵','蒲公英','薰衣草','仙人掌','海豚','企鹅','长颈鹿','孔雀','萤火虫','北极光',
    '咖啡','巧克力','冰淇淋','披萨','寿司','火锅','棉花糖','爆米花','马卡龙','甜甜圈',
    '时钟','指南针','望远镜','放大镜','沙漏','蜡烛','信封','羽毛','贝壳','珍珠'
  ];

  async function _startWordGuess() {
    _switchView('gm-view-wordguess');
    // 随机选词
    _wgWord = WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)];
    _wgGuesses = [];
    _$('gm-wg-hints').innerHTML = '';
    _$('gm-wg-input').value = '';
    _$('gm-wg-display').textContent = '_ '.repeat(_wgWord.length).trim();
    _$('gm-wg-round').textContent = `ROUND ${_wgTotal + 1}`;
    _$('gm-wg-correct').textContent = _wgCorrect;
    _$('gm-wg-total').textContent = _wgTotal;
    _$('gm-wg-clue').textContent = '正在生成线索...';
    _renderPlayerBar('gm-wg-player-bar');

    // 用 LLM 生成线索（私聊：角色出题；群聊：主持人出题）
    const basePrompt = `你${_contextIsGroup ? '是一个猜词游戏的主持人' : ''}，要让玩家猜一个词。这个词是：「${_wgWord}」。请给出 3 条线索来描述这个词，但线索中不能直接出现这个词本身。线索应该从模糊到具体。用中文回复，每条线索一行。`;
    const sysPrompt = _charAwarePrompt(basePrompt);
    const clueText = await _callLLM(sysPrompt, '请给出3条线索');
    _wgClues = clueText || `1. 这是一个常见的词语\n2. 它有${_wgWord.length}个字\n3. 与日常生活相关`;
    _$('gm-wg-clue').textContent = _wgClues;
  }

  function _handleWGGuess() {
    const input = _$('gm-wg-input');
    const guess = (input.value || '').trim();
    if (!guess) return;
    if (_wgGuesses.includes(guess)) {
      if (typeof Toast !== 'undefined') Toast.show('已经猜过了');
      return;
    }
    _wgGuesses.push(guess);

    if (guess === _wgWord) {
      // 猜对了
      _wgCorrect++;
      _wgTotal++;
      _$('gm-wg-correct').textContent = _wgCorrect;
      _$('gm-wg-total').textContent = _wgTotal;
      _$('gm-wg-display').textContent = _wgWord;
      _$('gm-wg-clue').textContent = `🎉 猜对了！答案就是「${_wgWord}」`;
      _addWGHint(guess, true);
      const playerName = _currentPlayerName();
      _saveRecord({
        gameType: 'wordguess', gameName: 'Word Guess',
        chatId: _contextChatId, isGroup: _contextIsGroup,
        winner: 'player', playerName: playerName,
        detail: `猜中「${_wgWord}」，${_wgGuesses.length}次尝试`,
        timestamp: Date.now()
      });
      const whoText = _contextIsGroup ? `\n猜对者：${playerName}` : '';
      const vsText = _contextCharName ? `\n对手：${_contextCharName}` : '';
      _showResult('🎉', 'YOU GOT IT!', `答案：${_wgWord}\n尝试次数：${_wgGuesses.length}${vsText}${whoText}`, () => _startWordGuess(), () => _switchView('gm-view-lobby'));
    } else {
      _addWGHint(guess, false);
      input.value = '';
    }
  }

  function _addWGHint(guess, correct) {
    const container = _$('gm-wg-hints');
    const el = document.createElement('div');
    el.className = 'gm-wg-hint-item gm-fade-up';
    const who = _contextIsGroup ? `<span style="font-size:0.6rem;color:var(--gm-accent);">${_currentPlayerName()}：</span>` : '';
    el.innerHTML = `${who}<span class="gm-wg-hint-icon ${correct ? 'correct' : 'wrong'}">${correct ? '✓' : '✗'}</span> ${guess}`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  // ================================================================
  // 海龟汤 Turtle Soup
  // ================================================================
  const TURTLE_SOUP_POOL = [
    {
      story: '一个男人走进一家酒吧，点了一杯水。酒保却掏出一把枪指着他。男人说了一声"谢谢"然后离开了。为什么？',
      truth: '这个男人有打嗝的毛病。他走进酒吧点水是为了止住打嗝。酒保看出他的意图，用枪吓唬他——惊吓也能止住打嗝。男人的打嗝被吓好了，所以道谢离开。'
    },
    {
      story: '一个人住在10楼。每天早上他坐电梯到1楼去上班。但下班回来时，如果电梯里没有其他人，他只坐到7楼然后走楼梯上10楼。为什么？',
      truth: '这个人是个侏儒（身高很矮）。他能够到1楼的电梯按钮，但够不到10楼的按钮。最多只能够到7楼的按钮。下雨天他带伞，用伞尖可以按到10楼。'
    },
    {
      story: '一男一女死在一间房间里，地上有碎玻璃和一滩水。房间里没有打斗痕迹。他们是怎么死的？',
      truth: '这一男一女是两条鱼。鱼缸被打碎了（碎玻璃+水），鱼离开了水所以死了。'
    },
    {
      story: '深夜，一个人在床上睡觉。突然电话响了，他接起来，对方说了一句话就挂了。这个人立刻穿上衣服出门，再也没有回来。为什么？',
      truth: '这个人是医生。电话是医院打来的，说有一个紧急手术需要他主刀。他出门后在手术过程中因意外去世了。'
    },
    {
      story: '一个盲人走进一家餐厅，点了一份海鸥肉。他吃了一口后，放下叉子，回家后自杀了。为什么？',
      truth: '这个盲人曾经在海上遇难漂流，他的同伴为了救他，骗他说抓到的是海鸥肉，实际上是同伴割下自己的肉给他吃。盲人获救后一直不知道真相。这次在餐厅吃到真正的海鸥肉，发现味道完全不同，才意识到当年吃的是同伴的肉，悲痛之下自杀。'
    },
    {
      story: '一个人把车停在路边，走进一家商店。回来时发现车胎被人扎破了。但他只是笑了笑，开车走了。为什么？',
      truth: '他的车本来停在禁停区域，交警要给他贴罚单。但发现车胎已经破了，认为这是一辆故障车，就没有开罚单。而车胎是他自己扎破的，为了逃避罚单。'
    }
  ];

  async function _startTurtleSoup() {
    _switchView('gm-view-turtlesoup');
    const puzzle = TURTLE_SOUP_POOL[Math.floor(Math.random() * TURTLE_SOUP_POOL.length)];
    _tsStory = puzzle.story;
    _tsTruth = puzzle.truth;
    _tsQA = [];
    _tsQCount = 0;
    _$('gm-ts-story').textContent = _tsStory;
    _$('gm-ts-qa-list').innerHTML = '';
    _$('gm-ts-input').value = '';
    _$('gm-ts-q-count').textContent = 'Q:0';
    _renderPlayerBar('gm-ts-player-bar');
  }

  async function _handleTSAsk() {
    const input = _$('gm-ts-input');
    const question = (input.value || '').trim();
    if (!question) return;
    _tsQCount++;
    _$('gm-ts-q-count').textContent = `Q:${_tsQCount}`;

    // 添加提问到 QA 列表
    _addTSQA(question, 'question');
    input.value = '';

    // 用 LLM 判断答案（私聊：角色来回答；群聊：主持人回答）
    const basePrompt = `谜底真相是：「${_tsTruth}」\n\n玩家会向你提出关于这个故事的问题。你只能回答以下三种之一：\n- 「是」— 如果问题与真相一致\n- 「不是」— 如果问题与真相矛盾\n- 「与此无关」— 如果问题不影响核心真相的还原\n\n请只回复这三个选项之一，不要解释。`;
    const sysPrompt = _charAwarePrompt(basePrompt);
    const answer = await _callLLM(sysPrompt, question);
    const cleanAnswer = (answer || '').trim();
    let answerClass = 'answer-irrelevant';
    if (cleanAnswer.includes('是') && !cleanAnswer.includes('不是')) answerClass = 'answer-yes';
    else if (cleanAnswer.includes('不是')) answerClass = 'answer-no';

    _addTSQA(cleanAnswer || '与此无关', answerClass);
  }

  function _addTSQA(text, cls) {
    const container = _$('gm-ts-qa-list');
    const el = document.createElement('div');
    el.className = `gm-ts-qa-item gm-fade-up ${cls}`;
    const prefix = cls === 'question' ? '❓ ' : (cls === 'answer-yes' ? '✅ ' : (cls === 'answer-no' ? '❌ ' : '➖ '));
    const who = (_contextIsGroup && cls === 'question') ? `<span style="font-size:0.6rem;color:var(--gm-accent);">${_currentPlayerName()}：</span>` : '';
    el.innerHTML = who + prefix + text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  async function _handleTSReveal() {
    const input = _$('gm-ts-input');
    const guess = (input.value || '').trim();
    if (!guess) {
      // 弹出一个简易输入框让用户输入他们的推理
      const story = prompt('请输入你的故事还原（用一两句话描述你认为的真相）：');
      if (!story) return;
      // 用 LLM 判断是否与真相一致
      const sysPrompt = `你是海龟汤的裁判。真正的真相是：「${_tsTruth}」\n\n玩家给出的推理是：「${story}」\n\n请判断玩家的推理是否基本正确（核心事实一致即可，不需要完全相同）。只回复 YES 或 NO，然后简述原因。`;
      const result = await _callLLM(sysPrompt, '请判断');
      const isCorrect = (result || '').toUpperCase().includes('YES');
      const playerName = _currentPlayerName();
      _saveRecord({
        gameType: 'turtlesoup', gameName: 'Turtle Soup',
        chatId: _contextChatId, isGroup: _contextIsGroup,
        winner: isCorrect ? 'player' : 'ai', playerName: playerName,
        detail: `提问${_tsQCount}次，推理${isCorrect ? '正确' : '错误'}`,
        timestamp: Date.now()
      });
      const whoText = _contextIsGroup ? `\n推理者：${playerName}` : '';
      const vsText = _contextCharName ? `\n对手：${_contextCharName}` : '';
      _showResult(
        isCorrect ? '🎉' : '🐢',
        isCorrect ? '推理正确！' : '再想想...',
        (isCorrect ? `真相：${_tsTruth}` : `你的推理：${story}\n\n正确答案：${_tsTruth}`) + vsText + whoText,
        () => _startTurtleSoup(),
        () => _switchView('gm-view-lobby')
      );
    }
  }

  // ================================================================
  // 真心话大冒险 Truth or Dare
  // ================================================================
  async function _startTruthDare() {
    _switchView('gm-view-truthdare');
    _tdRound++;
    _$('gm-td-round').textContent = `#${_tdRound}`;
    _$('gm-td-result').style.display = 'none';
    _$('gm-td-wheel-text').textContent = 'TAP TO\nSPIN';
    _$('gm-td-wheel').classList.remove('spinning');
    _$('gm-td-prompt').textContent = '生成题目中...';
    _renderPlayerBar('gm-td-player-bar');
  }

  async function _handleTDSpin() {
    const wheel = _$('gm-td-wheel');
    if (wheel.classList.contains('spinning')) return;
    wheel.classList.add('spinning');

    // 随机 Truth or Dare
    const isTruth = Math.random() > 0.5;
    const type = isTruth ? 'TRUTH' : 'DARE';

    // 用 LLM 生成题目（私聊：角色出题；群聊：主持人生成）
    const hostContext = _contextIsGroup ? `当前玩家是「${_currentPlayerName()}」` : '';
    const basePrompt = isTruth
      ? `你是一个真心话大冒险游戏的主持人。${hostContext}请生成一个有趣的、有深度的"真心话"问题。问题应该适合朋友间玩，不能太冒犯，有创意。用中文回复，只回复问题本身。`
      : `你是一个真心话大冒险游戏的主持人。${hostContext}请生成一个有趣的、安全可行的"大冒险"挑战。挑战应该适合在室内完成，有创意但不能危险或尴尬。用中文回复，只回复挑战内容本身。`;
    const sysPrompt = _charAwarePrompt(basePrompt);
    const prompt = await _callLLM(sysPrompt, '请出一道题');

    setTimeout(() => {
      wheel.classList.remove('spinning');
      _$('gm-td-wheel-text').textContent = type;
      _$('gm-td-result').style.display = 'block';
      _$('gm-td-badge').textContent = type;
      _$('gm-td-badge').className = 'gm-td-type-badge ' + (isTruth ? 'truth' : 'dare');
      _$('gm-td-prompt').textContent = prompt || (isTruth ? '你最近一次哭是因为什么？' : '学一种动物叫，让在场的人猜');
    }, 1300);
  }

  // ================================================================
  // 你画我猜 Draw & Guess
  // ================================================================
  const DRAW_WORDS = ['苹果','太阳','房子','树','花','猫','狗','鱼','鸟','汽车','飞机','轮船','笑脸','爱心','钥匙','眼镜','雨伞','蛋糕','冰淇淋','恐龙'];

  function _startDrawGuess() {
    _switchView('gm-view-drawguess');
    _dgWord = DRAW_WORDS[Math.floor(Math.random() * DRAW_WORDS.length)];
    _$('gm-dg-word').textContent = '???';
    _$('gm-dg-input').value = '';
    _$('gm-dg-round').textContent = 'ROUND 1';
    _clearCanvas();
    _renderPlayerBar('gm-dg-player-bar');
  }

  function _initCanvas() {
    const canvas = _$('gm-dg-canvas');
    if (!canvas || canvas.dataset.inited) return;
    canvas.dataset.inited = '1';

    const resizeCanvas = () => {
      const wrap = _$('gm-dg-canvas-wrap');
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.width * dpr; // 正方形
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.width + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.width);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Pointer Events 统一触控和鼠标
    canvas.addEventListener('pointerdown', e => {
      _dgIsDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = _dgIsErasing ? '#ffffff' : _dgColor;
      ctx.lineWidth = _dgIsErasing ? 20 : _dgBrushSize;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!_dgIsDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const ctx = canvas.getContext('2d');
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    canvas.addEventListener('pointerup', () => { _dgIsDrawing = false; });
    canvas.addEventListener('pointercancel', () => { _dgIsDrawing = false; });
  }

  function _clearCanvas() {
    const canvas = _$('gm-dg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.width);
  }

  function _handleDGGuess() {
    const input = _$('gm-dg-input');
    const guess = (input.value || '').trim();
    if (!guess) return;
    if (guess === _dgWord) {
      _$('gm-dg-word').textContent = `🎉 ${_dgWord}`;
      _saveRecord({
        gameType: 'drawguess', gameName: 'Draw & Guess',
        chatId: _contextChatId, isGroup: _contextIsGroup,
        winner: 'player', playerName: _currentPlayerName(),
        detail: `猜中「${_dgWord}」`,
        timestamp: Date.now()
      });
      const vsText = _contextCharName ? `\n对手：${_contextCharName}` : '';
      _showResult('🎨', '猜对了！', `答案：${_dgWord}${vsText}`, () => { _startDrawGuess(); _initCanvas(); }, () => _switchView('gm-view-lobby'));
    } else {
      if (typeof Toast !== 'undefined') Toast.show('不对哦，再试试！');
      input.value = '';
    }
  }

  function _revealDGWord() {
    _$('gm-dg-word').textContent = _dgWord;
  }

  // ================================================================
  // 事件绑定
  // ================================================================
  function _bindEvents() {
    // 关闭
    _$('gm-btn-close').onclick = close;

    // 猜词
    _$('gm-wg-back').onclick = () => _switchView('gm-view-lobby');
    _$('gm-wg-submit').onclick = _handleWGGuess;
    _$('gm-wg-input').addEventListener('keydown', e => { if (e.key === 'Enter') _handleWGGuess(); });
    _$('gm-wg-new').onclick = _startWordGuess;

    // 海龟汤
    _$('gm-ts-back').onclick = () => _switchView('gm-view-lobby');
    _$('gm-ts-ask').onclick = _handleTSAsk;
    _$('gm-ts-input').addEventListener('keydown', e => { if (e.key === 'Enter') _handleTSAsk(); });
    _$('gm-ts-reveal').onclick = _handleTSReveal;

    // 真心话大冒险
    _$('gm-td-back').onclick = () => _switchView('gm-view-lobby');
    _$('gm-td-wheel').onclick = _handleTDSpin;
    _$('gm-td-new').onclick = _startTruthDare;

    // 你画我猜
    _$('gm-dg-back').onclick = () => _switchView('gm-view-lobby');
    _$('gm-dg-submit').onclick = _handleDGGuess;
    _$('gm-dg-input').addEventListener('keydown', e => { if (e.key === 'Enter') _handleDGGuess(); });
    _$('gm-dg-new').onclick = _revealDGWord;
    _$('gm-dg-clear').onclick = _clearCanvas;

    // 画笔颜色
    document.querySelectorAll('#game-root .gm-dg-color').forEach(el => {
      el.onclick = () => {
        document.querySelectorAll('#game-root .gm-dg-color').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
        _dgColor = el.dataset.color;
        _dgIsErasing = false;
      };
    });

    // 画笔粗细
    document.querySelectorAll('#game-root .gm-dg-brush-btn[data-size]').forEach(el => {
      el.onclick = () => {
        document.querySelectorAll('#game-root .gm-dg-brush-btn[data-size]').forEach(b => b.classList.remove('active'));
        el.classList.add('active');
        _dgBrushSize = parseInt(el.dataset.size);
        _dgIsErasing = false;
      };
    });

    // 橡皮擦
    _$('gm-dg-eraser').onclick = () => {
      _dgIsErasing = !_dgIsErasing;
      _$('gm-dg-eraser').classList.toggle('active', _dgIsErasing);
    };

    // 关闭结果弹窗（点击蒙层）
    _$('gm-result-overlay').onclick = e => {
      if (e.target === _$('gm-result-overlay')) _$('gm-result-overlay').classList.remove('active');
    };
  }

  // ================================================================
  // 公开方法
  // ================================================================
  async function open(opts = {}) {
    _contextChatId = opts.chatId || null;
    _contextIsGroup = opts.isGroup || false;
    _contextCharName = '';
    _contextCharPersona = '';
    _contextCharAvatar = '';
    _contextGroupMembers = [];
    _contextCurrentPlayer = null;

    // 加载角色上下文（私聊）
    if (!_contextIsGroup && _contextChatId) {
      try {
        if (typeof DB !== 'undefined' && DB.characters) {
          const char = await DB.characters.get(Number(_contextChatId));
          if (char) {
            _contextCharName = char.name || '';
            _contextCharPersona = char.persona || '';
          }
        }
      } catch(e) { console.warn('[GameModule] 加载角色信息失败:', e); }
    }

    // 加载群聊成员（群聊）
    if (_contextIsGroup && _contextChatId && typeof GroupChatModule !== 'undefined') {
      try {
        const gc = GroupChatModule.get(_contextChatId);
        if (gc?.members) {
          for (const mid of gc.members) {
            try {
              const c = await DB.characters.get(Number(mid));
              if (c) _contextGroupMembers.push({ id: String(mid), name: c.name || '角色' });
            } catch(e) {}
          }
          if (_contextGroupMembers.length > 0) {
            _contextCurrentPlayer = _contextGroupMembers[0];
          }
        }
      } catch(e) { console.warn('[GameModule] 加载群聊成员失败:', e); }
    }

    if (!_initialized) {
      _injectCSS();
      _injectHTML();
      _bindEvents();
      _initialized = true;
    }

    _ensureDB();
    _switchView('gm-view-lobby');
    _renderLobby();

    setTimeout(() => {
      const root = document.getElementById('game-root');
      if (root) root.classList.add('gm-open');
    }, 20);

    // 初始化 Canvas（如果有 Draw & Guess view 可见）
    setTimeout(() => _initCanvas(), 500);
  }

  function close() {
    const root = document.getElementById('game-root');
    if (root) root.classList.remove('gm-open');
    _renderRecentGames(); // 更新大厅最近游戏
  }

  function init() {
    if (!_initialized) {
      _injectCSS();
      _injectHTML();
      _bindEvents();
      _initialized = true;
    }
    _ensureDB();
  }

  // 暴露给聊天系统：获取游戏结果嵌入 HTML
  function renderGameEmbed(msg) {
    if (!msg || !msg.parts) return '';
    const part = msg.parts.find(p => p.type === 'game_result');
    if (!part) return '';
    const icons = { wordguess: '🔤', turtlesoup: '🐢', truthdare: '🎭', drawguess: '🎨' };
    return `<div style="background:rgba(212,184,122,0.08);border:1px solid rgba(212,184,122,0.2);border-radius:12px;padding:12px 16px;display:inline-flex;align-items:center;gap:10px;font-size:0.85rem;">
      <span style="font-size:1.5rem;">${icons[part.gameType] || '🎮'}</span>
      <div>
        <div style="font-weight:500;letter-spacing:1px;">${part.gameName || part.gameType}</div>
        <div style="font-size:0.7rem;color:#888;">${part.result || part.detail || ''}</div>
      </div>
    </div>`;
  }

  return { init, open, close, renderGameEmbed, _switchPlayer };
})();

// Dock 导航辅助：绕过 const 无法被内联 onclick 访问的坑
window.openForum = function() {
  // 先尝试 Router
  if (typeof Router !== 'undefined') {
    Router.go('forum');
  }

  // 兜底：如果 forum-screen 不存在，手动创建
  var fs = document.getElementById('forum-screen');
  if (!fs) {
    // 尝试通过间接 eval 访问 const ForumModule
    var FM = null;
    try { FM = (1,eval)('ForumModule'); } catch(e) {}

    if (FM && FM.onEnter) {
      FM.onEnter();
    } else {
      // 最终兜底：手动创建一个最简 forum-screen
      fs = document.createElement('div');
      fs.id = 'forum-screen';
      fs.className = 'screen';
      fs.innerHTML = '<div style="padding:80px 20px;text-align:center;color:#fff;"><h2>Echoes</h2><p>Loading forum...</p></div>';
      var device = document.querySelector('.device');
      if (device) device.appendChild(fs);
    }
    fs = document.getElementById('forum-screen');
  }

  if (fs && !fs.classList.contains('active')) {
    fs.classList.add('active');
  }
};

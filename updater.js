// updater.js
'use strict';

const UpdateModule = (() => {
  // 🌟 每次更新时，只需要修改这个版本号和下面的更新内容即可！
  const CURRENT_VERSION = 'v4.1.0'; 
  const VERSION_KEY = 'chillos-last-version';
  const READ_SECONDS = 20; // ⏳ 强制阅读秒数：按钮锁定，倒计时结束才能点
  
 const CHANGELOG = [
  "✦ 全新功能【做梦 · 让 TA 在睡着的时候，梦见你们之间发生过的事】：给每个角色装上独立的梦境。点桌面「梦境」图标进入星野，每颗星就是一个角色——金色代表 TA 做过梦，呼吸的金光代表有你还没看过的新梦。点开角色，再点「潜入梦境」哄 TA 入睡，AI 会把你们最近的聊天碎片、TA 的人设、还有你绑定的面具，用梦的逻辑重新拼贴成一段超现实的潜意识日记。每个角色的梦各自成堆、互不干扰，最多留存 50 个。详见配套教程。",
  "✦ 做梦【一场梦不只有文字 · 配图 / 呓语 / 配乐三件套】：一个梦可以同时长出画面、声音和配乐。生成配图会按梦境氛围出一张超现实画面（走你「生图设置」那套，也能在做梦偏好里单独设梦境专属的画风正负词）；呓语是 AI 另外写的一段梦话，用角色的音色念出来，像睡着的人含糊嘟囔的碎语；配乐让 AI 给这个梦选一首贴合情绪的真歌，自动从网易云抓来，用梦境专属的星轨播放器放。三样都能在做梦偏好里各自开关。详见配套教程。",
  "✦ 做梦【梦境详情 · 醒来记得的那半句，和留在现实里的锚点】：点开任意一个梦进入详情页，能看到完整正文、醒来只记得的那半句「echo」、情绪标签、梦的深度（深潜 / 浅眠），还有这个梦从现实里抓走的几个碎片「锚点」——让你一眼看出 TA 这场梦是从你们哪句对话、哪件小事里长出来的。不想要的梦可以直接删，连带它的配图和呓语一起清掉。",
  "✦ 做梦【做梦偏好 · 配图画风与网易云配乐都在这设】：做梦偏好里能单独开关配图 / 配乐 / 呓语。配图可填梦境专属的正向 / 负向提示词（留空就用生图设置的全局词）；配乐填好网易云 API 地址和 Cookie 就能抓歌，这份配置和剧情配乐共用一份，一处填好两边都能用。详见配套教程。",
];

  // 动态注入弹窗的 CSS 样式
  function injectCSS() {
    if (document.getElementById('updater-css')) return;
    const style = document.createElement('style');
    style.id = 'updater-css';
    style.textContent = `
      .upd-overlay {
        position: absolute; inset: 0; z-index: 9999;
        background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none; transition: opacity 0.4s ease;
      }
      .upd-overlay.active { opacity: 1; pointer-events: auto; }
      .upd-card {
        background: var(--bg-card, #fff); border: 1px solid var(--border-line, #e0e0e0);
        border-radius: 24px; padding: 32px 24px; width: 85%; max-width: 320px;
        box-shadow: 0 40px 80px rgba(0,0,0,0.15); position: relative; overflow: hidden;
        transform: translateY(20px) scale(0.95); transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
      }
      .upd-overlay.active .upd-card { transform: translateY(0) scale(1); }
      .upd-watermark {
        position: absolute; top: -30px; right: -20px; font-family: 'Playfair Display', serif;
        font-size: 160px; font-style: italic; font-weight: 300; color: var(--text-main, #121212);
        opacity: 0.03; line-height: 1; pointer-events: none; z-index: 0;
      }
      .upd-header { margin-bottom: 24px; position: relative; z-index: 1; }
      .upd-title { font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 600; font-style: italic; color: var(--text-main, #121212); line-height: 1; }
      .upd-version { font-family: 'Space Mono', monospace; font-size: 0.65rem; color: var(--text-sub, #888); letter-spacing: 2px; text-transform: uppercase; margin-top: 8px; font-weight: 700; }
      .upd-list { position: relative; z-index: 1; max-height: 40vh; overflow-y: auto; margin-bottom: 32px; padding-right: 4px; }
      .upd-list::-webkit-scrollbar { display: none; }
      .upd-item { font-family: 'Noto Sans SC', sans-serif; font-size: 0.85rem; color: var(--text-main, #333); line-height: 1.6; margin-bottom: 12px; }
      .upd-btn {
        width: 100%; padding: 14px 0; background: var(--text-main, #121212); color: var(--bg-device, #fff);
        border: none; border-radius: 100px; font-family: 'Space Mono', monospace; font-size: 0.8rem;
        font-weight: 600; letter-spacing: 2px; text-transform: uppercase; cursor: pointer;
        position: relative; z-index: 1; transition: transform 0.2s; box-shadow: 0 10px 20px rgba(0,0,0,0.1);
      }
      .upd-btn:active { transform: scale(0.96); }
      .upd-btn.counting {
        background: var(--text-sub, #999); cursor: not-allowed; box-shadow: none; opacity: 0.65;
      }
      .upd-btn.counting:active { transform: none; }
    `;
    document.head.appendChild(style);
  }

  // 动态创建并插入 DOM
  function createModal() {
    if (document.getElementById('updater-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'updater-overlay';
    overlay.className = 'upd-overlay';
    
    let listHtml = CHANGELOG.map(item => `<div class="upd-item">${item}</div>`).join('');

    overlay.innerHTML = `
      <div class="upd-card">
        <div class="upd-watermark">U</div>
        <div class="upd-header">
          <div class="upd-title">System Update</div>
          <div class="upd-version">VERSION // ${CURRENT_VERSION}</div>
        </div>
        <div class="upd-list">${listHtml}</div>
        <button class="upd-btn counting" id="upd-confirm-btn" disabled onclick="UpdateModule.closeAndSave()">${READ_SECONDS}s</button>
      </div>
    `;
    // 挂载到 body 或者 device 容器内
    const device = document.querySelector('.device') || document.body;
    device.appendChild(overlay);
  }

  function checkUpdate() {
    // 使用 localStorage 进行简单的本地版本校验
    const savedVersion = localStorage.getItem(VERSION_KEY);
    
    // 如果没有记录（新用户）或者版本号变了（老用户更新了），则弹出
    if (savedVersion !== CURRENT_VERSION) {
      injectCSS();
      createModal();
      // 稍微延迟一下，配合系统的进入动画，显得更丝滑
      setTimeout(() => {
        const overlay = document.getElementById('updater-overlay');
        if (overlay) overlay.classList.add('active');
        startCountdown();
      }, 800);
    }
  }

  // ⏳ 按钮倒计时：READ_SECONDS 秒内锁定，结束后解锁为 Got it
  function startCountdown() {
    const btn = document.getElementById('upd-confirm-btn');
    if (!btn) return;
    let left = READ_SECONDS;
    btn.classList.add('counting');
    btn.disabled = true;
    btn.textContent = `${left}s`;
    const timer = setInterval(() => {
      left--;
      if (left > 0) {
        btn.textContent = `${left}s`;
      } else {
        clearInterval(timer);
        btn.classList.remove('counting');
        btn.disabled = false;
        btn.textContent = 'Got it';
      }
    }, 1000);
  }

  function closeAndSave() {
    const btn = document.getElementById('upd-confirm-btn');
    if (btn && btn.disabled) return; // 倒计时未结束，不允许关闭
    const overlay = document.getElementById('updater-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      // 记录最新版本号，下次就不弹了
      localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
      // 等待动画结束后移除 DOM
      setTimeout(() => overlay.remove(), 400);
    }
  }

  return { checkUpdate, closeAndSave };
})();
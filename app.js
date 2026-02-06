// ===============================
// app.js (CELÝ SOUBOR) – zobrazuje pouze ROK (YYYY)
// Archive kódy A-001... + hash #A-001 + bez detailTitle/detailText
// ===============================

// ===============================
// Cloudflare R2 – BASE URL
// ===============================
const R2_BASE_URL = "https://pub-8117836d46bf42729082eee29fd41cf7.r2.dev";

// =====================================================
// KAZETY: audio + video sync + slider + LED + CRT class
// =====================================================

const tapeButtons = document.querySelectorAll(".tape-button");
const allAudios = Array.from(document.querySelectorAll("audio"));
const players = document.querySelectorAll("[data-player]");

// Map pro UI prvky playeru (seek/current/duration) – potřebujeme je umět refreshnout po otočení SIDE
const playerUI = new WeakMap();

function getCurrentAudioSelForPlayer(playerEl) {
  if (!playerEl) return null;
  const side = getSideForElement(playerEl); // čte .tape-card[data-side]
  return (
    playerEl.getAttribute(side === "B" ? "data-audio-b" : "data-audio-a") ||
    playerEl.getAttribute("data-audio") ||
    playerEl.getAttribute("data-audio-a") ||
    playerEl.getAttribute("data-audio-b")
  );
}

function getCurrentAudioForPlayer(playerEl) {
  const sel = getCurrentAudioSelForPlayer(playerEl);
  return sel ? document.querySelector(sel) : null;
}

function refreshPlayerUI(playerEl) {
  const ui = playerUI.get(playerEl);
  if (!ui) return;

  const audio = getCurrentAudioForPlayer(playerEl);
  if (!audio) return;

  // duration
  if (ui.durationEl) {
    ui.durationEl.textContent = Number.isFinite(audio.duration) ? formatTime(audio.duration) : "0:00";
  }

  // current time
  if (ui.currentEl) {
    ui.currentEl.textContent = formatTime(audio.currentTime || 0);
  }

  // slider position
  if (ui.seek && Number.isFinite(audio.duration) && audio.duration > 0) {
    const pct = (audio.currentTime / audio.duration) * 100;
    if (!ui.seek.dataset.dragging) ui.seek.value = String(pct);
  } else if (ui.seek && !ui.seek.dataset.dragging) {
    ui.seek.value = "0";
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

// SIDE A/B – očekávané atributy v HTML:
// - na .tape-button: data-audio-a="#audio1A" a data-audio-b="#audio1B" (nebo fallback data-audio)
// - na videích uvnitř .tape-button: <video class="tape-video" data-side="A"> a <video ... data-side="B">
// - (volitelné) tlačítko pro otočení uvnitř .tape-card nebo .tape-button: [data-side-toggle]

function normalizeSide(side) {
  const s = String(side || "A").toUpperCase();
  return s === "B" ? "B" : "A";
}

function getSideForElement(el) {
  const card = el ? el.closest?.(".tape-card") : null;
  return normalizeSide(card?.dataset?.side || "A");
}

function getAudioSelForButton(btn, side) {
  if (!btn) return null;
  const s = normalizeSide(side);
  // nové atributy
  const selA = btn.getAttribute("data-audio-a");
  const selB = btn.getAttribute("data-audio-b");
  // fallback (staré chování)
  const legacy = btn.getAttribute("data-audio");

  if (s === "B" && selB) return selB;
  if (s === "A" && selA) return selA;

  // když má jen jeden selector, ber ho jako A
  if (legacy) return legacy;
  // když má jen A, použij A i pro B (aby to nespadlo)
  if (selA) return selA;
  if (selB) return selB;
  return null;
}

function getTapeButtonForAudioSel(audioSel) {
  // najdi button, který má audioSel v data-audio / data-audio-a / data-audio-b
  return (
    Array.from(tapeButtons).find((btn) => {
      const a = btn.getAttribute("data-audio");
      const aA = btn.getAttribute("data-audio-a");
      const aB = btn.getAttribute("data-audio-b");
      return a === audioSel || aA === audioSel || aB === audioSel;
    }) || null
  );
}

function getPlayerForAudioSel(audioSel) {
  // kompatibilita: player může mít data-audio, nebo data-audio-a / data-audio-b
  return (
    Array.from(players).find((p) => {
      const a = p.getAttribute("data-audio");
      const aA = p.getAttribute("data-audio-a");
      const aB = p.getAttribute("data-audio-b");
      return a === audioSel || aA === audioSel || aB === audioSel;
    }) || null
  );
}

function getTapeCardForAudioSel(audioSel) {
  const btn = getTapeButtonForAudioSel(audioSel);
  return btn ? btn.closest(".tape-card") : null;
}

function clearPlayingCards() {
  document.querySelectorAll(".tape-card.is-playing").forEach((c) => c.classList.remove("is-playing"));
}

function setCardPlaying(audioSel, isPlaying) {
  const card = getTapeCardForAudioSel(audioSel);
  if (!card) return;
  if (isPlaying) card.classList.add("is-playing");
  else card.classList.remove("is-playing");
}

function getVideoForButtonAndSide(btn, side) {
  if (!btn) return null;
  const s = normalizeSide(side);
  // Preferuj video pro konkrétní stranu
  const bySide = btn.querySelector(`video.tape-video[data-side="${s}"]`);
  if (bySide) return bySide;
  // fallback: první video
  return btn.querySelector("video.tape-video");
}

function setVideoVisibilityForButton(btn, side) {
  if (!btn) return;
  const s = normalizeSide(side);
  const vids = Array.from(btn.querySelectorAll("video.tape-video"));
  if (vids.length <= 1) return;

  vids.forEach((v) => {
    const vSide = normalizeSide(v.getAttribute("data-side") || "A");
    const isActive = vSide === s;
    v.style.display = isActive ? "" : "none";
    if (!isActive) {
      try { v.pause(); } catch (_) {}
    }
  });
}

function updateSideLabelUI(card) {
  if (!card) return;
  const s = normalizeSide(card.dataset.side || "A");
  const label = card.querySelector("[data-side-label]");
  if (label) label.textContent = `SIDE ${s}`;
}

// pauza všeho kromě výjimky (bez resetu pozice)
function pauseAllExcept(exceptionAudio) {
  allAudios.forEach((a) => {
    if (a !== exceptionAudio) a.pause();
  });

  const exceptionSel = exceptionAudio ? `#${exceptionAudio.id}` : null;
  tapeButtons.forEach((btn) => {
    const card = btn.closest(".tape-card");
    const side = getSideForElement(btn);
    const sel = getAudioSelForButton(btn, side);
    const vid = getVideoForButtonAndSide(btn, side);

    // vždy zajisti viditelnost správné strany
    if (card) {
      card.dataset.side = normalizeSide(card.dataset.side || "A");
      updateSideLabelUI(card);
    }
    setVideoVisibilityForButton(btn, side);

    if (!vid) return;
    if (!exceptionSel || sel !== exceptionSel) {
      vid.pause();
    }
  });

  // UI: pauznuto
  tapeButtons.forEach((btn) => {
    btn.classList.remove("playing");
    const st = btn.querySelector("[data-status]");
    if (st) st.textContent = "Paused";
  });

  players.forEach((p) => {
    const toggle = p.querySelector("[data-toggle]");
    if (toggle) toggle.textContent = "Play";
  });

  clearPlayingCards();

  // pokud výjimka hraje, nastav jí UI
  if (exceptionAudio && !exceptionAudio.paused) {
    const audioSel = `#${exceptionAudio.id}`;
    const btn = getTapeButtonForAudioSel(audioSel);
    const player = getPlayerForAudioSel(audioSel);

    // nastav viditelnost videa dle aktuální strany
    const side = btn ? getSideForElement(btn) : "A";
    if (btn) setVideoVisibilityForButton(btn, side);

    if (btn) {
      btn.classList.add("playing");
      const st = btn.querySelector("[data-status]");
      if (st) st.textContent = "Playing";
    }
    if (player) {
      const toggle = player.querySelector("[data-toggle]");
      if (toggle) toggle.textContent = "Pause";
    }
    setCardPlaying(audioSel, true);
  }
}

async function playAudioAndVideo(audio, audioSel) {
  pauseAllExcept(audio);

  const btn = getTapeButtonForAudioSel(audioSel);
  const side = btn ? getSideForElement(btn) : "A";

  // video pro správnou stranu
  if (btn) setVideoVisibilityForButton(btn, side);
  const vid = btn ? getVideoForButtonAndSide(btn, side) : null;

  if (vid) {
    try {
      if (Number.isFinite(vid.duration) && vid.currentTime >= vid.duration) {
        vid.currentTime = 0;
      }
      await vid.play();
    } catch (e) {
      console.warn("Video play blocked:", e);
    }
  }

  try {
    await audio.play();

    const player = getPlayerForAudioSel(audioSel);

    if (btn) {
      btn.classList.add("playing");
      const st = btn.querySelector("[data-status]");
      if (st) st.textContent = `Playing (SIDE ${normalizeSide(side)})`;
    }
    if (player) {
      const toggle = player.querySelector("[data-toggle]");
      if (toggle) toggle.textContent = "Pause";
    }

    clearPlayingCards();
    setCardPlaying(audioSel, true);
  } catch (e) {
    if (btn) {
      const st = btn.querySelector("[data-status]");
      if (st) st.textContent = "Playback blocked";
    }
    console.error(e);
  }
}

function pauseAudioAndVideo(audio, audioSel) {
  audio.pause();

  const btn = getTapeButtonForAudioSel(audioSel);
  const side = btn ? getSideForElement(btn) : "A";
  if (btn) setVideoVisibilityForButton(btn, side);

  const vid = btn ? getVideoForButtonAndSide(btn, side) : null;
  if (vid) vid.pause();

  const player = getPlayerForAudioSel(audioSel);

  if (btn) {
    btn.classList.remove("playing");
    const st = btn.querySelector("[data-status]");
    if (st) st.textContent = `Paused (SIDE ${normalizeSide(side)})`;
  }
  if (player) {
    const toggle = player.querySelector("[data-toggle]");
    if (toggle) toggle.textContent = "Play";
  }

  setCardPlaying(audioSel, false);
}

async function togglePlay(audio, audioSel) {
  if (!audio) return;

  if (!audio.paused) {
    pauseAudioAndVideo(audio, audioSel);
    return;
  }

  await playAudioAndVideo(audio, audioSel);
}

// klik na kazetu
// (pozn.: otočení řešíme přes [data-side-toggle] – klik na něj neodpaluje Play/Pause)
tapeButtons.forEach((btn) => {
  btn.addEventListener("click", (ev) => {
    // pokud uživatel klikl na toggle-side uvnitř, neřeš Play/Pause
    const toggleEl = ev.target && ev.target.closest ? ev.target.closest("[data-side-toggle]") : null;
    if (toggleEl) return;

    const side = getSideForElement(btn);
    const audioSel = getAudioSelForButton(btn, side);
    if (!audioSel) return;

    const audio = document.querySelector(audioSel);
    if (!audio) return;

    // vždy zajisti správnou viditelnost videa
    setVideoVisibilityForButton(btn, side);

    togglePlay(audio, audioSel);
  });
});

// player ovládání
players.forEach((player) => {
  // Player může mít data-audio (legacy) nebo data-audio-a/data-audio-b.
  // POZOR: audio pro player se musí vždy brát podle aktuální strany kazety (SIDE A/B).
  const audioA = player.getAttribute("data-audio-a") || player.getAttribute("data-audio");
  const audioB = player.getAttribute("data-audio-b") || null;

  const aA = audioA ? document.querySelector(audioA) : null;
  const aB = audioB ? document.querySelector(audioB) : null;

  // Musí existovat aspoň jedna stopa
  if (!aA && !aB) return;

  const seek = player.querySelector("[data-seek]");
  const currentEl = player.querySelector("[data-current]");
  const durationEl = player.querySelector("[data-duration]");
  const toggleBtn = player.querySelector("[data-toggle]");
  const backBtn = player.querySelector("[data-back]");
  const fwdBtn = player.querySelector("[data-forward]");
  const stopBtn = player.querySelector("[data-stop]");
  const backFastBtn = player.querySelector("[data-back-fast]");
  const fwdFastBtn = player.querySelector("[data-forward-fast]");

  // uložit UI refs pro refresh po otočení SIDE
  playerUI.set(player, { seek, currentEl, durationEl });

  // helper: aktuální audio + selector podle strany
  const getAudioSel = () => getCurrentAudioSelForPlayer(player);
  const getAudioEl = () => getCurrentAudioForPlayer(player);

  // =========================
  // FAST HOLD (držení tlačítka)
  // - >> : přehrává rychleji při držení
  // - << : rychlé přetáčení dozadu (skoky), protože negativní playbackRate není spolehlivé
  // =========================
  let fastTimer = null;
  let fastWasPaused = false;
  let fastPrevRate = 1;

  function stopFastHold() {
    if (fastTimer) {
      clearInterval(fastTimer);
      fastTimer = null;
    }

    const a = getAudioEl();
    if (!a) return;

    // restore rate
    try { a.playbackRate = fastPrevRate || 1; } catch (_) {}

    // if it was paused before hold, pause again
    if (fastWasPaused) {
      try { a.pause(); } catch (_) {}
    }

    refreshPlayerUI(player);
  }

  async function startFastForwardHold() {
    const a = getAudioEl();
    const sel = getAudioSel();
    if (!a || !sel) return;

    // snapshot state
    fastWasPaused = a.paused;
    fastPrevRate = a.playbackRate || 1;

    // ensure playing
    try {
      if (a.paused) await a.play();
    } catch (_) {}

    // speed up while holding
    try { a.playbackRate = 5.0; } catch (_) {}

    refreshPlayerUI(player);
  }

  function startFastBackwardHold() {
    const a = getAudioEl();
    const sel = getAudioSel();
    if (!a || !sel) return;

    // snapshot state
    fastWasPaused = a.paused;
    fastPrevRate = a.playbackRate || 1;

    // rewind: rychlé skoky dozadu
    try { a.pause(); } catch (_) {}

    // ~4x rychlost: 0.4s každých 100ms
    fastTimer = setInterval(() => {
      const aa = getAudioEl();
      if (!aa) return;
      const dur = Number.isFinite(aa.duration) ? aa.duration : Infinity;
      aa.currentTime = clamp((aa.currentTime || 0) - 0.4, 0, dur);
      refreshPlayerUI(player);
    }, 100);
  }

  function bindHold(btn, onStart) {
    if (!btn) return;

    const start = (e) => {
      e.preventDefault();
      // stop any previous hold
      stopFastHold();
      onStart();
    };

    const end = (e) => {
      e.preventDefault();
      stopFastHold();
    };

    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    btn.addEventListener("pointerleave", end);
    btn.addEventListener("blur", end);
  }

  bindHold(fwdFastBtn, startFastForwardHold);
  bindHold(backFastBtn, startFastBackwardHold);

  if (toggleBtn) toggleBtn.addEventListener("click", async () => {
    const sel = getAudioSel();
    const a = getAudioEl();
    if (!a || !sel) return;
    await togglePlay(a, sel);
    refreshPlayerUI(player);
  });

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      const a = getAudioEl();
      if (!a) return;
      const dur = Number.isFinite(a.duration) ? a.duration : Infinity;
      a.currentTime = clamp(a.currentTime - 10, 0, dur);
      if (currentEl) currentEl.textContent = formatTime(a.currentTime);
      refreshPlayerUI(player);
    });
  }

  if (fwdBtn) {
    fwdBtn.addEventListener("click", () => {
      const a = getAudioEl();
      if (!a) return;
      const dur = Number.isFinite(a.duration) ? a.duration : a.currentTime + 10;
      a.currentTime = clamp(a.currentTime + 10, 0, dur);
      if (currentEl) currentEl.textContent = formatTime(a.currentTime);
      refreshPlayerUI(player);
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stopFastHold();
      const sel = getAudioSel();
      const a = getAudioEl();
      if (!a || !sel) return;

      // Stop = pauza + návrat na začátek
      a.pause();
      a.currentTime = 0;

      // Video pro aktuální stranu kazety
      const btn = getTapeButtonForAudioSel(sel);
      const s = btn ? getSideForElement(btn) : "A";
      if (btn) setVideoVisibilityForButton(btn, s);
      const vid = btn ? getVideoForButtonAndSide(btn, s) : null;
      if (vid) {
        try { vid.pause(); } catch (_) {}
        try { vid.currentTime = 0; } catch (_) {}
      }

      // UI
      if (toggleBtn) toggleBtn.textContent = "Play";
      if (currentEl) currentEl.textContent = "0:00";
      refreshPlayerUI(player);

      if (btn) {
        btn.classList.remove("playing");
        const st = btn.querySelector("[data-status]");
        if (st) st.textContent = "Paused";
      }
      setCardPlaying(sel, false);
    });
  }

  if (seek) {
    seek.addEventListener("pointerdown", () => {
      seek.dataset.dragging = "1";
    });

    seek.addEventListener("input", () => {
      const a = getAudioEl();
      if (!a) return;
      if (!Number.isFinite(a.duration) || a.duration <= 0) return;
      const pct = Number(seek.value) / 100;
      a.currentTime = pct * a.duration;
      if (currentEl) currentEl.textContent = formatTime(a.currentTime);
      refreshPlayerUI(player);
    });

    const stopDrag = () => delete seek.dataset.dragging;
    seek.addEventListener("pointerup", stopDrag);
    seek.addEventListener("pointercancel", stopDrag);
    seek.addEventListener("blur", stopDrag);
  }

  function bindAudioToPlayer(a) {
    if (!a) return;

    a.addEventListener("loadedmetadata", () => {
      // update duration only if this audio is the current side
      const current = getAudioEl();
      if (current === a) refreshPlayerUI(player);
    });

    a.addEventListener("timeupdate", () => {
      const current = getAudioEl();
      if (current !== a) return;
      refreshPlayerUI(player);
    });

    a.addEventListener("ended", () => {
      const sel = getAudioSel();
      const current = getAudioEl();
      if (!sel || current !== a) return;

      const btn = getTapeButtonForAudioSel(sel);
      const s = btn ? getSideForElement(btn) : "A";
      if (btn) setVideoVisibilityForButton(btn, s);
      const vid = btn ? getVideoForButtonAndSide(btn, s) : null;
      if (vid) vid.pause();

      if (btn) {
        btn.classList.remove("playing");
        const st = btn.querySelector("[data-status]");
        if (st) st.textContent = "Paused";
      }
      if (toggleBtn) toggleBtn.textContent = "Play";

      setCardPlaying(sel, false);
      refreshPlayerUI(player);
    });
  }

  // bind obě strany (pokud existují)
  bindAudioToPlayer(aA);
  bindAudioToPlayer(aB);

  // init UI podle aktuální strany
  refreshPlayerUI(player);
});

// =====================================================
// SIDE A/B – otočení kazety
// =====================================================

function getAllSideToggles() {
  return Array.from(document.querySelectorAll("[data-side-toggle]"));
}

function flipSide(card) {
  if (!card) return;
  const current = normalizeSide(card.dataset.side || "A");
  const next = current === "A" ? "B" : "A";
  card.dataset.side = next;

  // najdi button v kartě a přepni viditelnost videí
  const btn = card.querySelector(".tape-button");
  if (btn) setVideoVisibilityForButton(btn, next);

  updateSideLabelUI(card);
  // refresh player UI (seek/time) pro tuto kazetu po otočení
  const p = card.querySelector("[data-player]");
  if (p) refreshPlayerUI(p);

  // pokud na této kartě právě něco hraje, přepni na druhou stranu plynule
  const playingBtn = btn && btn.classList.contains("playing");
  if (!btn || !playingBtn) return;

  // zjisti právě hrající audio (A nebo B)
  const selA = getAudioSelForButton(btn, "A");
  const selB = getAudioSelForButton(btn, "B");
  const aA = selA ? document.querySelector(selA) : null;
  const aB = selB ? document.querySelector(selB) : null;

  const wasAudio = current === "A" ? aA : aB;
  const nextAudio = next === "A" ? aA : aB;
  if (!nextAudio) return;

  // zachovej přibližně čas
  const t = wasAudio && Number.isFinite(wasAudio.currentTime) ? wasAudio.currentTime : 0;
  if (wasAudio) wasAudio.pause();

  // UI reset všeho kromě nové stopy
  pauseAllExcept(nextAudio);

  // nastav čas (clamp)
  const dur = Number.isFinite(nextAudio.duration) ? nextAudio.duration : Infinity;
  nextAudio.currentTime = clamp(t, 0, dur);

  // pusť novou stranu
  const nextSel = next === "A" ? selA : selB;
  if (nextSel) playAudioAndVideo(nextAudio, nextSel);
}

function bindSideToggles() {
  getAllSideToggles().forEach((toggle) => {
    toggle.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const card = toggle.closest(".tape-card");
      if (!card) return;
      // inicializace
      card.dataset.side = normalizeSide(card.dataset.side || "A");
      flipSide(card);
    };
  });

  // inicializace labelů a videí při startu
  document.querySelectorAll(".tape-card").forEach((card) => {
    card.dataset.side = normalizeSide(card.dataset.side || "A");
    updateSideLabelUI(card);
    const btn = card.querySelector(".tape-button");
    if (btn) setVideoVisibilityForButton(btn, card.dataset.side);
  });
}

bindSideToggles();

// =====================================================
// PRIME TAPE VIDEOS: bez poster.jpg – načti 1. snímek videa
// =====================================================
function primeTapeVideos() {
  const vids = Array.from(document.querySelectorAll("video.tape-video"));
  vids.forEach((v) => {
    try {
      // metadata stačí pro první snímek, ale některé prohlížeče potřebují i load()
      v.preload = v.getAttribute("preload") || "metadata";
      v.playsInline = true;

      // jakmile jsou data dostupná, posuň se o chlup, aby se vykreslil frame
      const onLoaded = () => {
        try {
          // 0 někdy nevykreslí frame, 0.01 obvykle ano
          v.currentTime = 0.01;
        } catch (_) {}
        try { v.pause(); } catch (_) {}
        v.removeEventListener("loadeddata", onLoaded);
      };

      v.addEventListener("loadeddata", onLoaded, { once: true });
      v.load();
    } catch (_) {}
  });
}

// spusť hned po bindu (DOM už je hotový, skript je na konci)
primeTapeVideos();

// =====================================================
// ARCHIVE: auto-generovaný seznam (00–40) + 2 sekce
// ZOBRAZENÍ JEN ROKU (YYYY) místo celého data
// Naming: {NN}__{YYYY}_{image|video}.{jpg|mp4}
// =====================================================

let ARCHIVE_ITEMS = [];

const archiveListEl = document.getElementById("archiveList");
const prevBtn = document.getElementById("prevItem");
const nextBtn = document.getElementById("nextItem");

const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const detailMedia = document.getElementById("detailMedia");
const detailText = document.getElementById("detailText");
const detailAudio = document.getElementById("detailAudio");

let activeIndex = -1;

// ===============================
// ARCHIVE config
// ===============================
const ARCHIVE_BASE_PATH = "assets/archive/";
// Index soubor s reálnými názvy souborů (rok se bere z názvu):
// [{"code":"00","file":"00__2019_image.jpg"}, {"code":"01","file":"01__2020_video.mp4"}, ...]
const ARCHIVE_INDEX_URL = "assets/archive-index.json";

const ARCHIVE_SECTIONS = [
  {
    id: "tape01",
    title: "01 – CHRONOLOGICKÝ ROZBOR ZÁVODNÍHO TÝMU",
    from: 0,
    to: 24
  },
  {
    id: "tape02",
    title: "02 – ROZHOVORY S JEDNOTLIVÝMI ČLENY TÝMU",
    from: 25,
    to: 40
  }
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function yearFromDateOrYear(value) {
  if (!value) return "";
  const s = String(value).trim();

  // když už je to YYYY
  if (/^\d{4}$/.test(s)) return s;

  // když je to YYYY-MM-DD
  const m = s.match(/^(\d{4})-/);
  if (m) return m[1];

  // fallback: najdi první 4 číslice
  const m2 = s.match(/(\d{4})/);
  return m2 ? m2[1] : "";
}

function typeLabel(t) {
  if (t === "image") return "fotografie";
  if (t === "video") return "video";
  return "text";
}


function sectionForCode(code) {
  const n = Number.parseInt(code, 10);
  const sec = ARCHIVE_SECTIONS.find((s) => n >= s.from && n <= s.to);
  return sec || ARCHIVE_SECTIONS[0];
}

function normalizeCode(code) {
  const raw = String(code ?? "").trim();
  if (!raw) return null;

  // podporuj i formáty jako "A-002", "02", "2"
  // 1) nejdřív zkus najít dvojčíslí
  const m2 = raw.match(/(\d{2})/);
  if (m2) {
    const n = Number.parseInt(m2[1], 10);
    if (!Number.isFinite(n) || n < 0 || n > 40) return null;
    return m2[1];
  }

  // 2) fallback: jedno číslo
  const m1 = raw.match(/(\d)/);
  if (m1) {
    const n = Number.parseInt(m1[1], 10);
    if (!Number.isFinite(n) || n < 0 || n > 40) return null;
    return String(n).padStart(2, "0");
  }

  return null;
}

function codeFromFileName(file) {
  const f = String(file ?? "").trim();
  if (!f) return null;
  // očekáváme na začátku "NN__"
  const m = f.match(/^(\d{2})__/);
  if (m) {
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 0 || n > 40) return null;
    return m[1];
  }
  // fallback: první dvojčíslí kdekoliv
  const m2 = f.match(/(\d{2})/);
  if (m2) {
    const n = Number.parseInt(m2[1], 10);
    if (!Number.isFinite(n) || n < 0 || n > 40) return null;
    return m2[1];
  }
  return null;
}

function inferTypeFromFile(file) {
  const f = String(file || "").toLowerCase();
  if (f.includes("_video")) return "video";
  return "image";
}

// DŮLEŽITÉ: onclick přepisuje předchozí handler => nikdy se "nenabalí" víckrát
function bindArchiveNav() {
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (ARCHIVE_ITEMS.length === 0) return;
      const prevIndex = Math.max(0, activeIndex - 1);
      setActiveIndex(prevIndex, true);
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      if (ARCHIVE_ITEMS.length === 0) return;
      const nextIndex = Math.min(ARCHIVE_ITEMS.length - 1, activeIndex + 1);
      setActiveIndex(nextIndex, true);
    };
  }
}

function renderArchiveList() {
  if (!archiveListEl) return;

  archiveListEl.innerHTML = "";

  // seskup podle sectionId
  const groups = new Map();
  ARCHIVE_ITEMS.forEach((it) => {
    const key = it.sectionId || "default";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });

  ARCHIVE_SECTIONS.forEach((sec) => {
    const items = groups.get(sec.id) || [];
    if (items.length === 0) return;

    const h = document.createElement("div");
    h.className = "archive-section";
    h.textContent = sec.title;
    archiveListEl.appendChild(h);

    items.forEach((item) => {
      const idx = ARCHIVE_ITEMS.indexOf(item);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "archive-item";

      const number = item.code || "";
      const kind = typeLabel(item.type);
      const year = yearFromDateOrYear(item.date) || yearFromDateOrYear(item.mediaSrc);

      btn.innerHTML = `
        <span class="a-num">${number}</span>
        <span class="a-sep">—</span>
        <span class="a-type">${kind}</span>
        <span class="a-sep">—</span>
        <span class="a-date">${year}</span>
      `;

      btn.id = item.code; // #00..#40
      btn.onclick = () => setActiveIndex(idx, true);

      archiveListEl.appendChild(btn);
    });
  });
}

function renderActiveStyles() {
  if (!archiveListEl) return;
  const items = archiveListEl.querySelectorAll(".archive-item");
  items.forEach((el, idx) => el.classList.toggle("active", idx === activeIndex));
}

function renderDetail(item) {
  if (!item) return;

  if (detailTitle) detailTitle.textContent = "";

  const year = yearFromDateOrYear(item.date) || yearFromDateOrYear(item.mediaSrc);
  if (detailMeta) detailMeta.textContent = `${item.code} – ${typeLabel(item.type)} – ${year}`;

  if (detailMedia) {
    detailMedia.innerHTML = "";
    detailMedia.dataset.archive = item.code || "";

    const resolveLocal = (src) => new URL(src, document.baseURI).toString();

    if (item.type === "image" && item.mediaSrc) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = resolveLocal(item.mediaSrc);
      img.setAttribute("data-archive", item.code || "");
      detailMedia.appendChild(img);

    } else if (item.type === "video" && item.mediaSrc) {
      const vid = document.createElement("video");
      vid.controls = true;
      vid.playsInline = true;
      vid.preload = "metadata";
      vid.src = resolveLocal(item.mediaSrc);
      vid.setAttribute("data-archive", item.code || "");
      detailMedia.appendChild(vid);
    }
  }

  if (detailText) detailText.textContent = "";
  if (detailAudio) detailAudio.innerHTML = "";
}

function setActiveIndex(idx, updateHash) {
  if (idx < 0 || idx >= ARCHIVE_ITEMS.length) return;
  activeIndex = idx;
  renderActiveStyles();
  renderDetail(ARCHIVE_ITEMS[activeIndex]);

  if (updateHash && ARCHIVE_ITEMS[activeIndex]?.code) {
    const code = ARCHIVE_ITEMS[activeIndex].code;
    if (location.hash.replace("#", "") !== code) {
      history.replaceState(null, "", `#${encodeURIComponent(code)}`);
    }
  }
}

function goToCode(code, updateHash) {
  if (!code) return;
  const norm = String(code).trim();
  const idx = ARCHIVE_ITEMS.findIndex((x) => x.code === norm);
  if (idx >= 0) {
    setActiveIndex(idx, updateHash);
    const btn = document.getElementById(norm);
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function loadArchiveManifest() {
  if (!archiveListEl) return;

  const indexUrl = new URL(ARCHIVE_INDEX_URL, document.baseURI).toString();

  try {
    const res = await fetch(indexUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Index HTTP ${res.status} (${res.statusText})`);
    }

    let text = await res.text();
    text = text.replace(/^\uFEFF/, "").trim();
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("archive-index.json musí být JSON pole.");
    }

    // očekáváme minimálně: { code:"00", file:"00__2019_image.jpg" }
    const items = [];

    data.forEach((row) => {
      const file = String(row.file || "").trim();
      if (!file) return;

      // code může být špatně / chybět – vytáhni ho z file
      const code = normalizeCode(row.code) || codeFromFileName(file);
      if (!code) return;

      const type = String(row.type || inferTypeFromFile(file)).toLowerCase() === "video" ? "video" : "image";
      const year = String(row.year || yearFromDateOrYear(file) || "");

      const sec = sectionForCode(code);

      items.push({
        code,
        sectionId: sec.id,
        sectionTitle: sec.title,
        title: "",
        date: year,
        type,
        mediaSrc: `${ARCHIVE_BASE_PATH}${file}`,
        audioSrc: ""
      });
    });

    // seřaď 00–40
    items.sort((a, b) => Number(a.code) - Number(b.code));

    ARCHIVE_ITEMS = items;

    renderArchiveList();
    bindArchiveNav();

    const hash = decodeURIComponent(location.hash || "").replace("#", "").trim();
    if (hash) {
      goToCode(hash, false);
    } else if (ARCHIVE_ITEMS.length > 0) {
      setActiveIndex(0, false);
    }
  } catch (e) {
    console.error("Nepodařilo se načíst archive-index.json:", e);

    archiveListEl.innerHTML = `
      <div class="muted" style="line-height:1.4">
        Archivní index se nepodařilo načíst.<br>
        <strong>Důvod:</strong> ${String(e.message || e)}<br>
        <strong>URL:</strong> <code>${indexUrl}</code>
      </div>
    `;
  }
}

// init
bindArchiveNav();
loadArchiveManifest();

window.addEventListener("hashchange", () => {
  const hash = decodeURIComponent(location.hash || "").replace("#", "").trim();
  if (hash) goToCode(hash, false);
});

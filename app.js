// ===============================
// Cloudflare R2 – BASE URL
// ===============================
const R2_BASE_URL = "https://pub-8117836d46bf42729082eee29fd41cf7.r2.dev";
// ===============================
// R2 pouze pro KAZETY (audio/video)
// ===============================
const R2_BASE_URL = "https://pub-8117836d46bf42729082eee29fd41cf7.r2.dev";

const R2_ONLY_FILES = new Set([
  "audio01.mp3",
  "audio02.mp3",
  "tape_01.mp4",
  "tape_02.mp4",
]);

function toR2Url(maybeLocalSrc) {
  if (!maybeLocalSrc) return maybeLocalSrc;
  if (/^https?:\/\//i.test(maybeLocalSrc)) return maybeLocalSrc;

  if (maybeLocalSrc.startsWith("assets/")) {
    const filename = maybeLocalSrc.slice("assets/".length);
    if (R2_ONLY_FILES.has(filename)) {
      return `${R2_BASE_URL}/${filename}`;
    }
  }
  return maybeLocalSrc;
}

function rewriteTapeMediaSourcesToR2() {
  // přepiš jen existující kazetová media v DOM (audio + video)
  document.querySelectorAll("audio[src], video[src]").forEach((el) => {
    const src = el.getAttribute("src") || "";
    const rewritten = toR2Url(src);
    if (rewritten !== src) el.src = rewritten;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", rewriteTapeMediaSourcesToR2);
} else {
  rewriteTapeMediaSourcesToR2();
}


// =====================================================
// KAZETY: audio + video sync + slider + LED + CRT class
// =====================================================

const tapeButtons = document.querySelectorAll(".tape-button");
const allAudios = Array.from(document.querySelectorAll("audio"));
const players = document.querySelectorAll("[data-player]");

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function getTapeButtonForAudioSel(audioSel) {
  return Array.from(tapeButtons).find((btn) => btn.getAttribute("data-audio") === audioSel) || null;
}

function getPlayerForAudioSel(audioSel) {
  return Array.from(players).find((p) => p.getAttribute("data-audio") === audioSel) || null;
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

function getVideoForAudioSel(audioSel) {
  const btn = getTapeButtonForAudioSel(audioSel);
  if (!btn) return null;
  return btn.querySelector("video.tape-video");
}

// pauza všeho kromě výjimky (bez resetu pozice)
function pauseAllExcept(exceptionAudio) {
  allAudios.forEach((a) => {
    if (a !== exceptionAudio) a.pause();
  });

  const exceptionSel = exceptionAudio ? `#${exceptionAudio.id}` : null;
  tapeButtons.forEach((btn) => {
    const sel = btn.getAttribute("data-audio");
    const vid = getVideoForAudioSel(sel);
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

  const vid = getVideoForAudioSel(audioSel);
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

    const btn = getTapeButtonForAudioSel(audioSel);
    const player = getPlayerForAudioSel(audioSel);

    if (btn) {
      btn.classList.add("playing");
      const st = btn.querySelector("[data-status]");
      if (st) st.textContent = "Playing";
    }
    if (player) {
      const toggle = player.querySelector("[data-toggle]");
      if (toggle) toggle.textContent = "Pause";
    }

    clearPlayingCards();
    setCardPlaying(audioSel, true);
  } catch (e) {
    const btn = getTapeButtonForAudioSel(audioSel);
    if (btn) {
      const st = btn.querySelector("[data-status]");
      if (st) st.textContent = "Playback blocked";
    }
    console.error(e);
  }
}

function pauseAudioAndVideo(audio, audioSel) {
  audio.pause();

  const vid = getVideoForAudioSel(audioSel);
  if (vid) vid.pause();

  const btn = getTapeButtonForAudioSel(audioSel);
  const player = getPlayerForAudioSel(audioSel);

  if (btn) {
    btn.classList.remove("playing");
    const st = btn.querySelector("[data-status]");
    if (st) st.textContent = "Paused";
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
tapeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const audioSel = btn.getAttribute("data-audio");
    const audio = document.querySelector(audioSel);
    togglePlay(audio, audioSel);
  });
});

// player ovládání
players.forEach((player) => {
  const audioSel = player.getAttribute("data-audio");
  const audio = document.querySelector(audioSel);
  if (!audio) return;

  const seek = player.querySelector("[data-seek]");
  const currentEl = player.querySelector("[data-current]");
  const durationEl = player.querySelector("[data-duration]");
  const toggleBtn = player.querySelector("[data-toggle]");
  const backBtn = player.querySelector("[data-back]");
  const fwdBtn = player.querySelector("[data-forward]");

  audio.addEventListener("loadedmetadata", () => {
    if (durationEl) durationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener("timeupdate", () => {
    if (currentEl) currentEl.textContent = formatTime(audio.currentTime);

    if (seek && Number.isFinite(audio.duration) && audio.duration > 0) {
      const pct = (audio.currentTime / audio.duration) * 100;
      if (!seek.dataset.dragging) seek.value = String(pct);
    }
  });

  audio.addEventListener("ended", () => {
    const vid = getVideoForAudioSel(audioSel);
    if (vid) vid.pause();

    const btn = getTapeButtonForAudioSel(audioSel);
    if (btn) {
      btn.classList.remove("playing");
      const st = btn.querySelector("[data-status]");
      if (st) st.textContent = "Paused";
    }
    if (toggleBtn) toggleBtn.textContent = "Play";

    setCardPlaying(audioSel, false);
  });

  if (toggleBtn) toggleBtn.addEventListener("click", () => togglePlay(audio, audioSel));

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity;
      audio.currentTime = clamp(audio.currentTime - 10, 0, dur);
      if (currentEl) currentEl.textContent = formatTime(audio.currentTime);
    });
  }

  if (fwdBtn) {
    fwdBtn.addEventListener("click", () => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + 10;
      audio.currentTime = clamp(audio.currentTime + 10, 0, dur);
      if (currentEl) currentEl.textContent = formatTime(audio.currentTime);
    });
  }

  if (seek) {
    seek.addEventListener("pointerdown", () => {
      seek.dataset.dragging = "1";
    });

    seek.addEventListener("input", () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const pct = Number(seek.value) / 100;
      audio.currentTime = pct * audio.duration;
      if (currentEl) currentEl.textContent = formatTime(audio.currentTime);
    });

    const stopDrag = () => delete seek.dataset.dragging;
    seek.addEventListener("pointerup", stopDrag);
    seek.addEventListener("pointercancel", stopDrag);
    seek.addEventListener("blur", stopDrag);
  }
});

// =====================================================
// ARCHIVE: načítání z assets/archive-manifest.json
// (fix: Předchozí/Další nepřeskakuje o 2)
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

function formatDate(iso) {
  if (!iso || !iso.includes("-")) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function typeLabel(t) {
  if (t === "image") return "fotografie";
  if (t === "video") return "video";
  return "text";
}

// DŮLEŽITÉ: onclick přepisuje předchozí handler => nikdy se "nenabalí" víckrát
function bindArchiveNav() {
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (ARCHIVE_ITEMS.length === 0) return;
      const prevIndex = Math.max(0, activeIndex - 1);
      setActiveIndex(prevIndex);
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      if (ARCHIVE_ITEMS.length === 0) return;
      const nextIndex = Math.min(ARCHIVE_ITEMS.length - 1, activeIndex + 1);
      setActiveIndex(nextIndex);
    };
  }
}

function renderArchiveList() {
  if (!archiveListEl) return;

  archiveListEl.innerHTML = "";

  ARCHIVE_ITEMS.forEach((item, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "archive-item";

    const number = String(item.title || "").replace(/^POLOŽKA\s*/i, "");
    const kind = typeLabel(item.type);
    const date = formatDate(item.date);

    btn.innerHTML = `
      <span class="a-num">${number}</span>
      <span class="a-sep">—</span>
      <span class="a-type">${kind}</span>
      <span class="a-sep">—</span>
      <span class="a-date">${date}</span>
    `;

    // také onclick => žádné duplicity
    btn.onclick = () => setActiveIndex(idx);

    archiveListEl.appendChild(btn);
  });
}

function renderActiveStyles() {
  if (!archiveListEl) return;
  const items = archiveListEl.querySelectorAll(".archive-item");
  items.forEach((el, idx) => el.classList.toggle("active", idx === activeIndex));
}

function renderDetail(item) {
  if (!item) return;

  // bez nadpisu i bez popisu (dle vašich předchozích požadavků)
  if (detailTitle) detailTitle.textContent = "";
  if (detailMeta) detailMeta.textContent = `${typeLabel(item.type)} • ${formatDate(item.date)}`;

  if (detailMedia) {
  detailMedia.innerHTML = "";

  // Archivní soubory vždy řeš přes absolutní URL z GitHub Pages
  const resolveLocal = (src) => new URL(src, document.baseURI).toString();

  if (item.type === "image" && item.mediaSrc) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = resolveLocal(item.mediaSrc);
    detailMedia.appendChild(img);

  } else if (item.type === "video" && item.mediaSrc) {
    const vid = document.createElement("video");
    vid.controls = true;
    vid.playsInline = true;
    vid.preload = "metadata";
    vid.src = resolveLocal(item.mediaSrc);
    detailMedia.appendChild(vid);
  }
}


  if (detailText) detailText.textContent = "";
  if (detailAudio) detailAudio.innerHTML = "";
}

function setActiveIndex(idx) {
  if (idx < 0 || idx >= ARCHIVE_ITEMS.length) return;
  activeIndex = idx;
  renderActiveStyles();
  renderDetail(ARCHIVE_ITEMS[activeIndex]);
}

async function loadArchiveManifest() {
  if (!archiveListEl) return;

  // robustní URL pro GitHub Pages v podadresáři
  const manifestUrl = new URL("assets/archive-manifest.json", document.baseURI).toString();

  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`Manifest HTTP ${res.status} (${res.statusText})`);
    }

    let text = await res.text();

    // Odstranění BOM (častý tichý zabiják JSON.parse)
    text = text.replace(/^\uFEFF/, "").trim();

    if (!text.startsWith("[")) {
      throw new Error("Manifest nevypadá jako JSON pole (server mohl vrátit HTML).");
    }

    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("Manifest není pole.");
    }

    ARCHIVE_ITEMS = data.map((x, i) => ({
      title: String(x.title ?? String(i + 1).padStart(2, "0")),
      date: String(x.date ?? "1970-01-01"),
      type: String(x.type ?? "text").toLowerCase(),
      mediaSrc: String(x.mediaSrc ?? ""),
      audioSrc: String(x.audioSrc ?? "")
    }));

    renderArchiveList();
    bindArchiveNav();
    if (ARCHIVE_ITEMS.length > 0) setActiveIndex(0);

  } catch (e) {
    console.error("Nepodařilo se načíst archive-manifest.json:", e);

    // Zobrazit konkrétní chybu a URL, ať to jde ihned opravit
    archiveListEl.innerHTML = `
      <div class="muted" style="line-height:1.4">
        Archivní manifest se nepodařilo načíst.<br>
        <strong>Důvod:</strong> ${String(e.message || e)}<br>
        <strong>URL:</strong> <code>${manifestUrl}</code>
      </div>
    `;
  }
}

// init
bindArchiveNav();
loadArchiveManifest();

/* Lagan promo timeline.
 * Builds every motion as a PAUSED Web Animations API animation with an absolute
 * start offset, then exposes window.__seek(ms) to set a deterministic frame.
 * This makes rendering independent of machine speed / real time. */

const anims = []; // { anim, start }
const dynamics = []; // (t) => void  — for text counters that WAAPI can't drive
let SCENES = [];
let DURATION = 30000;

/** create a paused animation that begins at absolute time `start` */
function A(el, keyframes, start, dur, easing = "cubic-bezier(.22,.61,.36,1)") {
  if (!el) return null;
  const anim = el.animate(keyframes, { duration: dur, fill: "both", easing });
  anim.pause();
  anims.push({ anim, start });
  return anim;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function lerpAt(t, t0, t1, v0, v1) {
  if (t <= t0) return v0;
  if (t >= t1) return v1;
  return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
}

// fade/slide in-and-out keyframes for a scene-length element
function inOut(slideY = 18) {
  return [
    { opacity: 0, transform: `translateY(${slideY}px)`, offset: 0 },
    { opacity: 1, transform: "translateY(0)", offset: 0.08 },
    { opacity: 1, transform: "translateY(0)", offset: 0.9 },
    { opacity: 0, transform: `translateY(${-slideY * 0.4}px)`, offset: 1 },
  ];
}

async function init() {
  const res = await fetch("../scenes.json");
  const data = await res.json();
  SCENES = data.scenes;
  DURATION = data.durationMs;
  window.__durationMs = DURATION;
  window.__fps = data.fps;

  buildCaptions();
  buildDots();
  buildHeatmap();
  buildWheel();
  buildConfetti();
  setupScreens();
  setupSceneAnimations();

  await document.fonts.ready;
  seek(0);
  window.__seek = seek;
  window.__ready = true;

  if (!location.search.includes("capture")) playLoop();
}

const S = {}; // scene id -> {start,end}
function setupScreens() {
  for (const sc of SCENES) S[sc.id] = sc;
  document.querySelectorAll(".screen").forEach((el) => {
    const id = el.dataset.scene;
    const sc = S[id];
    if (!sc) return;
    A(el, inOut(16), sc.start, sc.end - sc.start);
  });
}

function buildCaptions() {
  const wrap = document.getElementById("captions");
  for (const sc of SCENES) {
    const cap = document.createElement("div");
    cap.className = "caption";
    cap.innerHTML = `<div class="ctop">${sc.captionTop}</div><div class="cbot">${sc.captionBottom}</div>`;
    wrap.appendChild(cap);
    A(cap, inOut(26), sc.start, sc.end - sc.start);
  }
}

function buildDots() {
  const wrap = document.getElementById("dots");
  for (let i = 0; i < SCENES.length; i++) {
    const d = document.createElement("i");
    wrap.appendChild(d);
  }
}

function buildHeatmap() {
  const hm = document.getElementById("heatmap");
  // 4 weeks x 7 days, deterministic "intensity" pattern
  const levels = [
    0, 2, 3, 1, 3, 2, 0, 1, 3, 2, 3, 1, 3, 2, 2, 3, 1, 3, 3, 2, 3, 3, 2, 3, 1, 3, 3, 3,
  ];
  const colors = ["#1f1f27", "rgba(242,107,31,0.35)", "rgba(242,107,31,0.65)", "#f26b1f"];
  levels.forEach((lv) => {
    const i = document.createElement("i");
    i.style.background = colors[lv];
    hm.appendChild(i);
  });
}

function buildWheel() {
  const cx = 50,
    cy = 50,
    r = 46;
  const segs = [
    { v: 30, c: "#f26b1f" },
    { v: 22, c: "#ffc56b" },
    { v: 18, c: "#3ebb7f" },
    { v: 16, c: "#6aa3ff" },
    { v: 14, c: "#b07cff" },
  ];
  const total = segs.reduce((s, x) => s + x.v, 0);
  let a = 0;
  const polar = (ang) => {
    const rad = ((ang - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  let svg = "";
  for (const s of segs) {
    const a1 = a + (s.v / total) * 360;
    const [x0, y0] = polar(a);
    const [x1, y1] = polar(a1);
    const large = a1 - a > 180 ? 1 : 0;
    svg += `<path d="M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${s.c}"/>`;
    a = a1;
  }
  svg += `<circle cx="${cx}" cy="${cy}" r="20" fill="#0b0b0e"/>`;
  document.getElementById("wheel").innerHTML = svg;
}

function buildConfetti() {
  const wrap = document.getElementById("confettiWrap");
  const colors = ["#f26b1f", "#ffc56b", "#3ebb7f", "#ffffff"];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    p.style.background = colors[i % colors.length];
    wrap.appendChild(p);
  }
}

function setupSceneAnimations() {
  // ── WIZARD: thinking spinner, then generated habits slide in ──────────────
  const thinking = document.querySelector('[data-gen="thinking"]');
  const results = document.querySelector('[data-gen="results"]');
  A(thinking, [{ opacity: 0 }, { opacity: 1 }], 3000, 400);
  A(thinking, [{ opacity: 1 }, { opacity: 0 }], 5200, 300);
  A(
    document.getElementById("wizSpinner"),
    [{ transform: "rotate(0deg)" }, { transform: "rotate(1080deg)" }],
    3300,
    2000,
    "linear",
  );
  results.querySelectorAll(".gen-habit").forEach((g, i) => {
    A(
      g,
      [
        { opacity: 0, transform: "translateX(24px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      5300 + i * 350,
      500,
    );
  });

  // ── TODAY: tap completes the walk → check toggles, confetti, ring + count ─
  const tapAt = 10300;
  A(
    document.getElementById("tapCheckTodo"),
    [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(0.4)" },
    ],
    tapAt,
    260,
  );
  A(
    document.getElementById("tapCheckDone"),
    [
      { opacity: 0, transform: "scale(0.4)" },
      { opacity: 1, transform: "scale(1.25)", offset: 0.6 },
      { opacity: 1, transform: "scale(1)" },
    ],
    tapAt,
    420,
  );
  A(
    document.getElementById("tapHabit"),
    [
      { transform: "scale(1)" },
      { transform: "scale(0.97)", offset: 0.4 },
      { transform: "scale(1)" },
    ],
    tapAt - 120,
    360,
  );
  // ring fill: enter to 60%, then bump to 80% on tap
  A(
    document.getElementById("ringFill"),
    [{ strokeDashoffset: 106.8 }, { strokeDashoffset: 42.7 }],
    8400,
    700,
  );
  A(
    document.getElementById("ringFill"),
    [{ strokeDashoffset: 42.7 }, { strokeDashoffset: 21.36 }],
    tapAt,
    500,
  );
  // confetti burst
  document.querySelectorAll(".confetti").forEach((p, i) => {
    const ang = (i / 26) * Math.PI * 2;
    const dist = 26 + (i % 5) * 6;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 6;
    const rot = (i % 2 ? 1 : -1) * (180 + i * 12);
    A(
      p,
      [
        { opacity: 0, transform: "translate(0,0) scale(0) rotate(0deg)", offset: 0 },
        {
          opacity: 1,
          transform: `translate(${dx * 0.5}cqw, ${dy * 0.5}cqw) scale(1) rotate(${rot * 0.5}deg)`,
          offset: 0.25,
        },
        {
          opacity: 1,
          transform: `translate(${dx}cqw, ${dy + 70}cqw) scale(0.9) rotate(${rot}deg)`,
          offset: 1,
        },
      ],
      tapAt - 40,
      1300,
      "cubic-bezier(.2,.7,.3,1)",
    );
  });
  dynamics.push((t) => {
    document.getElementById("doneCount").textContent = t >= tapAt + 200 ? "4" : "3";
  });

  // ── COACH: chat bubbles stagger in ───────────────────────────────────────
  const bubbleTimes = [13800, 14900, 15900];
  document.querySelectorAll('[data-scene="coach"] .bubble').forEach((b, i) => {
    A(
      b,
      [
        { opacity: 0, transform: "translateY(14px) scale(0.96)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      bubbleTimes[i],
      450,
    );
  });

  // ── DETAIL: bars grow + steps count up ───────────────────────────────────
  document.querySelectorAll('[data-scene="detail"] .bar').forEach((bar, i) => {
    const h = bar.dataset.h + "%";
    A(bar, [{ height: "0%" }, { height: h }], 17300 + i * 70, 600);
  });
  dynamics.push((t) => {
    const v = lerpAt(t, 17800, 19400, 0, 4820);
    document.getElementById("stepsNum").textContent = Math.round(v).toLocaleString();
  });

  // ── PROGRESS: heatmap pop, wheel scale-in, xp bar fill + level up ─────────
  document.querySelectorAll("#heatmap i").forEach((cell, i) => {
    A(
      cell,
      [
        { opacity: 0, transform: "scale(0.3)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      20800 + i * 22,
      380,
    );
  });
  A(
    document.getElementById("wheel"),
    [
      { opacity: 0, transform: "scale(0.4) rotate(-40deg)" },
      { opacity: 1, transform: "scale(1) rotate(0deg)" },
    ],
    21600,
    700,
  );
  A(document.getElementById("xpFill"), [{ width: "18%" }, { width: "78%" }], 21900, 1400);
  A(
    document.getElementById("lvlNum"),
    [
      { transform: "scale(1)" },
      { transform: "scale(1.5)", color: "#ffc56b", offset: 0.5 },
      { transform: "scale(1)" },
    ],
    23000,
    600,
  );
  dynamics.push((t) => {
    document.getElementById("lvlNum").textContent = t >= 23300 ? "5" : "4";
  });

  // ── LEADERBOARD: rows stagger + badge pop ────────────────────────────────
  document.querySelectorAll('[data-scene="leaderboard"] .rowitem').forEach((r, i) => {
    A(
      r,
      [
        { opacity: 0, transform: "translateX(20px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      24700 + i * 120,
      420,
    );
  });
  A(
    document.getElementById("badgePop"),
    [
      { opacity: 0, transform: "translateX(-50%) scale(0) rotate(-30deg)", offset: 0 },
      { opacity: 1, transform: "translateX(-50%) scale(1.2) rotate(8deg)", offset: 0.45 },
      { opacity: 1, transform: "translateX(-50%) scale(1) rotate(0deg)", offset: 0.62 },
      { opacity: 1, transform: "translateX(-50%) scale(1) rotate(0deg)", offset: 0.85 },
      { opacity: 0, transform: "translateX(-50%) scale(0.7) rotate(0deg)", offset: 1 },
    ],
    25400,
    1900,
  );

  // ── CTA: logo + text rise, store badges pop ──────────────────────────────
  A(
    document.querySelector('[data-scene="cta"] .logobox'),
    [
      { opacity: 0, transform: "scale(0.5)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    27600,
    600,
    "cubic-bezier(.2,.9,.3,1.2)",
  );
  document.querySelectorAll('[data-scene="cta"] .store-badge').forEach((b, i) => {
    A(
      b,
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      28200 + i * 160,
      450,
    );
  });

  // ── Ambient glow breathing across whole video ────────────────────────────
  A(
    document.getElementById("glow"),
    [
      { opacity: 0.7, transform: "translate(-50%,-50%) scale(1)" },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1.08)" },
      { opacity: 0.7, transform: "translate(-50%,-50%) scale(1)" },
    ],
    0,
    DURATION,
    "ease-in-out",
  );
}

function activeIndex(t) {
  for (let i = SCENES.length - 1; i >= 0; i--) {
    if (t >= SCENES[i].start) return i;
  }
  return 0;
}

function seek(t) {
  t = clamp(t, 0, DURATION);
  for (const { anim, start } of anims) {
    const dur = anim.effect.getComputedTiming().duration;
    anim.currentTime = clamp(t - start, 0, dur);
  }
  for (const fn of dynamics) fn(t);
  const idx = activeIndex(t);
  const dots = document.querySelectorAll("#dots i");
  dots.forEach((d, i) => d.classList.toggle("on", i === idx));
}

function playLoop() {
  const t0 = performance.now();
  function frame(now) {
    const t = (now - t0) % (DURATION + 600);
    seek(Math.min(t, DURATION));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

init();

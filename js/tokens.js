// さくせん盤：盤のこま：描く・印の札・ドラッグ・長押し・範囲選択
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → tokens → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// 範囲で選んだもの（"p3"＝自チームの4人目、"o0"＝相手のGK、"ball"）。選んだものはまとめて動く
const selected = new Set();
// こまの見分け（"ball"・"p3"・"o2"）を返す
const keyOf = (target) => (target.kind === "ball" ? "ball" : `${target.kind === "player" ? "p" : "o"}${target.index}`);

// 並べ直したとき（相手の出し入れ・フォーメーション・戻すなど）は、前の位置からなめらかに動かす
let animateTokens = false;

// 盤のこま（自チーム・相手・ボール）を描きなおす。並べなおしたときは、前の位置からなめらかに動かす
function renderTokens() {
  const before = animateTokens ? new Map([...tokens.children].map((n) => [n.dataset.key, { left: n.style.left, top: n.style.top }])) : null;
  animateTokens = false;
  // 重なり：相手 → 自チーム → ボールの順に置く（自チームが相手より上、ボールが一番上）
  const list = [];
  if (state.showOpp) {
    if (!Array.isArray(state.opp) || (state.oppFormation && state.opp.length !== fieldCount(state.oppFormation) + 1)) state.opp = opponents();
    state.opp.forEach((p, i) => list.push(tokenEl(p, "is-opp", { kind: "opp", index: i })));
  }
  state.players.forEach((p, i) => list.push(tokenEl(p, "", { kind: "player", index: i })));
  if (state.showBall) {
    const ball = document.createElement("span");
    ball.className = "token is-ball";
    ball.dataset.key = "ball";
    ball.textContent = "⚽";
    place(ball, state.ball);
    ball.classList.toggle("is-selected", selected.has("ball"));
    bindDrag(ball, { kind: "ball" });
    list.push(ball);
  }
  tokens.replaceChildren(...list);
  fitMarks();
  if (!before || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const moving = [];
  for (const el of list) {
    const from = before.get(el.dataset.key);
    if (!from) {
      el.classList.add("is-appearing"); // 新しく出たもの（相手など）はふわっと出す
      continue;
    }
    if (from.left === el.style.left && from.top === el.style.top) continue;
    moving.push([el, el.style.left, el.style.top]);
    el.style.left = from.left;
    el.style.top = from.top;
  }
  if (!moving.length) return;
  tokens.getBoundingClientRect(); // 前の位置を確定させてから動かす
  for (const [el, left, top] of moving) {
    el.classList.add("is-moving");
    el.style.left = left;
    el.style.top = top;
    el.addEventListener("transitionend", () => el.classList.remove("is-moving"), { once: true });
  }
}

// 印の札（⚽・カードなどの絵文字。オウンゴールは赤いボールの絵）。丸の右下の印にも、交代前の得点にも使う
function marksBadge(marks, className, label) {
  const badge = Object.assign(document.createElement("em"), { className });
  badge.setAttribute("aria-label", label);
  markParts(marks).forEach((part) => {
    for (let k = 0; k < part.count; k += 1) {
      // オウンゴール：⚽ に赤を重ねた絵（作戦盤の画像と同じ。share.js の redBallDataUrl）
      if (part.red) badge.append(Object.assign(document.createElement("img"), { className: "mark-icon is-own-goal", src: redBallDataUrl(), alt: "" }));
      else badge.append(Object.assign(document.createElement("span"), { className: "mark-icon", textContent: part.icon }));
    }
    // 数（「⚽2」の 2）は要素にしておく。文字のままだと、次の絵文字が「絵文字が続く」とみなされて数に重なるため
    if (part.label) badge.append(Object.assign(document.createElement("span"), { className: "mark-num", textContent: part.label }));
  });
  return badge;
}

// こま1つ（丸・背番号・名前・印）の部品を作る
function tokenEl(p, extra, target) {
  const el = document.createElement("span");
  el.className = `token ${extra}`;
  el.dataset.key = keyOf(target);
  // GK（先頭）はチームと同じ色で、🧤 を付けて見分ける
  el.innerHTML = target.index === 0 ? '<b></b><i class="gk" aria-label="GK">🧤</i><small></small>' : "<b></b><small></small>";
  const number = el.querySelector("b");
  number.textContent = p.number || "";
  // 色：自チーム・相手（GK も同じ色）
  const fill = target.kind === "opp" ? state.oppColor : state.ourColor;
  number.style.background = fill;
  number.style.color = inkOn(fill);
  number.style.borderColor = isLight(fill) ? "#23302a" : "#ffffff";
  el.querySelector("small").textContent = p.name || "";
  // 交代して入った選手：丸の右上に小さく 🔄
  if (p.subs?.length) el.append(Object.assign(document.createElement("i"), { className: "sub-mark", textContent: "🔄", ariaLabel: "交代" }));
  // 交代前の選手の得点・OG：🔄 の右下に小さく（印と同じ ⚽・赤いボール。2つ以上は「⚽2」）
  const subGoals = p.subs?.length ? subGoalsOf(p, target.kind === "opp" ? "t" : "u") : undefined;
  if (subGoals) el.append(marksBadge(subGoals, "sub-goals", `交代前の得点 ${markText(subGoals)}`));
  // 印（イエロー・レッド・ゴール・アシスト）：いつも丸の右下（盤からはみ出すときは fitMarks で選手をずらす）。
  // 相手は、試合結果の得点者から数えた ⚽・OG
  const marks = target.kind === "opp" ? oppMarksOf(p) : playerMarksOf(p);
  if (markParts(marks).length) el.append(marksBadge(marks, "marks", markText(marks)));
  place(el, p);
  el.classList.toggle("is-selected", selected.has(keyOf(target)));
  bindDrag(el, target);
  return el;
}

// 右下の印の札が盤の右からはみ出す選手は、はみ出さないところまで左へずらす（位置も残す）。
// 札は丸の中心から 7px 右が左端（style.css の .token .marks）
function fitMarks() {
  const width = board.clientWidth;
  if (!width) return;
  [...tokens.children].forEach((el) => {
    const badge = el.querySelector(".marks");
    const match = /^([po])(\d+)$/.exec(el.dataset.key || "");
    if (!badge || !match) return;
    const p = (match[1] === "p" ? state.players : state.opp || [])[Number(match[2])];
    // 盤の上の見た目の横（横のコートでは回したあとの横）で比べ、はみ出す分だけ見た目の左へずらす
    const max = Math.floor((1 - (7 + badge.offsetWidth + 2) / width) * 1000) / 10;
    if (!p) return;
    const [vx, vy] = toView(p.x, p.y);
    if (vx > max) {
      [p.x, p.y] = fromView(max, vy);
      place(el, p);
      save(STORE_KEY, state);
    }
  });
}

// 盤に置く（横のコートでは回した位置に）
const place = (el, p) => {
  const [vx, vy] = toView(p.x, p.y);
  el.style.left = `${vx}%`;
  el.style.top = `${vy}%`;
};

// こまの見分け（"p3" など）から、どのこまか（{ kind, index }）を返す
function targetOf(key) {
  if (key === "ball") return { kind: "ball" };
  return { kind: key[0] === "p" ? "player" : "opp", index: Number(key.slice(1)) };
}

// どのこまか（{ kind, index }）から、その選手・相手・ボールの中身を返す
function itemOf(target) {
  if (target.kind === "player") return state.players[target.index];
  if (target.kind === "opp") return state.opp[target.index];
  return state.ball;
}

// ドラッグや線を描いたあと、指を離したときにブラウザが出す「クリック」が、別の場所（人数・フォーメーションの
// ボタンなど）に届いて押されてしまうことがあるので、ドラッグの直後のクリックは捨てる
let swallowClickUntil = 0;
document.addEventListener(
  "click",
  (event) => {
    if (Date.now() < swallowClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true
);

// ドラッグで移動、動かさずに離したらタップ（自分の選手なら入力シート）
const LONG_PRESS_MS = 450; // 長押しとみなす長さ（ミリ秒）
// こまをドラッグで動かせるようにする（長押しで印のメニュー、選んだこまはまとめて動かす）
function bindDrag(el, target) {
  // 長押しで出る OS のメニュー（画像の保存など）は出さない
  el.addEventListener("contextmenu", (event) => event.preventDefault());
  el.addEventListener("pointerdown", (event) => {
    if (drawing) return;
    event.preventDefault();
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      // つかめない端末でも、要素の上で動かせば移動できる
    }
    const rect = board.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const adding = event.ctrlKey || event.metaKey || event.shiftKey;
    let moved = false;
    // まとめて動かすもの（選ばれたものをつかんだとき）と、それぞれの最初の位置
    const group = selected.has(keyOf(target)) && selected.size > 1 ? [...selected] : [keyOf(target)];
    const origin = group.map((key) => ({ key, item: itemOf(targetOf(key)), x: itemOf(targetOf(key))?.x, y: itemOf(targetOf(key))?.y }));
    // 位置を盤の中（2〜98）の整数におさめる
    const clamp = (v) => Math.round(Math.min(98, Math.max(2, v)));
    // 自チームの選手を動かさずに長押しすると、印（ゴール・カードなど）をすぐ付けるメニュー（sheets.js の openQuickMarks）
    let longPressed = false;
    // 相手を長押しすると、相手の得点（OG も）を記録するポップアップ
    const timer = (target.kind === "player" || target.kind === "opp") && !adding
      ? setTimeout(() => {
          longPressed = true;
          if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(15); // 触れた合図（震えない端末は何もしない）
          if (target.kind === "opp") openOppQuick(target.index, el);
          else openQuickMarks(target.index, el);
        }, LONG_PRESS_MS)
      : 0;
    // 指・マウスが動いたら、こまを動かす（少し動いたら長押しのメニューはやめる）
    const onMove = (e) => {
      const far = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      // 長押しでメニューが出たあとでも、押したまま動かしはじめたらメニューを閉じて移動にする
      // （少し止まってから動かす人もいるので、長押しが移動のじゃまをしないように。ずれは大きめに 12px で判断）
      if (longPressed) {
        if (far < 12) return;
        longPressed = false;
        closeQuickMarks();
      }
      if (!moved && far < 6) return;
      clearTimeout(timer);
      if (!moved) remember();
      moved = true;
      el.classList.add("is-dragging");
      // 動かした量は見た目（画面）の向きで測り、縦のコートの位置に直す
      const dx = ((e.clientX - start.x) / rect.width) * 100;
      const dy = ((e.clientY - start.y) / rect.height) * 100;
      for (const o of origin) {
        if (!o.item) continue;
        const [vx, vy] = toView(o.x, o.y);
        const [nx, ny] = fromView(vx + dx, vy + dy);
        o.item.x = clamp(nx);
        o.item.y = clamp(ny);
      }
      renderTokensKeepDrag(el, target);
    };
    // はなしたら、動かしたあとの位置で描きなおす
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.classList.remove("is-dragging");
      clearTimeout(timer);
      if (longPressed) return; // メニューのボタンはすぐ押せるように、あとのクリックは止めない
      if (moved) swallowClickUntil = Date.now() + 400;
      if (moved) render();
      else {
        // タップは選ぶ・外す（選んだものはまとめて動く）
        const key = keyOf(target);
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
        render();
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}

// ドラッグ中は、つかんでいる要素はそのまま動かし、ほかの選ばれたものの位置だけ直す（要素を作り直すとつかみが外れる）
function renderTokensKeepDrag(el, target) {
  place(el, itemOf(target));
  for (const node of tokens.children) {
    if (node === el || !node.dataset.key) continue;
    const item = itemOf(targetOf(node.dataset.key));
    if (item && selected.has(node.dataset.key)) place(node, item);
  }
}

// 範囲選択：ピッチの何もない所をなぞる。動かさずに離したら選択を外す
const marquee = $("marquee");
tokens.addEventListener("pointerdown", (event) => {
  if (drawing || event.target !== tokens) return;
  event.preventDefault();
  const rect = board.getBoundingClientRect();
  const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const adding = event.ctrlKey || event.metaKey || event.shiftKey;
  let box = null;
  // 範囲選択の四角を、指・マウスの位置まで広げる
  const onMove = (e) => {
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    box = { left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
    if (box.width < 6 && box.height < 6) return;
    Object.assign(marquee.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    marquee.hidden = false;
  };
  // はなしたら、四角の中のこまを選ぶ
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    marquee.hidden = true;
    if (!adding) selected.clear();
    if (box && (box.width >= 6 || box.height >= 6)) {
      // そのこまが、範囲選択の四角の中にあるかを返す
      const inBox = (item) => {
        const [vx, vy] = toView(item.x, item.y);
        const x = (vx / 100) * rect.width;
        const y = (vy / 100) * rect.height;
        return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
      };
      state.players.forEach((p, i) => inBox(p) && selected.add(`p${i}`));
      if (state.showOpp) (state.opp || []).forEach((p, i) => inBox(p) && selected.add(`o${i}`));
      if (state.showBall && inBox(state.ball)) selected.add("ball");
      swallowClickUntil = Date.now() + 400;
    }
    render();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
});

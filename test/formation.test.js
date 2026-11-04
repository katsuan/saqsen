// フォーメーションの位置・印のリンクの形・作戦盤のリンクの長さのテスト。node --test test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = ["page", "formation", "marks", "store", "link"].map((f) => fs.readFileSync(path.join(__dirname, `../js/${f}.js`), "utf8")).join("\n");

// state とフォーメーション・印のところ（js/page.js〜link.js）を読む
function boot() {
  const ctx = vm.createContext({
    localStorage: { getItem: () => null, setItem() {} },
    location: { search: "", pathname: "/soccer/" },
    history: { replaceState() {} },
    window: { matchMedia: () => ({ matches: false }) },
    document: {},
    URLSearchParams, TextEncoder, TextDecoder, atob, btoa
  });
  vm.runInContext(code, ctx);
  return (name) => vm.runInContext(name, ctx);
}

test("どのフォーメーションも、GK を先頭に人数ぶんの位置を 0〜100 の中に作る（相手あり・なし）", () => {
  const get = boot();
  for (const group of get("FORMATION_GROUPS")) {
    for (const f of group.list) {
      for (const versus of [true, false]) {
        const spots = get("formationPositions")(group.mode, f, versus);
        assert.equal(spots.length, get("fieldCount")(f) + 1, `${group.id} ${f}`);
        assert.ok(spots[0].y >= Math.max(...spots.slice(1).map((s) => s.y)), `${f}：GK がいちばん後ろ`);
        for (const s of spots) assert.ok(s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100, `${f} ${JSON.stringify(s)}`);
      }
    }
  }
});

test("決まった形のない人数でも、その人数の並びを作る", () => {
  const get = boot();
  for (let n = 1; n <= 15; n += 1) assert.equal(get("fieldCount")(get("autoFormation")(n)), n, `${n}人`);
});

test("フォーメーションの文字の形がちがえば、並びは空（いつもの並びで置く）", () => {
  const get = boot();
  assert.deepEqual([...get("parseFormation")("4-4-2")], [4, 4, 2]);
  for (const bad of ["", "4--2", "abc", "4-4-2-1-1-1", "<b>"]) assert.equal(get("parseFormation")(bad).length, 0, bad);
  assert.equal(get("formationPositions")("soccer", "abc", false).length, 11);
});

test("印のリンクの形（y1g2）は、読み戻すと同じ。上限を超える数は上限に", () => {
  const get = boot();
  const marks = { y: 1, g: 2, a: 3 };
  const text = get("encodeMarks")(marks);
  assert.equal(text, "y1g2a3");
  assert.deepEqual({ ...get("decodeMarks")(text) }, marks);
  assert.deepEqual({ ...get("decodeMarks")("y9r5") }, { y: 2, r: 1 });
  assert.equal(get("decodeMarks")(""), undefined);
  assert.equal(get("decodeMarks")("<x>"), undefined);
});

test("盤の印は、2つ以上なら数で（⚽2）。オウンゴールは赤いボール", () => {
  const get = boot();
  assert.equal(get("markText")({ g: 1 }), "⚽");
  assert.equal(get("markText")({ g: 2, y: 1 }), "🟨⚽2");
  assert.equal(get("markParts")({ o: 1 })[0].red, true);
  assert.equal(get("markText")(null), "");
});

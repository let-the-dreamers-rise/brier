/**
 * The form's stylesheet and browser script, kept apart from form.mjs so the
 * generator stays readable as generator logic. Both are inert strings here;
 * nothing in this file runs in Node.
 *
 * The script deliberately uses no template literals: it is embedded inside a
 * generated document, and a stray interpolation in a build step is the kind
 * of bug that ships a broken form to the one outside labeller you got.
 */

export const STYLE = `
:root { color-scheme: light dark;
  --bg:#fbfaf7; --fg:#1a1917; --mut:#6d6a62; --line:#e2ded4; --card:#fff; --acc:#2f5d50; }
@media (prefers-color-scheme: dark) { :root {
  --bg:#141414; --fg:#e8e6e1; --mut:#9a968c; --line:#2e2c28; --card:#1c1c1b; --acc:#7fbfa8; } }
* { box-sizing:border-box; }
body { margin:0; padding:0 1.25rem 5rem; background:var(--bg); color:var(--fg);
  font:15px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif; }
header,main,footer { max-width:44rem; margin:0 auto; }
header { padding:2.5rem 0 1.5rem; border-bottom:1px solid var(--line); }
h1 { font-size:1.35rem; margin:0 0 .5rem; letter-spacing:-.01em; }
.lede { font-size:1.05rem; margin:0 0 .75rem; }
.meta,.seed { color:var(--mut); font-size:.85rem; }
.how { margin:1rem 0; } .how summary { cursor:pointer; color:var(--acc); }
.how div { padding:.5rem 0 0; color:var(--mut); font-size:.9rem; }
.how li { margin:.3rem 0; }
.who { display:block; margin-top:1rem; font-size:.85rem; color:var(--mut); }
.who input { display:block; margin-top:.3rem; width:100%; max-width:20rem; padding:.5rem;
  border:1px solid var(--line); border-radius:6px; background:var(--card); color:var(--fg); }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px;
  padding:1.1rem 1.2rem; margin:1.1rem 0; }
.card.done { border-color:var(--acc); }
.n { color:var(--mut); font-size:.75rem; letter-spacing:.06em; text-transform:uppercase; }
.q { font-size:1.05rem; font-weight:600; margin:.35rem 0 .8rem; }
.opts { display:flex; flex-direction:column; gap:.4rem; }
.opts label { display:flex; gap:.55rem; align-items:flex-start; cursor:pointer;
  padding:.4rem .5rem; border-radius:6px; }
.note { width:100%; margin-top:.7rem; padding:.5rem; border:1px solid var(--line);
  border-radius:6px; background:transparent; color:var(--fg); font:inherit; font-size:.9rem; }
.res { margin-top:.8rem; font-size:.85rem; }
.res summary { cursor:pointer; color:var(--acc); }
.res pre { white-space:pre-wrap; color:var(--mut); font:inherit; font-size:.85rem;
  max-height:16rem; overflow:auto; margin:.5rem 0 0; }
.facts { color:var(--mut); font-size:.78rem; margin-top:.6rem; }
footer { padding-top:1.5rem; border-top:1px solid var(--line); margin-top:2rem; }
.progress { color:var(--mut); font-size:.85rem; margin-bottom:.75rem; }
button,#dl { font:inherit; padding:.55rem 1rem; border-radius:7px; cursor:pointer;
  border:1px solid var(--acc); background:var(--acc); color:var(--bg);
  text-decoration:none; display:inline-block; }
#json { width:100%; margin:.5rem 0; padding:.6rem; border:1px solid var(--line);
  border-radius:7px; background:var(--card); color:var(--fg);
  font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:.75rem; }
.row { display:flex; gap:.5rem; }
`;

export const SCRIPT = `
var KEY = "brier-labels-" + SEED;
var state = {};
try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { state = {}; }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  paint();
}

function entry(id) {
  if (!state[id]) state[id] = { label: null, why: "", saw_description: false, t: null };
  return state[id];
}

function usd(n) {
  if (!n) return "no liquidity reported";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M liquidity";
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k liquidity";
  return "$" + Math.round(n) + " liquidity";
}

var OPTIONS = [
  ["SAME", "Same answer"],
  ["DIFFER", "Could differ"],
  ["CANT_TELL", "Cannot tell"]
];

var main = document.getElementById("items");
ITEMS.forEach(function (item, index) {
  var card = document.createElement("section");
  card.className = "card";
  card.id = "c-" + item.id;

  var n = document.createElement("div");
  n.className = "n";
  n.textContent = (index + 1) + " of " + ITEMS.length;
  card.appendChild(n);

  var q = document.createElement("div");
  q.className = "q";
  q.textContent = item.question;
  card.appendChild(q);

  var opts = document.createElement("div");
  opts.className = "opts";
  OPTIONS.forEach(function (opt) {
    var label = document.createElement("label");
    var radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "r-" + item.id;
    radio.value = opt[0];
    if (entry(item.id).label === opt[0]) radio.checked = true;
    radio.addEventListener("change", function () {
      var e = entry(item.id);
      e.label = opt[0];
      e.t = new Date().toISOString();
      save();
    });
    label.appendChild(radio);
    label.appendChild(document.createTextNode(opt[1]));
    opts.appendChild(label);
  });
  card.appendChild(opts);

  var note = document.createElement("input");
  note.className = "note";
  note.type = "text";
  note.placeholder = "What would they disagree about? (optional)";
  note.value = entry(item.id).why || "";
  note.addEventListener("input", function () { entry(item.id).why = note.value; save(); });
  card.appendChild(note);

  if (item.resolution_text) {
    var res = document.createElement("details");
    res.className = "res";
    var sum = document.createElement("summary");
    sum.textContent = "Show the market's resolution text";
    var pre = document.createElement("pre");
    pre.textContent = item.resolution_text;
    res.appendChild(sum);
    res.appendChild(pre);
    res.addEventListener("toggle", function () {
      if (res.open) { entry(item.id).saw_description = true; save(); }
    });
    card.appendChild(res);
  }

  var facts = document.createElement("div");
  facts.className = "facts";
  facts.textContent = usd(item.liquidity) +
    (item.end_date ? " - closes " + item.end_date.slice(0, 10) : "");
  card.appendChild(facts);

  main.appendChild(card);
});

function paint() {
  var done = 0;
  ITEMS.forEach(function (item) {
    var e = state[item.id];
    var card = document.getElementById("c-" + item.id);
    if (e && e.label) { done += 1; card.classList.add("done"); }
    else { card.classList.remove("done"); }
  });
  document.getElementById("progress").textContent =
    done + " of " + ITEMS.length + " answered";
}

document.getElementById("finish").addEventListener("click", function () {
  var name = document.getElementById("labeller").value.trim();
  if (!name) { document.getElementById("labeller").focus(); return; }
  var labels = ITEMS.filter(function (i) { return state[i.id] && state[i.id].label; })
    .map(function (i) {
      var e = state[i.id];
      return { id: i.id, label: e.label, why: e.why || "",
               saw_description: !!e.saw_description, answered_at: e.t };
    });
  var sheet = { labeller: name, protocol_version: PROTOCOL, seed: SEED,
                submitted_at: new Date().toISOString(), labels: labels };
  var text = JSON.stringify(sheet, null, 1);
  document.getElementById("json").value = text;
  document.getElementById("out").hidden = false;
  document.getElementById("dl").href =
    "data:application/json;charset=utf-8," + encodeURIComponent(text);
  document.getElementById("out").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("copy").addEventListener("click", function () {
  var ta = document.getElementById("json");
  ta.select();
  try { document.execCommand("copy"); } catch (e) { /* user copies manually */ }
  if (navigator.clipboard) { navigator.clipboard.writeText(ta.value).catch(function () {}); }
});

try {
  var saved = localStorage.getItem(KEY + "-who");
  if (saved) document.getElementById("labeller").value = saved;
} catch (e) { /* ignore */ }
document.getElementById("labeller").addEventListener("input", function (ev) {
  try { localStorage.setItem(KEY + "-who", ev.target.value); } catch (e) { /* ignore */ }
});

paint();
`;

/**
 * Generate the blind labelling form.
 *
 * BLIND MEANS BLIND. The generated page contains the question, the market's
 * own resolution text, its liquidity and close date -- and nothing else. No
 * grader verdict, no probe names, no counts, no framing about what this
 * project believes. `formItems` whitelists fields rather than deleting them,
 * so a field added to the corpus later cannot leak by default, and a test
 * asserts that no probe code appears in the rendered output.
 *
 * The resolution text sits behind a toggle. Labellers judge from the question
 * first, and whether they opened it is recorded per item, so the effect of
 * seeing the criteria is measured rather than assumed.
 */

import { PROMPT, PROTOCOL_VERSION, SAME, DIFFER, CANT_TELL } from "./protocol.mjs";
import { STYLE, SCRIPT } from "./form-assets.mjs";

/** The only fields that reach the page. */
export function formItems(markets) {
  return markets.map((m) => ({
    id: String(m.id),
    question: String(m.question ?? ""),
    resolution_text: String(m.description ?? ""),
    liquidity: Number(m.liquidity ?? 0),
    end_date: String(m.endDate ?? ""),
  }));
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * @param {object} input
 * @param {Array<object>} input.markets the drawn sample
 * @param {string} input.seed printed so the labeller can quote it back
 * @returns {string} a standalone HTML document
 */
export function renderForm({ markets, seed }) {
  const items = formItems(markets);
  const payload = JSON.stringify(items).replace(/</g, "\\u003c");

  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Question review</title>",
    "<style>" + STYLE + "</style></head><body>",
    "<header>",
    "<h1>Question review</h1>",
    '<p class="lede">' + escapeHtml(PROMPT.task) + "</p>",
    '<p class="meta">' + items.length + " questions, drawn from live prediction markets. " +
      "Roughly 20 minutes. Your answers save in this browser as you go.</p>",
    '<details class="how"><summary>How to answer</summary><div>',
    "<p>Judge from <strong>the question alone</strong> first. Open the resolution text " +
      "only if you want to; whether you opened it is recorded, and that is useful either way.</p>",
    "<ul>",
    "<li><strong>Same answer</strong> &mdash; " + escapeHtml(PROMPT.options[SAME]) + "</li>",
    "<li><strong>Could differ</strong> &mdash; " + escapeHtml(PROMPT.options[DIFFER]) + "</li>",
    "<li><strong>Cannot tell</strong> &mdash; " + escapeHtml(PROMPT.options[CANT_TELL]) + "</li>",
    "</ul>",
    "<p>There is no answer key and nothing here is scored against you. " +
      "Disagreeing with the person who sent you this is the most useful outcome.</p>",
    "</div></details>",
    '<label class="who">Your name or handle ' +
      '<input id="labeller" type="text" placeholder="required" autocomplete="off"></label>',
    "</header>",
    '<main id="items"></main>',
    "<footer>",
    '<div id="progress" class="progress"></div>',
    '<button id="finish" type="button">Finish and show my answers</button>',
    '<div id="out" hidden>',
    "<p>Copy this and send it back.</p>",
    '<textarea id="json" readonly rows="10"></textarea>',
    '<div class="row"><button id="copy" type="button">Copy</button>',
    '<a id="dl" download="labels.json">Download</a></div>',
    "</div>",
    '<p class="seed">draw seed <code>' + escapeHtml(seed) + "</code> &middot; protocol " +
      escapeHtml(PROTOCOL_VERSION) + "</p>",
    "</footer>",
    "<script>var ITEMS = " + payload + ";",
    "var SEED = " + JSON.stringify(String(seed)) + ";",
    "var PROTOCOL = " + JSON.stringify(PROTOCOL_VERSION) + ";",
    SCRIPT,
    "</script></body></html>",
  ].join("\n");
}

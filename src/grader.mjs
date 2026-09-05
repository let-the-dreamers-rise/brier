/**
 * Admission grading: decide whether a question can be settled at all.
 *
 * The mechanism is elimination, not judgement. Each probe below detects a
 * construct in the question text that admits more than one reading, and names
 * the spec field that would collapse it to one. A construct that fires and is
 * not answered by the spec is a defect, and any defect refuses the market.
 *
 * Two probes are unresolvable by construction: a vague predicate and an
 * unbound entity cannot be pinned by any field, because the ambiguity is in
 * what is being asked rather than in how it is measured. Those questions have
 * to be rewritten, not annotated.
 *
 * HONEST LIMITATION: these probes are lexical, not semantic. They catch the
 * constructs that have empirically produced disputes on Polymarket and Augur.
 * They do not catch a question that is ambiguous for a reason no probe knows
 * about. This is a lint, and it is a floor on question quality, not a ceiling.
 */

import { validateSpec } from "./spec.mjs";

export const ADMIT = "ADMIT";
export const REFUSE = "REFUSE";

/** A probe fires on the question; `resolvedBy` names the field that answers it. */
const PROBES = Object.freeze([
  {
    code: "TEMPORAL_VAGUE",
    // "by end of year", "in 2026", "before April", "soon", "this week"
    pattern:
      /\b(soon|eventually|shortly|by (the )?end of|end of (the )?(year|month|week)|this (year|month|week)|next (year|month|week)|before \w+|by \w+ \d{4}|in \d{4})\b/i,
    resolvedBy: "observed_at",
    why: "names a period, not an instant -- two readers in two timezones settle differently",
  },
  {
    code: "SUPERLATIVE_UNTIED",
    pattern: /\b(best|top|highest|lowest|largest|smallest|first|leading|most|fastest)\b/i,
    resolvedBy: "tiebreak",
    why: "a superlative with no tie-break is undefined the moment two values match",
  },
  {
    code: "MISSING_UNIT",
    pattern: /\b(above|below|over|under|more than|less than|at least|exceeds?|reaches?)\b/i,
    resolvedBy: "unit",
    why: "a threshold with no unit compares numbers that may not be commensurable",
  },
  {
    code: "COMPOUND_CONDITION",
    pattern: /\b(\w+)\b\s+(and|or)\s+\b(\w+)\b.*\b(and|or)\b/i,
    resolvedBy: "combine",
    why: "more than one connective without stated precedence has multiple truth tables",
  },
  {
    code: "VAGUE_PREDICATE",
    pattern:
      /\b(significant|significantly|major|successful|successfully|substantial|meaningful|widely|popular|properly|effective|agree|agrees|agreed|announce[sd]?|adopt[sd]?|support[sd]?)\b/i,
    resolvedBy: null, // unresolvable: rewrite required
    why: "the predicate itself is a judgement call -- no source can be read to settle it",
  },
  {
    code: "UNBOUND_ENTITY",
    pattern: /\b(a|any|some|an)\s+(top|major|leading|big|large|well-known|notable)\s+\w+/i,
    resolvedBy: "entities",
    why: "the set of qualifying entities is not enumerated, so membership is arguable",
  },
]);

/**
 * Grade one question against its spec.
 * @param {string} question
 * @param {object} spec
 * @returns {{decision: string, defects: ReadonlyArray<object>, fired: string[]}}
 */
export function grade(question, spec) {
  const text = String(question ?? "");
  const structure = validateSpec(spec);

  const structural = structure.problems.map((problem) => ({
    code: "SPEC_INVALID",
    detail: problem,
    fixable: true,
  }));

  const fired = PROBES.filter((probe) => probe.pattern.test(text));

  const semantic = fired.flatMap((probe) => {
    if (probe.resolvedBy === null) {
      return [{
        code: probe.code,
        detail: `"${firstMatch(probe.pattern, text)}" -- ${probe.why}`,
        fixable: false,
      }];
    }
    if (isAnswered(spec, probe.resolvedBy)) return [];
    return [{
      code: probe.code,
      detail: `"${firstMatch(probe.pattern, text)}" -- ${probe.why}; set spec.${probe.resolvedBy}`,
      fixable: true,
    }];
  });

  const defects = Object.freeze([...structural, ...semantic]);
  return {
    decision: defects.length === 0 ? ADMIT : REFUSE,
    defects,
    fired: fired.map((p) => p.code),
  };
}

function isAnswered(spec, field) {
  const value = spec?.[field];
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

function firstMatch(pattern, text) {
  const found = pattern.exec(text);
  return found ? found[0] : "";
}

/**
 * Render a refusal the way a market creator should see it: the defect, and the
 * specific thing to change. An error that does not say what to do is noise.
 * @param {{decision: string, defects: ReadonlyArray<object>}} result
 * @returns {string}
 */
export function explain(result) {
  if (result.decision === ADMIT) return "ADMIT -- the spec settles this question uniquely.";
  const rewrite = result.defects.filter((d) => !d.fixable);
  const annotate = result.defects.filter((d) => d.fixable);
  const lines = [`REFUSE -- ${result.defects.length} defect(s).`];
  if (rewrite.length > 0) {
    lines.push("", "Rewrite the question (no spec field can fix these):");
    rewrite.forEach((d) => lines.push(`  - [${d.code}] ${d.detail}`));
  }
  if (annotate.length > 0) {
    lines.push("", "Complete the spec:");
    annotate.forEach((d) => lines.push(`  - [${d.code}] ${d.detail}`));
  }
  return lines.join("\n");
}

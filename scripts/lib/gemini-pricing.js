/**
 * Per-model Gemini API pricing — input/output $/M tokens.
 *
 * Single source of truth for bench-models.js and any future cost projection.
 * Update the `LAST_VERIFIED` date when refreshing rates.
 *
 * Tiering note: Gemini 2.5/3 Pro charge a higher rate above 200k context tokens.
 * Our match-analysis prompts (video + system + encyclopedia) usually land in
 * the 100k–250k range, so the >200k tier is realistic — always check both.
 */

const LAST_VERIFIED = '2026-05-21';

const PRICES = {
  // Gemini 2.5 family
  'gemini-2.5-pro': {
    input_under_200k_per_m: 1.25,
    output_under_200k_per_m: 10.00,
    input_over_200k_per_m: 2.50,
    output_over_200k_per_m: 15.00,
    cached_input_per_m: 0.31,    // ~75% off prompt-cache hits, 2.5 Pro
    deprecation_date: '2026-06-17',   // AI Studio. Vertex extends to 2026-10-16.
  },
  'gemini-2.5-flash': {
    input_under_200k_per_m: 0.30,
    output_under_200k_per_m: 2.50,
    input_over_200k_per_m: 0.30,
    output_over_200k_per_m: 2.50,
    cached_input_per_m: 0.075,
    deprecation_date: null,
  },
  'gemini-2.5-flash-lite': {
    input_under_200k_per_m: 0.10,
    output_under_200k_per_m: 0.40,
    input_over_200k_per_m: 0.10,
    output_over_200k_per_m: 0.40,
    cached_input_per_m: 0.025,
    deprecation_date: null,
  },

  // Gemini 3 family — released Nov 2025 (3 Pro) / Feb 2026 (3.1 Pro preview)
  'gemini-3-pro': {
    input_under_200k_per_m: 2.00,
    output_under_200k_per_m: 12.00,
    input_over_200k_per_m: 4.00,
    output_over_200k_per_m: 18.00,
    cached_input_per_m: 0.50,    // estimate — Google has not yet documented 3.x cache pricing
    deprecation_date: null,
  },
  'gemini-3.1-pro-preview': {
    input_under_200k_per_m: 2.00,
    output_under_200k_per_m: 12.00,
    input_over_200k_per_m: 4.00,
    output_over_200k_per_m: 18.00,
    cached_input_per_m: 0.50,
    deprecation_date: null,
  },
  // Preview alias the API actually uses today; same rates as the GA 3 Pro line.
  'gemini-3-pro-preview': {
    input_under_200k_per_m: 2.00,
    output_under_200k_per_m: 12.00,
    input_over_200k_per_m: 4.00,
    output_over_200k_per_m: 18.00,
    cached_input_per_m: 0.50,
    deprecation_date: null,
  },

  // Gemini 3.5 Flash — announced Google I/O 2026-05-19; rates TBD
  // Placeholder uses 2.5 Flash rates; refresh once Google publishes pricing.
  'gemini-3.5-flash': {
    input_under_200k_per_m: 0.30,
    output_under_200k_per_m: 2.50,
    input_over_200k_per_m: 0.30,
    output_over_200k_per_m: 2.50,
    cached_input_per_m: 0.075,
    deprecation_date: null,
    _tbd: true,
  },
};

/**
 * Estimate USD cost of a single Gemini call given a usage object.
 *
 * @param {string} model - e.g. 'gemini-2.5-pro'
 * @param {object} usage - { promptTokenCount, candidatesTokenCount, cachedContentTokenCount? }
 * @returns {{ usd: number, breakdown: object, missing?: true }}
 */
function estimateCallCost(model, usage) {
  const p = PRICES[model];
  if (!p) return { usd: 0, missing: true, breakdown: { reason: `no pricing for ${model}` } };

  const promptTokens = usage?.promptTokenCount || usage?.prompt_token_count || 0;
  const outputTokens = usage?.candidatesTokenCount || usage?.candidates_token_count || 0;
  const cachedTokens = usage?.cachedContentTokenCount || usage?.cached_content_token_count || 0;
  const billablePromptTokens = Math.max(0, promptTokens - cachedTokens);

  const overThreshold = promptTokens > 200_000;
  const inputRate = overThreshold ? p.input_over_200k_per_m : p.input_under_200k_per_m;
  const outputRate = overThreshold ? p.output_over_200k_per_m : p.output_under_200k_per_m;

  const promptUsd = (billablePromptTokens / 1_000_000) * inputRate;
  const cachedUsd = (cachedTokens / 1_000_000) * p.cached_input_per_m;
  const outputUsd = (outputTokens / 1_000_000) * outputRate;
  const usd = promptUsd + cachedUsd + outputUsd;

  return {
    usd,
    breakdown: {
      promptTokens, cachedTokens, outputTokens,
      tier: overThreshold ? 'over_200k' : 'under_200k',
      promptUsd, cachedUsd, outputUsd,
    },
  };
}

/**
 * Estimate total cost across all prompts in a gemini_output payload.
 * Production worker stores per-prompt usage at gemini_output.{goals,saves,distribution}.usage.
 */
function estimateMatchCost(model, geminiOutput) {
  const sections = ['goals', 'saves', 'distribution', 'crosses', 'sweeper'];
  let totalUsd = 0;
  const perSection = {};
  for (const s of sections) {
    const usage = geminiOutput?.[s]?.usage;
    if (!usage) continue;
    const c = estimateCallCost(model, usage);
    perSection[s] = c;
    totalUsd += c.usd;
  }
  return { usd: totalUsd, perSection, model };
}

module.exports = {
  LAST_VERIFIED,
  PRICES,
  estimateCallCost,
  estimateMatchCost,
};

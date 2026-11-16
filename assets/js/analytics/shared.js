export const KEY = "cfc_consent";
export const GA_COOKIES = /^(_ga|_ga_[A-Z0-9]+|_gid|_gcl_au|_gcl_aw|_gcl_dc)$/;

// Returns a valid stored choice or null (absent, unparsable, expired or old policy version).
export function parseChoice(raw, pv, days, now) {
  try {
    const c = JSON.parse(raw);
    if (!c || c.v !== 1 || c.pv !== pv || typeof c.t !== "number" || (c.a !== 0 && c.a !== 1)) return null;
    if (now - c.t > days * 864e5 || c.t > now + 864e5) return null;
    return c;
  } catch (e) {
    return null;
  }
}

export function tzMatches(tz, prefixes) {
  return !!tz && prefixes.some((p) => tz.indexOf(p) === 0);
}

// Advertising signals are permanently denied; only analytics follows the choice.
export function toState(c) {
  return {
    analytics_storage: c && c.a ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}

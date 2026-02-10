const HUNTER_ROOT = typeof globalThis !== "undefined" ? globalThis : self;

HUNTER_ROOT.HUNTER_QUERIES = HUNTER_ROOT.HUNTER_QUERIES || {};

HUNTER_ROOT.buildHunterQuery = (keyword, customQuery, filters = {}) => {
    const categoryQuery = HUNTER_ROOT.HUNTER_QUERIES[(keyword || "").trim()] || "";
    const base = customQuery && customQuery.trim()
        ? customQuery.trim()
        : (categoryQuery || (keyword || "").trim());
    const parts = [];
    if (base) parts.push(`(${base})`);
    if (filters.location) parts.push(filters.location);
    if (filters.language) parts.push(filters.language);
    if (filters.includeKeywords) parts.push(filters.includeKeywords);
    if (filters.excludeKeywords) parts.push(`-${filters.excludeKeywords}`);
    return parts.join(" ").trim();
};

HUNTER_ROOT.buildLinkedInSearchUrl = (query) => {
    const encoded = encodeURIComponent(query);
    return `https://www.linkedin.com/search/results/people/?keywords=${encoded}`;
};

if (typeof window !== "undefined") {
    window.HUNTER_QUERIES = HUNTER_ROOT.HUNTER_QUERIES;
}

window.HUNTER_QUERIES = {
    "Freelance marketing": [
        "\"freelance marketing\"",
        "\"consultant marketing\"",
        "\"growth marketing\""
    ],
    "Agent immobilier": [
        "\"agent immobilier\"",
        "\"conseiller immobilier\"",
        "\"négociateur immobilier\""
    ],
    "Musée/Culture": [
        "\"musée\"",
        "\"culture\"",
        "\"médiation culturelle\""
    ],
    "Avocats": [
        "\"avocat\"",
        "\"juriste\"",
        "\"cabinet d'avocats\""
    ],
    "Médecins": [
        "\"médecin\"",
        "\"docteur\"",
        "\"chirurgien\""
    ]
};

window.buildHunterQuery = (category, customQuery, filters = {}) => {
    const base = customQuery && customQuery.trim()
        ? customQuery.trim()
        : (window.HUNTER_QUERIES[category] || []).join(" OR ");
    const parts = [];
    if (base) parts.push(`(${base})`);
    if (filters.location) parts.push(filters.location);
    if (filters.language) parts.push(filters.language);
    if (filters.includeKeywords) parts.push(filters.includeKeywords);
    if (filters.excludeKeywords) parts.push(`-${filters.excludeKeywords}`);
    return parts.join(" ").trim();
};

window.buildLinkedInSearchUrl = (query) => {
    const encoded = encodeURIComponent(query);
    return `https://www.linkedin.com/search/results/people/?keywords=${encoded}`;
};

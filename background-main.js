const API_KEY_STORAGE_KEY = "openaiApiKey";
const TARGETS_KEY = "targets";
const REJECTED_KEY = "rejected";
const HUNTER_CONSENT_KEY = "consentGiven";
const QUEUE_ALARM = "ghostly-post-queue";
const CONTENT_SCRIPT_FILES = ['selectors.js', 'content.js'];
const hasChrome = typeof chrome !== "undefined";
const runtimeApi = hasChrome && chrome.runtime ? chrome.runtime : null;
const storageLocalApi = hasChrome && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
const storageSyncApi = hasChrome && chrome.storage && chrome.storage.sync ? chrome.storage.sync : null;
const alarmsApi = hasChrome && chrome.alarms ? chrome.alarms : null;

const getApiKey = () => new Promise(resolve => {
    const syncStore = storageSyncApi;
    if (!syncStore) {
        if (!storageLocalApi) {
            resolve("");
            return;
        }
        storageLocalApi.get([API_KEY_STORAGE_KEY], localResult => {
            resolve((localResult[API_KEY_STORAGE_KEY] || "").trim());
        });
        return;
    }
    syncStore.get([API_KEY_STORAGE_KEY], syncResult => {
        const syncKey = (syncResult[API_KEY_STORAGE_KEY] || "").trim();
        if (syncKey) {
            resolve(syncKey);
            return;
        }
        if (!storageLocalApi) {
            resolve("");
            return;
        }
        storageLocalApi.get([API_KEY_STORAGE_KEY], localResult => {
            resolve((localResult[API_KEY_STORAGE_KEY] || "").trim());
        });
    });
});

const getQueue = () => new Promise(resolve => {
    if (!storageLocalApi) {
        resolve([]);
        return;
    }
    storageLocalApi.get(['postQueue'], r => resolve(r.postQueue || []));
});

const setQueue = (queue) => new Promise(resolve => {
    if (!storageLocalApi) {
        resolve();
        return;
    }
    storageLocalApi.set({ postQueue: queue }, resolve);
});

const getTargets = () => new Promise(resolve => {
    if (!storageLocalApi) {
        resolve([]);
        return;
    }
    storageLocalApi.get([TARGETS_KEY], r => resolve(r[TARGETS_KEY] || []));
});

const setTargets = (targets) => new Promise(resolve => {
    if (!storageLocalApi) {
        resolve();
        return;
    }
    storageLocalApi.set({ [TARGETS_KEY]: targets }, resolve);
});

const getRejected = () => new Promise(resolve => {
    if (!storageLocalApi) {
        resolve([]);
        return;
    }
    storageLocalApi.get([REJECTED_KEY], r => resolve(r[REJECTED_KEY] || []));
});

const setRejected = (rejected) => new Promise(resolve => {
    if (!storageLocalApi) {
        resolve();
        return;
    }
    storageLocalApi.set({ [REJECTED_KEY]: rejected }, resolve);
});

const fetchOpenAI = async (payload) => {
    const apiKey = await getApiKey();
    if (!apiKey) {
        return { ok: false, data: null, error: "OpenAI API key missing" };
    }
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(payload)
    });
    let data = null;
    try {
        data = await r.json();
    } catch (e) {
        data = null;
    }
    if (!r.ok) {
        return { ok: false, data, error: `OpenAI ${r.status}` };
    }
    return { ok: true, data, error: null };
};

const scheduleNextPost = async () => {
    const queue = await getQueue();
    const next = queue
        .filter(item => !item.sent && item.timestamp)
        .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!next) {
        chrome.alarms.clear(QUEUE_ALARM);
        return;
    }

    const when = Math.max(Date.now() + 2000, next.timestamp);
    chrome.alarms.create(QUEUE_ALARM, { when });
};

const openLinkedInAndPost = async (content) => new Promise(resolve => {
    chrome.tabs.create({ url: "https://www.linkedin.com/feed/", active: false }, tab => {
        const tabId = tab.id;
        const onUpdated = async (updatedTabId, info) => {
            if (updatedTabId === tabId && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                try {
                    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
                    chrome.tabs.sendMessage(tabId, { action: "WRITE_POST_ON_LINKEDIN", content, autoPost: true }, () => {
                        resolve(true);
                        chrome.tabs.remove(tabId);
                    });
                } catch (e) {
                    resolve(false);
                }
            }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
});

const processQueue = async () => {
    const queue = await getQueue();
    const now = Date.now();
    const nextIndex = queue.findIndex(item => !item.sent && item.timestamp <= now);
    if (nextIndex === -1) {
        await scheduleNextPost();
        return;
    }

    const item = queue[nextIndex];
    const success = await openLinkedInAndPost(item.content);
    queue[nextIndex] = { ...item, sent: success };
    await setQueue(queue);
    await scheduleNextPost();
};

function clean(text) {
    if (!text) return "";
    return text.replace(/^(Score|Note|Analyse|Evaluation).*?$/gim, "").replace(/\d+\/\d+/g, "").replace(/"/g, "").trim();
}

const parseJsonSafe = (text) => {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
};

const buildHunterQuery = (keyword, customQuery, filters = {}) => {
    const base = customQuery && customQuery.trim()
        ? customQuery.trim()
        : (keyword || "").trim();
    const parts = [];
    if (base) parts.push(`(${base})`);
    if (filters.location) parts.push(filters.location);
    if (filters.language) parts.push(filters.language);
    if (filters.includeKeywords) parts.push(filters.includeKeywords);
    if (filters.excludeKeywords) parts.push(`-${filters.excludeKeywords}`);
    return parts.join(" ").trim();
};

const buildLinkedInSearchUrl = (query) => {
    const encoded = encodeURIComponent(query);
    return `https://www.linkedin.com/search/results/people/?keywords=${encoded}`;
};

const buildHunterSearchUrl = (category, settings) => {
    const query = buildHunterQuery(category, settings.customQuery, settings);
    if (!query) return null;
    return buildLinkedInSearchUrl(query);
};

const ensureConsent = async (consentGiven) => {
    if (consentGiven) return true;
    const stored = await new Promise(resolve => {
        chrome.storage.local.get([HUNTER_CONSENT_KEY], r => resolve(Boolean(r[HUNTER_CONSENT_KEY])));
    });
    return stored;
};

const extractAiDecision = (content) => {
    const parsed = parseJsonSafe(content);
    if (parsed && typeof parsed.relevant === "boolean") return parsed;
    return { relevant: false, reason: "Réponse IA invalide", tag: "invalid" };
};

const buildFallbackComment = (postText, objectiveText) => {
    const summary = (postText || "").replace(/\s+/g, " ").trim().slice(0, 140);
    const objectiveHint = (objectiveText || "").trim();
    if (objectiveHint) {
        return `Merci pour ce partage, il est très pertinent pour "${objectiveHint}". Le passage sur "${summary}" ouvre une vraie piste d'action.`;
    }
    return `Merci pour ce partage, le passage sur "${summary}" est particulièrement utile et concret.`;
};

const generateCommentSuggestions = async (target, posts, objectives) => {
    const apiKey = await getApiKey();
    const candidatePosts = Array.isArray(posts) ? posts.filter(p => p && p.text).slice(0, 10) : [];
    if (!candidatePosts.length) return [];

    if (!apiKey) {
        return candidatePosts.slice(0, 3).map((post, idx) => ({
            id: `${target.profileUrl || 'profile'}-${Date.now()}-${idx}`,
            urn: post.urn || "",
            postText: post.text,
            comment: buildFallbackComment(post.text, objectives),
            source: "fallback",
            status: "draft"
        }));
    }

    const promptPosts = candidatePosts.map((post, index) => `${index + 1}. ${post.text}`).join("\n\n");
    const { ok, data, error } = await fetchOpenAI({
        model: "gpt-4o",
        messages: [{
            role: "user",
            content: `Objectifs client: ${objectives || "non précisés"}\nProfil ciblé: ${target.fullName || "Profil LinkedIn"} | ${target.headline || ""}\n\nPosts récents:\n${promptPosts}\n\nPour chaque post vraiment pertinent, propose un commentaire opportunité (1-2 phrases max). Réponds en JSON strict: {"suggestions":[{"index":1,"comment":"...","reason":"..."}]}`
        }],
        temperature: 0.4
    });

    if (!ok) {
        return [{
            id: `${target.profileUrl || 'profile'}-${Date.now()}-error`,
            urn: "",
            postText: "",
            comment: "",
            reason: error || "Erreur IA",
            source: "ai_error",
            status: "error"
        }];
    }

    const content = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
    const parsed = parseJsonSafe(content) || {};
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    return suggestions
        .map((s, idx) => {
            const postIndex = Number(s.index) - 1;
            const linkedPost = candidatePosts[postIndex];
            if (!linkedPost || !s.comment) return null;
            return {
                id: `${target.profileUrl || 'profile'}-${Date.now()}-${idx}`,
                urn: linkedPost.urn || "",
                postText: linkedPost.text,
                comment: String(s.comment).trim(),
                reason: String(s.reason || "").trim(),
                source: "ai",
                status: "draft"
            };
        })
        .filter(Boolean)
        .slice(0, 5);
};

const connectToProfile = async (profileUrl) => {
    if (!profileUrl) return { success: false, error: "URL profil manquante." };
    const tabId = await new Promise(resolve => {
        chrome.tabs.create({ url: profileUrl, active: false }, tab => resolve(tab.id));
    });
    const waitForTabComplete = () => new Promise(resolve => {
        const onUpdated = (updatedTabId, info) => {
            if (updatedTabId === tabId && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
    await waitForTabComplete();
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
    const result = await new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { action: "CONNECT_PROFILE" }, resolve);
    });
    chrome.tabs.remove(tabId);
    return result || { success: false, error: "Connexion non exécutée." };
};

const createInactiveTab = (url) => new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
        const createError = chrome.runtime && chrome.runtime.lastError
            ? chrome.runtime.lastError.message
            : "";
        if (createError || !tab || typeof tab.id !== "number") {
            reject(new Error(createError || "Impossible de créer un onglet."));
            return;
        }
        resolve(tab.id);
    });
});

const waitTabComplete = (tabId, timeoutMs) => new Promise((resolve, reject) => {
    let done = false;
    let timeoutId = null;
    const onUpdated = (updatedTabId, info) => {
        if (done) return;
        if (updatedTabId === tabId && info && info.status === "complete") {
            done = true;
            if (timeoutId) clearTimeout(timeoutId);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
        }
    };
    timeoutId = setTimeout(() => {
        if (done) return;
        done = true;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error("Délai dépassé pendant le chargement de l'onglet."));
    }, timeoutMs || 15000);
    chrome.tabs.onUpdated.addListener(onUpdated);
});

const publishSuggestionsForTarget = async ({ tabId, target, suggestions }) => {
    const profileUrl = target && target.profileUrl ? target.profileUrl : "";
    const sourceSuggestions = Array.isArray(suggestions) ? suggestions : [];
    const attempted = sourceSuggestions.length;
    const updatedSuggestions = [];
    let posted = 0;

    const buildPendingComments = () => ({
        ...(target.pendingComments || {}),
        profileUrl,
        suggestions: updatedSuggestions,
        lastPublishedAt: Date.now()
    });

    const failRemainingSuggestions = (errorMessage) => {
        while (updatedSuggestions.length < sourceSuggestions.length) {
            const suggestion = sourceSuggestions[updatedSuggestions.length];
            if (suggestion && (suggestion.status || "draft") === "published") {
                updatedSuggestions.push(suggestion);
                continue;
            }
            updatedSuggestions.push({
                ...suggestion,
                status: "error",
                error: errorMessage || "Échec de publication LinkedIn."
            });
        }
    };

    console.log("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:start", {
        tabId,
        profileUrl,
        suggestionsCount: sourceSuggestions.length
    });
    if (!profileUrl) {
        console.warn("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:missing_profile_url");
        failRemainingSuggestions("URL profil manquante.");
        return {
            success: false,
            posted,
            attempted,
            error: "URL profil manquante.",
            pendingComments: buildPendingComments()
        };
    }
    try {
        const activityUrl = profileUrl.endsWith("/")
            ? `${profileUrl}recent-activity/all/`
            : `${profileUrl}/recent-activity/all/`;
        console.log("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:navigate", { activityUrl });
        await chrome.tabs.update(tabId, { url: activityUrl });
        await waitTabComplete(tabId, 20000);
        console.log("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:tab_complete", { profileUrl });
        await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
        console.log("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:script_injected", { profileUrl });
    } catch (navigationError) {
        const errorMessage = navigationError && navigationError.message
            ? navigationError.message
            : "Navigation ou injection impossible.";
        console.error("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:navigation_failed", {
            profileUrl,
            errorMessage,
            navigationError
        });
        failRemainingSuggestions(errorMessage);
        return {
            success: false,
            posted,
            attempted,
            error: errorMessage,
            pendingComments: buildPendingComments()
        };
    }

    for (const suggestion of sourceSuggestions) {
        const status = suggestion && suggestion.status ? suggestion.status : "draft";
        console.log("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:suggestion", {
            profileUrl,
            urn: suggestion && suggestion.urn ? suggestion.urn : null,
            status
        });
        if (status === "published") {
            updatedSuggestions.push(suggestion);
            continue;
        }
        if (!suggestion || !suggestion.urn || !String(suggestion.comment || "").trim()) {
            updatedSuggestions.push({ ...suggestion, status: "error", error: "Suggestion incomplète." });
            continue;
        }
        try {
            const publishResult = await new Promise(resolve => {
                chrome.tabs.sendMessage(tabId, {
                    action: "COMMENT_ON_FEED_POST_BY_URN",
                    targetURN: suggestion.urn,
                    text: suggestion.comment
                }, resolve);
            });

            if (publishResult && publishResult.success) {
                console.log("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:publish_success", { profileUrl, urn: suggestion.urn });
                posted += 1;
                updatedSuggestions.push({ ...suggestion, status: "published", publishedAt: Date.now() });
            } else {
                console.warn("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:publish_failed", {
                    profileUrl,
                    urn: suggestion.urn,
                    publishResult
                });
                updatedSuggestions.push({ ...suggestion, status: "error", error: "Échec de publication LinkedIn." });
            }
        } catch (publishError) {
            const errorMessage = publishError && publishError.message
                ? publishError.message
                : "Échec de publication LinkedIn.";
            console.warn("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:publish_exception", {
                profileUrl,
                urn: suggestion.urn,
                errorMessage,
                publishError
            });
            updatedSuggestions.push({ ...suggestion, status: "error", error: errorMessage });
        }
        await new Promise(r => setTimeout(r, 1200));
    }

    console.log("[PUBLISH_FOLLOWED_SCAN] publishSuggestionsForTarget:done", { profileUrl, posted, attempted });

    return {
        success: posted > 0,
        posted,
        attempted,
        pendingComments: buildPendingComments()
    };
};

const runHunter = async ({ url, category, settings, consentGiven }) => {
    const hasConsent = await ensureConsent(consentGiven);
    if (!hasConsent) {
        return { success: false, error: "Consentement requis pour lancer la chasse." };
    }
    const searchUrl = url || buildHunterSearchUrl(category, settings);
    if (!searchUrl) {
        return { success: false, error: "Veuillez saisir un mot-clé ou une requête personnalisée." };
    }
    const tabId = await new Promise(resolve => {
        chrome.tabs.create({ url: searchUrl, active: false }, tab => resolve(tab.id));
    });

    const waitForTabComplete = () => new Promise(resolve => {
        const onUpdated = (updatedTabId, info) => {
            if (updatedTabId === tabId && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });

    await waitForTabComplete();
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });

    const runScrape = () => new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { action: "SCRAPE_SEARCH_RESULTS", maxProfilesPerRun: settings.maxProfilesPerRun || 30 }, resolve);
    });

    await new Promise(r => setTimeout(r, 2500));
    let scrapeResult = await runScrape();
    if (scrapeResult && scrapeResult.success && (!scrapeResult.candidates || scrapeResult.candidates.length === 0)) {
        await new Promise(r => setTimeout(r, 2500));
        scrapeResult = await runScrape();
    }

    if (!scrapeResult || !scrapeResult.success) {
        chrome.tabs.remove(tabId);
        return { success: false, error: scrapeResult && scrapeResult.error ? scrapeResult.error : "Scrape échoué." };
    }

    const targets = await getTargets();
    const rejected = await getRejected();
    const existingUrls = new Set(targets.map(t => t.profileUrl));
    const rejectedUrls = new Set(rejected.map(r => r.profileUrl));
    const candidates = scrapeResult.candidates || [];
    const filteredCandidates = candidates.filter(c => !existingUrls.has(c.profileUrl) && !rejectedUrls.has(c.profileUrl));

    const addedTargets = [];
    const newRejected = [];

    const apiKey = await getApiKey();
    const useAI = Boolean(apiKey);

    for (const candidate of filteredCandidates) {
        candidate.category = category;
        if (!useAI) {
            addedTargets.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                profileUrl: candidate.profileUrl,
                fullName: candidate.fullName,
                headline: candidate.headline,
                category,
                addedAt: Date.now(),
                commentsCount: 0,
                commentsSummary: []
            });
            candidate.reason = "Ajout direct (IA désactivée)";
            candidate.prechecked = true;
            continue;
        }
        const { ok, data, error } = await fetchOpenAI({
            model: "gpt-4o",
            messages: [{
                role: "user",
                content: `Mot-clé: ${category}\nProfil: ${candidate.fullName}\nHeadline: ${candidate.headline || ""}\nObjectif: ${settings.includeKeywords || ""}\nRéponds au format JSON strict: {"relevant": true/false, "reason": "...", "tag": "..."}.`
            }],
            temperature: 0.2
        });
        if (!ok) {
            newRejected.push({
                profileUrl: candidate.profileUrl,
                reason: error || "Erreur IA",
                category,
                rejectedAt: Date.now()
            });
            continue;
        }
        const content = data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : "";
        const decision = extractAiDecision(content);
        if (decision.relevant) {
            addedTargets.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                profileUrl: candidate.profileUrl,
                fullName: candidate.fullName,
                headline: candidate.headline,
                category,
                addedAt: Date.now(),
                commentsCount: 0,
                commentsSummary: []
            });
            candidate.reason = decision.reason;
            candidate.prechecked = true;
        } else {
            newRejected.push({
                profileUrl: candidate.profileUrl,
                reason: decision.reason,
                category,
                rejectedAt: Date.now()
            });
            candidate.reason = decision.reason;
        }
    }

    const maxAdd = Math.max(1, Number(settings.maxAddPerRun || addedTargets.length));
    const cappedTargets = addedTargets.slice(0, maxAdd);
    await setTargets(targets.concat(cappedTargets));
    await setRejected(rejected.concat(newRejected));
    chrome.tabs.remove(tabId);

    if (settings.autoConnect) {
        for (const target of cappedTargets) {
            await connectToProfile(target.profileUrl);
            const delayMs = 2000 + Math.floor(Math.random() * 3000);
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    return {
        success: true,
        added: cappedTargets.length,
        rejected: newRejected.length,
        candidates: filteredCandidates
    };
};

if (runtimeApi && runtimeApi.onMessage) runtimeApi.onMessage.addListener((request, sender, sendResponse) => {
  // RADAR
  if (request.action === "ANALYZE_FEED_MANUAL") {
      (async () => {
          const results = [];
          let hadError = false;
          for(let p of request.posts.slice(0, 8)) {
             try {
                 const { ok, data, error } = await fetchOpenAI({
                    model: "gpt-4o",
                    messages: [{role:"user", content: `CONTEXTE: LinkedIn. POST: "${p.text.substring(0,200)}...". Si pertinent pro, écris une réponse précise et contextualisée (1-2 phrases), évite les phrases génériques. Si non pertinent: SKIP.`}],
                    temperature: 0.6
                 });
                 if (!ok) throw new Error(error);
                 const content = data && data.choices && data.choices[0] && data.choices[0].message
                     ? data.choices[0].message.content
                     : "";
                 let rep = clean(content);
                 if(rep.length > 1) { p.aiReply = rep; results.push(p); }
             } catch(e){ p.aiReply = "Erreur IA"; results.push(p); hadError = true; }
          }
          sendResponse({ success: true, results: results, error: hadError ? "Erreur IA" : null });
      })();
      return true;
  }
  // SCAN POST
  if (request.action === "GENERATE_SAV_REPLY") {
    (async () => {
        try {
            const { ok, data, error } = await fetchOpenAI({
                model: "gpt-4o",
                messages: [{role:"user", content: `Persona: "${request.persona || "Expert"}". Contexte: "${request.postContext.substring(0,150)}...". Commentaire: "${request.text}". Tâche: réponse courte (1-2 phrases), spécifique, sans formules génériques.`}],
                temperature: 0.5
            });
            if (!ok) throw new Error(error);
            sendResponse({ reply: clean(data.choices[0].message.content) });
        } catch (e) { sendResponse({ reply: "Merci !", error: "Erreur IA" }); }
    })();
    return true; 
  }
  // EDITEUR
  if (request.action === "GENERATE_DAILY_IDEAS") {
      (async () => {
        try {
            const { ok, data, error } = await fetchOpenAI({
                model: "gpt-4o",
                messages: [{role:"user", content: `3 idées posts LinkedIn.`}],
                temperature: 0.8
            });
            if (!ok) throw new Error(error);
            const ideas = data && data.choices && data.choices[0] && data.choices[0].message
                ? data.choices[0].message.content
                : "";
            if (!ideas) throw new Error("EMPTY_IDEAS");
            sendResponse({ success: true, ideas });
        } catch (e) {
            const fallbackIdeas = "Idée 1|||Sujet simple###Idée 2|||Conseil pratique###Idée 3|||Retour d'expérience";
            if (String(e && e.message).includes("OpenAI API key missing")) {
                sendResponse({ success: true, ideas: fallbackIdeas });
                return;
            }
            sendResponse({ success: false, ideas: fallbackIdeas, error: "Erreur IA" });
        }
      })();
      return true;
  }
  if (request.action === "WRITE_FINAL_POST") {
    (async () => {
        try {
            const { ok, data, error } = await fetchOpenAI({
                model: "gpt-4o",
                messages: [{role:"user", content: `IDENTITÉ:${request.persona}. SUJET:"${request.angle}". Rédige un post complet, concret et spécifique.`}],
                temperature: 0.7
            });
            if (!ok) throw new Error(error);
            sendResponse({ success: true, post: data.choices[0].message.content });
        } catch (e) {
            sendResponse({ success: false, post: "", error: "Erreur IA" });
        }
    })();
    return true;
  }
  // IDENTITE
  if (request.action === "BUILD_PERSONA") {
      (async () => {
        try {
            const { ok, data, error } = await fetchOpenAI({
                model: "gpt-4o",
                messages: [{role: "user", content: `Analyse profil: ${request.profile.headline}. System Prompt court.`}],
                temperature: 0.7
            });
            if (!ok) throw new Error(error);
            sendResponse({ reply: data.choices[0].message.content });
        } catch(e) { sendResponse({ reply: "Expert LinkedIn.", error: "Erreur IA" }); }
      })();
      return true;
  }
  if (request.action === "QUEUE_UPDATED") {
      scheduleNextPost();
      sendResponse({ success: true });
      return true;
  }
  if (request.action === "START_AUTO_HUNT") {
      (async () => {
          const settings = request.settings || {};
          const category = request.category || settings.defaultCategory || "Freelance marketing";
          const response = await runHunter({ category, settings, consentGiven: request.consentGiven });
          sendResponse(response);
      })();
      return true;
  }
  if (request.action === "IMPORT_HUNT_URL") {
      (async () => {
          const settings = request.settings || {};
          const category = settings.defaultCategory || "Freelance marketing";
          const response = await runHunter({ url: request.url, category, settings, consentGiven: request.consentGiven });
          sendResponse(response);
      })();
      return true;
  }
  if (request.action === "ADD_TARGETS") {
      (async () => {
          const candidates = request.candidates || [];
          const targets = await getTargets();
          const existing = new Set(targets.map(t => t.profileUrl));
          const additions = candidates.filter(c => c.profileUrl && !existing.has(c.profileUrl)).map(c => ({
              id: Date.now() + Math.floor(Math.random() * 1000),
              profileUrl: c.profileUrl,
              fullName: c.fullName,
              headline: c.headline,
              category: c.category || "Manual",
              addedAt: Date.now(),
              commentsCount: 0,
              commentsSummary: []
          }));
          await setTargets(targets.concat(additions));
          sendResponse({ success: true, added: additions.length });
      })();
      return true;
  }
  if (request.action === "CONNECT_TARGET") {
      (async () => {
          const response = await connectToProfile(request.profileUrl);
          sendResponse(response);
      })();
      return true;
  }
  if (request.action === "PREVIEW_FOLLOWED_SCAN") {
      (async () => {
          const targets = await getTargets();
          const category = request.category || "all";
          const filtered = category === "all" ? targets : targets.filter(t => (t.category || "").toLowerCase() === category.toLowerCase());
          sendResponse({ success: true, count: filtered.length });
      })();
      return true;
  }
  if (request.action === "START_FOLLOWED_SCAN") {
      (async () => {
          let tabId = null;
          try {
              console.log("[START_FOLLOWED_SCAN] start", {
                  category: request.category || "all",
                  testLimit: request.testLimit || 10
              });
              const targets = await getTargets();
              const category = request.category || "all";
              const filtered = category === "all" ? targets : targets.filter(t => (t.category || "").toLowerCase() === category.toLowerCase());
              console.log("[START_FOLLOWED_SCAN] targets_loaded", { totalTargets: targets.length, filtered: filtered.length });
              if (!filtered.length) {
                  sendResponse({ success: false, error: "Aucun profil suivi dans cette catégorie." });
                  return;
              }
              const limit = Math.max(1, Number(request.testLimit || 10));
              const payload = filtered.slice(0, limit);
              console.log("[START_FOLLOWED_SCAN] payload_ready", { payloadSize: payload.length, limit });
              let totalPosts = 0;
              let totalSuggestions = 0;
              const suggestions = [];
              tabId = await createInactiveTab("https://www.linkedin.com/feed/");
              console.log("[START_FOLLOWED_SCAN] tab_created", { tabId });
              for (const target of payload) {
                  if (!target.profileUrl) {
                      console.warn("[START_FOLLOWED_SCAN] skip_target_missing_profileUrl", { target });
                      continue;
                  }
                  console.log("[START_FOLLOWED_SCAN] processing_target", {
                      profileUrl: target.profileUrl,
                      fullName: target.fullName || null
                  });
                  const activityUrl = target.profileUrl.endsWith("/")
                      ? `${target.profileUrl}recent-activity/all/`
                      : `${target.profileUrl}/recent-activity/all/`;
                  await chrome.tabs.update(tabId, { url: activityUrl });
                  await waitTabComplete(tabId, 15000);
                  console.log("[START_FOLLOWED_SCAN] tab_ready", { profileUrl: target.profileUrl });
                  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
                  console.log("[START_FOLLOWED_SCAN] script_injected", { profileUrl: target.profileUrl });
                  const scanResult = await new Promise(resolve => {
                      chrome.tabs.sendMessage(tabId, { action: "SCAN_PROFILE_POSTS" }, resolve);
                  });
                  console.log("[START_FOLLOWED_SCAN] scan_result", {
                      profileUrl: target.profileUrl,
                      success: !!(scanResult && scanResult.success),
                      postsCount: Array.isArray(scanResult && scanResult.posts) ? scanResult.posts.length : 0
                  });
                  if (scanResult && scanResult.success && Array.isArray(scanResult.posts)) {
                      totalPosts += scanResult.posts.length;
                      const commentSuggestions = await generateCommentSuggestions(target, scanResult.posts, request.objectives || "");
                      console.log("[START_FOLLOWED_SCAN] suggestions_generated", {
                          profileUrl: target.profileUrl,
                          suggestionsCount: commentSuggestions.length
                      });
                      totalSuggestions += commentSuggestions.length;
                      suggestions.push({
                          profileUrl: target.profileUrl,
                          posts: scanResult.posts,
                          suggestions: commentSuggestions,
                          scannedAt: Date.now()
                      });
                  } else {
                      console.warn("[START_FOLLOWED_SCAN] scan_result_invalid_or_empty", {
                          profileUrl: target.profileUrl,
                          scanResult
                      });
                  }
                  await new Promise(r => setTimeout(r, 1500));
              }
              const now = Date.now();
              const updatedTargets = targets.map(t => {
                  if (payload.find(p => p.profileUrl === t.profileUrl)) {
                      return {
                          ...t,
                          lastScanAt: now,
                          pendingComments: suggestions.find(s => s.profileUrl === t.profileUrl) || null
                      };
                  }
                  return t;
              });
              await setTargets(updatedTargets);
              console.log("[START_FOLLOWED_SCAN] completed", {
                  payload: payload.length,
                  totalPosts,
                  totalSuggestions
              });
              sendResponse({ success: true, count: payload.length, message: `Scan terminé: ${payload.length} profils, ${totalPosts} posts détectés, ${totalSuggestions} propositions générées.` });
          } catch (error) {
              const errorMessage = error && error.message ? error.message : "Erreur pendant le scan des profils suivis.";
              console.error("[START_FOLLOWED_SCAN] failed", { errorMessage, error });
              sendResponse({ success: false, error: errorMessage });
          } finally {
              if (typeof tabId === "number") {
                  chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
              }
          }
      })();
      return true;
  }
  if (request.action === "PUBLISH_FOLLOWED_SCAN") {
      (async () => {
          let tabId = null;
          try {
              console.log("[PUBLISH_FOLLOWED_SCAN] start", { category: request.category || "all" });
              const targets = await getTargets();
              const category = request.category || "all";
              const filteredTargets = category === "all"
                  ? targets
                  : targets.filter(t => (t.category || "").toLowerCase() === category.toLowerCase());
              const targetsWithSuggestions = filteredTargets.filter(t =>
                  t &&
                  t.pendingComments &&
                  Array.isArray(t.pendingComments.suggestions) &&
                  t.pendingComments.suggestions.some(s => (s.status || "draft") !== "published")
              );

              console.log("[PUBLISH_FOLLOWED_SCAN] targets_ready", {
                  totalTargets: targets.length,
                  filteredTargets: filteredTargets.length,
                  targetsWithSuggestions: targetsWithSuggestions.length
              });

              if (!targetsWithSuggestions.length) {
                  sendResponse({ success: false, error: "Aucun commentaire en attente de publication." });
                  return;
              }

              tabId = await createInactiveTab("https://www.linkedin.com/feed/");
              console.log("[PUBLISH_FOLLOWED_SCAN] tab_created", { tabId });
              let posted = 0;
              let attempted = 0;
              const failedProfiles = [];
              const byProfileUrl = new Map(targets.map(target => [target.profileUrl, target.pendingComments]));
              let updatedTargets = targets;

              for (const target of targetsWithSuggestions) {
                  const suggestions = target.pendingComments.suggestions || [];
                  console.log("[PUBLISH_FOLLOWED_SCAN] processing_target", {
                      profileUrl: target.profileUrl,
                      fullName: target.fullName || null,
                      suggestionsCount: suggestions.length
                  });
                  try {
                      const publishResult = await publishSuggestionsForTarget({ tabId, target, suggestions });
                      posted += publishResult.posted || 0;
                      attempted += publishResult.attempted || 0;
                      byProfileUrl.set(target.profileUrl, publishResult.pendingComments || target.pendingComments);
                      if ((publishResult.posted || 0) === 0) {
                          failedProfiles.push(target.fullName || target.profileUrl || "Profil");
                      }
                  } catch (error) {
                      console.error("[PUBLISH_FOLLOWED_SCAN] target_failed", {
                          profileUrl: target.profileUrl,
                          errorMessage: error && error.message ? error.message : "Erreur inconnue",
                          error
                      });
                      failedProfiles.push(target.fullName || target.profileUrl || "Profil");
                      attempted += suggestions.length;
                      byProfileUrl.set(target.profileUrl, target.pendingComments);
                  }

                  updatedTargets = updatedTargets.map(currentTarget => {
                      if (!byProfileUrl.has(currentTarget.profileUrl)) return currentTarget;
                      return {
                          ...currentTarget,
                          pendingComments: byProfileUrl.get(currentTarget.profileUrl)
                      };
                  });
                  await setTargets(updatedTargets);
                  console.log("[PUBLISH_FOLLOWED_SCAN] target_persisted", {
                      profileUrl: target.profileUrl,
                      posted,
                      attempted,
                      failedProfilesCount: failedProfiles.length
                  });
              }

              const success = posted > 0;
              console.log("[PUBLISH_FOLLOWED_SCAN] completed", { posted, attempted, failedProfilesCount: failedProfiles.length, success });
              const message = success
                  ? `Publication terminée: ${posted}/${attempted} commentaires publiés.`
                  : "Aucun commentaire n'a pu être publié.";
              sendResponse({ success, posted, attempted, failedProfiles, message });
          } catch (error) {
              const errorMessage = error && error.message ? error.message : "Erreur pendant la publication des commentaires.";
              console.error("[PUBLISH_FOLLOWED_SCAN] failed", { errorMessage, error });
              sendResponse({ success: false, error: errorMessage });
          } finally {
              if (typeof tabId === "number") {
                  chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
              }
          }
      })();
      return true;
  }
  if (request.action === "GENERATE_HOOK_MESSAGE") {
      (async () => {
          const targets = await getTargets();
          const target = targets.find(t => t.profileUrl === request.profileUrl);
          if (!target) {
              sendResponse({ success: false, error: "Profil introuvable." });
              return;
          }
          const message = `Bonjour ${target.fullName || ""}, j’ai apprécié vos contenus sur ${target.headline || "LinkedIn"}.`;
          sendResponse({ success: true, message });
      })();
      return true;
  }
});

if (runtimeApi && runtimeApi.onInstalled) runtimeApi.onInstalled.addListener(() => {
    scheduleNextPost();
});

if (runtimeApi && runtimeApi.onStartup) runtimeApi.onStartup.addListener(() => {
    scheduleNextPost();
});

if (alarmsApi && alarmsApi.onAlarm) alarmsApi.onAlarm.addListener((alarm) => {
    if (alarm.name === QUEUE_ALARM) {
        processQueue();
    }
});

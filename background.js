importScripts('hunter_queries.js');

const API_KEY_STORAGE_KEY = "openaiApiKey";
const TARGETS_KEY = "targets";
const REJECTED_KEY = "rejected";
const HUNTER_CONSENT_KEY = "consentGiven";
const QUEUE_ALARM = "ghostly-post-queue";
const CONTENT_SCRIPT_FILES = ['selectors.js', 'content.js'];

const getApiKey = () => new Promise(resolve => {
    chrome.storage.sync.get([API_KEY_STORAGE_KEY], syncResult => {
        const syncKey = (syncResult[API_KEY_STORAGE_KEY] || "").trim();
        if (syncKey) {
            resolve(syncKey);
            return;
        }
        chrome.storage.local.get([API_KEY_STORAGE_KEY], localResult => {
            resolve((localResult[API_KEY_STORAGE_KEY] || "").trim());
        });
    });
});

const getQueue = () => new Promise(resolve => {
    chrome.storage.local.get(['postQueue'], r => resolve(r.postQueue || []));
});

const setQueue = (queue) => new Promise(resolve => {
    chrome.storage.local.set({ postQueue: queue }, resolve);
});

const getTargets = () => new Promise(resolve => {
    chrome.storage.local.get([TARGETS_KEY], r => resolve(r[TARGETS_KEY] || []));
});

const setTargets = (targets) => new Promise(resolve => {
    chrome.storage.local.set({ [TARGETS_KEY]: targets }, resolve);
});

const getRejected = () => new Promise(resolve => {
    chrome.storage.local.get([REJECTED_KEY], r => resolve(r[REJECTED_KEY] || []));
});

const setRejected = (rejected) => new Promise(resolve => {
    chrome.storage.local.set({ [REJECTED_KEY]: rejected }, resolve);
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
});

chrome.runtime.onInstalled.addListener(() => {
    scheduleNextPost();
});

chrome.runtime.onStartup.addListener(() => {
    scheduleNextPost();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === QUEUE_ALARM) {
        processQueue();
    }
});

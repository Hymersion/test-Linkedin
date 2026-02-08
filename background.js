const QUEUE_ALARM = "ghostly-post-queue";
const WATCH_ALARM = "ghostly-watchtower";
const API_KEY_STORAGE_KEY = "openaiApiKey";
const TARGETS_KEY = "targets";
const OPPORTUNITIES_KEY = "opportunities";
const OBJECTIVES_KEY = "objectives";
const WATCH_SETTINGS_KEY = "watchSettings";
const ACTION_LOG_KEY = "actionLog";

const DEFAULT_OBJECTIVES = {
    promptSystem: "Tu es un conseiller LinkedIn qui qualifie des opportunités.",
    goals: "",
    excludedTopics: "",
    language: "fr",
    toneRules: "Professionnel, naturel, pas de phrases génériques."
};
const DEFAULT_WATCH_SETTINGS = {
    enabled: false,
    checkIntervalMinutes: 30,
    maxTargetsPerCycle: 5,
    requireManualApproval: true,
    scoreThreshold: 60
};
const DEFAULT_ACTION_LOG = { dailyActions: 0, lastReset: Date.now() };

let cachedApiKey = null;
let cacheLoaded = false;

const getApiKey = () => new Promise(resolve => {
    if (cacheLoaded) {
        resolve(cachedApiKey || "");
        return;
    }
    chrome.storage.local.get([API_KEY_STORAGE_KEY], r => {
        cachedApiKey = r[API_KEY_STORAGE_KEY] || "";
        cacheLoaded = true;
        resolve(cachedApiKey);
    });
});

const getQueue = () => new Promise(resolve => {
    chrome.storage.local.get(['postQueue'], r => resolve(r.postQueue || []));
});

const setQueue = (queue) => new Promise(resolve => {
    chrome.storage.local.set({ postQueue: queue }, resolve);
});

const getLocal = (keys) => new Promise(resolve => chrome.storage.local.get(keys, resolve));
const setLocal = (data) => new Promise(resolve => chrome.storage.local.set(data, resolve));

const fetchOpenAI = async (payload, apiKeyOverride) => {
    const apiKey = apiKeyOverride || await getApiKey();
    if (!apiKey) {
        return { ok: false, data: null, error: "OpenAI API key missing" };
    }
    let r;
    try {
        r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        return { ok: false, data: null, error: "Network error" };
    }
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

const getTargets = async () => {
    const data = await getLocal([TARGETS_KEY]);
    return data[TARGETS_KEY] || [];
};

const setTargets = (targets) => setLocal({ [TARGETS_KEY]: targets });

const getOpportunities = async () => {
    const data = await getLocal([OPPORTUNITIES_KEY]);
    return data[OPPORTUNITIES_KEY] || [];
};

const setOpportunities = (opportunities) => setLocal({ [OPPORTUNITIES_KEY]: opportunities });

const getObjectives = async () => {
    const data = await getLocal([OBJECTIVES_KEY]);
    return { ...DEFAULT_OBJECTIVES, ...(data[OBJECTIVES_KEY] || {}) };
};

const setObjectives = (objectives) => setLocal({ [OBJECTIVES_KEY]: objectives });

const getWatchSettings = async () => {
    const data = await getLocal([WATCH_SETTINGS_KEY]);
    return { ...DEFAULT_WATCH_SETTINGS, ...(data[WATCH_SETTINGS_KEY] || {}) };
};

const setWatchSettings = (settings) => setLocal({ [WATCH_SETTINGS_KEY]: settings });

const getActionLog = async () => {
    const data = await getLocal([ACTION_LOG_KEY]);
    return { ...DEFAULT_ACTION_LOG, ...(data[ACTION_LOG_KEY] || {}) };
};

const setActionLog = (log) => setLocal({ [ACTION_LOG_KEY]: log });

const ensureDailyCap = async (cap = 50) => {
    const log = await getActionLog();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (now - log.lastReset > dayMs) {
        const resetLog = { dailyActions: 0, lastReset: now };
        await setActionLog(resetLog);
        return { allowed: true, log: resetLog };
    }
    if (log.dailyActions >= cap) {
        return { allowed: false, log };
    }
    return { allowed: true, log };
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

const ensureQueueProcessing = async () => {
    const queue = await getQueue();
    const now = Date.now();
    const hasDue = queue.some(item => !item.sent && item.timestamp && item.timestamp <= now);
    if (hasDue) {
        await processQueue();
        return;
    }
    await scheduleNextPost();
};

const openLinkedInAndPost = async (content) => new Promise(resolve => {
    chrome.tabs.create({ url: "https://www.linkedin.com/feed/", active: true }, tab => {
        const tabId = tab.id;
        const onUpdated = async (updatedTabId, info) => {
            if (updatedTabId === tabId && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                try {
                    await chrome.scripting.executeScript({ target: { tabId }, files: ['selectors.js', 'content.js'] });
                    let attempts = 0;
                    const sendPost = () => {
                        attempts += 1;
                        chrome.tabs.sendMessage(tabId, { action: "WRITE_POST_ON_LINKEDIN", content, autoPost: true }, (response) => {
                            const success = response && response.success;
                            if (!success && attempts < 3) {
                                setTimeout(sendPost, 2000);
                                return;
                            }
                            resolve(!!success);
                            if (success) {
                                chrome.tabs.remove(tabId);
                            }
                        });
                    };
                    sendPost();
                } catch (e) {
                    resolve(false);
                }
            }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
});

const filterCandidate = async (headline, objectives) => {
    const payload = {
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: objectives.promptSystem },
            { role: "user", content: `Objectifs: ${objectives.goals}\nExclusions: ${objectives.excludedTopics}\nHeadline: ${headline}\nRéponds en JSON {\"relevant\":boolean,\"reason\":string,\"category\":string}.` }
        ],
        temperature: 0.2
    };
    const { ok, data } = await fetchOpenAI(payload);
    if (!ok || !data) return { relevant: false, reason: "IA indisponible", category: "unknown" };
    try {
        const content = data.choices[0].message.content;
        return JSON.parse(content);
    } catch (e) {
        return { relevant: false, reason: "Réponse IA invalide", category: "unknown" };
    }
};

const scorePost = async (postText, target, objectives) => {
    const payload = {
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: objectives.promptSystem },
            {
                role: "user",
                content: `Objectifs: ${objectives.goals}\nTon: ${objectives.toneRules}\nHeadline cible: ${target.headline}\nPost: ${postText}\nRéponds en JSON {\"score\":0-100,\"decision\":\"IGNORE\"|\"DRAFT_COMMENT\",\"rationale\":string,\"draftComment\":string}. Commentaire: 1-2 phrases, concret, sans genericité.`
            }
        ],
        temperature: 0.4
    };
    const { ok, data } = await fetchOpenAI(payload);
    if (!ok || !data) return { score: 0, decision: "IGNORE", rationale: "IA indisponible", draftComment: "" };
    try {
        const content = data.choices[0].message.content;
        return JSON.parse(content);
    } catch (e) {
        return { score: 0, decision: "IGNORE", rationale: "Réponse IA invalide", draftComment: "" };
    }
};

const runWatchCycle = async () => {
    const settings = await getWatchSettings();
    if (!settings.enabled) return;
    const capStatus = await ensureDailyCap();
    if (!capStatus.allowed) return;
    const targets = await getTargets();
    const objectives = await getObjectives();
    const maxTargets = settings.maxTargetsPerCycle || 5;
    let processed = 0;
    for (const target of targets) {
        if (processed >= maxTargets) break;
        processed += 1;
        const tab = await new Promise(resolve => chrome.tabs.create({ url: target.profileUrl, active: false }, resolve));
        await new Promise(resolve => setTimeout(resolve, 4000));
        try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selectors.js', 'content.js'] });
            const result = await new Promise(resolve => {
                chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_LATEST_POST" }, resolve);
            });
            const now = Date.now();
            target.lastCheckedAt = now;
            if (result && result.error === "NOT_LOGGED_IN") {
                settings.enabled = false;
                await setWatchSettings(settings);
                chrome.tabs.remove(tab.id);
                break;
            }
            if (result && result.postUrn && result.postUrn !== target.lastSeenPostUrn) {
                const recency = result.recencySecondsEstimate || 0;
                if (recency <= 86400) {
                    const scored = await scorePost(result.postText, target, objectives);
                    if (scored.score >= (settings.scoreThreshold || 60)) {
                        if (settings.requireManualApproval || !result.postPermalink) {
                            const opportunities = await getOpportunities();
                            opportunities.push({
                                id: Date.now(),
                                targetId: target.id,
                                postUrn: result.postUrn,
                                postPermalink: result.postPermalink,
                                postText: result.postText,
                                draftComment: scored.draftComment,
                                score: scored.score,
                                status: "pending",
                                createdAt: now
                            });
                            await setOpportunities(opportunities);
                        } else {
                            const postTab = await new Promise(resolve => chrome.tabs.create({ url: result.postPermalink, active: false }, resolve));
                            await new Promise(resolve => setTimeout(resolve, 4000));
                            await chrome.scripting.executeScript({ target: { tabId: postTab.id }, files: ['selectors.js', 'content.js'] });
                            const posted = await new Promise(resolve => {
                                chrome.tabs.sendMessage(postTab.id, { action: "COMMENT_ON_FEED_POST_BY_URN", targetURN: result.postUrn, text: scored.draftComment }, resolve);
                            });
                            chrome.tabs.remove(postTab.id);
                            if (!posted || !posted.success) {
                                const opportunities = await getOpportunities();
                                opportunities.push({
                                    id: Date.now(),
                                    targetId: target.id,
                                    postUrn: result.postUrn,
                                    postPermalink: result.postPermalink,
                                    postText: result.postText,
                                    draftComment: scored.draftComment,
                                    score: scored.score,
                                    status: "pending",
                                    createdAt: now
                                });
                                await setOpportunities(opportunities);
                            } else {
                                const log = await getActionLog();
                                log.dailyActions += 1;
                                await setActionLog(log);
                            }
                        }
                    }
                }
                target.lastSeenPostUrn = result.postUrn;
            }
            await setTargets(targets);
        } catch (e) {
        } finally {
            chrome.tabs.remove(tab.id);
        }
    }
};

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SET_OPENAI_KEY") {
      cachedApiKey = request.apiKey || "";
      cacheLoaded = true;
      chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: cachedApiKey }, () => {
          sendResponse({ success: true });
      });
      return true;
  }
  if (request.action === "TEST_OPENAI") {
      (async () => {
          try {
              const overrideKey = request.apiKey ? request.apiKey.trim() : "";
              const { ok, data, error } = await fetchOpenAI({
                  model: "gpt-4o-mini",
                  messages: [{ role: "user", content: "Test ping." }],
                  temperature: 0
              }, overrideKey);
              if (!ok) throw new Error(error);
              const content = data && data.choices && data.choices[0] && data.choices[0].message
                  ? data.choices[0].message.content
                  : "";
              sendResponse({ success: true, message: content || "OK" });
          } catch (e) {
              sendResponse({ success: false, error: e && e.message ? e.message : "Erreur IA" });
          }
      })();
      return true;
  }
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
      ensureQueueProcessing();
      sendResponse({ success: true });
      return true;
  }
  if (request.action === "ADD_TARGET") {
      (async () => {
          const targets = await getTargets();
          const exists = targets.find(t => t.profileUrl === request.profileUrl);
          if (exists) {
              sendResponse({ success: false, error: "DUPLICATE" });
              return;
          }
          const objectives = await getObjectives();
          const filtered = await filterCandidate(request.headline || "", objectives);
          if (!filtered.relevant) {
              sendResponse({ success: false, error: "NOT_RELEVANT", reason: filtered.reason });
              return;
          }
          targets.push({
              id: Date.now(),
              profileUrl: request.profileUrl,
              fullName: request.fullName || "",
              headline: request.headline || "",
              addedAt: Date.now(),
              lastCheckedAt: null,
              lastSeenPostUrn: "",
              notes: filtered.reason || "",
              status: "active"
          });
          await setTargets(targets);
          sendResponse({ success: true });
      })();
      return true;
  }
  if (request.action === "SCAN_TARGETS_FROM_SEARCH") {
      (async () => {
          const tab = await new Promise(resolve => chrome.tabs.create({ url: request.searchUrl, active: false }, resolve));
          await new Promise(resolve => setTimeout(resolve, 4000));
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selectors.js', 'content.js'] });
          const result = await new Promise(resolve => chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_SEARCH_RESULTS" }, resolve));
          chrome.tabs.remove(tab.id);
          if (!result || !result.success) {
              sendResponse({ success: false, error: result && result.error ? result.error : "SCRAPE_FAILED" });
              return;
          }
          const objectives = await getObjectives();
          const targets = await getTargets();
          for (const candidate of result.candidates) {
              if (targets.find(t => t.profileUrl === candidate.profileUrl)) continue;
              const filtered = await filterCandidate(candidate.headline || "", objectives);
              if (!filtered.relevant) continue;
              targets.push({
                  id: Date.now() + Math.floor(Math.random() * 1000),
                  profileUrl: candidate.profileUrl,
                  fullName: candidate.fullName || "",
                  headline: candidate.headline || "",
                  addedAt: Date.now(),
                  lastCheckedAt: null,
                  lastSeenPostUrn: "",
                  notes: filtered.reason || "",
                  status: "active"
              });
          }
          await setTargets(targets);
          sendResponse({ success: true, count: targets.length });
      })();
      return true;
  }
  if (request.action === "FETCH_TARGETS") {
      (async () => {
          const targets = await getTargets();
          sendResponse({ success: true, targets });
      })();
      return true;
  }
  if (request.action === "FETCH_OPPORTUNITIES") {
      (async () => {
          const opportunities = await getOpportunities();
          sendResponse({ success: true, opportunities });
      })();
      return true;
  }
  if (request.action === "UPDATE_OBJECTIVES") {
      setObjectives(request.objectives || DEFAULT_OBJECTIVES).then(() => sendResponse({ success: true }));
      return true;
  }
  if (request.action === "UPDATE_WATCH_SETTINGS") {
      setWatchSettings(request.settings || DEFAULT_WATCH_SETTINGS).then(() => sendResponse({ success: true }));
      return true;
  }
  if (request.action === "TOGGLE_WATCH") {
      (async () => {
          const settings = await getWatchSettings();
          settings.enabled = !!request.enabled;
          await setWatchSettings(settings);
          if (settings.enabled) {
              chrome.alarms.create(WATCH_ALARM, { periodInMinutes: settings.checkIntervalMinutes || 30 });
          } else {
              chrome.alarms.clear(WATCH_ALARM);
          }
          sendResponse({ success: true });
      })();
      return true;
  }
  if (request.action === "DISMISS_OPPORTUNITY") {
      (async () => {
          const opportunities = await getOpportunities();
          const next = opportunities.filter(o => o.id !== request.id);
          await setOpportunities(next);
          sendResponse({ success: true });
      })();
      return true;
  }
  if (request.action === "PUBLISH_OPPORTUNITY") {
      (async () => {
          const opportunities = await getOpportunities();
          const target = opportunities.find(o => o.id === request.id);
          if (!target || !target.postPermalink) {
              sendResponse({ success: false });
              return;
          }
          const tab = await new Promise(resolve => chrome.tabs.create({ url: target.postPermalink, active: true }, resolve));
          await new Promise(resolve => setTimeout(resolve, 4000));
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selectors.js', 'content.js'] });
          const posted = await new Promise(resolve => {
              chrome.tabs.sendMessage(tab.id, { action: "COMMENT_ON_FEED_POST_BY_URN", targetURN: target.postUrn, text: target.draftComment }, resolve);
          });
          if (posted && posted.success) {
              const next = opportunities.filter(o => o.id !== request.id);
              await setOpportunities(next);
              const log = await getActionLog();
              log.dailyActions += 1;
              await setActionLog(log);
              sendResponse({ success: true });
          } else {
              sendResponse({ success: false });
          }
      })();
      return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
    ensureQueueProcessing();
    getLocal([WATCH_SETTINGS_KEY, OBJECTIVES_KEY, ACTION_LOG_KEY]).then(data => {
        if (!data[WATCH_SETTINGS_KEY]) setWatchSettings(DEFAULT_WATCH_SETTINGS);
        if (!data[OBJECTIVES_KEY]) setObjectives(DEFAULT_OBJECTIVES);
        if (!data[ACTION_LOG_KEY]) setActionLog(DEFAULT_ACTION_LOG);
    });
});

chrome.runtime.onStartup.addListener(() => {
    ensureQueueProcessing();
    getWatchSettings().then(settings => {
        if (settings.enabled) {
            chrome.alarms.create(WATCH_ALARM, { periodInMinutes: settings.checkIntervalMinutes || 30 });
        }
    });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (Object.prototype.hasOwnProperty.call(changes, API_KEY_STORAGE_KEY)) {
        cachedApiKey = changes[API_KEY_STORAGE_KEY].newValue || "";
        cacheLoaded = true;
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === QUEUE_ALARM) {
        processQueue();
    }
    if (alarm.name === WATCH_ALARM) {
        runWatchCycle();
    }
});

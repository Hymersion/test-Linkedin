const API_KEY = "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"; 
const QUEUE_ALARM = "ghostly-post-queue";

const getQueue = () => new Promise(resolve => {
    chrome.storage.local.get(['postQueue'], r => resolve(r.postQueue || []));
});

const setQueue = (queue) => new Promise(resolve => {
    chrome.storage.local.set({ postQueue: queue }, resolve);
});

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
                    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // RADAR
  if (request.action === "ANALYZE_FEED_MANUAL") {
      (async () => {
          const results = [];
          for(let p of request.posts.slice(0, 8)) {
             try {
                 const r = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `CONTEXTE: LinkedIn. POST: "${p.text.substring(0,200)}...". Si pertinent pro, écris une réponse précise et contextualisée (1-2 phrases), évite les phrases génériques. Si non pertinent: SKIP.`}], temperature: 0.6 })
                 });
                 const d = await r.json();
                 let rep = clean(d.choices[0].message.content);
                 if(rep.length > 1) { p.aiReply = rep; results.push(p); }
             } catch(e){ p.aiReply = "Erreur IA"; results.push(p); }
          }
          sendResponse({ success: true, results: results });
      })();
      return true;
  }
  // SCAN POST
  if (request.action === "GENERATE_SAV_REPLY") {
    (async () => {
        try {
            const r = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `Persona: "${request.persona || "Expert"}". Contexte: "${request.postContext.substring(0,150)}...". Commentaire: "${request.text}". Tâche: réponse courte (1-2 phrases), spécifique, sans formules génériques.`}], temperature: 0.5 })
            });
            const d = await r.json();
            sendResponse({ reply: clean(d.choices[0].message.content) });
        } catch (e) { sendResponse({ reply: "Merci !" }); }
    })();
    return true; 
  }
  // EDITEUR
  if (request.action === "GENERATE_DAILY_IDEAS") {
      (async () => {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `3 idées posts LinkedIn.`}], temperature: 0.8 })
        });
        const d = await r.json();
        sendResponse({ success: true, ideas: d.choices[0].message.content });
      })();
      return true;
  }
  if (request.action === "WRITE_FINAL_POST") {
    (async () => {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `IDENTITÉ:${request.persona}. SUJET:"${request.angle}". Rédige un post complet, concret et spécifique.`}], temperature: 0.7 })
        });
        const d = await r.json();
        sendResponse({ success: true, post: d.choices[0].message.content });
    })();
    return true;
  }
  // IDENTITE
  if (request.action === "BUILD_PERSONA") {
      (async () => {
        try {
            const r = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o", messages: [{role: "user", content: `Analyse profil: ${request.profile.headline}. System Prompt court.`}], temperature: 0.7 })
            });
            const d = await r.json();
            sendResponse({ reply: d.choices[0].message.content });
        } catch(e) { sendResponse({ reply: "Expert LinkedIn." }); }
      })();
      return true;
  }
  if (request.action === "QUEUE_UPDATED") {
      scheduleNextPost();
      sendResponse({ success: true });
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

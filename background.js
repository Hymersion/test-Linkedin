const API_KEY = "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"; 
const QUEUE_ALARM = "ghostly-post-queue";

const getQueue = () => new Promise(resolve => {
    chrome.storage.local.get(['postQueue'], r => resolve(r.postQueue || [])); (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/background.js b/background.js
index 2eab3f88ced6a932e14e09d90e32c3b437e85e3f..13f09f50c5779333382694661c344e41f6b0c3a3 100644
--- a/background.js
+++ b/background.js
@@ -1,79 +1,198 @@
-const API_KEY = "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"; 
+const API_KEY = "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";
+const QUEUE_ALARM = "ghostly-post-queue";
+
+const getQueue = () => new Promise(resolve => {
+    chrome.storage.local.get(['postQueue'], r => resolve(r.postQueue || []));
+});
+
+const setQueue = (queue) => new Promise(resolve => {
+    chrome.storage.local.set({ postQueue: queue }, resolve);
+});
+
+const fetchOpenAI = async (payload) => {
+    const r = await fetch("https://api.openai.com/v1/chat/completions", {
+        method: "POST",
+        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
+        body: JSON.stringify(payload)
+    });
+    let data = null;
+    try {
+        data = await r.json();
+    } catch (e) {
+        data = null;
+    }
+    if (!r.ok) {
+        return { ok: false, data, error: `OpenAI ${r.status}` };
+    }
+    return { ok: true, data, error: null };
+};
+
+const scheduleNextPost = async () => {
+    const queue = await getQueue();
+    const next = queue
+        .filter(item => !item.sent && item.timestamp)
+        .sort((a, b) => a.timestamp - b.timestamp)[0];
+
+    if (!next) {
+        chrome.alarms.clear(QUEUE_ALARM);
+        return;
+    }
+
+    const when = Math.max(Date.now() + 2000, next.timestamp);
+    chrome.alarms.create(QUEUE_ALARM, { when });
+};
+
+const openLinkedInAndPost = async (content) => new Promise(resolve => {
+    chrome.tabs.create({ url: "https://www.linkedin.com/feed/", active: false }, tab => {
+        const tabId = tab.id;
+        const onUpdated = async (updatedTabId, info) => {
+            if (updatedTabId === tabId && info.status === "complete") {
+                chrome.tabs.onUpdated.removeListener(onUpdated);
+                try {
+                    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
+                    chrome.tabs.sendMessage(tabId, { action: "WRITE_POST_ON_LINKEDIN", content, autoPost: true }, () => {
+                        resolve(true);
+                        chrome.tabs.remove(tabId);
+                    });
+                } catch (e) {
+                    resolve(false);
+                }
+            }
+        };
+        chrome.tabs.onUpdated.addListener(onUpdated);
+    });
+});
+
+const processQueue = async () => {
+    const queue = await getQueue();
+    const now = Date.now();
+    const nextIndex = queue.findIndex(item => !item.sent && item.timestamp <= now);
+    if (nextIndex === -1) {
+        await scheduleNextPost();
+        return;
+    }
+
+    const item = queue[nextIndex];
+    const success = await openLinkedInAndPost(item.content);
+    queue[nextIndex] = { ...item, sent: success };
+    await setQueue(queue);
+    await scheduleNextPost();
+};
 
 function clean(text) {
     if (!text) return "";
     return text.replace(/^(Score|Note|Analyse|Evaluation).*?$/gim, "").replace(/\d+\/\d+/g, "").replace(/"/g, "").trim();
 }
 
 chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
   // RADAR
   if (request.action === "ANALYZE_FEED_MANUAL") {
       (async () => {
           const results = [];
+          let hadError = false;
           for(let p of request.posts.slice(0, 8)) {
              try {
-                 const r = await fetch("https://api.openai.com/v1/chat/completions", {
-                    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-                    body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `CONTEXTE: LinkedIn. POST: "${p.text.substring(0,200)}...". Est-ce pertinent pro ? OUI: réponse courte (1 phrase). NON: SKIP.`}], temperature: 0.6 })
+                 const { ok, data, error } = await fetchOpenAI({
+                    model: "gpt-4o",
+                    messages: [{role:"user", content: `CONTEXTE: LinkedIn. POST: "${p.text.substring(0,200)}...". Si pertinent pro, écris une réponse précise et contextualisée (1-2 phrases), évite les phrases génériques. Si non pertinent: SKIP.`}],
+                    temperature: 0.6
                  });
-                 const d = await r.json();
-                 let rep = clean(d.choices[0].message.content);
+                 if (!ok) throw new Error(error);
+                 const content = data && data.choices && data.choices[0] && data.choices[0].message
+                     ? data.choices[0].message.content
+                     : "";
+                 let rep = clean(content);
                  if(rep.length > 1) { p.aiReply = rep; results.push(p); }
-             } catch(e){ p.aiReply = "Erreur IA"; results.push(p); }
+             } catch(e){ p.aiReply = "Erreur IA"; results.push(p); hadError = true; }
           }
-          sendResponse({ success: true, results: results });
+          sendResponse({ success: true, results: results, error: hadError ? "Erreur IA" : null });
       })();
       return true;
   }
   // SCAN POST
   if (request.action === "GENERATE_SAV_REPLY") {
     (async () => {
         try {
-            const r = await fetch("https://api.openai.com/v1/chat/completions", {
-                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-                body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `Contexte: "${request.postContext.substring(0,150)}...". Com: "${request.text}". Tâche: Réponse courte, sans note.`}], temperature: 0.5 })
+            const { ok, data, error } = await fetchOpenAI({
+                model: "gpt-4o",
+                messages: [{role:"user", content: `Persona: "${request.persona || "Expert"}". Contexte: "${request.postContext.substring(0,150)}...". Commentaire: "${request.text}". Tâche: réponse courte (1-2 phrases), spécifique, sans formules génériques.`}],
+                temperature: 0.5
             });
-            const d = await r.json();
-            sendResponse({ reply: clean(d.choices[0].message.content) });
-        } catch (e) { sendResponse({ reply: "Merci !" }); }
+            if (!ok) throw new Error(error);
+            sendResponse({ reply: clean(data.choices[0].message.content) });
+        } catch (e) { sendResponse({ reply: "Merci !", error: "Erreur IA" }); }
     })();
     return true; 
   }
   // EDITEUR
   if (request.action === "GENERATE_DAILY_IDEAS") {
       (async () => {
-        const r = await fetch("https://api.openai.com/v1/chat/completions", {
-            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-            body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `3 idées posts LinkedIn.`}], temperature: 0.8 })
-        });
-        const d = await r.json();
-        sendResponse({ success: true, ideas: d.choices[0].message.content });
+        try {
+            const { ok, data, error } = await fetchOpenAI({
+                model: "gpt-4o",
+                messages: [{role:"user", content: `3 idées posts LinkedIn.`}],
+                temperature: 0.8
+            });
+            if (!ok) throw new Error(error);
+            const ideas = data && data.choices && data.choices[0] && data.choices[0].message
+                ? data.choices[0].message.content
+                : "";
+            if (!ideas) throw new Error("EMPTY_IDEAS");
+            sendResponse({ success: true, ideas });
+        } catch (e) {
+            sendResponse({ success: false, ideas: "Idée 1|||Sujet simple###Idée 2|||Conseil pratique###Idée 3|||Retour d'expérience", error: "Erreur IA" });
+        }
       })();
       return true;
   }
   if (request.action === "WRITE_FINAL_POST") {
     (async () => {
-        const r = await fetch("https://api.openai.com/v1/chat/completions", {
-            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-            body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `IDENTITÉ:${request.persona}. SUJET:"${request.angle}". Rédige un post complet.`}], temperature: 0.7 })
-        });
-        const d = await r.json();
-        sendResponse({ success: true, post: d.choices[0].message.content });
+        try {
+            const { ok, data, error } = await fetchOpenAI({
+                model: "gpt-4o",
+                messages: [{role:"user", content: `IDENTITÉ:${request.persona}. SUJET:"${request.angle}". Rédige un post complet, concret et spécifique.`}],
+                temperature: 0.7
+            });
+            if (!ok) throw new Error(error);
+            sendResponse({ success: true, post: data.choices[0].message.content });
+        } catch (e) {
+            sendResponse({ success: false, post: "", error: "Erreur IA" });
+        }
     })();
     return true;
   }
   // IDENTITE
   if (request.action === "BUILD_PERSONA") {
       (async () => {
         try {
-            const r = await fetch("https://api.openai.com/v1/chat/completions", {
-                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-                body: JSON.stringify({ model: "gpt-4o", messages: [{role: "user", content: `Analyse profil: ${request.profile.headline}. System Prompt court.`}], temperature: 0.7 })
+            const { ok, data, error } = await fetchOpenAI({
+                model: "gpt-4o",
+                messages: [{role: "user", content: `Analyse profil: ${request.profile.headline}. System Prompt court.`}],
+                temperature: 0.7
             });
-            const d = await r.json();
-            sendResponse({ reply: d.choices[0].message.content });
-        } catch(e) { sendResponse({ reply: "Expert LinkedIn." }); }
+            if (!ok) throw new Error(error);
+            sendResponse({ reply: data.choices[0].message.content });
+        } catch(e) { sendResponse({ reply: "Expert LinkedIn.", error: "Erreur IA" }); }
       })();
       return true;
   }
-});
\ No newline at end of file
+  if (request.action === "QUEUE_UPDATED") {
+      scheduleNextPost();
+      sendResponse({ success: true });
+      return true;
+  }
+});
+
+chrome.runtime.onInstalled.addListener(() => {
+    scheduleNextPost();
+});
+
+chrome.runtime.onStartup.addListener(() => {
+    scheduleNextPost();
+});
+
+chrome.alarms.onAlarm.addListener((alarm) => {
+    if (alarm.name === QUEUE_ALARM) {
+        processQueue();
+    }
+});
diff --git a/content.js b/content.js
index b3d577ad911bf0fc79e18f7436111358a178cd55..abf5b304ddb8d1cd365239236b330f51b0ad77a1 100644
--- a/content.js
+++ b/content.js
@@ -6,50 +6,67 @@ if (!window.ghostlyLoaded) {
         console.log(`[GHOSTLY] ${msg}`);
         let box = document.getElementById('g-log');
         if(!box) { box = document.createElement('div'); box.id='g-log'; box.style.cssText="position:fixed;bottom:10px;left:10px;background:black;color:#0f0;padding:5px;z-index:99999;font-size:11px;font-family:monospace;max-width:350px;"; document.body.appendChild(box); }
         box.innerText = `> ${msg}`;
     };
 
     // --- OUTILS ---
     const findByText = (tag, texts, ctx = document) => {
         const els = ctx.querySelectorAll(tag);
         for(let el of els) {
             const txt = (el.innerText || "").toLowerCase();
             for(let t of texts) if(txt.includes(t)) return el;
         }
         return null;
     };
 
     const forceClick = (btn) => {
         if(!btn) return false;
         btn.disabled = false;
         btn.removeAttribute('disabled');
         btn.classList.remove('artdeco-button--disabled');
         btn.click();
         return true;
     };
 
+    const findSubmitButton = (container) => {
+        if (!container) return null;
+        return container.querySelector('.artdeco-button--primary') ||
+               container.querySelector('button[type="submit"]') ||
+               container.querySelector('button[aria-label*="Publier"]') ||
+               container.querySelector('button[aria-label*="Post"]');
+    };
+
+    const waitForElement = async (selector, ctx = document, attempts = 12, delay = 400) => {
+        for (let i = 0; i < attempts; i++) {
+            const el = ctx.querySelector(selector);
+            if (el) return el;
+            await new Promise(r => setTimeout(r, delay));
+        }
+        return null;
+    };
+
     const securePaste = async (editor, text) => {
         editor.focus();
         document.execCommand('selectAll', false, null);
         document.execCommand('delete', false, null);
         try {
             const dt = new DataTransfer(); dt.setData('text/plain', text);
             editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
         } catch (e) {}
         
         if (editor.innerText.trim().length === 0) document.execCommand('insertText', false, text);
         
         // Simulation vitale pour dégriser le bouton
         editor.dispatchEvent(new Event('input', {bubbles:true}));
         await new Promise(r => setTimeout(r, 800));
     };
 
     const normalize = (str) => str.replace(/\s+/g, ' ').trim().toLowerCase();
 
     chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
         
         // --- 1. SCAN FEED (RADAR ATOMIQUE) ---
         if (request.action === "SCAN_FEED") {
             (async () => {
                 log("Scan Radar Atomique...");
                 const start = Date.now();
@@ -99,70 +116,77 @@ if (!window.ghostlyLoaded) {
                 log(`${posts.length} posts valides trouvés.`);
                 sendResponse({ success: true, posts: posts });
             })();
             return true;
         }
 
         // --- 2. PUBLIER SUR RADAR (Ciblage Local) ---
         if (request.action === "COMMENT_ON_FEED_POST_BY_URN") {
              (async () => {
                 log("Traitement post Radar...");
                 const el = document.querySelector(`div[data-urn="${request.targetURN}"]`);
                 
                 if(el) {
                     el.scrollIntoView({block:"center"}); 
                     await new Promise(r => setTimeout(r, 1000));
                     
                     // 1. Ouvrir
                     let btn = el.querySelector('.comment-button');
                     if(!btn) {
                         const txtBtn = findByText('span', ['comment', 'omment'], el);
                         if(txtBtn) btn = txtBtn.closest('button');
                     }
                     
                     if(btn) { 
                         btn.click(); 
-                        await new Promise(r => setTimeout(r, 1500)); 
+                        await new Promise(r => setTimeout(r, 1200)); 
                         
                         // 2. Ecrire
-                        const ed = el.querySelector('[contenteditable="true"]') || el.querySelector('.ql-editor');
+                        const ed = el.querySelector('[contenteditable="true"]') ||
+                                   el.querySelector('.ql-editor') ||
+                                   await waitForElement('[contenteditable="true"]', el);
                         if(ed){ 
                             await securePaste(ed, request.text);
                             
                             // 3. Publier (Recherche Locale)
                             // On cherche le bouton DANS le conteneur du commentaire
-                            const container = ed.closest('form') || ed.closest('.comments-comment-box');
+                            const container = ed.closest('form') || ed.closest('.comments-comment-box') || el;
                             
                             if (container) {
-                                let submit = container.querySelector('.artdeco-button--primary') || 
-                                             container.querySelector('button[type="submit"]');
+                                let submit = findSubmitButton(container);
                                 
                                 if (!submit) { // Fallback texte
                                     const txtSubmit = findByText('span', ['publier', 'post'], container);
                                     if(txtSubmit) submit = txtSubmit.closest('button');
                                 }
 
+                                if(!submit) submit = findSubmitButton(document);
+                                if(!submit) {
+                                    const globalTxt = findByText('span', ['publier', 'post'], document);
+                                    if (globalTxt) submit = globalTxt.closest('button');
+                                }
+
                                 if(submit) {
                                     log("Radar : Envoi !");
                                     forceClick(submit);
                                     sendResponse({success:true});
                                     return;
                                 } else { log("Radar : Bouton Publier introuvable (Zone grise ?)"); }
                             }
                         } else { log("Radar : Éditeur introuvable."); }
                     } else { log("Radar : Bouton Commenter introuvable."); }
                 } else { log("Radar : Post introuvable (URN perdu)."); }
                 
                 sendResponse({success:false});
             })();
             return true; 
         }
 
         // --- 3. SCAN POST UNIQUE (BRUTE FORCE) ---
         if (request.action === "START_SCAN") {
             (async () => {
                 log("Scan Coms...");
                 window.scrollTo(0, document.body.scrollHeight); 
                 await new Promise(r => setTimeout(r, 1500));
                 
                 try { 
                     const btns = document.querySelectorAll('button');
@@ -193,59 +217,66 @@ if (!window.ghostlyLoaded) {
                 let ctx = ""; try { ctx = document.querySelector('.feed-shared-update-v2__description').innerText; } catch(e){}
                 sendResponse({ success: true, count: data.length, data: data, postContext: ctx });
             })();
             return true;
         }
 
         // --- 4. REPONDRE (HYBRIDE) ---
         if (request.action === "REPLY_BY_HYBRID") {
             (async () => {
                 const allComments = document.querySelectorAll('article');
                 let targetEl = null;
                 const snippet = normalize(request.matchText).substring(0, 40); 
                 for(let c of allComments) {
                     if(normalize(c.innerText).includes(snippet)) { targetEl = c; break; }
                 }
                 if(!targetEl && allComments[request.targetIndex]) targetEl = allComments[request.targetIndex];
 
                 if (targetEl) {
                     targetEl.scrollIntoView({block:"center"}); 
                     let btnSpan = findByText('span', ['répondre', 'reply'], targetEl);
                     let btn = btnSpan ? btnSpan.closest('button') : null;
                     if(!btn) btn = targetEl.querySelector('.comments-comment-action-bar__reply-action-button');
 
                     if (btn) {
                         btn.click(); await new Promise(r => setTimeout(r, 1500));
-                        const ed = targetEl.querySelector('.ql-editor') || targetEl.querySelector('[contenteditable="true"]');
+                        const ed = targetEl.querySelector('.ql-editor') ||
+                                   targetEl.querySelector('[contenteditable="true"]') ||
+                                   await waitForElement('[contenteditable="true"]', targetEl);
                         if (ed) {
                             await securePaste(ed, request.replyText);
-                            const form = ed.closest('form');
-                            let submit = form ? (form.querySelector('.artdeco-button--primary') || form.querySelector('button[type="submit"]')) : null;
+                            const form = ed.closest('form') || targetEl;
+                            let submit = form ? findSubmitButton(form) : null;
+                            if(!submit) {
+                                const txtSubmit = findByText('span', ['publier', 'post'], form || targetEl);
+                                if(txtSubmit) submit = txtSubmit.closest('button');
+                            }
+                            if(!submit) submit = findSubmitButton(document);
                             if (submit) { forceClick(submit); sendResponse({success:true}); return; }
-                        }
                     }
                 }
+                }
                 sendResponse({success:false});
             })();
             return true;
         }
 
         // --- 5. EDITEUR ---
         if (request.action === "WRITE_POST_ON_LINKEDIN") {
             (async () => {
                 let trigger = findByText('span', ['commencer un post', 'start a post', 'créer']);
                 if (trigger) trigger = trigger.closest('button') || trigger.closest('div[role="button"]');
                 if (!trigger) trigger = document.querySelector('button.share-box-feed-entry__trigger');
 
                 if (trigger) {
                     trigger.click(); await new Promise(r => setTimeout(r, 3000));
                     const ed = document.querySelector('.ql-editor') || document.querySelector('[contenteditable="true"]');
                     if (ed) {
                         await securePaste(ed, request.content);
                         if (request.autoPost) {
                             const modal = document.querySelector('.share-box-modal') || document.body;
                             let pubBtn = modal.querySelector('.share-actions__primary-action') || modal.querySelector('.artdeco-button--primary');
                             if (pubBtn) forceClick(pubBtn);
                         }
                     }
                 }
                 sendResponse({success:true});
@@ -253,57 +284,57 @@ if (!window.ghostlyLoaded) {
             return true;
         }
         
         if (request.action === "SCRAPE_MY_PROFILE") {
             (async () => {
                 const getText = (el) => (el && el.innerText ? el.innerText.trim() : "");
                 const pick = (...selectors) => {
                     for (const selector of selectors) {
                         const el = document.querySelector(selector);
                         if (el && getText(el)) return el;
                     }
                     return null;
                 };
                 const findSectionByHeading = (texts) => {
                     const sections = document.querySelectorAll('section');
                     for (const section of sections) {
                         const heading = section.querySelector('h2, h3');
                         if (!heading) continue;
                         const txt = getText(heading).toLowerCase();
                         if (texts.some(t => txt.includes(t))) return section;
                     }
                     return null;
                 };
 
                 try {
-                    const name = getText(pick('h1'));
-                    const headline = getText(pick('.text-body-medium.break-words', 'div.ph5 .text-body-medium', '.pv-text-details__left-panel .text-body-medium'));
-                    const location = getText(pick('.text-body-small.inline.t-black--light.break-words', '.pv-text-details__left-panel .text-body-small'));
+                    const name = getText(pick('h1.text-heading-xlarge', 'h1'));
+                    const headline = getText(pick('.text-body-medium.break-words', '.pv-text-details__left-panel .text-body-medium', '.text-body-medium.t-black'));
+                    const location = getText(pick('.text-body-small.inline.t-black--light.break-words', '.pv-text-details__left-panel .text-body-small', '.text-body-small.inline'));
 
-                    const aboutSection = findSectionByHeading(['à propos', 'about']);
+                    const aboutSection = findSectionByHeading(['à propos', 'about']) || document.querySelector('section[data-section="summary"]');
                     const about = aboutSection
                         ? getText(aboutSection.querySelector('.pv-shared-text-with-see-more, .inline-show-more-text, span[aria-hidden="true"]'))
                         : "";
 
-                    const expSection = findSectionByHeading(['expérience', 'experience']);
+                    const expSection = findSectionByHeading(['expérience', 'experience']) || document.querySelector('section[data-section="experience"]');
                     const firstRole = expSection
                         ? getText(expSection.querySelector('.pvs-entity__path-node, .pvs-entity__primary-title, .t-14.t-normal'))
                         : "";
 
                     sendResponse({
                         success: true,
                         data: {
                             name,
                             headline,
                             location,
                             about,
                             experience: firstRolediff --git a/background.js b/background.js
index 2eab3f88ced6a932e14e09d90e32c3b437e85e3f..f728a419bb2a065fd2de6a8eb17a7690168331e8 100644
--- a/background.js
+++ b/background.js
@@ -1,79 +1,198 @@
-const API_KEY = "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"; 
+// const API_KEY = "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";
+const QUEUE_ALARM = "ghostly-post-queue";
+
+const getQueue = () => new Promise(resolve => {
+    chrome.storage.local.get(['postQueue'], r => resolve(r.postQueue || []));
+});
+
+const setQueue = (queue) => new Promise(resolve => {
+    chrome.storage.local.set({ postQueue: queue }, resolve);
+});
+
+const fetchOpenAI = async (payload) => {
+    const r = await fetch("https://api.openai.com/v1/chat/completions", {
+        method: "POST",
+        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
+        body: JSON.stringify(payload)
+    });
+    let data = null;
+    try {
+        data = await r.json();
+    } catch (e) {
+        data = null;
+    }
+    if (!r.ok) {
+        return { ok: false, data, error: `OpenAI ${r.status}` };
+    }
+    return { ok: true, data, error: null };
+};
+
+const scheduleNextPost = async () => {
+    const queue = await getQueue();
+    const next = queue
+        .filter(item => !item.sent && item.timestamp)
+        .sort((a, b) => a.timestamp - b.timestamp)[0];
+
+    if (!next) {
+        chrome.alarms.clear(QUEUE_ALARM);
+        return;
+    }
+
+    const when = Math.max(Date.now() + 2000, next.timestamp);
+    chrome.alarms.create(QUEUE_ALARM, { when });
+};
+
+const openLinkedInAndPost = async (content) => new Promise(resolve => {
+    chrome.tabs.create({ url: "https://www.linkedin.com/feed/", active: false }, tab => {
+        const tabId = tab.id;
+        const onUpdated = async (updatedTabId, info) => {
+            if (updatedTabId === tabId && info.status === "complete") {
+                chrome.tabs.onUpdated.removeListener(onUpdated);
+                try {
+                    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
+                    chrome.tabs.sendMessage(tabId, { action: "WRITE_POST_ON_LINKEDIN", content, autoPost: true }, () => {
+                        resolve(true);
+                        chrome.tabs.remove(tabId);
+                    });
+                } catch (e) {
+                    resolve(false);
+                }
+            }
+        };
+        chrome.tabs.onUpdated.addListener(onUpdated);
+    });
+});
+
+const processQueue = async () => {
+    const queue = await getQueue();
+    const now = Date.now();
+    const nextIndex = queue.findIndex(item => !item.sent && item.timestamp <= now);
+    if (nextIndex === -1) {
+        await scheduleNextPost();
+        return;
+    }
+
+    const item = queue[nextIndex];
+    const success = await openLinkedInAndPost(item.content);
+    queue[nextIndex] = { ...item, sent: success };
+    await setQueue(queue);
+    await scheduleNextPost();
+};
 
 function clean(text) {
     if (!text) return "";
     return text.replace(/^(Score|Note|Analyse|Evaluation).*?$/gim, "").replace(/\d+\/\d+/g, "").replace(/"/g, "").trim();
 }
 
 chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
   // RADAR
   if (request.action === "ANALYZE_FEED_MANUAL") {
       (async () => {
           const results = [];
+          let hadError = false;
           for(let p of request.posts.slice(0, 8)) {
              try {
-                 const r = await fetch("https://api.openai.com/v1/chat/completions", {
-                    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-                    body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `CONTEXTE: LinkedIn. POST: "${p.text.substring(0,200)}...". Est-ce pertinent pro ? OUI: réponse courte (1 phrase). NON: SKIP.`}], temperature: 0.6 })
+                 const { ok, data, error } = await fetchOpenAI({
+                    model: "gpt-4o",
+                    messages: [{role:"user", content: `CONTEXTE: LinkedIn. POST: "${p.text.substring(0,200)}...". Si pertinent pro, écris une réponse précise et contextualisée (1-2 phrases), évite les phrases génériques. Si non pertinent: SKIP.`}],
+                    temperature: 0.6
                  });
-                 const d = await r.json();
-                 let rep = clean(d.choices[0].message.content);
+                 if (!ok) throw new Error(error);
+                 const content = data && data.choices && data.choices[0] && data.choices[0].message
+                     ? data.choices[0].message.content
+                     : "";
+                 let rep = clean(content);
                  if(rep.length > 1) { p.aiReply = rep; results.push(p); }
-             } catch(e){ p.aiReply = "Erreur IA"; results.push(p); }
+             } catch(e){ p.aiReply = "Erreur IA"; results.push(p); hadError = true; }
           }
-          sendResponse({ success: true, results: results });
+          sendResponse({ success: true, results: results, error: hadError ? "Erreur IA" : null });
       })();
       return true;
   }
   // SCAN POST
   if (request.action === "GENERATE_SAV_REPLY") {
     (async () => {
         try {
-            const r = await fetch("https://api.openai.com/v1/chat/completions", {
-                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-                body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `Contexte: "${request.postContext.substring(0,150)}...". Com: "${request.text}". Tâche: Réponse courte, sans note.`}], temperature: 0.5 })
+            const { ok, data, error } = await fetchOpenAI({
+                model: "gpt-4o",
+                messages: [{role:"user", content: `Persona: "${request.persona || "Expert"}". Contexte: "${request.postContext.substring(0,150)}...". Commentaire: "${request.text}". Tâche: réponse courte (1-2 phrases), spécifique, sans formules génériques.`}],
+                temperature: 0.5
             });
-            const d = await r.json();
-            sendResponse({ reply: clean(d.choices[0].message.content) });
-        } catch (e) { sendResponse({ reply: "Merci !" }); }
+            if (!ok) throw new Error(error);
+            sendResponse({ reply: clean(data.choices[0].message.content) });
+        } catch (e) { sendResponse({ reply: "Merci !", error: "Erreur IA" }); }
     })();
     return true; 
   }
   // EDITEUR
   if (request.action === "GENERATE_DAILY_IDEAS") {
       (async () => {
-        const r = await fetch("https://api.openai.com/v1/chat/completions", {
-            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-            body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `3 idées posts LinkedIn.`}], temperature: 0.8 })
-        });
-        const d = await r.json();
-        sendResponse({ success: true, ideas: d.choices[0].message.content });
+        try {
+            const { ok, data, error } = await fetchOpenAI({
+                model: "gpt-4o",
+                messages: [{role:"user", content: `3 idées posts LinkedIn.`}],
+                temperature: 0.8
+            });
+            if (!ok) throw new Error(error);
+            const ideas = data && data.choices && data.choices[0] && data.choices[0].message
+                ? data.choices[0].message.content
+                : "";
+            if (!ideas) throw new Error("EMPTY_IDEAS");
+            sendResponse({ success: true, ideas });
+        } catch (e) {
+            sendResponse({ success: false, ideas: "Idée 1|||Sujet simple###Idée 2|||Conseil pratique###Idée 3|||Retour d'expérience", error: "Erreur IA" });
+        }
       })();
       return true;
   }
   if (request.action === "WRITE_FINAL_POST") {
     (async () => {
-        const r = await fetch("https://api.openai.com/v1/chat/completions", {
-            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-            body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `IDENTITÉ:${request.persona}. SUJET:"${request.angle}". Rédige un post complet.`}], temperature: 0.7 })
-        });
-        const d = await r.json();
-        sendResponse({ success: true, post: d.choices[0].message.content });
+        try {
+            const { ok, data, error } = await fetchOpenAI({
+                model: "gpt-4o",
+                messages: [{role:"user", content: `IDENTITÉ:${request.persona}. SUJET:"${request.angle}". Rédige un post complet, concret et spécifique.`}],
+                temperature: 0.7
+            });
+            if (!ok) throw new Error(error);
+            sendResponse({ success: true, post: data.choices[0].message.content });
+        } catch (e) {
+            sendResponse({ success: false, post: "", error: "Erreur IA" });
+        }
     })();
     return true;
   }
   // IDENTITE
   if (request.action === "BUILD_PERSONA") {
       (async () => {
         try {
-            const r = await fetch("https://api.openai.com/v1/chat/completions", {
-                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
-                body: JSON.stringify({ model: "gpt-4o", messages: [{role: "user", content: `Analyse profil: ${request.profile.headline}. System Prompt court.`}], temperature: 0.7 })
+            const { ok, data, error } = await fetchOpenAI({
+                model: "gpt-4o",
+                messages: [{role: "user", content: `Analyse profil: ${request.profile.headline}. System Prompt court.`}],
+                temperature: 0.7
             });
-            const d = await r.json();
-            sendResponse({ reply: d.choices[0].message.content });
-        } catch(e) { sendResponse({ reply: "Expert LinkedIn." }); }
+            if (!ok) throw new Error(error);
+            sendResponse({ reply: data.choices[0].message.content });
+        } catch(e) { sendResponse({ reply: "Expert LinkedIn.", error: "Erreur IA" }); }
       })();
       return true;
   }
-});
\ No newline at end of file
+  if (request.action === "QUEUE_UPDATED") {
+      scheduleNextPost();
+      sendResponse({ success: true });
+      return true;
+  }
+});
+
+chrome.runtime.onInstalled.addListener(() => {
+    scheduleNextPost();
+});
+
+chrome.runtime.onStartup.addListener(() => {
+    scheduleNextPost();
+});
+
+chrome.alarms.onAlarm.addListener((alarm) => {
+    if (alarm.name === QUEUE_ALARM) {
+        processQueue();
+    }
+});
diff --git a/content.js b/content.js
index b3d577ad911bf0fc79e18f7436111358a178cd55..abf5b304ddb8d1cd365239236b330f51b0ad77a1 100644
--- a/content.js
+++ b/content.js
@@ -6,50 +6,67 @@ if (!window.ghostlyLoaded) {
         console.log(`[GHOSTLY] ${msg}`);
         let box = document.getElementById('g-log');
         if(!box) { box = document.createElement('div'); box.id='g-log'; box.style.cssText="position:fixed;bottom:10px;left:10px;background:black;color:#0f0;padding:5px;z-index:99999;font-size:11px;font-family:monospace;max-width:350px;"; document.body.appendChild(box); }
         box.innerText = `> ${msg}`;
     };
 
     // --- OUTILS ---
     const findByText = (tag, texts, ctx = document) => {
         const els = ctx.querySelectorAll(tag);
         for(let el of els) {
             const txt = (el.innerText || "").toLowerCase();
             for(let t of texts) if(txt.includes(t)) return el;
         }
         return null;
     };
 
     const forceClick = (btn) => {
         if(!btn) return false;
         btn.disabled = false;
         btn.removeAttribute('disabled');
         btn.classList.remove('artdeco-button--disabled');
         btn.click();
         return true;
     };
 
+    const findSubmitButton = (container) => {
+        if (!container) return null;
+        return container.querySelector('.artdeco-button--primary') ||
+               container.querySelector('button[type="submit"]') ||
+               container.querySelector('button[aria-label*="Publier"]') ||
+               container.querySelector('button[aria-label*="Post"]');
+    };
+
+    const waitForElement = async (selector, ctx = document, attempts = 12, delay = 400) => {
+        for (let i = 0; i < attempts; i++) {
+            const el = ctx.querySelector(selector);
+            if (el) return el;
+            await new Promise(r => setTimeout(r, delay));
+        }
+        return null;
+    };
+
     const securePaste = async (editor, text) => {
         editor.focus();
         document.execCommand('selectAll', false, null);
         document.execCommand('delete', false, null);
         try {
             const dt = new DataTransfer(); dt.setData('text/plain', text);
             editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
         } catch (e) {}
         
         if (editor.innerText.trim().length === 0) document.execCommand('insertText', false, text);
         
         // Simulation vitale pour dégriser le bouton
         editor.dispatchEvent(new Event('input', {bubbles:true}));
         await new Promise(r => setTimeout(r, 800));
     };
 
     const normalize = (str) => str.replace(/\s+/g, ' ').trim().toLowerCase();
 
     chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
         
         // --- 1. SCAN FEED (RADAR ATOMIQUE) ---
         if (request.action === "SCAN_FEED") {
             (async () => {
                 log("Scan Radar Atomique...");
                 const start = Date.now();
@@ -99,70 +116,77 @@ if (!window.ghostlyLoaded) {
                 log(`${posts.length} posts valides trouvés.`);
                 sendResponse({ success: true, posts: posts });
             })();
             return true;
         }
 
         // --- 2. PUBLIER SUR RADAR (Ciblage Local) ---
         if (request.action === "COMMENT_ON_FEED_POST_BY_URN") {
              (async () => {
                 log("Traitement post Radar...");
                 const el = document.querySelector(`div[data-urn="${request.targetURN}"]`);
                 
                 if(el) {
                     el.scrollIntoView({block:"center"}); 
                     await new Promise(r => setTimeout(r, 1000));
                     
                     // 1. Ouvrir
                     let btn = el.querySelector('.comment-button');
                     if(!btn) {
                         const txtBtn = findByText('span', ['comment', 'omment'], el);
                         if(txtBtn) btn = txtBtn.closest('button');
                     }
                     
                     if(btn) { 
                         btn.click(); 
-                        await new Promise(r => setTimeout(r, 1500)); 
+                        await new Promise(r => setTimeout(r, 1200)); 
                         
                         // 2. Ecrire
-                        const ed = el.querySelector('[contenteditable="true"]') || el.querySelector('.ql-editor');
+                        const ed = el.querySelector('[contenteditable="true"]') ||
+                                   el.querySelector('.ql-editor') ||
+                                   await waitForElement('[contenteditable="true"]', el);
                         if(ed){ 
                             await securePaste(ed, request.text);
                             
                             // 3. Publier (Recherche Locale)
                             // On cherche le bouton DANS le conteneur du commentaire
-                            const container = ed.closest('form') || ed.closest('.comments-comment-box');
+                            const container = ed.closest('form') || ed.closest('.comments-comment-box') || el;
                             
                             if (container) {
-                                let submit = container.querySelector('.artdeco-button--primary') || 
-                                             container.querySelector('button[type="submit"]');
+                                let submit = findSubmitButton(container);
                                 
                                 if (!submit) { // Fallback texte
                                     const txtSubmit = findByText('span', ['publier', 'post'], container);
                                     if(txtSubmit) submit = txtSubmit.closest('button');
                                 }
 
+                                if(!submit) submit = findSubmitButton(document);
+                                if(!submit) {
+                                    const globalTxt = findByText('span', ['publier', 'post'], document);
+                                    if (globalTxt) submit = globalTxt.closest('button');
+                                }
+
                                 if(submit) {
                                     log("Radar : Envoi !");
                                     forceClick(submit);
                                     sendResponse({success:true});
                                     return;
                                 } else { log("Radar : Bouton Publier introuvable (Zone grise ?)"); }
                             }
                         } else { log("Radar : Éditeur introuvable."); }
                     } else { log("Radar : Bouton Commenter introuvable."); }
                 } else { log("Radar : Post introuvable (URN perdu)."); }
                 
                 sendResponse({success:false});
             })();
             return true; 
         }
 
         // --- 3. SCAN POST UNIQUE (BRUTE FORCE) ---
         if (request.action === "START_SCAN") {
             (async () => {
                 log("Scan Coms...");
                 window.scrollTo(0, document.body.scrollHeight); 
                 await new Promise(r => setTimeout(r, 1500));
                 
                 try { 
                     const btns = document.querySelectorAll('button');
@@ -193,59 +217,66 @@ if (!window.ghostlyLoaded) {
                 let ctx = ""; try { ctx = document.querySelector('.feed-shared-update-v2__description').innerText; } catch(e){}
                 sendResponse({ success: true, count: data.length, data: data, postContext: ctx });
             })();
             return true;
         }
 
         // --- 4. REPONDRE (HYBRIDE) ---
         if (request.action === "REPLY_BY_HYBRID") {
             (async () => {
                 const allComments = document.querySelectorAll('article');
                 let targetEl = null;
                 const snippet = normalize(request.matchText).substring(0, 40); 
                 for(let c of allComments) {
                     if(normalize(c.innerText).includes(snippet)) { targetEl = c; break; }
                 }
                 if(!targetEl && allComments[request.targetIndex]) targetEl = allComments[request.targetIndex];
 
                 if (targetEl) {
                     targetEl.scrollIntoView({block:"center"}); 
                     let btnSpan = findByText('span', ['répondre', 'reply'], targetEl);
                     let btn = btnSpan ? btnSpan.closest('button') : null;
                     if(!btn) btn = targetEl.querySelector('.comments-comment-action-bar__reply-action-button');
 
                     if (btn) {
                         btn.click(); await new Promise(r => setTimeout(r, 1500));
-                        const ed = targetEl.querySelector('.ql-editor') || targetEl.querySelector('[contenteditable="true"]');
+                        const ed = targetEl.querySelector('.ql-editor') ||
+                                   targetEl.querySelector('[contenteditable="true"]') ||
+                                   await waitForElement('[contenteditable="true"]', targetEl);
                         if (ed) {
                             await securePaste(ed, request.replyText);
-                            const form = ed.closest('form');
-                            let submit = form ? (form.querySelector('.artdeco-button--primary') || form.querySelector('button[type="submit"]')) : null;
+                            const form = ed.closest('form') || targetEl;
+                            let submit = form ? findSubmitButton(form) : null;
+                            if(!submit) {
+                                const txtSubmit = findByText('span', ['publier', 'post'], form || targetEl);
+                                if(txtSubmit) submit = txtSubmit.closest('button');
+                            }
+                            if(!submit) submit = findSubmitButton(document);
                             if (submit) { forceClick(submit); sendResponse({success:true}); return; }
-                        }
                     }
                 }
+                }
                 sendResponse({success:false});
             })();
             return true;
         }
 
         // --- 5. EDITEUR ---
         if (request.action === "WRITE_POST_ON_LINKEDIN") {
             (async () => {
                 let trigger = findByText('span', ['commencer un post', 'start a post', 'créer']);
                 if (trigger) trigger = trigger.closest('button') || trigger.closest('div[role="button"]');
                 if (!trigger) trigger = document.querySelector('button.share-box-feed-entry__trigger');
 
                 if (trigger) {
                     trigger.click(); await new Promise(r => setTimeout(r, 3000));
                     const ed = document.querySelector('.ql-editor') || document.querySelector('[contenteditable="true"]');
                     if (ed) {
                         await securePaste(ed, request.content);
                         if (request.autoPost) {
                             const modal = document.querySelector('.share-box-modal') || document.body;
                             let pubBtn = modal.querySelector('.share-actions__primary-action') || modal.querySelector('.artdeco-button--primary');
                             if (pubBtn) forceClick(pubBtn);
                         }
                     }
                 }
                 sendResponse({success:true});
@@ -253,57 +284,57 @@ if (!window.ghostlyLoaded) {
             return true;
         }
         
         if (request.action === "SCRAPE_MY_PROFILE") {
             (async () => {
                 const getText = (el) => (el && el.innerText ? el.innerText.trim() : "");
                 const pick = (...selectors) => {
                     for (const selector of selectors) {
                         const el = document.querySelector(selector);
                         if (el && getText(el)) return el;
                     }
                     return null;
                 };
                 const findSectionByHeading = (texts) => {
                     const sections = document.querySelectorAll('section');
                     for (const section of sections) {
                         const heading = section.querySelector('h2, h3');
                         if (!heading) continue;
                         const txt = getText(heading).toLowerCase();
                         if (texts.some(t => txt.includes(t))) return section;
                     }
                     return null;
                 };
 
                 try {
-                    const name = getText(pick('h1'));
-                    const headline = getText(pick('.text-body-medium.break-words', 'div.ph5 .text-body-medium', '.pv-text-details__left-panel .text-body-medium'));
-                    const location = getText(pick('.text-body-small.inline.t-black--light.break-words', '.pv-text-details__left-panel .text-body-small'));
+                    const name = getText(pick('h1.text-heading-xlarge', 'h1'));
+                    const headline = getText(pick('.text-body-medium.break-words', '.pv-text-details__left-panel .text-body-medium', '.text-body-medium.t-black'));
+                    const location = getText(pick('.text-body-small.inline.t-black--light.break-words', '.pv-text-details__left-panel .text-body-small', '.text-body-small.inline'));
 
-                    const aboutSection = findSectionByHeading(['à propos', 'about']);
+                    const aboutSection = findSectionByHeading(['à propos', 'about']) || document.querySelector('section[data-section="summary"]');
                     const about = aboutSection
                         ? getText(aboutSection.querySelector('.pv-shared-text-with-see-more, .inline-show-more-text, span[aria-hidden="true"]'))
                         : "";
 
-                    const expSection = findSectionByHeading(['expérience', 'experience']);
+                    const expSection = findSectionByHeading(['expérience', 'experience']) || document.querySelector('section[data-section="experience"]');
                     const firstRole = expSection
                         ? getText(expSection.querySelector('.pvs-entity__path-node, .pvs-entity__primary-title, .t-14.t-normal'))
                         : "";
 
                     sendResponse({
                         success: true,
                         data: {
                             name,
                             headline,
                             location,
                             about,
                             experience: firstRole
                         }
                     });
                 } catch (e) {
                     sendResponse({ success: false, error: "Profile scrape failed." });
                 }
             })();
             return true;
         }
     });
 }
diff --git a/dashboard.html b/dashboard.html
index 7a8bc79f8939258d09fd8f8bcc053f4436a9ab7c..be4ff20f04133dd76283afdf900e05de795e2411 100644
--- a/dashboard.html
+++ b/dashboard.html
@@ -1,68 +1,215 @@
 <!DOCTYPE html>
 <html>
 <head>
   <meta charset="UTF-8">
   <style>
-    body{font-family:sans-serif;margin:0;display:flex;height:600px;width:500px;}
-    .sidebar{width:100px;background:#f0f0f0;padding:10px;}
-    .main{flex:1;padding:10px;overflow-y:auto;}
-    .nav-btn{width:100%;padding:10px;margin-bottom:5px;border:none;cursor:pointer;text-align:left;}
-    .nav-btn.active{background:#0073b1;color:white;}
-    .tab{display:none;} .tab.active{display:block;}
-    button{width:100%;padding:8px;margin-top:5px;cursor:pointer;background:#0073b1;color:white;border:none;}
-    textarea,input{width:100%;box-sizing:border-box;margin-bottom:5px;}
-    .card{border:1px solid #ccc;padding:8px;margin-bottom:8px;background:#fff;font-size:12px;}
-    .queue-item{border-left:4px solid orange; padding:5px; margin-bottom:5px; background:#fff;}
+    :root{
+      --bg:#f5f7fb;
+      --surface:#ffffff;
+      --text:#1f2a44;
+      --muted:#6b7280;
+      --primary:#2563eb;
+      --primary-strong:#1e40af;
+      --accent:#f59e0b;
+      --success:#16a34a;
+      --danger:#dc2626;
+      --shadow:0 10px 30px rgba(15, 23, 42, 0.08);
+      --radius:14px;
+    }
+    *{box-sizing:border-box;}
+    body{
+      font-family: "Inter", "Segoe UI", system-ui, sans-serif;
+      margin:0;
+      display:flex;
+      height:620px;
+      width:520px;
+      background:var(--bg);
+      color:var(--text);
+    }
+    .sidebar{
+      width:120px;
+      padding:14px 10px;
+      background:linear-gradient(180deg, #0f172a, #1e293b);
+      color:#fff;
+      display:flex;
+      flex-direction:column;
+      gap:8px;
+    }
+    .brand{
+      font-weight:700;
+      font-size:13px;
+      letter-spacing:0.4px;
+      text-transform:uppercase;
+      margin-bottom:8px;
+    }
+    .main{
+      flex:1;
+      padding:16px 18px;
+      overflow-y:auto;
+    }
+    .nav-btn{
+      width:100%;
+      padding:10px;
+      margin:0;
+      border:none;
+      border-radius:10px;
+      cursor:pointer;
+      text-align:left;
+      background:rgba(255,255,255,0.08);
+      color:#e2e8f0;
+      font-size:12px;
+      transition:all 0.2s ease;
+    }
+    .nav-btn:hover{background:rgba(255,255,255,0.16);}
+    .nav-btn.active{
+      background:#fff;
+      color:#0f172a;
+      font-weight:600;
+    }
+    .tab{display:none;}
+    .tab.active{display:block;}
+    h3{
+      margin:0 0 10px 0;
+      font-size:18px;
+    }
+    .section{
+      background:var(--surface);
+      padding:14px;
+      border-radius:var(--radius);
+      box-shadow:var(--shadow);
+      margin-bottom:14px;
+    }
+    button{
+      width:100%;
+      padding:10px 12px;
+      margin-top:8px;
+      cursor:pointer;
+      background:var(--primary);
+      color:white;
+      border:none;
+      border-radius:10px;
+      font-weight:600;
+      transition:transform 0.1s ease, background 0.2s ease;
+    }
+    button:hover{background:var(--primary-strong);}
+    button:active{transform:scale(0.99);}
+    textarea,input{
+      width:100%;
+      box-sizing:border-box;
+      margin-bottom:6px;
+      border:1px solid #e5e7eb;
+      border-radius:10px;
+      padding:10px;
+      font-size:12px;
+      background:#f8fafc;
+    }
+    label{font-size:12px;color:var(--muted);}
+    .card{
+      border:1px solid #e5e7eb;
+      padding:10px;
+      margin-bottom:8px;
+      background:#fff;
+      font-size:12px;
+      border-radius:12px;
+    }
+    .queue-item{
+      border-left:4px solid var(--accent);
+      padding:8px;
+      margin-bottom:8px;
+      background:#fff;
+      border-radius:10px;
+      font-size:12px;
+      display:flex;
+      align-items:flex-start;
+      justify-content:space-between;
+      gap:8px;
+    }
+    .queue-meta{flex:1;}
+    .queue-delete{
+      width:auto;
+      margin:0;
+      padding:6px 8px;
+      font-size:11px;
+      border-radius:8px;
+      background:#fee2e2;
+      color:#991b1b;
+    }
+    .queue-delete:hover{background:#fecaca;}
+    .btn-secondary{background:#e5e7eb;color:#111827;}
+    .btn-secondary:hover{background:#d1d5db;}
+    .btn-success{background:var(--success);}
+    .btn-danger{background:var(--danger);}
+    .btn-accent{background:var(--accent);}
+    .muted{color:var(--muted);font-size:12px;}
+    .row{display:flex;gap:8px;}
+    .row > *{flex:1;}
   </style>
 </head>
 <body>
   <div class="sidebar">
-    <button class="nav-btn active" id="nav_radar" style="color:#d35400;">Radar</button>
+    <div class="brand">Ghostly</div>
+    <button class="nav-btn active" id="nav_radar">Radar</button>
     <button class="nav-btn" id="nav_id">Identité</button>
     <button class="nav-btn" id="nav_com">Réponses</button>
     <button class="nav-btn" id="nav_post">Éditeur</button>
-    <button class="nav-btn" id="nav_queue" style="color:green;">Planning</button>
+    <button class="nav-btn" id="nav_queue">Planning</button>
   </div>
   
   <div class="main">
     <div id="tab_radar" class="tab active">
         <h3>Radar</h3>
-        <input type="number" id="input_scroll" value="20">
-        <button id="btn_scan_radar" style="background:#d35400;">Lancer Radar</button>
-        <div id="zone_radar" style="display:none; margin-top:10px;">
+        <div class="section">
+            <label for="input_scroll">Durée du scan (sec)</label>
+            <input type="number" id="input_scroll" value="20">
+            <button id="btn_scan_radar" class="btn-accent">Lancer Radar</button>
+            <p class="muted">Analyse le fil LinkedIn et propose des réponses prêtes à publier.</p>
+        </div>
+        <div id="zone_radar" class="section" style="display:none;">
             <div id="list_radar"></div>
-            <button id="btn_pub_radar" style="background:green;">Publier Sélection</button>
+            <button id="btn_pub_radar" class="btn-success">Publier Sélection</button>
         </div>
     </div>
     <div id="tab_id" class="tab">
         <h3>Identité</h3>
-        <button id="btn_scan_profile">Scanner Profil</button>
-        <textarea id="prompt_box" style="height:100px;"></textarea>
-        <button id="btn_save">Sauver</button>
+        <div class="section">
+            <button id="btn_scan_profile" class="btn-secondary">Scanner Profil</button>
+            <label for="prompt_box">Persona</label>
+            <textarea id="prompt_box" style="height:120px;"></textarea>
+            <button id="btn_save">Sauver</button>
+        </div>
     </div>
     <div id="tab_com" class="tab">
         <h3>Post Unique</h3>
-        <input id="input_url" placeholder="URL du post...">
-        <button id="btn_scan_post">Scanner le post</button>
-        <div id="zone_coms"></div>
-        <button id="btn_pub_all" style="background:green;display:none;">Publier Tout</button>
+        <div class="section">
+            <label for="input_url">URL du post</label>
+            <input id="input_url" placeholder="https://www.linkedin.com/...">
+            <button id="btn_scan_post">Scanner le post</button>
+            <div id="zone_coms"></div>
+            <button id="btn_pub_all" class="btn-success" style="display:none;">Publier Tout</button>
+        </div>
     </div>
     <div id="tab_post" class="tab">
         <h3>Éditeur</h3>
-        <button id="btn_ideas">Générer Idées</button>
-        <div id="zone_ideas"></div>
-        <textarea id="input_final" style="height:150px;"></textarea>
-        <hr>
-        <input type="datetime-local" id="schedule_time">
-        <button id="btn_add_queue" style="background:orange;">Mettre en File</button>
-        <button id="btn_pub_now" style="background:red;">Publier Maintenant</button>
+        <div class="section">
+            <button id="btn_ideas">Générer Idées</button>
+            <div id="zone_ideas"></div>
+            <label for="input_final">Votre post</label>
+            <textarea id="input_final" style="height:160px;"></textarea>
+            <div class="row">
+                <input type="datetime-local" id="schedule_time">
+                <button id="btn_add_queue" class="btn-accent">Mettre en File</button>
+            </div>
+            <button id="btn_pub_now" class="btn-danger">Publier Maintenant</button>
+        </div>
     </div>
     <div id="tab_queue" class="tab">
         <h3>File d'attente</h3>
-        <button id="btn_refresh_queue" style="background:#eee;color:black">Rafraîchir</button>
-        <div id="list_queue"></div>
+        <div class="section">
+            <button id="btn_refresh_queue" class="btn-secondary">Rafraîchir</button>
+            <div id="list_queue"></div>
+        </div>
     </div>
   </div>
   <script src="dashboard.js"></script>
 </body>
-</html>
\ No newline at end of file
+</html>
diff --git a/dashboard.js b/dashboard.js
index 2002916d9938030dc8b5f5547f0e8ea9e528cc7c..b9c9cc54c5398a9c8f84ef1da2ca64d44017676d 100644
--- a/dashboard.js
+++ b/dashboard.js
@@ -1,185 +1,228 @@
 document.addEventListener('DOMContentLoaded', () => {
 
     const map = { 'nav_id': 'tab_id', 'nav_com': 'tab_com', 'nav_radar': 'tab_radar', 'nav_post': 'tab_post', 'nav_queue': 'tab_queue' };
     Object.keys(map).forEach(navId => {
         document.getElementById(navId).addEventListener('click', () => {
             document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
             document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
             document.getElementById(navId).classList.add('active');
             document.getElementById(map[navId]).classList.add('active');
             if(navId === 'nav_queue') loadQueue();
         });
     });
 
     const promptBox = document.getElementById('prompt_box');
     let FOUND_COMS = [];
     let RADAR_OPPS = [];
 
-    chrome.storage.local.get(['persona'], r => { if(promptBox) promptBox.value = r.persona || "Expert."; });
+    chrome.storage.local.get(['persona'], r => {
+        if (promptBox) promptBox.value = r.persona || "Expert.";
+    });
 
     function nav(key, url, cb) {
         chrome.tabs.query({active:true, currentWindow:true}, async t => {
             if(t[0].url.includes(key)) {
                 await chrome.scripting.executeScript({target:{tabId:t[0].id}, files:['content.js']});
                 cb(t[0].id);
             } else {
                 alert("Redirection...");
                 await chrome.tabs.update(t[0].id, {url: url});
                 setTimeout(async()=>{
                     await chrome.scripting.executeScript({target:{tabId:t[0].id}, files:['content.js']});
                     cb(t[0].id);
                 }, 4000);
             }
         });
     }
 
     // --- SCAN POST UNIQUE ---
     document.getElementById('btn_scan_post').addEventListener('click', () => {
         const u = document.getElementById('input_url').value;
         nav(u.split('?')[0], u, tid => {
             chrome.tabs.sendMessage(tid, {action:"START_SCAN"}, r => {
                 FOUND_COMS = r.data;
                 const div = document.getElementById('zone_coms'); div.innerHTML="";
                 
                 const pubBtn = document.getElementById('btn_pub_all');
                 pubBtn.style.display = 'block';
                 pubBtn.innerText = "Publier la Sélection";
                 
                 if(FOUND_COMS.length === 0) div.innerHTML = "Aucun commentaire détecté.";
 
                 FOUND_COMS.forEach((c, i) => {
                     const d = document.createElement('div'); d.className='card';
                     d.innerHTML = `
                         <div style="display:flex; justify-content:space-between;">
                             <b>${c.author}</b>
                             <input type="checkbox" id="chk-com-${i}" checked>
                         </div>
                         <i style="font-size:10px; color:#666;">${c.text.substring(0,40)}...</i>
                         <textarea id="rc-${c.index}" style="width:100%"></textarea>
                     `;
                     div.appendChild(d);
                     
                     chrome.runtime.sendMessage({action:"GENERATE_SAV_REPLY", text:c.text, postContext:r.postContext, persona:promptBox.value}, ai=>{ 
+                        if (ai && ai.error) {
+                            alert(ai.error);
+                        }
                         document.getElementById(`rc-${c.index}`).value = ai.reply; 
                     });
                 });
             });
         });
     });
     
     // PUBLICATION SELECTIVE
     document.getElementById('btn_pub_all').addEventListener('click', () => {
         chrome.tabs.query({active:true}, async t => {
             alert("Publication de la sélection... (10s entre chaque)");
             for(let i=0; i<FOUND_COMS.length; i++) {
                 if(document.getElementById(`chk-com-${i}`).checked) {
                     let c = FOUND_COMS[i];
                     const val = document.getElementById(`rc-${c.index}`).value;
                     if(val) { 
                         try {
                             await chrome.tabs.sendMessage(t[0].id, {
                                 action: "REPLY_BY_HYBRID", 
                                 matchText: c.text, 
                                 targetIndex: c.index,
                                 replyText: val
                             });
                         } catch(e) {}
                         await new Promise(r=>setTimeout(r,10000));
                     }
                 }
             }
             alert("Traitement terminé.");
         });
     });
 
     // --- RADAR ---
     document.getElementById('btn_scan_radar').addEventListener('click', () => {
         const time = document.getElementById('input_scroll').value;
         nav("linkedin.com/feed", "https://www.linkedin.com/feed/", tid => {
             alert("Radar lancé (Atomique)...");
             chrome.tabs.sendMessage(tid, {action:"SCAN_FEED", duration:time}, r => {
                 if(r && r.posts) {
                     chrome.runtime.sendMessage({action:"ANALYZE_FEED_MANUAL", posts:r.posts, persona:promptBox.value}, ai => {
+                        if (ai && ai.error) {
+                            alert(ai.error);
+                        }
                         RADAR_OPPS = ai.results;
                         const div = document.getElementById('list_radar'); div.innerHTML="";
                         document.getElementById('zone_radar').style.display='block';
                         
                         if(RADAR_OPPS.length === 0) div.innerHTML = "0 post trouvé.";
 
                         RADAR_OPPS.forEach((o,i) => {
                             const d = document.createElement('div'); d.className='card';
                             d.innerHTML=`<b>${o.author}</b><br><i>${o.text.substring(0,50)}...</i><textarea id="rr-${i}" style="width:100%">${o.aiReply}</textarea><input type="checkbox" id="chk-${i}" checked> Valider`;
                             div.appendChild(d);
                         });
                     });
                 } else alert("Rien trouvé.");
             });
         });
     });
 
     document.getElementById('btn_pub_radar').addEventListener('click', () => {
         chrome.tabs.query({active:true}, async t => {
             alert("Envoi Radar...");
             for(let i=0; i<RADAR_OPPS.length; i++) {
                 if(document.getElementById(`chk-${i}`).checked) {
                     await chrome.tabs.sendMessage(t[0].id, {action: "COMMENT_ON_FEED_POST_BY_URN", targetURN: RADAR_OPPS[i].urn, text: document.getElementById(`rr-${i}`).value});
                     await new Promise(r=>setTimeout(r,10000));
                 }
             }
             alert("Fini");
         });
     });
 
     // --- RESTE INCHANGE ---
     document.getElementById('btn_ideas').addEventListener('click', () => {
         chrome.runtime.sendMessage({action:"GENERATE_DAILY_IDEAS", persona:promptBox.value}, r => {
+            if (r && r.error) {
+                alert(r.error);
+            }
             const div = document.getElementById('zone_ideas'); div.innerHTML="";
             r.ideas.split('###').forEach(i => {
                 const b = document.createElement('button'); b.innerText = i.split('|||')[0]; b.style.background="#eee"; b.style.color="black";
-                b.onclick = () => { document.getElementById('input_final').value = "Rédaction..."; chrome.runtime.sendMessage({action:"WRITE_FINAL_POST", angle:i, persona:promptBox.value}, res => document.getElementById('input_final').value = res.post); };
+                b.onclick = () => {
+                    document.getElementById('input_final').value = "Rédaction...";
+                    chrome.runtime.sendMessage({action:"WRITE_FINAL_POST", angle:i, persona:promptBox.value}, res => {
+                        if (res && res.error) {
+                            alert(res.error);
+                            return;
+                        }
+                        document.getElementById('input_final').value = res.post;
+                    });
+                };
                 div.appendChild(b);
             });
         });
     });
 
     document.getElementById('btn_pub_now').addEventListener('click', () => {
         if(confirm("Publier ?")) nav("linkedin.com/feed", "https://www.linkedin.com/feed/", tid => {
             chrome.tabs.sendMessage(tid, {action:"WRITE_POST_ON_LINKEDIN", content:document.getElementById('input_final').value, autoPost:true});
         });
     });
 
     document.getElementById('btn_add_queue').addEventListener('click', () => {
         const txt = document.getElementById('input_final').value;
         const time = document.getElementById('schedule_time').value;
         if(!txt || !time) return alert("Remplir texte et date");
         chrome.storage.local.get(['postQueue'], r => {
             const q = r.postQueue || [];
             q.push({id: Date.now(), content: txt, timestamp: new Date(time).getTime(), sent: false});
-            chrome.storage.local.set({postQueue: q}, () => { alert("Ajouté !"); loadQueue(); });
+            chrome.storage.local.set({postQueue: q}, () => {
+                chrome.runtime.sendMessage({ action: "QUEUE_UPDATED" });
+                alert("Ajouté !");
+                loadQueue();
+            });
         });
     });
 
     function loadQueue() {
         const div = document.getElementById('list_queue'); div.innerHTML = "";
         chrome.storage.local.get(['postQueue'], r => {
             const q = r.postQueue || [];
             q.forEach(p => {
                 const d = document.createElement('div'); d.className = "queue-item";
-                d.innerHTML = `<b>${new Date(p.timestamp).toLocaleString()}</b><br>${p.content.substring(0,30)}...`;
+                d.innerHTML = `
+                    <div class="queue-meta">
+                        <b>${new Date(p.timestamp).toLocaleString()}</b><br>
+                        ${p.content.substring(0,30)}...
+                    </div>
+                    <button class="queue-delete" data-id="${p.id}">Supprimer</button>
+                `;
                 div.appendChild(d);
             });
+            div.querySelectorAll('.queue-delete').forEach(btn => {
+                btn.addEventListener('click', (e) => {
+                    const id = Number(e.currentTarget.dataset.id);
+                    const nextQueue = (q || []).filter(item => item.id !== id);
+                    chrome.storage.local.set({ postQueue: nextQueue }, () => {
+                        chrome.runtime.sendMessage({ action: "QUEUE_UPDATED" });
+                        loadQueue();
+                    });
+                });
+            });
         });
     }
     document.getElementById('btn_refresh_queue').addEventListener('click', loadQueue);
     
     document.getElementById('btn_scan_profile').addEventListener('click', () => {
         nav("linkedin.com/in/", "https://www.linkedin.com/in/me/", tid => {
             chrome.tabs.sendMessage(tid, {action:"SCRAPE_MY_PROFILE"}, r => {
                 if(r && r.success) chrome.runtime.sendMessage({action:"BUILD_PERSONA", profile:r.data}, ai => {
+                    if (ai && ai.error) {
+                        alert(ai.error);
+                    }
                     promptBox.value = ai.reply; chrome.storage.local.set({persona:ai.reply});
                 });
             });
         });
     });
     document.getElementById('btn_save').addEventListener('click', () => chrome.storage.local.set({persona:promptBox.value}, ()=>alert("Sauvé")));
-});
\ No newline at end of file
+});

                         }
                     });
                 } catch (e) {
                     sendResponse({ success: false, error: "Profile scrape failed." });
                 }
             })();
             return true;
         }
     });
 }
diff --git a/dashboard.html b/dashboard.html
index 7a8bc79f8939258d09fd8f8bcc053f4436a9ab7c..8064b63cff0b607c37fcf2eb3faa4485ddff72f6 100644
--- a/dashboard.html
+++ b/dashboard.html
@@ -1,68 +1,200 @@
 <!DOCTYPE html>
 <html>
 <head>
   <meta charset="UTF-8">
   <style>
-    body{font-family:sans-serif;margin:0;display:flex;height:600px;width:500px;}
-    .sidebar{width:100px;background:#f0f0f0;padding:10px;}
-    .main{flex:1;padding:10px;overflow-y:auto;}
-    .nav-btn{width:100%;padding:10px;margin-bottom:5px;border:none;cursor:pointer;text-align:left;}
-    .nav-btn.active{background:#0073b1;color:white;}
-    .tab{display:none;} .tab.active{display:block;}
-    button{width:100%;padding:8px;margin-top:5px;cursor:pointer;background:#0073b1;color:white;border:none;}
-    textarea,input{width:100%;box-sizing:border-box;margin-bottom:5px;}
-    .card{border:1px solid #ccc;padding:8px;margin-bottom:8px;background:#fff;font-size:12px;}
-    .queue-item{border-left:4px solid orange; padding:5px; margin-bottom:5px; background:#fff;}
+    :root{
+      --bg:#f5f7fb;
+      --surface:#ffffff;
+      --text:#1f2a44;
+      --muted:#6b7280;
+      --primary:#2563eb;
+      --primary-strong:#1e40af;
+      --accent:#f59e0b;
+      --success:#16a34a;
+      --danger:#dc2626;
+      --shadow:0 10px 30px rgba(15, 23, 42, 0.08);
+      --radius:14px;
+    }
+    *{box-sizing:border-box;}
+    body{
+      font-family: "Inter", "Segoe UI", system-ui, sans-serif;
+      margin:0;
+      display:flex;
+      height:620px;
+      width:520px;
+      background:var(--bg);
+      color:var(--text);
+    }
+    .sidebar{
+      width:120px;
+      padding:14px 10px;
+      background:linear-gradient(180deg, #0f172a, #1e293b);
+      color:#fff;
+      display:flex;
+      flex-direction:column;
+      gap:8px;
+    }
+    .brand{
+      font-weight:700;
+      font-size:13px;
+      letter-spacing:0.4px;
+      text-transform:uppercase;
+      margin-bottom:8px;
+    }
+    .main{
+      flex:1;
+      padding:16px 18px;
+      overflow-y:auto;
+    }
+    .nav-btn{
+      width:100%;
+      padding:10px;
+      margin:0;
+      border:none;
+      border-radius:10px;
+      cursor:pointer;
+      text-align:left;
+      background:rgba(255,255,255,0.08);
+      color:#e2e8f0;
+      font-size:12px;
+      transition:all 0.2s ease;
+    }
+    .nav-btn:hover{background:rgba(255,255,255,0.16);}
+    .nav-btn.active{
+      background:#fff;
+      color:#0f172a;
+      font-weight:600;
+    }
+    .tab{display:none;}
+    .tab.active{display:block;}
+    h3{
+      margin:0 0 10px 0;
+      font-size:18px;
+    }
+    .section{
+      background:var(--surface);
+      padding:14px;
+      border-radius:var(--radius);
+      box-shadow:var(--shadow);
+      margin-bottom:14px;
+    }
+    button{
+      width:100%;
+      padding:10px 12px;
+      margin-top:8px;
+      cursor:pointer;
+      background:var(--primary);
+      color:white;
+      border:none;
+      border-radius:10px;
+      font-weight:600;
+      transition:transform 0.1s ease, background 0.2s ease;
+    }
+    button:hover{background:var(--primary-strong);}
+    button:active{transform:scale(0.99);}
+    textarea,input{
+      width:100%;
+      box-sizing:border-box;
+      margin-bottom:6px;
+      border:1px solid #e5e7eb;
+      border-radius:10px;
+      padding:10px;
+      font-size:12px;
+      background:#f8fafc;
+    }
+    label{font-size:12px;color:var(--muted);}
+    .card{
+      border:1px solid #e5e7eb;
+      padding:10px;
+      margin-bottom:8px;
+      background:#fff;
+      font-size:12px;
+      border-radius:12px;
+    }
+    .queue-item{
+      border-left:4px solid var(--accent);
+      padding:8px;
+      margin-bottom:8px;
+      background:#fff;
+      border-radius:10px;
+      font-size:12px;
+    }
+    .btn-secondary{background:#e5e7eb;color:#111827;}
+    .btn-secondary:hover{background:#d1d5db;}
+    .btn-success{background:var(--success);}
+    .btn-danger{background:var(--danger);}
+    .btn-accent{background:var(--accent);}
+    .muted{color:var(--muted);font-size:12px;}
+    .row{display:flex;gap:8px;}
+    .row > *{flex:1;}
   </style>
 </head>
 <body>
   <div class="sidebar">
-    <button class="nav-btn active" id="nav_radar" style="color:#d35400;">Radar</button>
+    <div class="brand">Ghostly</div>
+    <button class="nav-btn active" id="nav_radar">Radar</button>
     <button class="nav-btn" id="nav_id">Identité</button>
     <button class="nav-btn" id="nav_com">Réponses</button>
     <button class="nav-btn" id="nav_post">Éditeur</button>
-    <button class="nav-btn" id="nav_queue" style="color:green;">Planning</button>
+    <button class="nav-btn" id="nav_queue">Planning</button>
   </div>
   
   <div class="main">
     <div id="tab_radar" class="tab active">
         <h3>Radar</h3>
-        <input type="number" id="input_scroll" value="20">
-        <button id="btn_scan_radar" style="background:#d35400;">Lancer Radar</button>
-        <div id="zone_radar" style="display:none; margin-top:10px;">
+        <div class="section">
+            <label for="input_scroll">Durée du scan (sec)</label>
+            <input type="number" id="input_scroll" value="20">
+            <button id="btn_scan_radar" class="btn-accent">Lancer Radar</button>
+            <p class="muted">Analyse le fil LinkedIn et propose des réponses prêtes à publier.</p>
+        </div>
+        <div id="zone_radar" class="section" style="display:none;">
             <div id="list_radar"></div>
-            <button id="btn_pub_radar" style="background:green;">Publier Sélection</button>
+            <button id="btn_pub_radar" class="btn-success">Publier Sélection</button>
         </div>
     </div>
     <div id="tab_id" class="tab">
         <h3>Identité</h3>
-        <button id="btn_scan_profile">Scanner Profil</button>
-        <textarea id="prompt_box" style="height:100px;"></textarea>
-        <button id="btn_save">Sauver</button>
+        <div class="section">
+            <button id="btn_scan_profile" class="btn-secondary">Scanner Profil</button>
+            <label for="prompt_box">Persona</label>
+            <textarea id="prompt_box" style="height:120px;"></textarea>
+            <button id="btn_save">Sauver</button>
+        </div>
     </div>
     <div id="tab_com" class="tab">
         <h3>Post Unique</h3>
-        <input id="input_url" placeholder="URL du post...">
-        <button id="btn_scan_post">Scanner le post</button>
-        <div id="zone_coms"></div>
-        <button id="btn_pub_all" style="background:green;display:none;">Publier Tout</button>
+        <div class="section">
+            <label for="input_url">URL du post</label>
+            <input id="input_url" placeholder="https://www.linkedin.com/...">
+            <button id="btn_scan_post">Scanner le post</button>
+            <div id="zone_coms"></div>
+            <button id="btn_pub_all" class="btn-success" style="display:none;">Publier Tout</button>
+        </div>
     </div>
     <div id="tab_post" class="tab">
         <h3>Éditeur</h3>
-        <button id="btn_ideas">Générer Idées</button>
-        <div id="zone_ideas"></div>
-        <textarea id="input_final" style="height:150px;"></textarea>
-        <hr>
-        <input type="datetime-local" id="schedule_time">
-        <button id="btn_add_queue" style="background:orange;">Mettre en File</button>
-        <button id="btn_pub_now" style="background:red;">Publier Maintenant</button>
+        <div class="section">
+            <button id="btn_ideas">Générer Idées</button>
+            <div id="zone_ideas"></div>
+            <label for="input_final">Votre post</label>
+            <textarea id="input_final" style="height:160px;"></textarea>
+            <div class="row">
+                <input type="datetime-local" id="schedule_time">
+                <button id="btn_add_queue" class="btn-accent">Mettre en File</button>
+            </div>
+            <button id="btn_pub_now" class="btn-danger">Publier Maintenant</button>
+        </div>
     </div>
     <div id="tab_queue" class="tab">
         <h3>File d'attente</h3>
-        <button id="btn_refresh_queue" style="background:#eee;color:black">Rafraîchir</button>
-        <div id="list_queue"></div>
+        <div class="section">
+            <button id="btn_refresh_queue" class="btn-secondary">Rafraîchir</button>
+            <div id="list_queue"></div>
+        </div>
     </div>
   </div>
   <script src="dashboard.js"></script>
 </body>
-</html>
\ No newline at end of file
+</html>
diff --git a/dashboard.js b/dashboard.js
index 2002916d9938030dc8b5f5547f0e8ea9e528cc7c..bde96555743b2e26693c204c68ed7862d20a0da9 100644
--- a/dashboard.js
+++ b/dashboard.js
@@ -1,185 +1,212 @@
 document.addEventListener('DOMContentLoaded', () => {
 
     const map = { 'nav_id': 'tab_id', 'nav_com': 'tab_com', 'nav_radar': 'tab_radar', 'nav_post': 'tab_post', 'nav_queue': 'tab_queue' };
     Object.keys(map).forEach(navId => {
         document.getElementById(navId).addEventListener('click', () => {
             document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
             document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
             document.getElementById(navId).classList.add('active');
             document.getElementById(map[navId]).classList.add('active');
             if(navId === 'nav_queue') loadQueue();
         });
     });
 
     const promptBox = document.getElementById('prompt_box');
     let FOUND_COMS = [];
     let RADAR_OPPS = [];
 
-    chrome.storage.local.get(['persona'], r => { if(promptBox) promptBox.value = r.persona || "Expert."; });
+    chrome.storage.local.get(['persona'], r => {
+        if (promptBox) promptBox.value = r.persona || "Expert.";
+    });
 
     function nav(key, url, cb) {
         chrome.tabs.query({active:true, currentWindow:true}, async t => {
             if(t[0].url.includes(key)) {
                 await chrome.scripting.executeScript({target:{tabId:t[0].id}, files:['content.js']});
                 cb(t[0].id);
             } else {
                 alert("Redirection...");
                 await chrome.tabs.update(t[0].id, {url: url});
                 setTimeout(async()=>{
                     await chrome.scripting.executeScript({target:{tabId:t[0].id}, files:['content.js']});
                     cb(t[0].id);
                 }, 4000);
             }
         });
     }
 
     // --- SCAN POST UNIQUE ---
     document.getElementById('btn_scan_post').addEventListener('click', () => {
         const u = document.getElementById('input_url').value;
         nav(u.split('?')[0], u, tid => {
             chrome.tabs.sendMessage(tid, {action:"START_SCAN"}, r => {
                 FOUND_COMS = r.data;
                 const div = document.getElementById('zone_coms'); div.innerHTML="";
                 
                 const pubBtn = document.getElementById('btn_pub_all');
                 pubBtn.style.display = 'block';
                 pubBtn.innerText = "Publier la Sélection";
                 
                 if(FOUND_COMS.length === 0) div.innerHTML = "Aucun commentaire détecté.";
 
                 FOUND_COMS.forEach((c, i) => {
                     const d = document.createElement('div'); d.className='card';
                     d.innerHTML = `
                         <div style="display:flex; justify-content:space-between;">
                             <b>${c.author}</b>
                             <input type="checkbox" id="chk-com-${i}" checked>
                         </div>
                         <i style="font-size:10px; color:#666;">${c.text.substring(0,40)}...</i>
                         <textarea id="rc-${c.index}" style="width:100%"></textarea>
                     `;
                     div.appendChild(d);
                     
                     chrome.runtime.sendMessage({action:"GENERATE_SAV_REPLY", text:c.text, postContext:r.postContext, persona:promptBox.value}, ai=>{ 
+                        if (ai && ai.error) {
+                            alert(ai.error);
+                        }
                         document.getElementById(`rc-${c.index}`).value = ai.reply; 
                     });
                 });
             });
         });
     });
     
     // PUBLICATION SELECTIVE
     document.getElementById('btn_pub_all').addEventListener('click', () => {
         chrome.tabs.query({active:true}, async t => {
             alert("Publication de la sélection... (10s entre chaque)");
             for(let i=0; i<FOUND_COMS.length; i++) {
                 if(document.getElementById(`chk-com-${i}`).checked) {
                     let c = FOUND_COMS[i];
                     const val = document.getElementById(`rc-${c.index}`).value;
                     if(val) { 
                         try {
                             await chrome.tabs.sendMessage(t[0].id, {
                                 action: "REPLY_BY_HYBRID", 
                                 matchText: c.text, 
                                 targetIndex: c.index,
                                 replyText: val
                             });
                         } catch(e) {}
                         await new Promise(r=>setTimeout(r,10000));
                     }
                 }
             }
             alert("Traitement terminé.");
         });
     });
 
     // --- RADAR ---
     document.getElementById('btn_scan_radar').addEventListener('click', () => {
         const time = document.getElementById('input_scroll').value;
         nav("linkedin.com/feed", "https://www.linkedin.com/feed/", tid => {
             alert("Radar lancé (Atomique)...");
             chrome.tabs.sendMessage(tid, {action:"SCAN_FEED", duration:time}, r => {
                 if(r && r.posts) {
                     chrome.runtime.sendMessage({action:"ANALYZE_FEED_MANUAL", posts:r.posts, persona:promptBox.value}, ai => {
+                        if (ai && ai.error) {
+                            alert(ai.error);
+                        }
                         RADAR_OPPS = ai.results;
                         const div = document.getElementById('list_radar'); div.innerHTML="";
                         document.getElementById('zone_radar').style.display='block';
                         
                         if(RADAR_OPPS.length === 0) div.innerHTML = "0 post trouvé.";
 
                         RADAR_OPPS.forEach((o,i) => {
                             const d = document.createElement('div'); d.className='card';
                             d.innerHTML=`<b>${o.author}</b><br><i>${o.text.substring(0,50)}...</i><textarea id="rr-${i}" style="width:100%">${o.aiReply}</textarea><input type="checkbox" id="chk-${i}" checked> Valider`;
                             div.appendChild(d);
                         });
                     });
                 } else alert("Rien trouvé.");
             });
         });
     });
 
     document.getElementById('btn_pub_radar').addEventListener('click', () => {
         chrome.tabs.query({active:true}, async t => {
             alert("Envoi Radar...");
             for(let i=0; i<RADAR_OPPS.length; i++) {
                 if(document.getElementById(`chk-${i}`).checked) {
                     await chrome.tabs.sendMessage(t[0].id, {action: "COMMENT_ON_FEED_POST_BY_URN", targetURN: RADAR_OPPS[i].urn, text: document.getElementById(`rr-${i}`).value});
                     await new Promise(r=>setTimeout(r,10000));
                 }
             }
             alert("Fini");
         });
     });
 
     // --- RESTE INCHANGE ---
     document.getElementById('btn_ideas').addEventListener('click', () => {
         chrome.runtime.sendMessage({action:"GENERATE_DAILY_IDEAS", persona:promptBox.value}, r => {
+            if (r && r.error) {
+                alert(r.error);
+            }
             const div = document.getElementById('zone_ideas'); div.innerHTML="";
             r.ideas.split('###').forEach(i => {
                 const b = document.createElement('button'); b.innerText = i.split('|||')[0]; b.style.background="#eee"; b.style.color="black";
-                b.onclick = () => { document.getElementById('input_final').value = "Rédaction..."; chrome.runtime.sendMessage({action:"WRITE_FINAL_POST", angle:i, persona:promptBox.value}, res => document.getElementById('input_final').value = res.post); };
+                b.onclick = () => {
+                    document.getElementById('input_final').value = "Rédaction...";
+                    chrome.runtime.sendMessage({action:"WRITE_FINAL_POST", angle:i, persona:promptBox.value}, res => {
+                        if (res && res.error) {
+                            alert(res.error);
+                            return;
+                        }
+                        document.getElementById('input_final').value = res.post;
+                    });
+                };
                 div.appendChild(b);
             });
         });
     });
 
     document.getElementById('btn_pub_now').addEventListener('click', () => {
         if(confirm("Publier ?")) nav("linkedin.com/feed", "https://www.linkedin.com/feed/", tid => {
             chrome.tabs.sendMessage(tid, {action:"WRITE_POST_ON_LINKEDIN", content:document.getElementById('input_final').value, autoPost:true});
         });
     });
 
     document.getElementById('btn_add_queue').addEventListener('click', () => {
         const txt = document.getElementById('input_final').value;
         const time = document.getElementById('schedule_time').value;
         if(!txt || !time) return alert("Remplir texte et date");
         chrome.storage.local.get(['postQueue'], r => {
             const q = r.postQueue || [];
             q.push({id: Date.now(), content: txt, timestamp: new Date(time).getTime(), sent: false});
-            chrome.storage.local.set({postQueue: q}, () => { alert("Ajouté !"); loadQueue(); });
+            chrome.storage.local.set({postQueue: q}, () => {
+                chrome.runtime.sendMessage({ action: "QUEUE_UPDATED" });
+                alert("Ajouté !");
+                loadQueue();
+            });
         });
     });
 
     function loadQueue() {
         const div = document.getElementById('list_queue'); div.innerHTML = "";
         chrome.storage.local.get(['postQueue'], r => {
             const q = r.postQueue || [];
             q.forEach(p => {
                 const d = document.createElement('div'); d.className = "queue-item";
                 d.innerHTML = `<b>${new Date(p.timestamp).toLocaleString()}</b><br>${p.content.substring(0,30)}...`;
                 div.appendChild(d);
             });
         });
     }
     document.getElementById('btn_refresh_queue').addEventListener('click', loadQueue);
     
     document.getElementById('btn_scan_profile').addEventListener('click', () => {
         nav("linkedin.com/in/", "https://www.linkedin.com/in/me/", tid => {
             chrome.tabs.sendMessage(tid, {action:"SCRAPE_MY_PROFILE"}, r => {
                 if(r && r.success) chrome.runtime.sendMessage({action:"BUILD_PERSONA", profile:r.data}, ai => {
+                    if (ai && ai.error) {
+                        alert(ai.error);
+                    }
                     promptBox.value = ai.reply; chrome.storage.local.set({persona:ai.reply});
                 });
             });
         });
     });
     document.getElementById('btn_save').addEventListener('click', () => chrome.storage.local.set({persona:promptBox.value}, ()=>alert("Sauvé")));
-});
\ No newline at end of file
+});
 
EOF
)
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
                 const content = d && d.choices && d.choices[0] && d.choices[0].message
                     ? d.choices[0].message.content
                     : "";
                 let rep = clean(content);
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
        try {
            const r = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `3 idées posts LinkedIn.`}], temperature: 0.8 })
            });
            const d = await r.json();
            const ideas = d && d.choices && d.choices[0] && d.choices[0].message
                ? d.choices[0].message.content
                : "";
            if (!ideas) throw new Error("EMPTY_IDEAS");
            sendResponse({ success: true, ideas });
        } catch (e) {
            sendResponse({ success: false, ideas: "Idée 1|||Sujet simple###Idée 2|||Conseil pratique###Idée 3|||Retour d'expérience", error: "Erreur IA" });
        }
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

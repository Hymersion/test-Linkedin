const API_KEY = "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"; 

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
                    body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `CONTEXTE: LinkedIn. POST: "${p.text.substring(0,200)}...". Est-ce pertinent pro ? OUI: réponse courte (1 phrase). NON: SKIP.`}], temperature: 0.6 })
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
                body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `Contexte: "${request.postContext.substring(0,150)}...". Com: "${request.text}". Tâche: Réponse courte, sans note.`}], temperature: 0.5 })
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
            body: JSON.stringify({ model: "gpt-4o", messages: [{role:"user", content: `IDENTITÉ:${request.persona}. SUJET:"${request.angle}". Rédige un post complet.`}], temperature: 0.7 })
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
});
document.addEventListener('DOMContentLoaded', () => {

    const map = { 'nav_id': 'tab_id', 'nav_com': 'tab_com', 'nav_radar': 'tab_radar', 'nav_post': 'tab_post', 'nav_queue': 'tab_queue', 'nav_reseau': 'tab_reseau' };
    Object.keys(map).forEach(navId => {
        document.getElementById(navId).addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.getElementById(navId).classList.add('active');
            document.getElementById(map[navId]).classList.add('active');
            if(navId === 'nav_queue') loadQueue();
            if(navId === 'nav_reseau') {
                loadTargets();
                loadOpportunities();
            }
        });
    });

    const promptBox = document.getElementById('prompt_box');
    let FOUND_COMS = [];
    let RADAR_OPPS = [];

    chrome.storage.local.get(['persona'], r => {
        if (promptBox) promptBox.value = r.persona || "Expert.";
    });

    const apiKeyInput = document.getElementById('input_api_key');
    const apiStatus = document.getElementById('api_status');

    chrome.storage.local.get(['openaiApiKey'], r => {
        if (apiKeyInput) apiKeyInput.value = r.openaiApiKey || "";
    });

    function nav(key, url, cb) {
        chrome.tabs.query({active:true, currentWindow:true}, async t => {
            if(t[0].url.includes(key)) {
                await chrome.scripting.executeScript({target:{tabId:t[0].id}, files:['selectors.js', 'content.js']});
                cb(t[0].id);
            } else {
                alert("Redirection...");
                await chrome.tabs.update(t[0].id, {url: url});
                setTimeout(async()=>{
                    await chrome.scripting.executeScript({target:{tabId:t[0].id}, files:['selectors.js', 'content.js']});
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
                        if (ai && ai.error) {
                            alert(ai.error);
                        }
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
                        if (ai && ai.error) {
                            alert(ai.error);
                        }
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
            if (r && r.error) {
                alert(r.error);
            }
            const div = document.getElementById('zone_ideas'); div.innerHTML="";
            r.ideas.split('###').forEach(i => {
                const b = document.createElement('button'); b.innerText = i.split('|||')[0]; b.style.background="#eee"; b.style.color="black";
                    b.onclick = () => {
                    document.getElementById('input_final').value = "Rédaction...";
                    chrome.runtime.sendMessage({action:"WRITE_FINAL_POST", angle:i, persona:promptBox.value}, res => {
                        if (res && res.error) {
                            alert(res.error);
                            return;
                        }
                        document.getElementById('input_final').value = res.post;
                    });
                };
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
            chrome.storage.local.set({postQueue: q}, () => {
                chrome.runtime.sendMessage({ action: "QUEUE_UPDATED" });
                alert("Ajouté !");
                loadQueue();
            });
        });
    });

    function loadQueue() {
        const div = document.getElementById('list_queue'); div.innerHTML = "";
        chrome.storage.local.get(['postQueue'], r => {
            const q = r.postQueue || [];
            q.forEach(p => {
                const d = document.createElement('div'); d.className = "queue-item";
                d.innerHTML = `
                    <div class="queue-meta">
                        <b>${new Date(p.timestamp).toLocaleString()}</b><br>
                        ${p.content.substring(0,30)}...
                    </div>
                    <button class="queue-delete" data-id="${p.id}">Supprimer</button>
                `;
                div.appendChild(d);
            });
            div.querySelectorAll('.queue-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = Number(e.currentTarget.dataset.id);
                    const nextQueue = (q || []).filter(item => item.id !== id);
                    chrome.storage.local.set({ postQueue: nextQueue }, () => {
                        chrome.runtime.sendMessage({ action: "QUEUE_UPDATED" });
                        loadQueue();
                    });
                });
            });
        });
    }
    document.getElementById('btn_refresh_queue').addEventListener('click', loadQueue);
    
    document.getElementById('btn_scan_profile').addEventListener('click', () => {
        nav("linkedin.com/in/", "https://www.linkedin.com/in/me/", tid => {
            chrome.tabs.sendMessage(tid, {action:"SCRAPE_MY_PROFILE"}, r => {
                if(r && r.success) chrome.runtime.sendMessage({action:"BUILD_PERSONA", profile:r.data}, ai => {
                    if (ai && ai.error) {
                        alert(ai.error);
                    }
                    promptBox.value = ai.reply; chrome.storage.local.set({persona:ai.reply});
                });
            });
        });
    });
    document.getElementById('btn_save').addEventListener('click', () => chrome.storage.local.set({persona:promptBox.value}, ()=>alert("Sauvé")));

    document.getElementById('btn_save_api').addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        chrome.runtime.sendMessage({ action: "SET_OPENAI_KEY", apiKey }, () => {
            if (apiStatus) apiStatus.textContent = apiKey ? "Clé enregistrée." : "Clé supprimée.";
        });
    });

    document.getElementById('btn_test_api').addEventListener('click', () => {
        if (apiStatus) apiStatus.textContent = "Test en cours...";
        const apiKey = apiKeyInput.value.trim();
        chrome.runtime.sendMessage({ action: "TEST_OPENAI", apiKey }, res => {
            if (!res || res.success === false) {
                const message = res && res.error ? res.error : "Échec de connexion.";
                if (apiStatus) apiStatus.textContent = message;
                return;
            }
            if (apiStatus) apiStatus.textContent = "Connexion OK.";
        });
    });

    const scanStatus = document.getElementById('scan_status');
    const toggleWatch = document.getElementById('toggle_watch');
    const inputInterval = document.getElementById('input_interval');
    const inputMaxTargets = document.getElementById('input_max_targets');
    const inputThreshold = document.getElementById('input_threshold');
    const toggleManual = document.getElementById('toggle_manual');
    const targetsList = document.getElementById('targets_list');
    const opportunitiesList = document.getElementById('opportunities_list');

    const loadTargets = () => {
        chrome.runtime.sendMessage({ action: "FETCH_TARGETS" }, res => {
            if (!res || !res.success) return;
            targetsList.innerHTML = "";
            res.targets.forEach(t => {
                const div = document.createElement('div');
                div.className = 'card';
                div.innerHTML = `<b>${t.fullName || t.profileUrl}</b><br><span class="muted">${t.headline || ""}</span><br><span class="muted">Dernier check: ${t.lastCheckedAt ? new Date(t.lastCheckedAt).toLocaleString() : "Jamais"}</span>`;
                targetsList.appendChild(div);
            });
        });
        chrome.storage.local.get(['watchSettings', 'objectives'], r => {
            const settings = r.watchSettings || {};
            toggleWatch.checked = !!settings.enabled;
            inputInterval.value = settings.checkIntervalMinutes || 30;
            inputMaxTargets.value = settings.maxTargetsPerCycle || 5;
            inputThreshold.value = settings.scoreThreshold || 60;
            toggleManual.checked = settings.requireManualApproval !== false;
            const objectives = r.objectives || {};
            document.getElementById('input_goals').value = objectives.goals || "";
            document.getElementById('input_tone').value = objectives.toneRules || "";
        });
    };

    const loadOpportunities = () => {
        chrome.runtime.sendMessage({ action: "FETCH_OPPORTUNITIES" }, res => {
            if (!res || !res.success) return;
            opportunitiesList.innerHTML = "";
            res.opportunities.forEach(o => {
                const div = document.createElement('div');
                div.className = 'card';
                div.innerHTML = `
                    <div><b>Score:</b> ${o.score}</div>
                    <div class="muted">${o.postText.substring(0, 120)}...</div>
                    <textarea style="width:100%">${o.draftComment || ""}</textarea>
                    <button class="btn-secondary" data-id="${o.id}" data-link="${o.postPermalink}">Open Post</button>
                    <button class="btn-success" data-publish="${o.id}">Publish Comment</button>
                    <button class="btn-danger" data-dismiss="${o.id}">Dismiss</button>
                `;
                opportunitiesList.appendChild(div);
            });
            opportunitiesList.querySelectorAll('button[data-link]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const link = e.currentTarget.dataset.link;
                    if (link) chrome.tabs.create({ url: link });
                });
            });
            opportunitiesList.querySelectorAll('button[data-dismiss]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = Number(e.currentTarget.dataset.dismiss);
                    chrome.runtime.sendMessage({ action: "DISMISS_OPPORTUNITY", id }, () => loadOpportunities());
                });
            });
            opportunitiesList.querySelectorAll('button[data-publish]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = Number(e.currentTarget.dataset.publish);
                    chrome.runtime.sendMessage({ action: "PUBLISH_OPPORTUNITY", id }, () => loadOpportunities());
                });
            });
        });
    };

    document.getElementById('btn_scan_targets').addEventListener('click', () => {
        const url = document.getElementById('input_search_url').value.trim();
        if (!url) return;
        if (scanStatus) scanStatus.textContent = "Scan en cours...";
        chrome.runtime.sendMessage({ action: "SCAN_TARGETS_FROM_SEARCH", searchUrl: url }, res => {
            if (scanStatus) scanStatus.textContent = res && res.success ? "Scan terminé." : "Échec du scan.";
            loadTargets();
        });
    });

    document.getElementById('btn_add_target').addEventListener('click', () => {
        const url = document.getElementById('input_profile_url').value.trim();
        if (!url) return;
        chrome.runtime.sendMessage({ action: "ADD_TARGET", profileUrl: url }, res => {
            if (scanStatus) scanStatus.textContent = res && res.success ? "Cible ajoutée." : "Cible non ajoutée.";
            loadTargets();
        });
    });

    document.getElementById('btn_save_watch').addEventListener('click', () => {
        const settings = {
            enabled: toggleWatch.checked,
            checkIntervalMinutes: Number(inputInterval.value || 30),
            maxTargetsPerCycle: Number(inputMaxTargets.value || 5),
            scoreThreshold: Number(inputThreshold.value || 60),
            requireManualApproval: toggleManual.checked
        };
        chrome.runtime.sendMessage({ action: "UPDATE_WATCH_SETTINGS", settings }, () => {
            chrome.runtime.sendMessage({ action: "TOGGLE_WATCH", enabled: settings.enabled });
        });
    });

    document.getElementById('btn_save_objectives').addEventListener('click', () => {
        const objectives = {
            goals: document.getElementById('input_goals').value,
            toneRules: document.getElementById('input_tone').value
        };
        chrome.runtime.sendMessage({ action: "UPDATE_OBJECTIVES", objectives }, () => {
            if (scanStatus) scanStatus.textContent = "Objectifs sauvegardés.";
        });
    });
});

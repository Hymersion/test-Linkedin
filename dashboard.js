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

    chrome.storage.local.get(['persona'], r => {
        if (promptBox) promptBox.value = r.persona || "Expert.";
    });

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
<<<<<<< HEAD
=======
                        if (res && res.error) {
                            alert(res.error);
                            return;
                        }
>>>>>>> codex/activer-cle-secrete-pour-fonctionnalites-76k82j
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
});

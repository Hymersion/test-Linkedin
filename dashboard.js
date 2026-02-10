let dashboardInitialized = false;

const bindFallbackNavigation = () => {
    const map = { 'nav_id': 'tab_id', 'nav_com': 'tab_com', 'nav_radar': 'tab_radar', 'nav_post': 'tab_post', 'nav_reseau': 'tab_reseau', 'nav_queue': 'tab_queue' };
    Object.keys(map).forEach(navId => {
        const el = document.getElementById(navId);
        if (!el || el.dataset.fallbackBound === "1") return;
        el.dataset.fallbackBound = "1";
        el.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            const targetTab = document.getElementById(map[navId]);
            if (targetTab) targetTab.classList.add('active');
        });
    });
};

const initDashboard = () => {
    if (dashboardInitialized) return;
    dashboardInitialized = true;

    const map = { 'nav_id': 'tab_id', 'nav_com': 'tab_com', 'nav_radar': 'tab_radar', 'nav_post': 'tab_post', 'nav_reseau': 'tab_reseau', 'nav_queue': 'tab_queue' };
    const API_KEY_STORAGE_KEY = "openaiApiKey";
    const HUNTER_SETTINGS_KEY = "hunterSettings";
    const HUNTER_CONSENT_KEY = "consentGiven";
    const onClick = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
        return el;
    };

    Object.keys(map).forEach(navId => {
        const el = document.getElementById(navId);
        if (!el) return;
        el.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            const targetTab = document.getElementById(map[navId]);
            if (targetTab) targetTab.classList.add('active');
            if(navId === 'nav_queue') loadQueue();
        });
    });

    const promptBox = document.getElementById('prompt_box');
    const apiKeyInput = document.getElementById('input_api_key');
    const hunterKeyword = document.getElementById('hunter_keyword');
    const hunterCustomQuery = document.getElementById('hunter_custom_query');
    const hunterLocation = document.getElementById('hunter_location');
    const hunterLanguage = document.getElementById('hunter_language');
    const hunterInclude = document.getElementById('hunter_include');
    const hunterExclude = document.getElementById('hunter_exclude');
    const hunterMax = document.getElementById('hunter_max');
    const hunterMaxAdd = document.getElementById('hunter_max_add');
    const hunterAutoConnect = document.getElementById('hunter_auto_connect');
    const hunterConsent = document.getElementById('hunter_consent');
    const hunterStatus = document.getElementById('hunter_status');
    const hunterCandidates = document.getElementById('hunter_candidates');
    const hunterUrl = document.getElementById('hunter_url');
    const hunterAddBtn = document.getElementById('btn_hunter_add');
    const hunterTargets = document.getElementById('hunter_targets');
    const hunterRefreshBtn = document.getElementById('btn_hunter_refresh');
    const hunterCategories = document.getElementById('hunter_categories');
    const hunterSort = document.getElementById('hunter_sort');
    const hunterFilterLetter = document.getElementById('hunter_filter_letter');
    const autoTargetsCategorySelect = document.getElementById('auto_targets_category_select');
    const autoScheduleDaily = document.getElementById('auto_schedule_daily');
    const autoScheduleWeekly = document.getElementById('auto_schedule_weekly');
    const autoTargetsStart = document.getElementById('btn_auto_targets_start');
    const autoFollowedPreview = document.getElementById('btn_auto_followed_preview');
    const autoFollowedPublish = document.getElementById('btn_auto_followed_publish');
    const autoCommentPreview = document.getElementById('auto_comment_preview');
    const autoCommentVerifyBtn = document.getElementById('btn_auto_comment_verify');
    const autoCommentPublishBtn = document.getElementById('btn_auto_comment_publish');
    const autoObjectives = document.getElementById('auto_objectives');
    const autoTestLimit = document.getElementById('auto_test_limit');
    const autoScheduleTimeButtons = document.querySelectorAll('[data-time]');
    const autoScheduleDayButtons = document.querySelectorAll('[data-day]');
    const autoScheduleEvery = document.getElementById('auto_schedule_every');
    const autoScheduleTimeSelect = document.getElementById('auto_schedule_time_select');
    const autoTabFeed = document.getElementById('auto_tab_feed');
    const lockPanelBtn = document.getElementById('btn_lock_panel');
    const autoTabFollowed = document.getElementById('auto_tab_followed');
    const radarTabSettings = document.getElementById('radar_tab_settings');
    const radarTabTargets = document.getElementById('radar_tab_targets');
    const autoSectionQuick = document.getElementById('auto_section_quick');
    const autoSectionFeed = document.getElementById('auto_section_feed');
    const autoSectionFollowed = document.getElementById('auto_section_followed');
    const autoSectionVerify = document.getElementById('auto_section_verify');
    const radarSectionHunt = document.getElementById('radar_section_hunt');
    const radarSectionDb = document.getElementById('radar_section_db');
    const radarSectionCandidates = document.getElementById('radar_section_candidates');
    let FOUND_COMS = [];
    let RADAR_OPPS = [];
    let HUNTER_LAST_CANDIDATES = [];

    const chromeAvailable = typeof chrome !== "undefined" && chrome.storage && chrome.runtime;

    if (lockPanelBtn) {
        lockPanelBtn.addEventListener('click', () => {
            if (!chromeAvailable) {
                alert("Fonctionnalité indisponible hors extension.");
                return;
            }
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                const activeTab = Array.isArray(tabs) && tabs.length ? tabs[0] : null;
                chrome.runtime.sendMessage({
                    action: "LOCK_DASHBOARD_PANEL",
                    tabId: activeTab && typeof activeTab.id === "number" ? activeTab.id : undefined,
                    windowId: activeTab && typeof activeTab.windowId === "number" ? activeTab.windowId : undefined
                }, (response) => {
                    if (response && response.success) {
                        window.close();
                        return;
                    }
                    alert((response && response.error) || "Impossible de verrouiller l'affichage.");
                });
            });
        });
    }

    if (chromeAvailable) {
        chrome.storage.local.get(['persona'], r => {
            if (promptBox) promptBox.value = r.persona || "Expert.";
        });
    }

    const loadApiKey = () => {
        if (!apiKeyInput) return;
        if (!chromeAvailable) return;
        chrome.storage.sync.get([API_KEY_STORAGE_KEY], syncResult => {
            const syncKey = (syncResult[API_KEY_STORAGE_KEY] || "").trim();
            if (syncKey) {
                apiKeyInput.value = syncKey;
                return;
            }
            chrome.storage.local.get([API_KEY_STORAGE_KEY], localResult => {
                apiKeyInput.value = (localResult[API_KEY_STORAGE_KEY] || "").trim();
            });
        });
    };

    loadApiKey();

    const loadHunterSettings = () => {
        if (!chromeAvailable) return;
        chrome.storage.local.get([HUNTER_SETTINGS_KEY, HUNTER_CONSENT_KEY], r => {
            const settings = r[HUNTER_SETTINGS_KEY] || {};
            if (hunterKeyword) hunterKeyword.value = settings.keyword || "";
            if (hunterCustomQuery) hunterCustomQuery.value = settings.customQuery || "";
            if (hunterLocation) hunterLocation.value = settings.location || "";
            if (hunterLanguage) hunterLanguage.value = settings.language || "";
            if (hunterInclude) hunterInclude.value = settings.includeKeywords || "";
            if (hunterExclude) hunterExclude.value = settings.excludeKeywords || "";
            if (hunterMax) hunterMax.value = settings.maxProfilesPerRun || 30;
            if (hunterMaxAdd) hunterMaxAdd.value = settings.maxAddPerRun || 20;
            if (hunterAutoConnect) hunterAutoConnect.checked = Boolean(settings.autoConnect);
            if (hunterConsent) hunterConsent.checked = Boolean(r[HUNTER_CONSENT_KEY]);
        });
    };

    const saveHunterSettings = () => {
        const settings = {
            keyword: hunterKeyword ? hunterKeyword.value.trim() : "",
            customQuery: hunterCustomQuery ? hunterCustomQuery.value.trim() : "",
            location: hunterLocation ? hunterLocation.value.trim() : "",
            language: hunterLanguage ? hunterLanguage.value.trim() : "",
            includeKeywords: hunterInclude ? hunterInclude.value.trim() : "",
            excludeKeywords: hunterExclude ? hunterExclude.value.trim() : "",
            maxProfilesPerRun: hunterMax ? Number(hunterMax.value || 30) : 30,
            maxAddPerRun: hunterMaxAdd ? Number(hunterMaxAdd.value || 20) : 20,
            autoConnect: hunterAutoConnect ? hunterAutoConnect.checked : false
        };
        if (chromeAvailable) {
            chrome.storage.local.set({ [HUNTER_SETTINGS_KEY]: settings });
        }
        return settings;
    };

    const setHunterStatus = (text, isError = false) => {
        if (!hunterStatus) return;
        hunterStatus.textContent = text;
        hunterStatus.style.color = isError ? "#dc2626" : "";
    };

    const renderHunterCandidates = (candidates) => {
        if (!hunterCandidates) return;
        hunterCandidates.innerHTML = "";
        if (!candidates || candidates.length === 0) {
            hunterCandidates.innerHTML = "<p class=\"muted\">Aucun candidat.</p>";
            return;
        }
        candidates.forEach((c, idx) => {
            const row = document.createElement('div');
            row.className = "card";
            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; gap:8px;">
                    <div>
                        <b>${c.fullName || "Profil"}</b><br>
                        <span class="muted">${c.headline || ""}</span><br>
                        <a href="${c.profileUrl}" target="_blank" rel="noopener noreferrer">${c.profileUrl}</a>
                        ${c.reason ? `<div class="muted">IA: ${c.reason}</div>` : ""}
                    </div>
                    <div>
                        <input type="checkbox" id="hunter-cand-${idx}" ${c.prechecked ? "checked" : ""}>
                    </div>
                </div>
            `;
            hunterCandidates.appendChild(row);
        });
    };

    const applyTargetFilters = (targets) => {
        const letter = hunterFilterLetter ? hunterFilterLetter.value.trim().toLowerCase() : "";
        let nextTargets = targets.slice();
        if (letter) {
            nextTargets = nextTargets.filter(t => (t.fullName || "").toLowerCase().startsWith(letter));
        }
        const sortValue = hunterSort ? hunterSort.value : "date_desc";
        if (sortValue === "date_asc") {
            nextTargets.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
        } else if (sortValue === "alpha_asc") {
            nextTargets.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
        } else if (sortValue === "alpha_desc") {
            nextTargets.sort((a, b) => (b.fullName || "").localeCompare(a.fullName || ""));
        } else {
            nextTargets.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        }
        return nextTargets;
    };

    let activeCategory = "Toutes";

    const renderCategories = (grouped) => {
        if (!hunterCategories) return;
        const categories = Object.keys(grouped).sort();
        hunterCategories.innerHTML = "";
        const allButton = document.createElement('button');
        allButton.className = "btn-secondary";
        allButton.textContent = `Toutes (${categories.reduce((acc, key) => acc + grouped[key].length, 0)})`;
        allButton.style.marginBottom = "6px";
        allButton.onclick = () => {
            activeCategory = "Toutes";
            loadTargets();
        };
        hunterCategories.appendChild(allButton);
        categories.forEach(category => {
            const btn = document.createElement('button');
            btn.className = "btn-secondary";
            btn.style.marginBottom = "6px";
            btn.textContent = `${category} (${grouped[category].length})`;
            btn.onclick = () => {
                activeCategory = category;
                loadTargets();
            };
            hunterCategories.appendChild(btn);
        });
    };

    const renderTargets = (targets) => {
        if (!hunterTargets) return;
        hunterTargets.innerHTML = "";
        if (autoTargetsCategorySelect) {
            const categories = Array.from(new Set((targets || []).map(t => t.category || "Sans catégorie"))).sort();
            autoTargetsCategorySelect.innerHTML = "";
            const allOption = document.createElement('option');
            allOption.value = "all";
            allOption.textContent = "Toutes les catégories";
            autoTargetsCategorySelect.appendChild(allOption);
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                autoTargetsCategorySelect.appendChild(opt);
            });
        }
        const grouped = (targets || []).reduce((acc, t) => {
            const key = t.category || "Sans catégorie";
            if (!acc[key]) acc[key] = [];
            acc[key].push(t);
            return acc;
        }, {});
        const categoryKeys = Object.keys(grouped);
        renderCategories(grouped);
        if (categoryKeys.length === 0) {
            hunterTargets.innerHTML = "<p class=\"muted\">Aucune cible enregistrée.</p>";
            return;
        }
        const filteredKeys = activeCategory === "Toutes"
            ? categoryKeys.sort()
            : categoryKeys.filter(key => key === activeCategory);
        filteredKeys.forEach(category => {
            const header = document.createElement('div');
            header.className = "card";
            header.innerHTML = `<b>${category}</b> <span class="muted">(${grouped[category].length})</span>`;
            hunterTargets.appendChild(header);
            const filtered = applyTargetFilters(grouped[category]);
            filtered.forEach((t) => {
                const row = document.createElement('div');
                row.className = "card";
                row.innerHTML = `
                    <div style="display:flex; justify-content:space-between; gap:8px;">
                        <div>
                            <b>${t.fullName || "Profil"}</b><br>
                            <span class="muted">${t.headline || ""}</span><br>
                            <span class="muted">Ajouté: ${t.addedAt ? new Date(t.addedAt).toLocaleString() : "N/A"}</span><br>
                            <span class="muted">Commentaires: ${t.commentsCount || 0}</span><br>
                            <span class="muted">Récap: ${Array.isArray(t.commentsSummary) && t.commentsSummary.length ? t.commentsSummary.join(" • ") : "Aucun"}</span><br>
                            <a href="${t.profileUrl}" target="_blank" rel="noopener noreferrer">${t.profileUrl}</a>
                        </div>
                        <div>
                            <button class="btn-secondary" data-connect="${t.profileUrl}">🔗</button>
                            <button class="btn-secondary" data-hook="${t.profileUrl}">✉️</button>
                        </div>
                    </div>
                `;
                hunterTargets.appendChild(row);
            });
        });
        hunterTargets.querySelectorAll('[data-connect]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.currentTarget.dataset.connect;
                if (!url) return;
                if (!chromeAvailable) {
                    setHunterStatus("Fonctionnalité indisponible hors extension.", true);
                    return;
                }
                chrome.runtime.sendMessage({ action: "CONNECT_TARGET", profileUrl: url }, response => {
                    if (!response || !response.success) {
                        setHunterStatus(response && response.error ? response.error : "Connexion échouée.", true);
                        return;
                    }
                    setHunterStatus("Demande de connexion envoyée.");
                });
            });
        });
        hunterTargets.querySelectorAll('[data-hook]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.currentTarget.dataset.hook;
                if (!url) return;
                if (!chromeAvailable) {
                    setHunterStatus("Fonctionnalité indisponible hors extension.", true);
                    return;
                }
                chrome.runtime.sendMessage({ action: "GENERATE_HOOK_MESSAGE", profileUrl: url }, response => {
                    if (!response || !response.success) {
                        setHunterStatus(response && response.error ? response.error : "Génération échouée.", true);
                        return;
                    }
                    setHunterStatus(`Message d'accroche: ${response.message}`);
                });
            });
        });

        if (autoCommentPreview) {
            autoCommentPreview.innerHTML = "";
            const pending = [];
            (targets || []).forEach(t => {
                const suggestions = t && t.pendingComments && Array.isArray(t.pendingComments.suggestions)
                    ? t.pendingComments.suggestions
                    : [];
                suggestions.forEach((s, idx) => {
                    pending.push({
                        profileUrl: t.profileUrl,
                        fullName: t.fullName || "Profil",
                        suggestion: s,
                        key: `${t.profileUrl || 'profile'}-${idx}`
                    });
                });
            });
            if (!pending.length) {
                autoCommentPreview.innerHTML = '<p class="muted">Aucune proposition de commentaire pour le moment.</p>';
            } else {
                pending.slice(0, 30).forEach((item, idx) => {
                    const row = document.createElement('div');
                    row.className = 'card';
                    row.innerHTML = `
                        <div style="display:flex;justify-content:space-between;gap:8px;">
                            <div>
                                <b>${item.fullName}</b><br>
                                <span class="muted">${(item.suggestion.postText || '').substring(0, 120)}...</span><br>
                                <textarea id="pending-comment-${idx}" style="width:100%;margin-top:6px;">${item.suggestion.comment || ''}</textarea>
                            </div>
                            <div>
                                <input type="checkbox" id="pending-check-${idx}" checked>
                            </div>
                        </div>
                    `;
                    autoCommentPreview.appendChild(row);
                });
            }
        }
    };

    const loadTargets = () => {
        if (!chromeAvailable) return;
        chrome.storage.local.get(['targets'], r => {
            renderTargets(r.targets || []);
        });
    };

    if (chromeAvailable && autoObjectives) {
        chrome.storage.local.get(['autoObjectives'], r => {
            autoObjectives.value = r.autoObjectives || "";
        });
        autoObjectives.addEventListener('blur', () => {
            chrome.storage.local.set({ autoObjectives: autoObjectives.value.trim() });
        });
    }

    const setActiveButton = (buttons, activeValue, attr) => {
        buttons.forEach(btn => {
            const isActive = btn.getAttribute(attr) === activeValue;
            btn.classList.toggle('btn-accent', isActive);
            btn.classList.toggle('btn-secondary', !isActive);
        });
    };

    const toggleButton = (btn, active) => {
        btn.classList.toggle('btn-accent', active);
        btn.classList.toggle('btn-secondary', !active);
    };

    const scheduleState = {
        frequency: 'daily',
        time: '10:00',
        days: new Set(),
        everyDays: '1'
    };

    if (autoScheduleDaily && autoScheduleWeekly) {
        autoScheduleDaily.addEventListener('click', () => {
            scheduleState.frequency = 'daily';
            toggleButton(autoScheduleDaily, true);
            toggleButton(autoScheduleWeekly, false);
        });
        autoScheduleWeekly.addEventListener('click', () => {
            scheduleState.frequency = 'weekly';
            toggleButton(autoScheduleWeekly, true);
            toggleButton(autoScheduleDaily, false);
        });
        toggleButton(autoScheduleDaily, true);
        toggleButton(autoScheduleWeekly, false);
    }

    if (autoScheduleTimeButtons.length) {
        autoScheduleTimeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                scheduleState.time = btn.getAttribute('data-time');
                if (autoScheduleTimeSelect) autoScheduleTimeSelect.value = scheduleState.time;
                setActiveButton(autoScheduleTimeButtons, scheduleState.time, 'data-time');
            });
        });
        setActiveButton(autoScheduleTimeButtons, scheduleState.time, 'data-time');
    }

    if (autoScheduleTimeSelect) {
        autoScheduleTimeSelect.value = scheduleState.time;
        autoScheduleTimeSelect.addEventListener('change', () => {
            scheduleState.time = autoScheduleTimeSelect.value;
            setActiveButton(autoScheduleTimeButtons, scheduleState.time, 'data-time');
        });
    }

    if (autoScheduleEvery) {
        autoScheduleEvery.value = scheduleState.everyDays;
        autoScheduleEvery.addEventListener('change', () => {
            scheduleState.everyDays = autoScheduleEvery.value;
        });
    }

    if (autoScheduleDayButtons.length) {
        autoScheduleDayButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const day = btn.getAttribute('data-day');
                if (scheduleState.days.has(day)) {
                    scheduleState.days.delete(day);
                    toggleButton(btn, false);
                } else {
                    scheduleState.days.add(day);
                    toggleButton(btn, true);
                }
            });
        });
    }

    if (autoTargetsStart) {
        autoTargetsStart.addEventListener('click', () => {
            const category = autoTargetsCategorySelect ? autoTargetsCategorySelect.value : 'all';
            const testLimit = autoTestLimit ? Number(autoTestLimit.value) : 2;
            const objectives = autoObjectives ? autoObjectives.value.trim() : "";
            const days = Array.from(scheduleState.days).join(', ') || 'tous';
            const cadence = `tous les ${scheduleState.everyDays} jours à ${scheduleState.time}`;

            if (!chromeAvailable) {
                setHunterStatus("Fonctionnalité indisponible hors extension.", true);
                return;
            }

            setHunterStatus(`Démarrage scan suivi: ${category} • ${cadence} • ${scheduleState.frequency} • ${days}`);
            chrome.runtime.sendMessage({
                action: "START_FOLLOWED_SCAN",
                category,
                objectives,
                testLimit
            }, response => {
                if (!response || !response.success) {
                    setHunterStatus(response && response.error ? response.error : "Scan des profils suivis échoué.", true);
                    return;
                }
                loadTargets();
                setHunterStatus(response.message || `Scan terminé: ${response.count || 0} profils traités.`);
            });
        });
    }

    if (autoFollowedPreview) {
        autoFollowedPreview.addEventListener('click', () => {
            const category = autoTargetsCategorySelect ? autoTargetsCategorySelect.value : 'all';
            const testLimit = autoTestLimit ? Number(autoTestLimit.value) : 2;
            if (!chromeAvailable) {
                setHunterStatus("Fonctionnalité indisponible hors extension.", true);
                return;
            }
            setHunterStatus(`Test de scan en cours pour: ${category}`);
            chrome.runtime.sendMessage({
                action: "START_FOLLOWED_SCAN",
                category,
                objectives: autoObjectives ? autoObjectives.value.trim() : "",
                testLimit
            }, response => {
                if (!response || !response.success) {
                    setHunterStatus(response && response.error ? response.error : "Test de scan échoué.", true);
                    return;
                }
                loadTargets();
                setHunterStatus(response.message || `Test terminé: ${response.count || 0} profils détectés.`);
            });
        });
    }

    if (autoFollowedPublish) {
        autoFollowedPublish.addEventListener('click', () => {
            const category = autoTargetsCategorySelect ? autoTargetsCategorySelect.value : 'all';
            if (!chromeAvailable) {
                setHunterStatus("Fonctionnalité indisponible hors extension.", true);
                return;
            }
            setHunterStatus(`Publication des commentaires sélectionnés pour: ${category}`);
            chrome.runtime.sendMessage({
                action: "PUBLISH_FOLLOWED_SCAN",
                category,
                objectives: autoObjectives ? autoObjectives.value.trim() : ""
            }, response => {
                if (!response || !response.success) {
                    setHunterStatus(response && response.error ? response.error : "Publication échouée.", true);
                    return;
                }
                setHunterStatus("Publication terminée.");
            });
        });
    }

    if (autoCommentVerifyBtn) {
        autoCommentVerifyBtn.addEventListener('click', () => {
            loadTargets();
            setHunterStatus("Propositions rechargées depuis les profils suivis.");
        });
    }

    if (autoCommentPublishBtn) {
        autoCommentPublishBtn.addEventListener('click', () => {
            setHunterStatus("Publication manuelle: sélectionnez les commentaires à publier dans la liste puis lancez la publication des suivis.");
        });
    }

    const setDisplay = (el, visible) => {
        if (!el) return;
        el.style.display = visible ? 'block' : 'none';
    };

    const setActiveTabButtons = (activeBtn, otherBtn) => {
        if (!activeBtn || !otherBtn) return;
        activeBtn.classList.add('btn-accent');
        activeBtn.classList.remove('btn-secondary');
        otherBtn.classList.add('btn-secondary');
        otherBtn.classList.remove('btn-accent');
    };

    if (autoTabFeed && autoTabFollowed) {
        autoTabFeed.addEventListener('click', () => {
            setActiveTabButtons(autoTabFeed, autoTabFollowed);
            setDisplay(autoSectionQuick, true);
            setDisplay(autoSectionFeed, true);
            setDisplay(autoSectionFollowed, false);
            setDisplay(autoSectionVerify, false);
        });
        autoTabFollowed.addEventListener('click', () => {
            setActiveTabButtons(autoTabFollowed, autoTabFeed);
            setDisplay(autoSectionQuick, false);
            setDisplay(autoSectionFeed, false);
            setDisplay(autoSectionFollowed, true);
            setDisplay(autoSectionVerify, true);
        });
        autoTabFeed.click();
    }

    if (radarTabSettings && radarTabTargets) {
        radarTabSettings.addEventListener('click', () => {
            setActiveTabButtons(radarTabSettings, radarTabTargets);
            setDisplay(radarSectionHunt, true);
            setDisplay(radarSectionDb, false);
            setDisplay(radarSectionCandidates, false);
        });
        radarTabTargets.addEventListener('click', () => {
            setActiveTabButtons(radarTabTargets, radarTabSettings);
            setDisplay(radarSectionHunt, false);
            setDisplay(radarSectionDb, true);
            setDisplay(radarSectionCandidates, true);
        });
        radarTabSettings.click();
    }

    loadHunterSettings();
    loadTargets();

    function nav(key, url, cb) {
        if (!chromeAvailable) {
            alert("Fonctionnalité indisponible hors extension.");
            return;
        }
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
    onClick('btn_scan_post', () => {
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
    onClick('btn_pub_all', () => {
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
    onClick('btn_scan_radar', () => {
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

    onClick('btn_pub_radar', () => {
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
    onClick('btn_ideas', () => {
        if (!chromeAvailable) {
            alert("Fonctionnalité indisponible hors extension.");
            return;
        }
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

    onClick('btn_pub_now', () => {
        if(!chromeAvailable) {
            alert("Fonctionnalité indisponible hors extension.");
            return;
        }
        if(confirm("Publier ?")) nav("linkedin.com/feed", "https://www.linkedin.com/feed/", tid => {
            chrome.tabs.sendMessage(tid, {action:"WRITE_POST_ON_LINKEDIN", content:document.getElementById('input_final').value, autoPost:true});
        });
    });

    onClick('btn_add_queue', () => {
        const txt = document.getElementById('input_final').value;
        const time = document.getElementById('schedule_time').value;
        if(!txt || !time) return alert("Remplir texte et date");
        if (!chromeAvailable) {
            alert("Fonctionnalité indisponible hors extension.");
            return;
        }
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
        if (!chromeAvailable) return;
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
    onClick('btn_refresh_queue', loadQueue);
    
    onClick('btn_scan_profile', () => {
        if (!chromeAvailable) {
            alert("Fonctionnalité indisponible hors extension.");
            return;
        }
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
    onClick('btn_save', () => {
        if (!chromeAvailable) {
            alert("Fonctionnalité indisponible hors extension.");
            return;
        }
        chrome.storage.local.set({persona:promptBox.value}, ()=>alert("Sauvé"));
    });

    if (apiKeyInput) {
        onClick('btn_save_api_key', () => {
            if (!chromeAvailable) {
                alert("Fonctionnalité indisponible hors extension.");
                return;
            }
            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                chrome.storage.sync.remove([API_KEY_STORAGE_KEY], () => {
                    chrome.storage.local.remove([API_KEY_STORAGE_KEY], () => alert("Clé supprimée."));
                });
                return;
            }
            chrome.storage.sync.set({ [API_KEY_STORAGE_KEY]: apiKey }, () => {
                chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: apiKey }, () => alert("Clé sauvegardée."));
            });
        });
    }

    if (hunterConsent) {
        hunterConsent.addEventListener('change', () => {
            if (!chromeAvailable) return;
            chrome.storage.local.set({ [HUNTER_CONSENT_KEY]: hunterConsent.checked });
        });
    }

    const runHunter = (payload) => {
        setHunterStatus("Chasse en cours...");
        if (!chromeAvailable) {
            setHunterStatus("Fonctionnalité indisponible hors extension.", true);
            return;
        }
        chrome.runtime.sendMessage(payload, response => {
            if (!response) {
                setHunterStatus("Erreur: aucune réponse.", true);
                return;
            }
            if (!response.success) {
                setHunterStatus(response.error || "Erreur pendant la chasse.", true);
                return;
            }
            HUNTER_LAST_CANDIDATES = response.candidates || [];
            renderHunterCandidates(HUNTER_LAST_CANDIDATES);
            loadTargets();
            const connected = Number(response.connected || 0);
            const failed = Array.isArray(response.connectionErrors) ? response.connectionErrors.length : 0;
            const autoConnectEnabled = Boolean(payload.settings && payload.settings.autoConnect);
            const autoConnectSuffix = autoConnectEnabled
                ? ` Connexions envoyées: ${connected}${failed ? `, échecs: ${failed}` : ""}.`
                : "";
            setHunterStatus(`Chasse terminée: ${response.added || 0} ajoutés, ${response.rejected || 0} rejetés.${autoConnectSuffix}`);
        });
    };

    const hunterStartBtn = document.getElementById('btn_hunter_start');
    if (hunterStartBtn) {
        hunterStartBtn.addEventListener('click', () => {
            const settings = saveHunterSettings();
            const category = settings.keyword || "Général";
            runHunter({
                action: "START_AUTO_HUNT",
                category,
                settings,
                consentGiven: hunterConsent ? hunterConsent.checked : false
            });
        });
    }

    const hunterImportBtn = document.getElementById('btn_hunter_import');
    if (hunterImportBtn) {
        hunterImportBtn.addEventListener('click', () => {
            const settings = saveHunterSettings();
            const url = hunterUrl ? hunterUrl.value.trim() : "";
            if (!url) {
                setHunterStatus("Veuillez coller une URL LinkedIn.", true);
                return;
            }
            runHunter({
                action: "IMPORT_HUNT_URL",
                url,
                settings,
                consentGiven: hunterConsent ? hunterConsent.checked : false
            });
        });
    }

    if (hunterAddBtn) {
        hunterAddBtn.addEventListener('click', () => {
            const selected = HUNTER_LAST_CANDIDATES.filter((c, idx) => {
                const checkbox = document.getElementById(`hunter-cand-${idx}`);
                return checkbox && checkbox.checked;
            });
            if (selected.length === 0) {
                setHunterStatus("Aucun candidat sélectionné.", true);
                return;
            }
            if (!chromeAvailable) {
                setHunterStatus("Fonctionnalité indisponible hors extension.", true);
                return;
            }
            const settings = saveHunterSettings();
            chrome.runtime.sendMessage({
                action: "ADD_TARGETS",
                candidates: selected,
                autoConnect: Boolean(settings && settings.autoConnect)
            }, response => {
                if (!response || !response.success) {
                    setHunterStatus("Erreur lors de l'ajout des cibles.", true);
                    return;
                }
                loadTargets();
                const connected = Number(response.connected || 0);
                const added = Number(response.added || 0);
                const failed = Array.isArray(response.connectionErrors) ? response.connectionErrors.length : 0;
                if (Boolean(settings && settings.autoConnect)) {
                    setHunterStatus(`Cibles ajoutées: ${added}. Connexions envoyées: ${connected}${failed ? `, échecs: ${failed}` : ""}.`);
                    return;
                }
                setHunterStatus(`Cibles ajoutées: ${added}.`);
            });
        });
    }

    if (hunterRefreshBtn) {
        hunterRefreshBtn.addEventListener('click', () => {
            loadTargets();
        });
    }

    if (hunterSort) {
        hunterSort.addEventListener('change', () => loadTargets());
    }
    if (hunterFilterLetter) {
        hunterFilterLetter.addEventListener('input', () => loadTargets());
    }
};

const safeInitDashboard = () => {
    try {
        initDashboard();
    } catch (error) {
        console.error("Dashboard init failed:", error);
        bindFallbackNavigation();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInitDashboard);
} else {
    safeInitDashboard();
}

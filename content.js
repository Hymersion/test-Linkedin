if (!window.ghostlyLoaded) {
    window.ghostlyLoaded = true;
    console.log("👻 Ghostly V127 Loaded");

    const SELECTORS = window.GHOSTLY_SELECTORS || {};

    const log = (msg) => {
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

    const findSubmitButton = (container) => {
        if (!container) return null;
        return container.querySelector('.artdeco-button--primary') ||
               container.querySelector('button[type="submit"]') ||
               container.querySelector('button[aria-label*="Publier"]') ||
               container.querySelector('button[aria-label*="Post"]');
    };

    const getElementLabel = (el) => (el && (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || "") || "").toLowerCase().trim();

    const isConnectLabel = (label) => {
        if (!label) return false;
        return label.includes('se connecter') ||
            label.includes('connect') ||
            label.includes('inviter') ||
            label.includes('invitation');
    };

    const findConnectButton = (ctx = document) => {
        const buttons = Array.from(ctx.querySelectorAll('button'));
        const match = buttons.find(btn => {
            const label = getElementLabel(btn);
            if (!isConnectLabel(label)) return false;
            if (label.includes('déconnecter') || label.includes('disconnect')) return false;
            return true;
        });
        return match || null;
    };

    const findMoreActionsButton = (ctx = document) => {
        const buttons = Array.from(ctx.querySelectorAll('button'));
        return buttons.find(btn => {
            const label = getElementLabel(btn);
            return label.includes('plus') || label.includes('more') || label.includes('autres actions');
        }) || null;
    };

    const waitForElement = async (selector, ctx = document, attempts = 12, delay = 400) => {
        for (let i = 0; i < attempts; i++) {
            const el = ctx.querySelector(selector);
            if (el) return el;
            await new Promise(r => setTimeout(r, delay));
        }
        return null;
    };


    const clickConnectFromOverflow = async () => {
        const moreBtn = findMoreActionsButton();
        if (!moreBtn) return false;
        forceClick(moreBtn);
        await new Promise(r => setTimeout(r, 500));

        const options = Array.from(document.querySelectorAll('div[role="menuitem"], li[role="menuitem"], button, div[role="button"]'));
        const connectOption = options.find(el => isConnectLabel(getElementLabel(el)));
        if (!connectOption) return false;
        forceClick(connectOption.closest('button') || connectOption);
        return true;
    };

    const completeInviteModal = async (customMessage) => {
        await new Promise(r => setTimeout(r, 700));
        const modal = document.querySelector('[role="dialog"], .artdeco-modal');
        if (!modal) return { success: true };

        if (customMessage && String(customMessage).trim()) {
            const addNoteButton = findByText('button', ['ajouter une note', 'add a note'], modal) || findByText('span', ['ajouter une note', 'add a note'], modal);
            const addNoteClickable = addNoteButton ? (addNoteButton.closest('button') || addNoteButton) : null;
            if (addNoteClickable) {
                forceClick(addNoteClickable);
                const textarea = await waitForElement('textarea#custom-message, textarea[name="message"], textarea', modal, 8, 300);
                if (textarea) {
                    textarea.focus();
                    textarea.value = String(customMessage).trim().slice(0, 280);
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }

        const sendButton = findByText('button', ['envoyer', 'send']) || findByText('span', ['envoyer', 'send']);
        const sendClickable = sendButton ? (sendButton.closest('button') || sendButton) : null;
        if (sendClickable) {
            forceClick(sendClickable);
            return { success: true };
        }

        const noNoteButton = findByText('button', ['sans note', 'without a note']) || findByText('span', ['sans note', 'without a note']);
        const noNoteClickable = noNoteButton ? (noNoteButton.closest('button') || noNoteButton) : null;
        if (noNoteClickable) {
            forceClick(noNoteClickable);
            return { success: true };
        }

        return { success: false, error: "Invitation ouverte mais confirmation introuvable." };
    };

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
    const selectors = window.GHOSTLY_SELECTORS || { search: { main: "main", profileLink: "a[href*=\"/in/\"]", profileCard: "li, div" }, auth: { loginForm: "form[action*=\"login\"], input[name=\"session_key\"], input#username" } };
    const isLoginPage = () => Boolean(document.querySelector(selectors.auth.loginForm)) || window.location.href.includes("linkedin.com/login");

    const getCandidateCard = (linkEl) => {
        if (!linkEl) return null;
        let card = linkEl.closest(selectors.search.profileCard);
        if (!card) card = linkEl.parentElement;
        return card || linkEl;
    };

    const extractCandidate = (linkEl) => {
        if (!linkEl) return null;
        const profileUrl = linkEl.href ? linkEl.href.split("?")[0] : "";
        if (!profileUrl.includes("/in/")) return null;
        const card = getCandidateCard(linkEl);
        const fullName = linkEl.innerText.trim() || linkEl.getAttribute("aria-label") || "Profil LinkedIn";
        let headline = "";
        if (card) {
            const ariaText = card.querySelector('[aria-hidden="true"]');
            if (ariaText) headline = ariaText.innerText.trim();
        }
        return { profileUrl, fullName, headline };
    };

    const collectRecentPosts = (limit = 10) => {
        const posts = [];
        const candidates = document.querySelectorAll('div[data-urn]');
        candidates.forEach((el) => {
            if (posts.length >= limit) return;
            const urn = el.getAttribute('data-urn');
            if (!urn || (!urn.includes('activity') && !urn.includes('ugcPost'))) return;
            const txt = el.innerText || "";
            if (txt.length < 40) return;
            posts.push({ urn, text: txt.substring(0, 400) });
        });
        return posts;
    };

    const scrollAndCollect = async (limit = 10) => {
        let posts = collectRecentPosts(limit);
        let attempts = 0;
        while (posts.length < limit && attempts < 4) {
            window.scrollBy(0, 800);
            await new Promise(r => setTimeout(r, 1200));
            posts = collectRecentPosts(limit);
            attempts += 1;
        }
        return posts;
    };

    const isLoggedOut = () => {
        return !!document.querySelector(SELECTORS.loginField || 'input[name="session_key"]');
    };

    const parseRecency = (label) => {
        if (!label) return null;
        const text = label.trim().toLowerCase();
        const match = text.match(/(\d+)\s*(s|m|h|d|w|sem|mo|yr|an|ans)/);
        if (!match) return null;
        const value = Number(match[1]);
        const unit = match[2];
        const secondsMap = { s: 1, m: 60, h: 3600, d: 86400, w: 604800, sem: 604800, mo: 2592000, yr: 31536000, an: 31536000, ans: 31536000 };
        return value * (secondsMap[unit] || 0);
    };

    const scrapeSearchResultsCandidates = () => {
        if (isLoggedOut()) {
            return { success: false, error: "NOT_LOGGED_IN", candidates: [] };
        }
        const cards = Array.from(document.querySelectorAll(SELECTORS.searchResultCard || 'li'));
        const seen = new Set();
        const candidates = [];
        cards.forEach(card => {
            const link = card.querySelector(SELECTORS.profileLink || 'a[href*="/in/"]');
            if (!link) return;
            const href = link.href || "";
            if (!href.includes("/in/")) return;
            const profileUrl = href.split('?')[0];
            if (seen.has(profileUrl)) return;
            seen.add(profileUrl);
            const nameEl = card.querySelector(SELECTORS.fullName || 'span[aria-hidden="true"]');
            const headlineEl = card.querySelector(SELECTORS.headline || '.entity-result__primary-subtitle');
            candidates.push({
                profileUrl,
                fullName: nameEl ? nameEl.innerText.trim() : "",
                headline: headlineEl ? headlineEl.innerText.trim() : ""
            });
        });
        return { success: true, candidates };
    };

    const scrapeLatestPostFromProfile = () => {
        if (isLoggedOut()) {
            return { success: false, error: "NOT_LOGGED_IN" };
        }
        const containers = Array.from(document.querySelectorAll(SELECTORS.profilePostContainer || '[data-urn]'))
            .filter(el => {
                const urn = el.getAttribute('data-urn') || "";
                return urn.includes('activity') || urn.includes('ugcPost');
            });
        if (!containers.length) {
            return { success: true, postUrn: "", postText: "", recencySecondsEstimate: null, postPermalink: "" };
        }
        const el = containers[0];
        const postUrn = el.getAttribute('data-urn');
        const textEl = el.querySelector(SELECTORS.postText || 'span[dir="ltr"]');
        const postText = textEl ? textEl.innerText.trim().slice(0, 600) : (el.innerText || "").trim().slice(0, 600);
        const recencyEl = el.querySelector(SELECTORS.recencyLabel || 'time');
        const recencySecondsEstimate = parseRecency(recencyEl ? recencyEl.innerText : "");
        const link = el.querySelector('a[href*="/posts/"], a[href*="/activity/"]');
        const postPermalink = link ? link.href.split('?')[0] : "";
        return { success: true, postUrn, postText, recencySecondsEstimate, postPermalink };
    };

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        
        // --- 1. SCAN FEED (RADAR ATOMIQUE) ---
        if (request.action === "SCAN_FEED") {
            (async () => {
                log("Scan Radar Atomique...");
                const start = Date.now();
                // Scroll
                while (Date.now() - start < (request.duration * 1000)) { 
                    window.scrollBy(0, 600); 
                    await new Promise(r => setTimeout(r, 1000));
                }
                
                const posts = [];
                // SELECTEUR ATOMIQUE : Tout ce qui a un ID LinkedIn (URN)
                const candidates = document.querySelectorAll('div[data-urn]');
                
                log(`Analyse de ${candidates.length} blocs...`);

                candidates.forEach((el, index) => {
                    const urn = el.getAttribute('data-urn');
                    const txt = el.innerText;
                    
                    // On ne garde que les vrais posts (activity ou ugcPost)
                    if (urn && (urn.includes('activity') || urn.includes('ugcPost'))) {
                        
                        // Filtre de qualité basique
                        if (txt.length > 50 && !txt.includes('Promoted') && !txt.includes('Sponsorisé')) {
                            
                            // Extraction Auteur robuste
                            let author = "Auteur Inconnu";
                            const authEl = el.querySelector('.update-components-actor__name') || 
                                           el.querySelector('.feed-shared-actor__name') ||
                                           el.querySelector('span[dir="ltr"] strong'); // Fallback
                                           
                            if(authEl) author = authEl.innerText.split('\n')[0].trim();

                            // Anti-doublon
                            if(!posts.find(p => p.urn === urn)) {
                                posts.push({ 
                                    tempId: index, 
                                    urn: urn, 
                                    author: author, 
                                    text: txt.substring(0, 300) 
                                });
                            }
                        }
                    }
                });
                
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
                        await new Promise(r => setTimeout(r, 1200)); 
                        
                        // 2. Ecrire
                        const ed = el.querySelector('[contenteditable="true"]') ||
                                   el.querySelector('.ql-editor') ||
                                   await waitForElement('[contenteditable="true"]', el);
                        if(ed){ 
                            await securePaste(ed, request.text);
                            
                            // 3. Publier (Recherche Locale)
                            // On cherche le bouton DANS le conteneur du commentaire
                            const container = ed.closest('form') || ed.closest('.comments-comment-box') || el;
                            
                            if (container) {
                                let submit = findSubmitButton(container);
                                
                                if (!submit) { // Fallback texte
                                    const txtSubmit = findByText('span', ['publier', 'post'], container);
                                    if(txtSubmit) submit = txtSubmit.closest('button');
                                }

                                if(!submit) submit = findSubmitButton(document);
                                if(!submit) {
                                    const globalTxt = findByText('span', ['publier', 'post'], document);
                                    if (globalTxt) submit = globalTxt.closest('button');
                                }

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
                    for(let b of btns) {
                        const txt = b.innerText.toLowerCase();
                        if(txt.includes('voir plus') || txt.includes('load more')) b.click();
                    }
                } catch(e){}
                await new Promise(r => setTimeout(r, 2000));
                
                const data = [];
                const articles = document.querySelectorAll('article');
                
                articles.forEach((el, index) => {
                    const authLink = el.querySelector('a[href*="/in/"]');
                    if (authLink) {
                        let textEl = el.querySelector('span[dir="ltr"]');
                        let rawText = textEl ? textEl.innerText : el.innerText;
                        const authorName = authLink.innerText.split('\n')[0].trim();
                        rawText = rawText.replace(authorName, "").trim();

                        if(rawText.length > 2 && !rawText.includes("Promoted")) {
                            data.push({ index: index, author: authorName, text: rawText });
                        }
                    }
                });
                
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
                        const ed = targetEl.querySelector('.ql-editor') ||
                                   targetEl.querySelector('[contenteditable="true"]') ||
                                   await waitForElement('[contenteditable="true"]', targetEl);
                        if (ed) {
                            await securePaste(ed, request.replyText);
                            const form = ed.closest('form') || targetEl;
                            let submit = form ? findSubmitButton(form) : null;
                            if(!submit) {
                                const txtSubmit = findByText('span', ['publier', 'post'], form || targetEl);
                                if(txtSubmit) submit = txtSubmit.closest('button');
                            }
                            if(!submit) submit = findSubmitButton(document);
                            if (submit) { forceClick(submit); sendResponse({success:true}); return; }
                    }
                }
                }
                sendResponse({success:false});
            })();
            return true;
        }

        // --- 5. EDITEUR ---
        if (request.action === "WRITE_POST_ON_LINKEDIN") {
            (async () => {
                let trigger = findByText('span', ['commencer un post', 'start a post', 'créer', 'créer un post', 'create a post']);
                if (trigger) trigger = trigger.closest('button') || trigger.closest('div[role="button"]');
                if (!trigger) {
                    trigger = document.querySelector('button.share-box-feed-entry__trigger');
                }
                if (!trigger) {
                    trigger = document.querySelector('button[aria-label*="post" i], button[aria-label*="publier" i]');
                }
                if (!trigger) {
                    trigger = await waitForElement('button.share-box-feed-entry__trigger', document, 20, 500);
                }
                if (!trigger) {
                    trigger = await waitForElement('button[aria-label*="post" i]', document, 20, 500);
                }

                if (trigger) {
                    trigger.click(); await new Promise(r => setTimeout(r, 3000));
                    const modal = await waitForElement('.share-box-modal, .artdeco-modal', document, 20, 500) || document.body;
                    const ed = modal.querySelector('.ql-editor') ||
                        modal.querySelector('[contenteditable="true"]') ||
                        document.querySelector('.ql-editor') ||
                        document.querySelector('[contenteditable="true"]') ||
                        await waitForElement('.ql-editor', modal, 20, 500);
                    if (ed) {
                        await securePaste(ed, request.content);
                        if (request.autoPost) {
                            let pubBtn = modal.querySelector('.share-actions__primary-action') ||
                                modal.querySelector('.artdeco-button--primary') ||
                                document.querySelector('.share-actions__primary-action');
                            if (!pubBtn) {
                                pubBtn = await waitForElement('.share-actions__primary-action', modal, 20, 500);
                            }
                            if (!pubBtn) {
                                pubBtn = await waitForElement('button[aria-label*="publier" i], button[aria-label*="post" i]', modal, 20, 500);
                            }
                            if (pubBtn) forceClick(pubBtn);
                        }
                        sendResponse({ success: true });
                        return;
                    }
                }
                sendResponse({ success: false });
            })();
            return true;
        }

        if (request.action === "SCRAPE_SEARCH_RESULTS") {
            const result = scrapeSearchResultsCandidates();
            sendResponse(result);
            return true;
        }

        if (request.action === "SCRAPE_LATEST_POST") {
            const result = scrapeLatestPostFromProfile();
            sendResponse(result);
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
                    const name = getText(pick('h1.text-heading-xlarge', 'h1'));
                    const headline = getText(pick('.text-body-medium.break-words', '.pv-text-details__left-panel .text-body-medium', '.text-body-medium.t-black'));
                    const location = getText(pick('.text-body-small.inline.t-black--light.break-words', '.pv-text-details__left-panel .text-body-small', '.text-body-small.inline'));

                    const aboutSection = findSectionByHeading(['à propos', 'about']) || document.querySelector('section[data-section="summary"]');
                    const about = aboutSection
                        ? getText(aboutSection.querySelector('.pv-shared-text-with-see-more, .inline-show-more-text, span[aria-hidden="true"]'))
                        : "";

                    const expSection = findSectionByHeading(['expérience', 'experience']) || document.querySelector('section[data-section="experience"]');
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
        if (request.action === "SCRAPE_SEARCH_RESULTS") {
            (async () => {
                if (isLoginPage()) {
                    sendResponse({ success: false, error: "Veuillez vous connecter à LinkedIn." });
                    return;
                }
                const maxProfiles = Number(request.maxProfilesPerRun || 30);
                const main = document.querySelector(selectors.search.main) || document;
                const links = Array.from(main.querySelectorAll(selectors.search.profileLink));
                const candidates = [];
                const seen = new Set();
                for (const linkEl of links) {
                    const candidate = extractCandidate(linkEl);
                    if (!candidate || seen.has(candidate.profileUrl)) continue;
                    seen.add(candidate.profileUrl);
                    candidates.push(candidate);
                    if (candidates.length >= maxProfiles) break;
                }
                sendResponse({ success: true, candidates });
            })();
            return true;
        }
        if (request.action === "CONNECT_PROFILE") {
            (async () => {
                if (isLoginPage()) {
                    sendResponse({ success: false, error: "Veuillez vous connecter à LinkedIn." });
                    return;
                }

                let clicked = false;
                const directConnectBtn = findConnectButton();
                if (directConnectBtn) {
                    clicked = forceClick(directConnectBtn);
                }

                if (!clicked) {
                    clicked = await clickConnectFromOverflow();
                }

                if (!clicked) {
                    sendResponse({ success: false, error: "Bouton de connexion introuvable." });
                    return;
                }

                const modalResult = await completeInviteModal(request.message || "");
                if (!modalResult.success) {
                    sendResponse(modalResult);
                    return;
                }
                sendResponse({ success: true });
            })();
            return true;
        }
        if (request.action === "SCAN_FOLLOWED_PROFILES") {
            (async () => {
                if (isLoginPage()) {
                    sendResponse({ success: false, error: "Veuillez vous connecter à LinkedIn." });
                    return;
                }
                const profiles = request.profiles || [];
                if (!profiles.length) {
                    sendResponse({ success: false, error: "Aucun profil à scanner." });
                    return;
                }
                const results = [];
                for (const profile of profiles) {
                    if (window.location.href !== profile.profileUrl) {
                        await new Promise(resolve => {
                            window.location.href = profile.profileUrl;
                            setTimeout(resolve, 4000);
                        });
                    }
                    const posts = collectRecentPosts(10);
                    results.push({ profileUrl: profile.profileUrl, posts });
                }
                sendResponse({ success: true, results });
            })();
            return true;
        }
        if (request.action === "SCAN_PROFILE_POSTS") {
            (async () => {
                if (isLoginPage()) {
                    sendResponse({ success: false, error: "Veuillez vous connecter à LinkedIn." });
                    return;
                }
                const posts = await scrollAndCollect(10);
                sendResponse({ success: true, posts });
            })();
            return true;
        }
    });
}

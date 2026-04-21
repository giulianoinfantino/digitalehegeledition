// Hilfsfunktion, um Fehler direkt auf der Seite anzuzeigen
function showDebugError(msg) {
    const renderArea = document.getElementById('text-render') || document.getElementById('search-results');
    if (renderArea) {
        renderArea.innerHTML = `<div style="padding:20px; border:2px solid red; background:#fff0f0; color:red; font-family:sans-serif;">
            <strong>System-Fehler:</strong><br>${msg}
        </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    console.log("Aktueller Pfad:", path);

    // Prüfe, auf welcher Seite wir sind
    if (path.includes('text.html')) {
        loadReader();
    } else if (path.includes('search.html')) {
        initSearch();
    }
});

async function fetchCorpus() {
    try {
        // Cache-Buster: Fügt ?v=ZEITSTEMPEL hinzu, damit der Browser nicht die alte Version nutzt
        const cacheBuster = new Date().getTime();
        const response = await fetch(`data/twa_band_5.json?v=${cacheBuster}`);
        
        if (!response.ok) {
            throw new Error(`JSON-Datei nicht gefunden (Status: ${response.status}). <br>Pfad: data/twa_band_5.json`);
        }
        
        const data = await response.json();
        console.log("JSON erfolgreich geladen. Seiten:", data.pages.length);
        return data;
    } catch (error) {
        console.error("Fetch-Fehler:", error);
        showDebugError(error.message);
        return null;
    }
}

async function loadReader() {
    const data = await fetchCorpus();
    if (!data) return;

    const renderArea = document.getElementById('text-render');
    const tocList = document.getElementById('toc-list');
    
    if (!renderArea) return;

    renderArea.innerHTML = `<h1>${data.metadata.titel || 'Wissenschaft der Logik I'} (TWA ${data.metadata.band})</h1>`;
    
    data.pages.forEach(page => {
        const pageId = `page-${page.id}`;
        
        // Sidebar (TOC)
        if (tocList) {
            const li = document.createElement('li');
            li.innerHTML = `<a href="#${pageId}">Seite ${page.id}</a>`;
            tocList.appendChild(li);
        }

        // Haupttext
        let html = `<section class="page-unit" id="${pageId}">
                        <div class="marginalie">${page.sigel}</div>
                        <div class="content">`;
        
        if (page.blocks && page.blocks.length > 0) {
            page.blocks.forEach(block => {
                html += `<p>${block}</p>`;
            });
        } else {
            html += `<p><em>[Kein Text auf dieser Seite]</em></p>`;
        }
        
        html += `</div></section>`;
        renderArea.innerHTML += html;
    });
}

async function initSearch() {
    const data = await fetchCorpus();
    if (!data) return;

    const input = document.getElementById('search-input');
    const resultsDiv = document.getElementById('search-results');

    if (!input || !resultsDiv) return;

    input.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        resultsDiv.innerHTML = ''; 

        if (term.length < 3) return;

        let hitCount = 0;

        data.pages.forEach(page => {
            if (!page.blocks) return;
            
            page.blocks.forEach(block => {
                if (block.toLowerCase().includes(term)) {
                    hitCount++;
                    const regex = new RegExp(`(${term})`, 'gi');
                    const highlightedBlock = block.replace(regex, '<mark>$1</mark>');

                    resultsDiv.innerHTML += `
                        <div class="search-result" style="margin-bottom:30px; border-bottom:1px solid #eee; padding-bottom:15px;">
                            <div class="marginalie" style="position: static; border:none; text-align: left; padding: 0; color:#8e2020; font-size:0.8rem; font-weight:bold;">${page.sigel}</div>
                            <div class="text-body" style="font-size: 1.15rem; font-family: 'EB Garamond', serif;">
                                ${highlightedBlock}
                            </div>
                        </div>
                    `;
                }
            });
        });

        if (hitCount === 0) {
            resultsDiv.innerHTML = '<p>Keine Ergebnisse gefunden.</p>';
        } else {
            resultsDiv.insertAdjacentHTML('afterbegin', `<p style="color: #8e2020; font-size: 0.9rem; margin-bottom: 20px;">${hitCount} Treffer gefunden.</p>`);
        }
    });
}
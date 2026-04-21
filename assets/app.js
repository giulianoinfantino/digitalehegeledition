document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();

    if (currentPage === 'text.html') {
        loadReader();
    } else if (currentPage === 'search.html') {
        initSearch();
    }
});

async function fetchCorpus() {
    try {
        // Hier lädt er deine echte, große JSON-Datei vom Server
        const response = await fetch('data/twa_band_5.json');
        if (!response.ok) throw new Error("JSON nicht gefunden");
        return await response.json();
    } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
        document.getElementById('text-render').innerHTML = '<p style="color:red;">Fehler: Konnte Daten nicht laden.</p>';
        return null;
    }
}

async function loadReader() {
    const data = await fetchCorpus();
    if (!data) return;

    const renderArea = document.getElementById('text-render');
    const tocList = document.getElementById('toc-list');
    
    // Setzt den Titel aus der JSON
    renderArea.innerHTML = `<h1>Wissenschaft der Logik I (TWA ${data.metadata.band})</h1>`;
    
    // Schleife durch ALLE 456 Seiten der echten JSON
    data.pages.forEach(page => {
        // WICHTIG: Deine echte JSON nutzt "id" statt "nr"
        const pageId = `page-${page.id}`;
        
        // Inhaltsverzeichnis (Sidebar) füllen
        const li = document.createElement('li');
        li.innerHTML = `<a href="#${pageId}">Seite ${page.id}</a>`;
        tocList.appendChild(li);

        // Text rendern
        let html = `<section class="page-unit" id="${pageId}">
                        <div class="marginalie">${page.sigel}</div>
                        <div class="content">`;
        
        // WICHTIG: Deine echte JSON nutzt "blocks" statt "paragraphs"
        if (page.blocks && page.blocks.length > 0) {
            page.blocks.forEach(block => {
                html += `<p>${block}</p>`;
            });
        } else {
            html += `<p><em>[Leere Seite oder keine Textblöcke erkannt]</em></p>`;
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

    input.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        resultsDiv.innerHTML = ''; // Vorherige Ergebnisse löschen

        if (term.length < 3) return;

        let hitCount = 0;

        data.pages.forEach(page => {
            if (!page.blocks) return; // Überspringe Seiten ohne Text
            
            page.blocks.forEach(block => {
                if (block.toLowerCase().includes(term)) {
                    hitCount++;
                    // Suchbegriff gelb markieren (<mark>)
                    const regex = new RegExp(`(${term})`, 'gi');
                    const highlightedBlock = block.replace(regex, '<mark>$1</mark>');

                    resultsDiv.innerHTML += `
                        <div class="search-result">
                            <div class="marginalie" style="position: relative; border:none; text-align: left; padding: 0; margin-bottom: 5px;">${page.sigel}</div>
                            <div class="text-body" style="font-size: 1.1rem;">
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
            // Zeige Anzahl der Treffer oben an (optional, aber nützlich!)
            resultsDiv.insertAdjacentHTML('afterbegin', `<p style="color: var(--accent); font-size: 0.9rem; margin-bottom: 20px;">${hitCount} Treffer gefunden.</p>`);
        }
    });
}
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'text.html') loadReader();
    else if (currentPage === 'search.html') initSearch();
});

async function fetchCorpus() {
    try {
        const response = await fetch('data/twa_band_5.json');
        if (!response.ok) throw new Error("JSON nicht gefunden");
        return await response.json();
    } catch (error) { console.error("Fehler:", error); return null; }
}

async function loadReader() {
    const data = await fetchCorpus();
    if (!data) return;
    const renderArea = document.getElementById('text-render');
    const tocList = document.getElementById('toc-list');
    renderArea.innerHTML = `<h1>${data.metadata.titel}</h1>`;
    
    data.pages.forEach(page => {
        const pageId = `page-${page.nr}`;
        const li = document.createElement('li');
        li.innerHTML = `<a href="#${pageId}">Seite ${page.nr}</a>`;
        tocList.appendChild(li);

        let html = `<section class="page-unit" id="${pageId}"><div class="marginalie">${page.sigel}</div><div class="content">`;
        page.paragraphs.forEach(para => html += `<p>${para}</p>`);
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
        resultsDiv.innerHTML = '';
        if (term.length < 3) return;
        let hitCount = 0;

        data.pages.forEach(page => {
            page.paragraphs.forEach(para => {
                if (para.toLowerCase().includes(term)) {
                    hitCount++;
                    const regex = new RegExp(`(${term})`, 'gi');
                    const highlightedPara = para.replace(regex, '<mark>$1</mark>');
                    resultsDiv.innerHTML += `
                        <div class="search-result">
                            <div class="marginalie" style="position: relative; border:none; text-align: left; padding: 0; margin-bottom: 5px;">${page.sigel}</div>
                            <div class="text-body" style="font-size: 1.1rem;">${highlightedPara}</div>
                        </div>`;
                }
            });
        });
        if (hitCount === 0) resultsDiv.innerHTML = '<p>Keine Ergebnisse gefunden.</p>';
    });
}
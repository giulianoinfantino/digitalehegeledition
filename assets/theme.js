
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('hegel-theme', theme);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = theme === 'dark' ? '◑ Hell' : '◐ Dunkel';
  });
}

function cycleTheme() {
  const current = document.body.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Initial apply
(function() {
  const saved = localStorage.getItem('hegel-theme') || 'light';
  applyTheme(saved);
})();

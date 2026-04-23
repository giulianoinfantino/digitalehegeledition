
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('hegel-theme', theme);
}

function cycleTheme() {
  const themes = ['light', 'dark'];
  const current = document.body.getAttribute('data-theme') || 'light';
  const next = themes[(themes.indexOf(current) + 1) % themes.length];
  applyTheme(next);
}

// Initial apply
(function() {
  const saved = localStorage.getItem('hegel-theme') || 'light';
  document.body.setAttribute('data-theme', saved);
})();

(function () {
  const STORAGE_KEY = 'hegel-edition-theme';

  function preferredTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) {
      toggle.textContent = theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus';
      toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
  }

  function currentTheme() {
    return document.body.dataset.theme || localStorage.getItem(STORAGE_KEY) || preferredTheme();
  }

  function installToggle() {
    const header = document.querySelector('.site-header');
    if (!header || header.querySelector('[data-theme-toggle]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.dataset.themeToggle = 'true';
    button.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
    });
    header.appendChild(button);
    applyTheme(currentTheme());
  }

  document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY) || preferredTheme();
    applyTheme(saved);
    installToggle();
  });
})();

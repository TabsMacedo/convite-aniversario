(() => {
  const storageKey = 'tabata-party-theme';
  const root = document.documentElement;

  function applyTheme(theme) {
    const light = theme === 'light';
    root.dataset.theme = light ? 'light' : 'dark';
    const button = document.querySelector('#theme-toggle');
    if (button) {
      const label = light ? 'Ativar tema escuro' : 'Ativar tema claro';
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    const color = getComputedStyle(root).getPropertyValue(light ? '--cor-fundo' : '--cor-noite').trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }

  // O script roda no cabeçalho para restaurar a escolha antes da primeira pintura.
  // Sem preferência salva, o padrão é sempre escuro, inclusive em aparelhos no modo claro.
  let saved = 'dark';
  try { saved = localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark'; } catch { /* Navegação com armazenamento bloqueado. */ }
  applyTheme(saved);

  function initialize() {
    const button = document.querySelector('#theme-toggle');
    if (!button) return;
    applyTheme(root.dataset.theme);
    button.hidden = false;
    button.addEventListener('click', () => {
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      try { localStorage.setItem(storageKey, theme); } catch { /* A alternância funciona mesmo sem salvar. */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();

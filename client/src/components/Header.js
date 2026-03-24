/**
 * Header component — top bar with logo, Browse, Profile
 */
export function renderHeader(onLogoClick) {
  const header = document.createElement('header');
  header.className = 'header';
  header.innerHTML = `
    <div class="header-logo" id="header-logo">
      <div class="header-logo-icon">P</div>
      <span class="header-logo-text">PlotSeekerAI</span>
    </div>
    <nav class="header-nav">
      <a class="header-nav-link" id="nav-browse">Browse</a>
      <div class="header-profile" id="nav-profile" title="Profile">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
    </nav>
  `;

  header.querySelector('#header-logo').addEventListener('click', () => {
    if (onLogoClick) onLogoClick();
  });

  return header;
}

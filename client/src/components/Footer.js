import logo from '../logo.png';

/**
 * Footer component — bottom bar with branding, social links, and copyright
 */
export function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'footer';

  // Get LinkedIn URL from environment variable
  const linkedinUrl = 'https://www.linkedin.com/in/harel-asher/';

  footer.innerHTML = `
    <div class="footer-container">
      <div class="footer-branding">
        <div class="footer-logo">
          <img src="${logo}" alt="PlotSeekerAI Logo" class="footer-logo-icon" />
          <span class="footer-logo-text">PlotSeekerAI</span>
        </div>
        <p class="footer-tagline">Describe any book idea or plot, and we'll instantly find the best matches from thousands of titles. Your next favorite story is just a few words away.</p>
      </div>
      
      <div class="footer-links">
        <div class="footer-section">
          <h4 class="footer-section-title">Connect</h4>
          <div class="footer-social">
            <a href="${linkedinUrl}" target="_blank" rel="noopener noreferrer" class="footer-social-link" title="LinkedIn">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </div>
    
    <div class="footer-bottom">
      <p class="footer-copyright">&copy; ${new Date().getFullYear()} PlotSeekerAI. All rights reserved.</p>
      <p class="footer-credit">Crafted by Harel Asher</p>
    </div>
  `;

  return footer;
}

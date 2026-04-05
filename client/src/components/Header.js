import logo from '../logo.png';

/**
 * Header component — top bar with logo, Browse, Categories
 */
export function renderHeader(onLogoClick, onBrowseClick, onCategoryClick) {
  const header = document.createElement('header');
  header.className = 'header';

  const categories = [
    'Trending Now', /* 'Just Announced', */ 'Self Improvement', 
    'Science Fiction', 'Mystery & Thriller', 'Historical Fiction', 'Fantasy Epics'
  ];

  let catHtml = categories.map(c => `<a class="dropdown-item" href="#" data-id="${encodeURIComponent(c)}">${c}</a>`).join('');

  header.innerHTML = `
    <div class="header-logo" id="header-logo">
      <img src="${logo}" alt="PlotSeekerAI Logo" class="header-logo-icon" />
      <span class="header-logo-text">PlotSeekerAI</span>
    </div>
    <nav class="header-nav">
      <a class="header-nav-link" href="#" id="nav-browse">Browse</a>
      <div class="header-dropdown" id="nav-categories">
        <a class="header-nav-link" href="#">Categories <span style="font-size:0.8em">▼</span></a>
        <div class="dropdown-content">
          ${catHtml}
        </div>
      </div>
    </nav>
  `;

  header.querySelector('#header-logo').addEventListener('click', (e) => {
    e.preventDefault();
    if (onLogoClick) onLogoClick();
  });

  header.querySelector('#nav-browse').addEventListener('click', (e) => {
    e.preventDefault();
    if (onBrowseClick) onBrowseClick();
  });

  header.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const cat = decodeURIComponent(e.currentTarget.dataset.id);
      if (onCategoryClick) onCategoryClick(cat);
    });
  });

  return header;
}

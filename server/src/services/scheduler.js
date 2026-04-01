const { refreshFeaturedSectionsBackground } = require('./bookSources');

/**
 * Basic background scheduler to keep featured sections fresh.
 * Checks every 6 hours and refreshes if data is >24 hours old.
 */
function initScheduler() {
  console.log('Scheduler initialized: Checking for stale featured sections...');
  
  // Initial check on boot
  checkAndRefresh();

  // Periodic check every 6 hours
  setInterval(() => {
    checkAndRefresh();
  }, 1000 * 60 * 60 * 6);
}

async function checkAndRefresh() {
  const { getPersistedFeaturedSections, isDatabaseAvailable } = require('./database');
  
  if (!isDatabaseAvailable()) return;

  try {
    const persisted = await getPersistedFeaturedSections();
    
    let isStale = true;
    if (persisted && persisted.length > 0) {
      const oldestUpdate = Math.min(...persisted.map(s => new Date(s.updatedAt).getTime()));
      isStale = (Date.now() - oldestUpdate) > (1000 * 60 * 60 * 24);
    }

    if (isStale) {
      console.log('Scheduler: Featured sections are stale. Starting background refresh...');
      await refreshFeaturedSectionsBackground();
      console.log('Scheduler: Background refresh complete.');
    } else {
      console.log('Scheduler: Featured sections are fresh. Next check in 6 hours.');
    }
  } catch (err) {
    console.error('Scheduler check failed:', err.message);
  }
}

module.exports = { initScheduler };

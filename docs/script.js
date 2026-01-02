// Scroll-based image shrinking and sticky positioning for narrow screens
(function() {
  'use strict';

  // Check if we're on a narrow screen
  function isNarrowScreen() {
    return window.innerWidth <= 968;
  }

  // Get initial sizes
  let initialIconSize = 180; // Default for mobile, will be updated
  let halfIconSize = 90;
  let isFrozen = false;
  let scrollStartOffset = 100; // Start shrinking after 100px of scroll

  function init() {
    if (!isNarrowScreen()) {
      return; // Only apply on narrow screens
    }

    const appIcon = document.getElementById('appIcon');
    const appIconContainer = document.getElementById('appIconContainer');
    const bggBadge = document.getElementById('bggBadge');
    const logoSection = document.getElementById('logoSection');
    const contentSection = document.querySelector('.content-section');

    if (!appIcon || !appIconContainer || !bggBadge || !logoSection) {
      return;
    }

    // Get initial icon size (could be 180px on mobile or 240px on tablet)
    const computedStyle = window.getComputedStyle(appIcon);
    initialIconSize = parseInt(computedStyle.width) || 180;
    halfIconSize = initialIconSize / 2;

    // Calculate when to freeze (when icon reaches half size)
    // We'll freeze when scroll reaches a point where icon is at half size
    const shrinkDistance = 300; // Distance over which to shrink (in pixels of scroll)
    const freezeScrollPoint = scrollStartOffset + shrinkDistance;

    function handleScroll() {
      if (!isNarrowScreen()) {
        // Reset if screen becomes wide
        resetStyles();
        return;
      }

      const scrollY = window.scrollY || window.pageYOffset;

      if (scrollY < scrollStartOffset) {
        // Before shrink starts - normal state
        resetStyles();
        isFrozen = false;
      } else if (scrollY >= scrollStartOffset && scrollY < freezeScrollPoint && !isFrozen) {
        // Shrinking phase
        const scrollProgress = (scrollY - scrollStartOffset) / shrinkDistance;
        const currentSize = initialIconSize - (initialIconSize - halfIconSize) * scrollProgress;
        
        appIcon.style.width = currentSize + 'px';
        appIcon.style.height = currentSize + 'px';
        
        // Keep logo section in normal flow during shrinking
        logoSection.classList.remove('scrolled');
        appIconContainer.classList.remove('shrunk');
        bggBadge.classList.remove('frozen');
      } else if (scrollY >= freezeScrollPoint) {
        // Freeze phase - position to left of BGG logo and stick
        if (!isFrozen) {
          isFrozen = true;
          appIcon.style.width = halfIconSize + 'px';
          appIcon.style.height = halfIconSize + 'px';
          logoSection.classList.add('scrolled');
          appIconContainer.classList.add('shrunk');
          bggBadge.classList.add('frozen');
        }
      }
    }

    function resetStyles() {
      appIcon.style.width = '';
      appIcon.style.height = '';
      logoSection.classList.remove('scrolled');
      appIconContainer.classList.remove('shrunk');
      bggBadge.classList.remove('frozen');
      isFrozen = false;
    }

    // Throttle scroll events for performance
    let ticking = false;
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(function() {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    }

    // Handle resize to recalculate sizes
    function handleResize() {
      if (isNarrowScreen()) {
        const computedStyle = window.getComputedStyle(appIcon);
        initialIconSize = parseInt(computedStyle.width) || 180;
        halfIconSize = initialIconSize / 2;
        handleScroll(); // Recalculate on resize
      } else {
        resetStyles();
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    // Initial check
    handleScroll();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

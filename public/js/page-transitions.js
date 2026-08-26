/**
 * Page Transitions
 * Uses the View Transitions API if supported, or falls back to a GSAP simulated wipe.
 * Hooks into standard link clicks to intercept navigation for EJS multipage apps.
 */

document.addEventListener("DOMContentLoaded", () => {
    // Intercept clicks on internal links
    document.body.addEventListener("click", (e) => {
        const link = e.target.closest('a');
        
        // Ensure it's an internal link, not opening in a new tab, and not explicitly ignored
        if (!link || 
            link.target === '_blank' || 
            link.origin !== window.location.origin ||
            link.hasAttribute('download') ||
            link.hasAttribute('data-no-transition') ||
            e.ctrlKey || e.metaKey) {
            return;
        }

        e.preventDefault();
        const targetUrl = link.href;

        // If View Transitions API is supported
        if (document.startViewTransition) {
            // We need to fetch the next page, parse it, and transition
            fetchAndTransition(targetUrl);
        } else {
            // Fallback: GSAP wipe out, then navigate
            fallbackTransitionOut(targetUrl);
        }
    });
});

async function fetchAndTransition(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        
        // Parse the new HTML
        const parser = new DOMParser();
        const newDocument = parser.parseFromString(text, 'text/html');
        
        // Start transition
        document.startViewTransition(() => {
            // Update the body content and title
            document.title = newDocument.title;
            
            // Replace main content (assuming we have an element with id 'main-content')
            const currentMain = document.getElementById('main-content') || document.body;
            const newMain = newDocument.getElementById('main-content') || newDocument.body;
            
            currentMain.innerHTML = newMain.innerHTML;
            
            // Update URL in browser history
            window.history.pushState({}, '', url);
            
            // Re-initialize scripts if needed
            if (window.initMagneticButtons) window.initMagneticButtons();
        });
        
    } catch (err) {
        // Fallback to normal navigation if fetch fails
        window.location.href = url;
    }
}

function fallbackTransitionOut(url) {
    // Create an overlay panel if it doesn't exist
    let overlay = document.getElementById('transition-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'transition-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: 0, left: 0,
            width: '100%', height: '100%',
            backgroundColor: 'var(--bg-primary)',
            zIndex: 9999,
            transform: 'translateX(-100%)'
        });
        document.body.appendChild(overlay);
    }
    
    // Animate overlay in
    gsap.to(overlay, {
        x: '0%',
        duration: 0.4,
        ease: "power2.inOut",
        onComplete: () => {
            window.location.href = url;
        }
    });
}

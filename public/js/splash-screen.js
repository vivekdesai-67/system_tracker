/**
 * Splash Screen Animation
 * Runs once per session, smoothly reveals the app.
 */
document.addEventListener("DOMContentLoaded", () => {
    const splashScreen = document.getElementById('splash-screen');
    
    // Check if we've already shown the splash this session
    if (!splashScreen || sessionStorage.getItem('splashShown') === 'true') {
        if (splashScreen) splashScreen.style.display = 'none';
        
        // Trigger initial reveal animations for the dashboard immediately
        triggerDashboardReveal();
        return;
    }

    // GSAP Timeline for the Splash Screen
    const tl = gsap.timeline({
        onComplete: () => {
            splashScreen.style.display = 'none';
            sessionStorage.setItem('splashShown', 'true');
            triggerDashboardReveal();
        }
    });

    // Assume we have an inner container or logo in the splash screen
    const splashContent = splashScreen.querySelector('.splash-content');

    // Reset initial state just in case
    gsap.set(splashScreen, { display: 'flex', opacity: 1 });
    if(splashContent) {
        gsap.set(splashContent, { scale: 0.9, opacity: 0, filter: 'blur(10px)' });
    }

    // Animation: Logo/Name animates in (scale + fade + blur to sharp)
    if(splashContent) {
        tl.to(splashContent, {
            duration: 0.8,
            scale: 1,
            opacity: 1,
            filter: 'blur(0px)',
            ease: "expo.out"
        })
        // Hold briefly
        .to({}, { duration: 0.4 });
    } else {
        tl.to({}, { duration: 1.2 });
    }

    // Morph/Wipe away the overlay
    tl.to(splashScreen, {
        duration: 0.6,
        opacity: 0,
        // Could also do a transform wipe: yPercent: -100
        ease: "power2.inOut"
    });
});

/**
 * Triggers entrance animations for the dashboard once the splash is gone
 */
function triggerDashboardReveal() {
    // Reveal Top Nav
    if (document.querySelector('.top-nav')) {
        gsap.fromTo('.top-nav', 
            { y: -20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, ease: "power2.out" }
        );
    }
    
    // Staggered fade in for cards (Issue List)
    if (document.querySelector('.stagger-card')) {
        gsap.fromTo('.stagger-card', 
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, stagger: 0.05, ease: "power2.out", delay: 0.1 }
        );
    }
    
    // Sidebar morph in Admin panel
    if (document.querySelector('.sidebar')) {
        gsap.fromTo('.sidebar',
            { x: -50, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.6, ease: "power2.out" }
        );
    }

    // Stat cards count up (Admin)
    const statNumbers = document.querySelectorAll('.stat-count');
    if (statNumbers.length > 0) {
        statNumbers.forEach(el => {
            const target = parseFloat(el.getAttribute('data-target') || el.innerText);
            gsap.fromTo(el,
                { innerText: 0 },
                { 
                    innerText: target, 
                    duration: 1.5, 
                    snap: { innerText: 1 }, 
                    ease: "power2.out" 
                }
            );
        });
    }
}

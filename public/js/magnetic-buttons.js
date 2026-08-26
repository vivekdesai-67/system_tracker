/**
 * Magnetic Buttons
 * Attaches a magnetic hover effect to elements with data-magnetic attribute.
 */
class MagneticButton {
    constructor(el) {
        this.el = el;
        // Inner element holds the text/icon to scale separately if desired, 
        // but we'll animate the main element itself
        
        this.bounds = this.el.getBoundingClientRect();
        
        // Settings
        this.magneticPull = 0.3; // How strong the pull is
        
        // State
        this.hovering = false;
        
        // Quick setters for GSAP (high performance)
        this.xSet = gsap.quickSetter(this.el, "x", "px");
        this.ySet = gsap.quickSetter(this.el, "y", "px");
        
        this.bindEvents();
    }

    bindEvents() {
        this.el.addEventListener('mouseenter', (e) => {
            this.hovering = true;
            this.bounds = this.el.getBoundingClientRect();
            
            // Soft scale up on hover
            gsap.to(this.el, {
                scale: 1.03,
                duration: 0.4,
                ease: "power2.out"
            });
        });

        this.el.addEventListener('mousemove', (e) => {
            if (!this.hovering) return;
            
            // Calculate mouse position relative to the center of the button
            const x = (e.clientX - this.bounds.left - this.bounds.width / 2) * this.magneticPull;
            const y = (e.clientY - this.bounds.top - this.bounds.height / 2) * this.magneticPull;

            gsap.to(this.el, {
                x: x,
                y: y,
                duration: 0.4,
                ease: "power2.out"
            });
        });

        this.el.addEventListener('mouseleave', () => {
            this.hovering = false;
            
            // Snap back
            gsap.to(this.el, {
                x: 0,
                y: 0,
                scale: 1,
                duration: 0.6,
                ease: "elastic.out(1, 0.3)"
            });
        });

        // Satisfying press-down on click
        this.el.addEventListener('mousedown', () => {
            gsap.to(this.el, {
                scale: 0.95,
                duration: 0.1,
                ease: "power1.inOut"
            });
        });

        this.el.addEventListener('mouseup', () => {
            if(this.hovering) {
                gsap.to(this.el, {
                    scale: 1.03,
                    duration: 0.4,
                    ease: "power2.out"
                });
            }
        });
    }
}

// Initialization function
function initMagneticButtons() {
    const magneticEls = document.querySelectorAll('[data-magnetic]');
    magneticEls.forEach(el => {
        new MagneticButton(el);
    });
}

// Run on load
document.addEventListener("DOMContentLoaded", initMagneticButtons);

// Expose globally so it can be re-run after AJAX/morph transitions if needed
window.initMagneticButtons = initMagneticButtons;

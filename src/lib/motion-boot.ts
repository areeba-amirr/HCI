// Runs before first paint. Without it, server-rendered hero content would show, vanish
// when GSAP takes over, then animate in. The class is only added when motion is allowed,
// so no-JS and reduced-motion visitors always see everything. The timeout is a failsafe
// in case the page's script never loads.
export const MOTION_BOOT_SCRIPT = `(function(){try{if(window.matchMedia("(prefers-reduced-motion: no-preference)").matches){var d=document.documentElement;d.classList.add("motion-ok");setTimeout(function(){d.classList.remove("motion-ok")},4000)}}catch(e){}})();`;

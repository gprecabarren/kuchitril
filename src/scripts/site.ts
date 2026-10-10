import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initVoicesCarousel(): void {
  document.querySelectorAll<HTMLElement>('[data-voices-carousel]').forEach((carousel) => {
    const viewport = carousel.querySelector<HTMLElement>('.voices__viewport');
    const track = carousel.querySelector<HTMLElement>('.voices__track');
    const pauseButton = carousel.querySelector<HTMLButtonElement>('[data-voices-pause]');
    if (!viewport || !track || !pauseButton) return;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = false;
    let hovered = false;
    let focused = false;
    let touching = false;
    let visible = false;
    let interactionUntil = 0;
    let interactionTimer = 0;
    let frame = 0;
    let lastFrame = 0;
    let cycleWidth = 0;

    const measure = () => {
      const groups = track.querySelectorAll<HTMLElement>('.voices__group');
      if (groups.length < 2) return;
      cycleWidth = groups[1].offsetLeft - groups[0].offsetLeft;
      // A complete extra group keeps the loop seamless even with one testimonial.
      while (cycleWidth > 0 && track.scrollWidth < viewport.clientWidth + cycleWidth + 2 && track.children.length < 10) {
        const duplicate = groups[0].cloneNode(true) as HTMLElement;
        duplicate.setAttribute('aria-hidden', 'true');
        duplicate.inert = true;
        track.append(duplicate);
      }
    };
    const canMove = () => !motionPreference.matches && !paused && !hovered && !focused && !touching && visible && !document.hidden && performance.now() >= interactionUntil && cycleWidth > 0 && viewport.scrollWidth > viewport.clientWidth;
    const tick = (now: number) => {
      frame = 0;
      if (!canMove()) return;
      const elapsed = Math.min(now - lastFrame, 50);
      lastFrame = now;
      const next = viewport.scrollLeft + elapsed * 0.026;
      viewport.scrollLeft = next >= cycleWidth ? next - cycleWidth : next;
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      pauseButton.disabled = motionPreference.matches;
      pauseButton.setAttribute('aria-pressed', String(paused || motionPreference.matches));
      pauseButton.textContent = motionPreference.matches ? 'Movimiento reducido' : paused ? 'Reanudar movimiento' : 'Pausar movimiento';
      if (canMove() && !frame) {
        lastFrame = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!canMove() && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const pauseInteraction = () => {
      interactionUntil = performance.now() + 4000;
      window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(sync, 4050);
      sync();
    };
    const move = (direction: number) => {
      pauseInteraction();
      const firstCard = track.querySelector<HTMLElement>('.voice-card');
      if (direction < 0 && viewport.scrollLeft < 2 && cycleWidth > 0) viewport.scrollLeft = cycleWidth;
      viewport.scrollBy({ left: direction * ((firstCard?.getBoundingClientRect().width ?? viewport.clientWidth) + 20), behavior: motionPreference.matches ? 'instant' : 'smooth' });
    };

    pauseButton.addEventListener('click', () => { paused = !paused; sync(); });
    carousel.querySelector('[data-voices-prev]')?.addEventListener('click', () => move(-1));
    carousel.querySelector('[data-voices-next]')?.addEventListener('click', () => move(1));
    viewport.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { hovered = true; sync(); } });
    viewport.addEventListener('pointerleave', () => { hovered = false; sync(); });
    viewport.addEventListener('pointerdown', () => { touching = true; sync(); });
    const endTouch = () => { if (touching) { touching = false; pauseInteraction(); } };
    window.addEventListener('pointerup', endTouch, { passive: true });
    window.addEventListener('pointercancel', endTouch, { passive: true });
    viewport.addEventListener('wheel', pauseInteraction, { passive: true });
    carousel.addEventListener('focusin', () => { focused = true; sync(); });
    carousel.addEventListener('focusout', () => {
      queueMicrotask(() => { focused = carousel.contains(document.activeElement); sync(); });
    });
    viewport.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home') return;
      event.preventDefault();
      if (event.key === 'Home') { viewport.scrollLeft = 0; pauseInteraction(); }
      else move(event.key === 'ArrowRight' ? 1 : -1);
    });
    motionPreference.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    new ResizeObserver(() => { measure(); sync(); }).observe(viewport);
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0.05 }).observe(viewport);
    measure();
    sync();
  });
}

export function initSite(): void {
  const header = document.querySelector<HTMLElement>('#site-header');
  const menuButton = document.querySelector<HTMLButtonElement>('.menu-toggle');
  const mobileMenu = document.querySelector<HTMLElement>('#mobile-menu');

  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 24);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    if (mobileMenu) mobileMenu.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  });
  mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    if (mobileMenu) mobileMenu.hidden = true;
    menuButton?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }));

  initVoicesCarousel();
  document.querySelectorAll<HTMLVideoElement>('.hero-video video').forEach((video) => {
    const notice = video.parentElement?.querySelector<HTMLElement>('.hero-video__error');
    const showError = () => { if (notice) notice.hidden = false; };
    video.addEventListener('error', showError);
    video.querySelector('source')?.addEventListener('error', showError);
    video.addEventListener('loadeddata', () => { if (notice) notice.hidden = true; });
  });

  if (reducedMotion()) {
    document.querySelector<HTMLElement>('#intro')?.remove();
    return;
  }

  const intro = document.querySelector<HTMLElement>('#intro');
  let introTimeline: gsap.core.Timeline | undefined;
  const finishIntro = () => {
    if (!intro) return;
    introTimeline?.kill();
    gsap.to(intro, { opacity: 0, duration: 0.48, ease: 'power2.inOut', onComplete: () => intro.remove() });
    document.body.classList.remove('intro-active');
  };

  if (intro) {
    document.body.classList.add('intro-active');
    document.querySelector('#skip-intro')?.addEventListener('click', finishIntro);
    introTimeline = gsap.timeline({ onComplete: finishIntro });
    introTimeline
      .from('.intro__orbit', { scale: 0.6, opacity: 0, rotation: -45, duration: 0.8, ease: 'power3.out' })
      .from('.intro__mascot-wrap', { x: -160, rotation: -18, opacity: 0, duration: 0.9, ease: 'back.out(1.4)' }, 0.15)
      .to('.intro__mascot-wrap', { y: 36, duration: 0.32, ease: 'power3.in' }, 0.95)
      .to('.intro__mascot-wrap', { y: 10, duration: 0.42, ease: 'elastic.out(1, 0.45)' }, 1.27)
      .fromTo('.intro__ground', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.out' }, 1.2)
      .from('.intro__caption', { y: 24, opacity: 0, duration: 0.5, ease: 'power2.out' }, 1.48)
      .to('.intro__orbit', { rotation: 18, duration: 1, ease: 'none' }, 1.1)
      .to({}, { duration: 0.55 });
  }

  if (document.querySelector('.hero')) {
    gsap.from('.hero__line', { yPercent: 105, opacity: 0, stagger: 0.11, duration: 0.85, delay: intro ? 1.95 : 0.1, ease: 'power3.out' });
    gsap.from('.hero__bottom', { y: 28, opacity: 0, duration: 0.7, delay: intro ? 2.25 : 0.4, ease: 'power2.out' });
  }

  document.querySelectorAll<HTMLElement>('.section-index, .services__heading, .portfolio-preview__heading, .voices__heading, .team__heading').forEach((element) => {
    gsap.from(element, { scrollTrigger: { trigger: element, start: 'top 88%', once: true }, y: 38, opacity: 0, duration: 0.75, ease: 'power2.out' });
  });
  document.querySelectorAll<HTMLElement>('.service-row').forEach((element) => {
    gsap.from(element, { scrollTrigger: { trigger: element, start: 'top 86%', once: true }, y: 55, opacity: 0, duration: 0.75, ease: 'power3.out' });
  });
  document.querySelectorAll<HTMLElement>('.founder__photo-frame, .founder__copy, .manifesto__layout, .project-card, .team-card, .contact h2').forEach((element) => {
    gsap.from(element, { scrollTrigger: { trigger: element, start: 'top 85%', once: true }, y: 48, opacity: 0, duration: 0.85, ease: 'power3.out' });
  });
  if (document.querySelector('.founder')) {
    gsap.to('.founder__photo-frame img', { scrollTrigger: { trigger: '.founder', start: 'top bottom', end: 'bottom top', scrub: true }, yPercent: -10, ease: 'none' });
  }
  if (document.querySelector('.hero__art')) {
    gsap.to('.hero__art-ring', { rotation: 360, duration: 28, repeat: -1, ease: 'none' });
    gsap.to('.hero__art img', { y: -12, duration: 2.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }
  if (document.querySelector('.contact')) {
    gsap.to('.contact__orb', { scrollTrigger: { trigger: '.contact', start: 'top bottom', end: 'bottom top', scrub: true }, rotation: 210, ease: 'none' });
  }

  const heroArt = document.querySelector<HTMLElement>('.hero__art');
  heroArt?.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const bounds = heroArt.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 18;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 18;
    gsap.to('.hero__art img', { x, y, duration: 0.5, overwrite: 'auto', ease: 'power2.out' });
  });
  heroArt?.addEventListener('pointerleave', () => gsap.to('.hero__art img', { x: 0, y: 0, duration: 0.5, overwrite: 'auto' }));
  ScrollTrigger.refresh();
}

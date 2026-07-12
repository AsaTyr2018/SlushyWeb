const hero = document.querySelector('.hero');
const heroSlides = [...document.querySelectorAll('.hero-slide')];
const heroDots = document.querySelector('.hero-dots');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const heroCopy = {
  de: { region: 'Hero-Bilder', choose: 'Bild auswählen', previous: 'Vorheriges Bild', next: 'Nächstes Bild', image: 'Bild' },
  en: { region: 'Hero images', choose: 'Choose image', previous: 'Previous image', next: 'Next image', image: 'Image' }
};
let heroIndex = 0;
let heroTimer;

const updateHeroLanguage = () => {
  const language = document.documentElement.lang === 'en' ? 'en' : 'de';
  const c = heroCopy[language];
  document.querySelector('.hero-carousel').setAttribute('aria-label', c.region);
  heroDots.setAttribute('aria-label', c.choose);
  document.querySelector('.hero-prev').setAttribute('aria-label', c.previous);
  document.querySelector('.hero-prev').title = c.previous;
  document.querySelector('.hero-next').setAttribute('aria-label', c.next);
  document.querySelector('.hero-next').title = c.next;
  [...heroDots.children].forEach((dot, index) => dot.setAttribute('aria-label', `${c.image} ${index + 1} / ${heroSlides.length}`));
};

const showHeroSlide = (index, restart = true) => {
  heroIndex = (index + heroSlides.length) % heroSlides.length;
  heroSlides.forEach((slide, position) => slide.classList.toggle('active', position === heroIndex));
  [...heroDots.children].forEach((dot, position) => {
    const active = position === heroIndex;
    dot.classList.toggle('active', active);
    dot.setAttribute('aria-current', active ? 'true' : 'false');
  });
  if (restart) startHeroCarousel();
};

const stopHeroCarousel = () => window.clearInterval(heroTimer);
const startHeroCarousel = () => {
  stopHeroCarousel();
  if (!reducedMotion.matches && !document.hidden) {
    heroTimer = window.setInterval(() => showHeroSlide(heroIndex + 1, false), 7000);
  }
};

heroSlides.forEach((_, index) => {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.setAttribute('aria-label', `Bild ${index + 1} von ${heroSlides.length}`);
  dot.onclick = () => showHeroSlide(index);
  heroDots.append(dot);
});

document.querySelector('.hero-prev').onclick = () => showHeroSlide(heroIndex - 1);
document.querySelector('.hero-next').onclick = () => showHeroSlide(heroIndex + 1);
hero.addEventListener('mouseenter', stopHeroCarousel);
hero.addEventListener('mouseleave', startHeroCarousel);
hero.addEventListener('focusin', stopHeroCarousel);
hero.addEventListener('focusout', event => { if (!hero.contains(event.relatedTarget)) startHeroCarousel(); });
document.addEventListener('visibilitychange', startHeroCarousel);
reducedMotion.addEventListener('change', startHeroCarousel);
new MutationObserver(updateHeroLanguage).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
updateHeroLanguage();
showHeroSlide(0);

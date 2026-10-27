/** Progressive enhancement only. Authorization remains server-side. */
const side = document.getElementById('oc-sidebar');
const toggle = document.getElementById('oc-menu');
const overlay = document.getElementById('oc-overlay');
const closeNav = () => {
  side?.classList.remove('open');
  document.body.classList.remove('oc-drawer-open');
  toggle?.setAttribute('aria-expanded', 'false');
  if (overlay) overlay.hidden = true;
};
toggle?.addEventListener('click', () => {
  const open = !side.classList.contains('open');
  side.classList.toggle('open', open);
  document.body.classList.toggle('oc-drawer-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  if (overlay) overlay.hidden = !open;
});
overlay?.addEventListener('click', closeNav);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNav(); });

// Search is a convenience filter on the owner-only dataset, not a data permission boundary.
const search = document.getElementById('oc-site-search');
const rows = Array.from(document.querySelectorAll('.oc-site-row'));
search?.addEventListener('input', () => {
  const term = search.value.trim().toLocaleLowerCase('ar');
  let visible = 0;
  for (const row of rows) {
    const matches = (row.dataset.filter || '').toLocaleLowerCase('ar').includes(term);
    row.hidden = !matches;
    if (matches) visible++;
  }
  const message = document.getElementById('oc-no-results');
  if (message) message.hidden = visible > 0 || term.length === 0;
});

const links = [...document.querySelectorAll('[data-section-link]')];
for (const link of links) {
  link.addEventListener('click', () => {
    links.forEach(l => l.classList.toggle('active', l === link));
    closeNav();
  });
}

// Reduced-motion is respected. UI remains usable with JS disabled.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('oc-visible');
      obs.unobserve(entry.target);
    }
  }, { threshold: 0.08 });
  document.querySelectorAll('.oc-rise').forEach(el => observer.observe(el));
}

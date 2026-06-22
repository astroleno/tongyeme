const SNAP_CLASS = 'homepage-transition--snapped';
const PLAYING_CLASS = 'homepage-transition--playing';
const FORWARD_STATE = 'forward';

const ENTRY_ATTRIBUTES = [
  {
    id: 'home-belief',
    dataset: {
      transitionPreserveEntry: 'true'
    }
  },
  {
    id: 'belief-method',
    dataset: {
      transitionInstantExit: 'true'
    }
  },
  {
    id: 'philosophy-contact',
    dataset: {
      transitionInstantExit: 'true'
    }
  }
];

const HANDOFF_RULES = [
  {
    id: 'belief-method',
    targetSelector: '.method-edition-layout--after-handoff, #method',
    afterPlayback: true
  },
  {
    id: 'method-tooling__method-proof',
    targetSelector: '#brand .brand-definition-grid, #brand',
    afterPlayback: false
  },
  {
    id: 'philosophy-contact',
    targetSelector: '#contact .contact-endpoint, #contact',
    afterPlayback: true
  }
];

const getScrollY = () => window.scrollY || window.pageYOffset || 0;

function getDocumentTop(element) {
  return getScrollY() + element.getBoundingClientRect().top;
}

function getQueryRoot(root) {
  return typeof root?.querySelector === 'function' ? root : document;
}

function getDocument(root) {
  return getQueryRoot(root).ownerDocument || document;
}

function getHost(root, id) {
  return getQueryRoot(root).querySelector(`[data-transition-id="${id}"]`);
}

function applyEntryAttributes(root) {
  ENTRY_ATTRIBUTES.forEach(({ id, dataset }) => {
    const host = getHost(root, id);
    if (!host) return;

    Object.entries(dataset).forEach(([key, value]) => {
      host.dataset[key] = value;
    });
  });
}

function findRuleTarget(rule, host, doc) {
  return doc.querySelector(rule.targetSelector)
    || doc.getElementById(host?.dataset?.transitionTo || '')
    || null;
}

function scrollToTarget(target, scrollRuntime) {
  const targetY = Math.max(0, Math.round(getDocumentTop(target)));
  if (targetY <= getScrollY() + 2) return;

  const lenis = scrollRuntime?.lenis;

  window.scrollTo({ top: targetY, left: window.scrollX, behavior: 'auto' });

  if (typeof lenis?.scrollTo === 'function') {
    lenis.scrollTo(targetY, {
      immediate: true,
      force: true,
      lock: false
    });
  }
}

function shouldSkipDetachedGap({ host, target, direction }) {
  if (!host || !target || direction <= 0) return false;
  if (host.classList.contains(SNAP_CLASS) || host.classList.contains(PLAYING_CLASS)) return false;

  const scrollY = getScrollY();
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const hostEnd = getDocumentTop(host) + Math.max(viewportHeight, host.offsetHeight || viewportHeight);
  const targetTop = getDocumentTop(target);
  const guardStart = hostEnd - Math.min(56, viewportHeight * 0.08);

  return targetTop > hostEnd + 2
    && scrollY >= guardStart
    && scrollY < targetTop - 2;
}

export function initHomepageContinuityGuard(options = {}) {
  const { root = document, reduceMotion = false, scrollRuntime = null } = options;
  const queryRoot = getQueryRoot(root);
  const doc = getDocument(queryRoot);
  const schedules = new WeakMap();
  let lastScrollY = getScrollY();
  let destroyed = false;

  applyEntryAttributes(queryRoot);

  if (reduceMotion) return options;

  const rules = HANDOFF_RULES
    .map((rule) => ({
      ...rule,
      host: getHost(queryRoot, rule.id)
    }))
    .filter((rule) => rule.host);

  const scheduleJump = (rule) => {
    if (destroyed || schedules.get(rule.host)) return;
    const target = findRuleTarget(rule, rule.host, doc);
    if (!target) return;

    schedules.set(rule.host, true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        schedules.delete(rule.host);
        if (destroyed) return;
        scrollToTarget(target, scrollRuntime);
        lastScrollY = getScrollY();
      });
    });
  };

  const onScroll = () => {
    if (destroyed) return;
    const scrollY = getScrollY();
    const direction = scrollY >= lastScrollY ? 1 : -1;
    lastScrollY = scrollY;

    rules.forEach((rule) => {
      const target = findRuleTarget(rule, rule.host, doc);
      if (shouldSkipDetachedGap({ host: rule.host, target, direction })) {
        scheduleJump(rule);
      }
    });
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(({ target }) => {
      const host = target instanceof Element ? target : null;
      if (!host || host.dataset.snapState !== FORWARD_STATE) return;
      if (host.classList.contains(SNAP_CLASS) || host.classList.contains(PLAYING_CLASS)) return;

      const rule = rules.find((candidate) => candidate.afterPlayback && candidate.host === host);
      if (rule) scheduleJump(rule);
    });
  });

  rules
    .filter((rule) => rule.afterPlayback)
    .forEach((rule) => observer.observe(rule.host, { attributes: true, attributeFilter: ['class'] }));

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', () => {
    destroyed = true;
    observer.disconnect();
    window.removeEventListener('scroll', onScroll);
  }, { once: true });

  return options;
}

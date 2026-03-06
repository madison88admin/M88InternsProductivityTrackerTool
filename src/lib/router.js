/**
 * Simple SPA Router
 * Hash-based routing for Netlify compatibility (no server-side config needed).
 */

/** @type {Map<string, { handler: Function, roles?: string[] }>} */
const routes = new Map();
let notFoundHandler = null;
let beforeEachGuard = null;

/**
 * Register a route.
 * @param {string} path - Route path (e.g., '/dashboard')
 * @param {Function} handler - Async function that returns HTML string or renders to #app
 * @param {string[]} [roles] - Allowed roles (empty = public)
 */
export function addRoute(path, handler, roles = []) {
  routes.set(path, { handler, roles });
}

/**
 * Set the 404 handler.
 * @param {Function} handler
 */
export function setNotFound(handler) {
  notFoundHandler = handler;
}

/**
 * Set a guard that runs before each navigation.
 * @param {Function} guard - async (path) => boolean. Return false to cancel navigation.
 */
export function setBeforeEach(guard) {
  beforeEachGuard = guard;
}

/**
 * Navigate to a route.
 * @param {string} path
 */
export function navigateTo(path) {
  window.location.hash = `#${path}`;
}

/**
 * Get current route path from hash.
 * @returns {string}
 */
export function getCurrentPath() {
  const hash = window.location.hash.slice(1) || '/login';
  return hash;
}

/**
 * Get the route config for a path, supporting route parameters.
 * @param {string} path
 * @returns {{ route: { handler: Function, roles?: string[] }, params: Record<string, string> } | null}
 */
function matchRoute(path) {
  // Exact match first
  if (routes.has(path)) {
    return { route: routes.get(path), params: {} };
  }

  // Parameterized routes (e.g., /intern/:id)
  for (const [pattern, route] of routes) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return { route, params };
    }
  }

  return null;
}

/**
 * Handle route changes.
 */
async function handleRouteChange() {
  const path = getCurrentPath();

  if (beforeEachGuard) {
    const allowed = await beforeEachGuard(path);
    if (!allowed) return;
  }

  const matched = matchRoute(path);

  if (matched) {
    try {
      await matched.route.handler(matched.params);
    } catch (err) {
      console.error(`Route error for ${path}:`, err);
    }
  } else if (notFoundHandler) {
    await notFoundHandler();
  }
}

/**
 * Initialize the router.
 */
export function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  // Handle initial load
  if (!window.location.hash) {
    window.location.hash = '#/login';
  } else {
    handleRouteChange();
  }
}

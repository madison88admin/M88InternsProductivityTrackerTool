/**
 * Simple component rendering helper.
 * Renders HTML string into a target element and runs an optional init function.
 */

/**
 * Render a component into the #app element.
 * @param {string} html - The HTML template
 * @param {Function} [init] - Callback to run after render (for event binding)
 */
export function renderPage(html, init) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = html;
  if (init) {
    // Run init after DOM update
    requestAnimationFrame(() => init(app));
  }
}

/**
 * Create a modal and append it to the body.
 * @param {string} title
 * @param {string} bodyHtml
 * @param {Function} [init]
 * @returns {{ element: HTMLElement, close: Function }}
 */
export function createModal(title, bodyHtml, init) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal';
  backdrop.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="text-lg font-bold text-neutral-900">${title}</h3>
        <button id="modal-close" class="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all duration-200">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();

  backdrop.querySelector('#modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  if (init) {
    requestAnimationFrame(() => init(backdrop, close));
  }

  return { element: backdrop, close };
}

/**
 * Close any open modal.
 */
export function closeModal() {
  document.getElementById('modal')?.remove();
}

/**
 * Create a confirmation dialog.
 * @param {string} message
 * @param {Function} onConfirm
 * @param {string} [confirmText='Confirm']
 */
export function confirmDialog(message, onConfirm, confirmText = 'Confirm') {
  createModal('Confirm Action', `
    <div class="text-center py-4">
      <div class="mx-auto w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mb-4">
        <svg class="w-6 h-6 text-danger-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <p class="text-neutral-700 mb-6">${message}</p>
      <div class="flex justify-center gap-3">
        <button id="confirm-cancel" class="btn-secondary">Cancel</button>
        <button id="confirm-ok" class="btn-danger">${confirmText}</button>
      </div>
    </div>
  `, (el, close) => {
    el.querySelector('#confirm-cancel').addEventListener('click', close);
    el.querySelector('#confirm-ok').addEventListener('click', () => {
      close();
      onConfirm();
    });
  });
}

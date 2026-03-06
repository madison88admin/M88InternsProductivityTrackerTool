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
        <h3 class="text-lg font-semibold text-neutral-800">${title}</h3>
        <button id="modal-close" class="text-neutral-400 hover:text-neutral-600">
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
    <p class="text-neutral-600 mb-4">${message}</p>
    <div class="flex justify-end gap-3">
      <button id="confirm-cancel" class="btn-secondary">Cancel</button>
      <button id="confirm-ok" class="btn-danger">${confirmText}</button>
    </div>
  `, (el, close) => {
    el.querySelector('#confirm-cancel').addEventListener('click', close);
    el.querySelector('#confirm-ok').addEventListener('click', () => {
      close();
      onConfirm();
    });
  });
}

/**
 * My DAR Draft Page (Intern)
 * Preview a draft Daily Activity Report for the current tracking week.
 * This view is controlled by an admin system setting: intern_dar_draft_view.
 */

import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import {
  formatDate,
  formatDateKey,
  getTrackingWeekStart,
  getTrackingWeekEnd,
} from '../lib/utils.js';
import { fetchDarData, generateDarPdf } from './reports.js';
import { showToast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

function calculateInternWeekNumber(ojtStartDate, startDate) {
  if (!ojtStartDate) return 1;

  const ojtStart = new Date(`${ojtStartDate}T00:00:00`);
  const start = new Date(`${startDate}T00:00:00`);
  const ojtStartWeek = getTrackingWeekStart(ojtStart);
  const diffMs = start - ojtStartWeek;
  let weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  if (weekNum < 1) weekNum = 1;
  return weekNum;
}

async function renderPdfPreview(containerEl, frameEl, pdfBytes, zoomMultiplier = 1) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  // pdf.js may transfer/detach buffers to the worker; pass a fresh copy each render.
  const dataCopy = pdfBytes?.slice ? pdfBytes.slice(0) : new Uint8Array(pdfBytes);
  const pdf = await pdfjsLib.getDocument({ data: dataCopy }).promise;
  const page = await pdf.getPage(1);

  // Fit the PDF page to the available frame (no scrolling).
  const baseViewport = page.getViewport({ scale: 1 });
  const rect = (frameEl || containerEl).getBoundingClientRect();
  const availableWidth = Math.max(320, rect.width - 24); // account for padding
  const availableHeight = Math.max(320, rect.height - 24);
  const widthScale = availableWidth / baseViewport.width;
  const heightScale = availableHeight / baseViewport.height;
  const fitScale = Math.min(1.5, Math.max(0.35, Math.min(widthScale, heightScale)));
  const userScale = Math.min(2.25, Math.max(0.25, fitScale * (zoomMultiplier || 1)));
  const viewport = page.getViewport({ scale: userScale });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  canvas.style.display = 'block';
  canvas.style.userSelect = 'none';
  canvas.style.webkitUserSelect = 'none';
  canvas.className = 'mx-auto';

  // Preview-only hardening: prevent the common "Save image as..." and drag-save paths.
  // Note: screenshots/devtools can't be fully prevented in a browser.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dragstart', (e) => e.preventDefault());
  containerEl.addEventListener('contextmenu', (e) => e.preventDefault());

  containerEl.innerHTML = '';
  containerEl.appendChild(canvas);

  await page.render({ canvasContext: ctx, viewport }).promise;
}

export async function renderMyDarDraftPage() {
  const profile = getProfile();

  const today = new Date();
  const weekStart = getTrackingWeekStart(today);
  const weekEnd = getTrackingWeekEnd(today);

  const previousWeekDate = new Date(weekStart);
  previousWeekDate.setDate(previousWeekDate.getDate() - 1);
  const previousWeekStart = getTrackingWeekStart(previousWeekDate);
  const previousWeekEnd = getTrackingWeekEnd(previousWeekDate);

  const weekStartKey = formatDateKey(weekStart);
  const weekEndKey = formatDateKey(weekEnd);
  const previousWeekStartKey = formatDateKey(previousWeekStart);
  const previousWeekEndKey = formatDateKey(previousWeekEnd);

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">My DAR Draft</h1>
      <p class="page-subtitle">This draft is for validation purposes only and does not represent final allowance computations.</p>
    </div>

    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div class="space-y-2">
          <div>
            <p class="text-sm font-semibold text-neutral-800">Current tracking week</p>
            <p class="text-xs text-neutral-500">${formatDate(weekStart)} to ${formatDate(weekEnd)} (Friday to Thursday)</p>
          </div>

          <div>
            <label for="dar-week-select" class="block text-xs font-semibold text-neutral-700 mb-1">View week</label>
            <select id="dar-week-select" class="form-input text-sm min-w-60"></select>
          </div>
        </div>

        <div class="flex items-center gap-2 self-start md:self-center">
          <div class="text-xs text-neutral-500 bg-neutral-100 px-3 py-1 rounded-full inline-flex items-center gap-2">
            ${icons.info}
            <span id="dar-week-label">Week -</span>
          </div>

          <div class="flex items-center gap-1" aria-label="Preview zoom controls">
            <button id="dar-zoom-out" class="btn-secondary btn-sm" type="button" title="Zoom out">−</button>
            <button id="dar-zoom-reset" class="btn-secondary btn-sm" type="button" title="Reset zoom"><span id="dar-zoom-label">100%</span></button>
            <button id="dar-zoom-in" class="btn-secondary btn-sm" type="button" title="Zoom in">${icons.plus}</button>
          </div>
        </div>
      </div>

      <p id="dar-week-help" class="text-xs text-neutral-500 mb-4 hidden"></p>

      <div id="dar-draft-disabled" class="hidden p-4 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-600">
        This feature is currently disabled by administrators.
      </div>

      <div id="dar-draft-loading" class="flex items-center text-sm text-neutral-500">
        <span class="spinner mr-2"></span> Loading draft...
      </div>

      <div id="dar-draft-frame" class="rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50" style="height: calc(100vh - 220px); min-height: 540px;">
        <div id="dar-draft-preview" class="p-3">
          <div class="flex items-center justify-center text-sm text-neutral-400" style="min-height: 120px;">
            Draft preview will appear here.
          </div>
        </div>
      </div>

      <p class="text-xs text-neutral-400 mt-4">Total hours are shown for validation. Allowance will display as PHP 0.00 until the week is approved by admins. Approved historical DARs are available after admin processing in My Allowance.</p>
    </div>
  `, async (el) => {
    const disabledBox = el.querySelector('#dar-draft-disabled');
    const loadingRow = el.querySelector('#dar-draft-loading');
    const previewHost = el.querySelector('#dar-draft-preview');
    const previewFrame = el.querySelector('#dar-draft-frame');
    const weekLabel = el.querySelector('#dar-week-label');
    const weekSelect = el.querySelector('#dar-week-select');
    const weekHelp = el.querySelector('#dar-week-help');

    const zoomOutBtn = el.querySelector('#dar-zoom-out');
    const zoomInBtn = el.querySelector('#dar-zoom-in');
    const zoomResetBtn = el.querySelector('#dar-zoom-reset');
    const zoomLabel = el.querySelector('#dar-zoom-label');

    let zoomMultiplier = 1;
    const zoomMin = 0.7;
    const zoomMax = 1.8;
    const zoomStep = 0.1;

    let cachedPdfBytes = null;
    let activeLoadId = 0;

    function updateZoomUi() {
      if (!zoomLabel) return;
      zoomLabel.textContent = `${Math.round(zoomMultiplier * 100)}%`;

      // Keep default as no-scroll full-page view.
      if (previewFrame) {
        previewFrame.classList.toggle('overflow-hidden', zoomMultiplier <= 1);
        previewFrame.classList.toggle('overflow-auto', zoomMultiplier > 1);
      }

      if (zoomOutBtn) zoomOutBtn.disabled = zoomMultiplier <= zoomMin;
      if (zoomInBtn) zoomInBtn.disabled = zoomMultiplier >= zoomMax;
    }

    async function rerenderPreview() {
      if (!cachedPdfBytes) return;
      try {
        await renderPdfPreview(previewHost, previewFrame, cachedPdfBytes, zoomMultiplier);
      } catch (err) {
        console.error('DAR preview render error:', err);
      }
    }

    async function loadDarForSelectedWeek(weekOptionsByValue) {
      const selectedWeek = weekOptionsByValue.get(weekSelect.value);
      if (!selectedWeek) return;

      const loadId = ++activeLoadId;
      loadingRow.classList.remove('hidden');

      try {
        const darData = await fetchDarData(profile.id, selectedWeek.start, selectedWeek.end);
        if (loadId !== activeLoadId) return;

        const weekNum = calculateInternWeekNumber(darData?.intern?.ojt_start_date, selectedWeek.start);
        weekLabel.textContent = `${selectedWeek.badgeLabel}: Week ${weekNum}`;

        const doc = await generateDarPdf(darData, weekNum, selectedWeek.start, null, {
          maskAllowanceUnlessApproved: true,
          watermarkText: 'DRAFT — PREVIEW ONLY',
        });

        if (loadId !== activeLoadId) return;

        const pdfArrayBuffer = doc.output('arraybuffer');
        cachedPdfBytes = new Uint8Array(pdfArrayBuffer);
        updateZoomUi();
        await renderPdfPreview(previewHost, previewFrame, cachedPdfBytes, zoomMultiplier);
      } catch (err) {
        if (loadId !== activeLoadId) return;
        console.error('My DAR Draft load error:', err);
        previewHost.innerHTML = `
          <div class="p-4 rounded-lg border border-danger-200 bg-danger-50 text-sm text-danger-700">
            Failed to load your DAR draft. Please try again later.
          </div>
        `;
      } finally {
        if (loadId === activeLoadId) {
          loadingRow.classList.add('hidden');
        }
      }
    }

    updateZoomUi();

    zoomOutBtn?.addEventListener('click', async () => {
      zoomMultiplier = Math.max(zoomMin, Math.round((zoomMultiplier - zoomStep) * 10) / 10);
      updateZoomUi();
      await rerenderPreview();
    });

    zoomInBtn?.addEventListener('click', async () => {
      zoomMultiplier = Math.min(zoomMax, Math.round((zoomMultiplier + zoomStep) * 10) / 10);
      updateZoomUi();
      await rerenderPreview();
    });

    zoomResetBtn?.addEventListener('click', async () => {
      zoomMultiplier = 1;
      updateZoomUi();
      await rerenderPreview();
    });

    try {
      const { data: settingRow, error: settingErr } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'intern_dar_draft_view')
        .maybeSingle();

      if (settingErr) throw settingErr;

      const enabled = settingRow?.value?.enabled === true || settingRow?.value === true;
      if (!enabled) {
        loadingRow.classList.add('hidden');
        disabledBox.classList.add('hidden');
        showToast('My DAR Draft is currently disabled by administrators', 'info');
        navigateTo('/dashboard');
        return;
      }

      const { data: previousAllowance, error: previousAllowanceErr } = await supabase
        .from('allowance_periods')
        .select('status')
        .eq('intern_id', profile.id)
        .eq('week_start', previousWeekStartKey)
        .maybeSingle();

      if (previousAllowanceErr) throw previousAllowanceErr;

      const previousWeekDeadline = new Date(`${previousWeekEndKey}T23:59:59`);
      previousWeekDeadline.setDate(previousWeekDeadline.getDate() + 3);
      const withinPreviousWeekGrace = Date.now() <= previousWeekDeadline.getTime();
      const previousWeekApproved = previousAllowance?.status === 'approved';
      const canShowPreviousWeek = !previousWeekApproved || withinPreviousWeekGrace;

      const weekOptions = [
        {
          value: 'current',
          start: weekStartKey,
          end: weekEndKey,
          label: `Current week (${formatDate(weekStart)} to ${formatDate(weekEnd)})`,
          badgeLabel: 'Current week',
        },
      ];

      if (canShowPreviousWeek) {
        weekOptions.push({
          value: 'previous',
          start: previousWeekStartKey,
          end: previousWeekEndKey,
          label: `Last week (${formatDate(previousWeekStart)} to ${formatDate(previousWeekEnd)})`,
          badgeLabel: 'Last week',
        });
      }

      weekSelect.innerHTML = weekOptions
        .map(option => `<option value="${option.value}">${option.label}</option>`)
        .join('');

      const weekOptionsByValue = new Map(weekOptions.map(option => [option.value, option]));
      weekSelect.addEventListener('change', () => {
        loadDarForSelectedWeek(weekOptionsByValue);
      });

      if (canShowPreviousWeek) {
        weekHelp.classList.remove('hidden');
        weekHelp.textContent = 'Last week is available while pending approval or during the 3-day transition window.';
      }

      await loadDarForSelectedWeek(weekOptionsByValue);
    } catch (err) {
      console.error('My DAR Draft load error:', err);
      previewHost.innerHTML = `
        <div class="p-4 rounded-lg border border-danger-200 bg-danger-50 text-sm text-danger-700">
          Failed to load your DAR draft. Please try again later.
        </div>
      `;
      loadingRow.classList.add('hidden');
    }
  }, '/my-dar-draft');
}

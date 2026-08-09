// ==UserScript==
// @name         Gemini Bulk Delete Chats
// @namespace    gemini-bulk-delete-recent
// @version      1.0
// @description  Adds checkboxes to the Gemini sidebar "Recent" chat list, allowing you to bulk delete selected chats.
// @author       htaskn
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__gmBulkDeleteInstalled) return;
  window.__gmBulkDeleteInstalled = true;

  const SECTION_SELECTOR = 'expandable-section[data-test-id="chats-expandable-section"]';
  const ITEM_SELECTOR = 'gem-nav-list-item';
  const OPTIONS_BTN_SELECTOR = 'button[aria-label*="Options"], button[aria-label*="オプション"]';
  const CHECKBOX_CLASS = 'gm-bulk-del-checkbox';
  const TOOLBAR_ID = 'gm-bulk-del-toolbar';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(predicate, timeout = 4000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = predicate();
      if (result) return result;
      await sleep(interval);
    }
    return null;
  }

  function getChatItems(section) {
    return Array.from(section.querySelectorAll(ITEM_SELECTOR)).filter((item) =>
      item.querySelector('a[href^="/app/"]')
    );
  }

  function ensureCheckbox(item) {
    if (item.querySelector('.' + CHECKBOX_CLASS)) return;
    const label = document.createElement('label');
    label.className = CHECKBOX_CLASS;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    label.appendChild(cb);
    cb.addEventListener('change', updateToolbarState);
    item.appendChild(label);
    item.classList.add('gm-has-checkbox');
  }

  function ensureToolbar(section) {
    if (document.getElementById(TOOLBAR_ID)) return;
    const header = section.querySelector('.expandable-section-header') || section.firstElementChild;

    const bar = document.createElement('div');
    bar.id = TOOLBAR_ID;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.width = '100%';

    const selectAllLabel = document.createElement('label');
    selectAllLabel.style.display = 'flex';
    selectAllLabel.style.alignItems = 'center';
    selectAllLabel.style.gap = '4px';
    selectAllLabel.style.cursor = 'pointer';
    selectAllLabel.style.whiteSpace = 'nowrap';
    const selectAllCb = document.createElement('input');
    selectAllCb.type = 'checkbox';
    selectAllCb.id = 'gm-select-all';
    const selectAllSpan = document.createElement('span');
    selectAllSpan.textContent = 'Select All';
    selectAllLabel.appendChild(selectAllCb);
    selectAllLabel.appendChild(selectAllSpan);

    const countSpan = document.createElement('span');
    countSpan.id = 'gm-selected-count';
    countSpan.textContent = '0 selected';
    countSpan.style.color = '#888';
    countSpan.style.whiteSpace = 'nowrap';

    row.appendChild(selectAllLabel);
    row.appendChild(countSpan);

    const delBtn = document.createElement('button');
    delBtn.id = 'gm-delete-selected';
    delBtn.textContent = 'Delete Selected Chats';
    delBtn.disabled = true;
    delBtn.style.width = '100%';
    delBtn.style.padding = '5px 0';
    delBtn.style.whiteSpace = 'nowrap';

    bar.appendChild(row);
    bar.appendChild(delBtn);
    header.insertAdjacentElement('afterend', bar);

    selectAllCb.addEventListener('change', (e) => {
      const section2 = document.querySelector(SECTION_SELECTOR);
      getChatItems(section2).forEach((item) => {
        const cb = item.querySelector('.' + CHECKBOX_CLASS + ' input');
        if (cb) cb.checked = e.target.checked;
      });
      updateToolbarState();
    });

    delBtn.addEventListener('click', onDeleteSelected);
  }

  function getSelectedHrefs() {
    const section = document.querySelector(SECTION_SELECTOR);
    if (!section) return [];
    return getChatItems(section)
      .filter((item) => {
        const cb = item.querySelector('.' + CHECKBOX_CLASS + ' input');
        return cb && cb.checked;
      })
      .map((item) => item.querySelector('a[href^="/app/"]').getAttribute('href'));
  }

  function updateToolbarState() {
    const bar = document.getElementById(TOOLBAR_ID);
    if (!bar) return;
    const hrefs = getSelectedHrefs();
    bar.querySelector('#gm-selected-count').textContent = hrefs.length + ' selected';
    bar.querySelector('#gm-delete-selected').disabled = hrefs.length === 0;
  }

  function injectCheckboxes() {
    const section = document.querySelector(SECTION_SELECTOR);
    if (!section) return;
    ensureToolbar(section);
    getChatItems(section).forEach(ensureCheckbox);
    updateToolbarState();
  }

  async function deleteOneChat(href) {
    const section = document.querySelector(SECTION_SELECTOR);
    if (!section) return false;
    const a = section.querySelector('a[href="' + href + '"]');
    if (!a) return false;
    const item = a.closest(ITEM_SELECTOR);
    const optBtn = item.querySelector(OPTIONS_BTN_SELECTOR);
    if (!optBtn) return false;
    optBtn.click();

    const menuItem = await waitFor(() => {
      const panel = document.querySelector('.cdk-overlay-container .mat-mdc-menu-panel');
      if (!panel) return null;
      return (
        Array.from(panel.querySelectorAll('[role="menuitem"]')).find(
          (b) => b.textContent.trim() === 'Delete' || b.textContent.trim() === '削除'
        ) || null
      );
    });
    if (!menuItem) return false;
    menuItem.click();

    const confirmBtn = await waitFor(() => {
      const dialog = document.querySelector('.cdk-overlay-container mat-dialog-container');
      if (!dialog) return null;
      return (
        Array.from(dialog.querySelectorAll('button')).find(
          (b) => b.textContent.trim() === 'Delete' || b.textContent.trim() === '削除'
        ) || null
      );
    });
    if (!confirmBtn) return false;
    confirmBtn.click();

    await waitFor(() => !document.querySelector('.cdk-overlay-container mat-dialog-container'));
    await sleep(300);
    return true;
  }

  async function onDeleteSelected() {
    const hrefs = getSelectedHrefs();
    if (hrefs.length === 0) return;

    const bar = document.getElementById(TOOLBAR_ID);
    const btn = bar.querySelector('#gm-delete-selected');
    btn.disabled = true;
    const origText = btn.textContent;

    let done = 0;
    for (const href of hrefs) {
      btn.textContent = 'Deleting… (' + (done + 1) + '/' + hrefs.length + ')';
      try {
        await deleteOneChat(href);
      } catch (e) {
        console.error('Delete failed:', href, e);
      }
      done++;
      await sleep(200);
    }
    btn.textContent = origText;
    injectCheckboxes();
  }

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(injectCheckboxes, 300);
  });

  const style = document.createElement('style');
  style.textContent = `
    gem-nav-list-item.gm-has-checkbox .mdc-list-item__content { max-width: 205px !important; }
    .${CHECKBOX_CLASS} { position:absolute; top:0; right:34px; height:32px; width:18px; display:flex; align-items:center; z-index:3; cursor:pointer; }
    .#${TOOLBAR_ID} { display:flex; flex-direction:column; align-items:stretch; gap:4px; padding:6px 10px; font-size:11px; color:#444; border-bottom:1px solid #e0e0e0; margin-bottom:4px; }
    .#${TOOLBAR_ID} button { cursor:pointer; border:none; background:#d93025; color:#fff; border-radius:6px; font-size:12px; }
    .#${TOOLBAR_ID} button:disabled { background:#ccc; cursor:default; }
  `;
  document.head.appendChild(style);

  injectCheckboxes();
  observer.observe(document.body, { childList: true, subtree: true });
})();
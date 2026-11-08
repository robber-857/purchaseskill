// Keep long previews in the document's normal scroll flow. Native modal dialogs
// make wheel events over their backdrop appear to do nothing, especially in a
// short window. These views use the same page scrollbar as the workbench.
let active = null;
export function closePanel() {
  if (!active) return;
  const { panel, hidden, scroll, trigger } = active;
  active = null;
  panel.hidden = true;
  document.querySelector('.app-sidebar')?.removeAttribute('inert');
  hidden.forEach(element => { element.hidden = false; });
  trigger?.focus({ preventScroll: true });
  window.scrollTo({ top: scroll, behavior: 'instant' });
}
export function openPanel(id) {
  closePanel();
  const panel = document.getElementById(id);
  const hidden = [...document.querySelector('#app').children].filter(element =>
    element !== panel && !element.hidden && !element.matches('.topbar, .app-sidebar, #toast')
  );
  active = { panel, hidden, scroll: window.scrollY, trigger: document.activeElement };
  hidden.forEach(element => { element.hidden = true; });
  panel.hidden = false;
  document.querySelector('.app-sidebar')?.setAttribute('inert','');
  window.scrollTo({ top: 0, behavior: 'instant' });
  panel.querySelector('.close')?.focus({ preventScroll: true });
}
export function resetPanels() { active = null; }
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && active) { event.preventDefault(); closePanel(); }
});

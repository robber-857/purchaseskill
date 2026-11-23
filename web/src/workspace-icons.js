export const workspaceMark='<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#143749"/><path d="m7 11 9-4 9 4-9 4-9-4Z" fill="#fff"/><path d="m7 15.2 9 4 9-4M7 19.3l9 4 9-4" fill="none" stroke="#a6dae0" stroke-width="2.2" stroke-linejoin="round"/></svg>';

const paths = {
  key: '<circle cx="8" cy="9" r="4"/><path d="m11 12 8 8h2v-3h-3v-3h-3"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  refresh: '<path d="M4.5 10a7.5 7.5 0 0 1 13-3.5L20 9m0-5v5h-5M19.5 14a7.5 7.5 0 0 1-13 3.5L4 15m0 5v-5h5"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  library: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M7 3.5h10M9 11h6"/>',
  data: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M4 9h16M10 9v11"/>',
  sample: '<path d="M12 5.5c-2.6-1.8-5.3-1.8-9-.8v14c3.5-1.1 6.5-.8 9 .8 2.5-1.6 5.5-1.9 9-.8v-14c-3.7-1-6.4-1-9 .8Zm0 0v14"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M8.5 12h7M8.5 16h5"/>',
  panel: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M9 5v14"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.1M4 12h.1M4 18h.1"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1m-6 4h1m4 0h1m-4 9v-4h2v4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m10 5-7 7 7 7M4 12h16"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  print: '<path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7zM17 11h.1"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/>'
};

export function workspaceIcon(name) {
  return `<svg class="ws-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||''}</svg>`;
}

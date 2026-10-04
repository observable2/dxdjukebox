// What the Screen and Titles pages draw. "html" is the htl template tag, passed in by the page.
import {FIELDS} from "./lib.js";

export function renderScreen(html, item) {
  return item
    ? html`<iframe src=${item.url} title=${item.title} style="width:100%;height:90vh;border:0" referrerpolicy="no-referrer" allow="fullscreen; autoplay"></iframe>`
    : html`<p style="font:16px system-ui;color:#666;text-align:center;padding:4em 0">Nothing scheduled right now.</p>`;
}

export function renderTitles(html, item) {
  if (!item) return html`<p style="font:16px system-ui;color:#666">Nothing scheduled right now.</p>`;
  const rows = FIELDS.filter((f) => f.key !== "title" && item[f.key]).map((f) =>
    html.fragment`<dt style="font-weight:600">${f.label}</dt><dd style="margin:0;white-space:pre-wrap">${f.key === "url" ? html`<a href=${item.url} target=_blank rel=noopener>${item.url}</a>` : item[f.key]}</dd>`);
  return html`<div style="font:15px system-ui;max-width:720px"><h2 style="margin-bottom:4px">${item.title}</h2><dl style="display:grid;grid-template-columns:max-content 1fr;gap:6px 16px">${rows}</dl></div>`;
}

export const renderError = (html, message) => html`<p style="color:crimson">${message}</p>`;

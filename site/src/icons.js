/**
 * Static SVG strings for Lucide icons used throughout the app.
 *
 * SECURITY NOTE: These strings are emitted via `cv-html.raw="icons.X"` in
 * templates, which bypasses the default sanitizer added in Courvux 0.6.0.
 * The strings here are TRUSTED because they originate from this module
 * and are not user-controllable. Do NOT add icons sourced from user input,
 * external APIs, or any data that might cross a trust boundary.
 *
 * If you need to render user-provided HTML, use `cv-html` (sanitized by
 * default) instead of `cv-html.raw`.
 */

// Static SVG strings for the lucide icons the landing uses. Same
// helper pattern as the app — keeps the bundle tight (only the icons
// we actually render ship) and dodges runtime tag construction.

import {
    Download, ExternalLink, FolderTree, Menu, FileText,
    Lock, Image, Link2, Layers, ChevronDown, Check, Search, Save, Plus,
} from 'lucide';

// Lucide v1 dropped brand glyphs (no `Github` export). Inline the
// Octicons mark-16 SVG instead — it's MIT-licensed and matches the
// stroke weight of the lucide icons we use elsewhere.
const GITHUB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

function lucideToSvg(children, size = 16, strokeWidth = 2) {
    const attrs = {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    };
    const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    const childStr = children
        .map(([tag, props]) => `<${tag} ${Object.entries(props).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
        .join('');
    return `<svg ${attrStr}>${childStr}</svg>`;
}

export const ICONS = {
    github:       GITHUB_SVG,
    download:     lucideToSvg(Download),
    externalLink: lucideToSvg(ExternalLink),
    folderTree:   lucideToSvg(FolderTree),
    menu:         lucideToSvg(Menu),
    file:         lucideToSvg(FileText),
    lock:         lucideToSvg(Lock),
    image:        lucideToSvg(Image),
    link:         lucideToSvg(Link2),
    layers:       lucideToSvg(Layers),
    chevronDown:  lucideToSvg(ChevronDown),
    check:        lucideToSvg(Check),
    search:       lucideToSvg(Search),
    save:         lucideToSvg(Save),
    plus:         lucideToSvg(Plus),
};

// Bigger variant for hero / feature cards.
export const ICONS_LG = Object.fromEntries(
    Object.entries(ICONS).map(([k, svg]) => [
        k,
        svg.replace(/width="\d+"/, 'width="22"').replace(/height="\d+"/, 'height="22"'),
    ]),
);

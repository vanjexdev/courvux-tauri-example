// Prebuild Lucide icons into static SVG strings at module load time.
// We keep the set tight — only what the notepad UI actually uses — so the
// bundle doesn't pay for the full Lucide catalog.

import {
    Plus, Check, Pencil, Eye, Columns2, X, Save, Folder, Settings,
    PanelLeftClose, PanelLeftOpen, Trash2, FileText,
} from 'lucide';

/**
 * Convert a Lucide icon tuple ([tag, attrs, children]) into an SVG string.
 * `size` overrides width/height; `strokeWidth` overrides line thickness.
 */
function lucideToSvg(icon, size = 16, strokeWidth = 2) {
    // Lucide ships each icon as: ['svg', defaultAttrs, [['line', { ... }], …]]
    const [, defaultAttrs, children] = icon;
    const attrs = { ...defaultAttrs, width: size, height: size, 'stroke-width': strokeWidth };
    const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
    const childStr = children
        .map(([tag, attrs]) =>
            `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
        )
        .join('');
    return `<svg ${attrStr}>${childStr}</svg>`;
}

/**
 * Static SVG strings keyed by short name. Used directly via `cv-html.raw`
 * inside the template — re-rendering is essentially free because the value
 * is a string constant.
 */
export const ICONS = {
    plus:           lucideToSvg(Plus),
    check:          lucideToSvg(Check),
    edit:           lucideToSvg(Pencil),
    eye:            lucideToSvg(Eye),
    split:          lucideToSvg(Columns2),
    x:              lucideToSvg(X),
    save:           lucideToSvg(Save),
    folder:         lucideToSvg(Folder),
    settings:       lucideToSvg(Settings),
    sidebarClose:   lucideToSvg(PanelLeftClose),
    sidebarOpen:    lucideToSvg(PanelLeftOpen),
    trash:          lucideToSvg(Trash2),
    file:           lucideToSvg(FileText),
};

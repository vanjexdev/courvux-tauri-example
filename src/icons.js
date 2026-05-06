// Prebuild Lucide icons into static SVG strings at module load time.
// We keep the set tight — only what the notepad UI actually uses — so the
// bundle doesn't pay for the full Lucide catalog.

import {
    Plus, Check, Pencil, Eye, Columns2, X, Save, Folder, Settings,
    PanelLeftClose, PanelLeftOpen, Trash2, FileText, Search, Info,
    FolderOpen, FolderTree, ChevronRight, ChevronDown, Image, FolderPlus,
} from 'lucide';

/**
 * Convert a Lucide icon (v1 shape — `[[tag, attrs], [tag, attrs], …]`)
 * into an SVG string. `size` overrides width/height; `strokeWidth`
 * overrides line thickness. The default Lucide attrs (viewBox, fill,
 * stroke, linecap, linejoin) are stamped on every output so the icons
 * always render correctly without an external CSS rule.
 */
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
    const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
    const childStr = children
        .map(([tag, props]) =>
            `<${tag} ${Object.entries(props).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
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
    search:         lucideToSvg(Search),
    info:           lucideToSvg(Info),
    folderOpen:     lucideToSvg(FolderOpen),
    folderTree:     lucideToSvg(FolderTree),
    chevronRight:   lucideToSvg(ChevronRight),
    chevronDown:    lucideToSvg(ChevronDown),
    image:          lucideToSvg(Image),
    folderPlus:     lucideToSvg(FolderPlus),
};

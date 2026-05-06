// Markdown rendering pipeline: marked → Prism syntax highlight → DOMPurify.
//
// We isolate the configuration here so main.js stays focused on UI state.

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { convertFileSrc } from '@tauri-apps/api/core';

// Prism core. Each `import 'prismjs/components/prism-<lang>'` plugs that
// language's grammar into Prism.languages[<lang>]; we only ship the
// languages people are likely to drop into a notepad.
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-markup';        // html / xml
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-yaml';
// Tomorrow Night theme — dark, matches the notepad's zinc palette.
import 'prismjs/themes/prism-tomorrow.css';

const escapeHtml = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Wire syntax highlighting into marked's renderer. Falls back to plain
// HTML-escaped <pre><code> when the language is unknown so unsupported
// fences still render safely.
//
// Note: marked v5+ changed renderer hooks from positional args
// (code, infoString) to a single token object (`{ text, lang, ... }`).
// Passing the old signature here meant Prism received a token object
// instead of the source string and threw on every fenced block, which
// blanked the preview.
marked.use({
    renderer: {
        code({ text, lang }) {
            const langKey = (lang ?? '').trim().split(/\s+/)[0];
            if (langKey && Prism.languages[langKey]) {
                const html = Prism.highlight(text, Prism.languages[langKey], langKey);
                return `<pre><code class="language-${escapeHtml(langKey)}">${html}</code></pre>`;
            }
            return `<pre><code>${escapeHtml(text)}</code></pre>`;
        },
    },
    gfm: true,
    breaks: true,
});

// DOMPurify defaults reject the `asset:` URI scheme Tauri uses to serve
// local files into the webview. We extend the default URL regex to allow
// it so `<img src="asset://localhost/...">` survives sanitization.
// Windows resolves `convertFileSrc` to `https://asset.localhost/...`,
// which the default regex already permits — so this only matters for
// Linux / macOS where the scheme is the literal `asset:`.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|ftp|mailto|tel|callto|sms|cid|xmpp|asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

/**
 * Resolve a possibly-relative href to an absolute path under `baseDir`.
 * Leaves `https?:`, `data:`, `asset:`, and absolute filesystem paths
 * untouched. Used by the markdown renderer's image hook.
 */
function resolveAssetHref(href, baseDir) {
    if (!href || !baseDir) return href;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(href) || href.startsWith('//')) return href;
    // Posix-style relative paths in markdown — keep their separator and
    // join onto baseDir without normalizing away `../` (Tauri's asset
    // protocol enforces the scope, so a sneaky `../` outside the project
    // root just 404s instead of leaking).
    const sep = baseDir.includes('\\') ? '\\' : '/';
    const trimmed = baseDir.replace(/[\/\\]+$/, '');
    const joined = `${trimmed}${sep}${href.replace(/^[\/\\]+/, '')}`;
    return convertFileSrc(joined);
}

// Wire image and link renderers. We can't pass `baseDir` /
// `linkResolver` to marked through its renderer hooks (no per-call
// context in v18), so we stash them in module-local variables that
// the renderer reads — set/cleared inside `renderMarkdown` so a
// concurrent caller can't see leftover state.
let activeBaseDir = null;
let activeLinkResolver = null;
marked.use({
    renderer: {
        image({ href, title, text }) {
            const src = resolveAssetHref(href, activeBaseDir);
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text ?? '')}"${titleAttr}/>`;
        },
        link({ href, title, text }) {
            // Caller can supply a resolver (e.g. project-bundle PDF
            // export rewriting cross-doc `.md` links into intra-PDF
            // section anchors). Returning a non-null string replaces
            // the href; null/undefined leaves it untouched.
            let resolved = href;
            if (activeLinkResolver) {
                const r = activeLinkResolver(href, activeBaseDir);
                if (r != null) resolved = r;
            }
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
            return `<a href="${escapeHtml(resolved)}"${titleAttr}>${text}</a>`;
        },
    },
});

/**
 * Render a Markdown string to sanitized HTML.
 *
 * Pipeline:
 *   1. marked parses Markdown → HTML, calling our renderer.code for fences,
 *      renderer.image (rewrites relative paths to `asset://` when
 *      `baseDir` is set), and renderer.link (delegates to `linkResolver`
 *      when one is supplied — used by the project-PDF export to point
 *      cross-doc `.md` links at intra-PDF section anchors).
 *   2. Prism colorizes inside the renderer.
 *   3. DOMPurify strips `<script>`, `on*=`, `javascript:` URLs, etc., so
 *      a hostile paste cannot execute even with strict CSP. The asset:
 *      scheme is whitelisted via `ALLOWED_URI_REGEXP`; the in-document
 *      `#` anchor scheme is permitted by the same regex.
 *
 * @param {string} src
 * @param {string|null} baseDir            absolute dir for `asset://` rewrite
 * @param {(href: string, baseDir: string|null) => string|null|undefined} [linkResolver]
 *        optional rewriter for `<a href>` values
 * @returns {string} sanitized HTML
 */
export function renderMarkdown(src, baseDir = null, linkResolver = null) {
    activeBaseDir = baseDir;
    activeLinkResolver = linkResolver;
    try {
        return DOMPurify.sanitize(marked.parse(src ?? ''), {
            // Allow the syntax-highlighted spans Prism emits.
            ADD_ATTR: ['class'],
            ALLOWED_URI_REGEXP,
        });
    } finally {
        activeBaseDir = null;
        activeLinkResolver = null;
    }
}

// Markdown rendering pipeline: marked → Prism syntax highlight → DOMPurify.
//
// We isolate the configuration here so main.js stays focused on UI state.

import { marked } from 'marked';
import DOMPurify from 'dompurify';

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
marked.use({
    renderer: {
        code(code, infoString) {
            const lang = (infoString ?? '').trim().split(/\s+/)[0];
            if (lang && Prism.languages[lang]) {
                const html = Prism.highlight(code, Prism.languages[lang], lang);
                return `<pre><code class="language-${escapeHtml(lang)}">${html}</code></pre>`;
            }
            return `<pre><code>${escapeHtml(code)}</code></pre>`;
        },
    },
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
});

/**
 * Render a Markdown string to sanitized HTML.
 *
 * Pipeline:
 *   1. marked parses Markdown → HTML, calling our renderer.code for fences.
 *   2. Prism colorizes inside the renderer.
 *   3. DOMPurify strips `<script>`, `on*=`, `javascript:` URLs, etc., so
 *      a hostile paste cannot execute even with strict CSP.
 *
 * @param {string} src
 * @returns {string} sanitized HTML
 */
export function renderMarkdown(src) {
    return DOMPurify.sanitize(marked.parse(src ?? ''), {
        // Allow the syntax-highlighted spans Prism emits.
        ADD_ATTR: ['class'],
    });
}

// jsPDF-based PDF export.
//
// Why this exists: WebKit2GTK's print-to-file pipeline does not emit
// `<a href>` link annotations into the PDF. Every reader (Evince,
// Foxit, Chrome's built-in viewer) sees only flat text — clicks do
// nothing. Generating the PDF directly with jsPDF lets us emit real
// PDF link annotations for URLs and intra-document jumps.
//
// We hand-walk the rendered HTML rather than rasterizing with
// html2canvas (the usual jsPDF.html() route) because rasterization
// turns text into a pixel grid that has no link metadata at all,
// which would defeat the whole point of moving off the GTK pipeline.

import { jsPDF } from 'jspdf';

// Page geometry — A4 portrait in jsPDF's default points unit.
const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 50;

// Font + spacing presets. `lh` is line height in pt; `mt`/`mb` are top/
// bottom margins around block elements (headings only).
const FONT = {
    body:    { size: 11, lh: 14 },
    code:    { size: 10, lh: 13 },
    heading: [
        { size: 22, lh: 28, mt: 18, mb: 10 },
        { size: 18, lh: 23, mt: 16, mb: 8  },
        { size: 15, lh: 20, mt: 14, mb: 7  },
        { size: 13, lh: 17, mt: 12, mb: 6  },
        { size: 12, lh: 15, mt: 10, mb: 5  },
        { size: 11, lh: 14, mt: 10, mb: 5  },
    ],
};

const COLOR = {
    text:         [17, 24, 39],
    link:         [29, 78, 216],
    code:         [136, 19, 145],
    sectionTitle: [29, 78, 216],
    rule:         [212, 212, 216],
    blockquote:   [82, 82, 91],
};

// PdfBuilder owns the jsPDF document plus a cursor, current style, and
// the deferred-link table for intra-document jumps. Inline text is
// emitted word-by-word so we can wrap precisely and attach a link
// annotation rect over each word that's part of an `<a>`.
class PdfBuilder {
    constructor() {
        this.doc = new jsPDF({ unit: 'pt', format: 'a4' });
        this.x = MARGIN;
        this.y = MARGIN;
        this.lh = FONT.body.lh;
        // Deferred internal link annotations: jsPDF needs a page number
        // to jump to, but we don't know which page a target section
        // lands on until we've finished laying out. Resolve at finalize.
        this.deferredLinks = [];
        this.sectionAnchors = new Map();  // sectionIndex → { page }
        this.firstSectionEmitted = false;
    }

    // Bottom of writable area on current page.
    pageBottom() { return PAGE.h - MARGIN; }
    // Right edge of writable area.
    pageRight() { return PAGE.w - MARGIN; }
    // Width of a fresh line (after wrap).
    lineWidth() { return PAGE.w - 2 * MARGIN; }

    setStyle({ family = 'helvetica', size = 11, weight = 'normal', italic = false, color = COLOR.text } = {}) {
        const style = weight === 'bold'
            ? (italic ? 'bolditalic' : 'bold')
            : (italic ? 'italic' : 'normal');
        this.doc.setFont(family, style);
        this.doc.setFontSize(size);
        this.doc.setTextColor(color[0], color[1], color[2]);
        this.lh = Math.max(size * 1.3, 12);
    }

    // Ensure at least `h` vertical space remains; otherwise paginate.
    needSpace(h) {
        if (this.y + h > this.pageBottom()) this.newPage();
    }

    newPage() {
        this.doc.addPage();
        this.y = MARGIN;
        this.x = MARGIN;
    }

    // Move to start of next line and apply current line height.
    newline(extra = 0) {
        this.y += this.lh + extra;
        this.x = MARGIN;
        this.needSpace(this.lh);
    }

    // Drop in vertical space (used between blocks).
    spacer(h) {
        this.y += h;
        this.needSpace(this.lh);
    }

    sectionStart(index, title) {
        if (this.firstSectionEmitted) {
            this.doc.addPage();
            this.y = MARGIN;
            this.x = MARGIN;
        }
        this.firstSectionEmitted = true;
        this.sectionAnchors.set(index, {
            page: this.doc.internal.getCurrentPageInfo().pageNumber,
        });

        // Title strip: monospace, blue, with underline rule.
        this.setStyle({ family: 'courier', size: 13, weight: 'bold', color: COLOR.sectionTitle });
        const lines = this.doc.splitTextToSize(title, this.lineWidth());
        for (const line of lines) {
            this.needSpace(this.lh);
            this.doc.text(line, this.x, this.y);
            this.y += this.lh;
        }
        this.doc.setDrawColor(COLOR.sectionTitle[0], COLOR.sectionTitle[1], COLOR.sectionTitle[2]);
        this.doc.setLineWidth(1.2);
        this.doc.line(MARGIN, this.y - 4, this.pageRight(), this.y - 4);
        this.y += 14;
    }

    // Render an inline text run with the active style.
    //
    // Word-level wrap: jsPDF's splitTextToSize wraps an entire string
    // against a fixed width, which doesn't know about partial-line
    // continuations from the previous run. Walking word-by-word lets
    // mixed styles ("**bold** rest") share a line correctly and lets
    // us emit one link rect per word for live PDF links.
    writeInline(text, opts = {}) {
        const link = opts.link;
        const tokens = text.split(/(\s+)/).filter(Boolean);

        for (const tok of tokens) {
            const tokW = this.doc.getTextWidth(tok);
            const isWS = /^\s+$/.test(tok);
            if (isWS) {
                // Skip leading whitespace at the start of a line; emit
                // mid-line whitespace as advancing space.
                if (this.x > MARGIN) {
                    this.doc.text(tok, this.x, this.y);
                    this.x += tokW;
                }
                continue;
            }
            // Wrap if the word doesn't fit on the current line and we're
            // not already at the line's start (a single oversized word
            // gets clipped rather than infinite-looping).
            if (this.x + tokW > this.pageRight() && this.x > MARGIN) {
                this.newline();
            }
            this.needSpace(this.lh);
            this.doc.text(tok, this.x, this.y);
            if (link) this.attachLink(this.x, this.y, tokW, link);
            this.x += tokW;
        }
    }

    // Annotate a rectangle as a link. URLs go in immediately; internal
    // anchors are deferred until finalize() since the destination page
    // isn't known until the doc is fully laid out.
    attachLink(textX, textY, width, link) {
        // Rect coords: jsPDF expects top-left of the box; text() draws
        // along the baseline, so the box top is `y - ascender`. Using
        // (lh - 3) as the box height keeps it tight around the glyphs.
        const x = textX;
        const y = textY - this.lh + 3;
        const w = width;
        const h = this.lh;
        if (link.url) {
            this.doc.link(x, y, w, h, { url: link.url });
        } else if (link.target != null) {
            this.deferredLinks.push({
                page: this.doc.internal.getCurrentPageInfo().pageNumber,
                x, y, w, h,
                target: link.target,
            });
        }
    }

    // Block: paragraph composed of inline runs.
    paragraph(runs, { bottomMargin = 8 } = {}) {
        this.x = MARGIN;
        this.needSpace(this.lh);
        this.emitRuns(runs);
        this.newline(bottomMargin);
    }

    heading(level, runs) {
        const f = FONT.heading[Math.max(0, Math.min(5, level - 1))];
        this.spacer(f.mt);
        this.x = MARGIN;
        this.needSpace(f.lh + f.mb);
        // Override line height before emitting so wrap uses the larger value.
        const restoreLh = this.lh;
        this.emitRuns(runs, {
            family: 'helvetica', size: f.size, weight: 'bold', color: COLOR.text,
            forcedLh: f.lh,
        });
        this.newline(f.mb);
        this.lh = restoreLh;
    }

    listItem(runs, ordered, index, depth = 0) {
        const indent = MARGIN + depth * 16;
        const marker = ordered ? `${index + 1}.` : '•';
        this.x = indent;
        this.needSpace(this.lh);
        this.setStyle({ family: 'helvetica', size: FONT.body.size });
        this.doc.text(marker, indent, this.y);
        this.x = indent + 14;
        this.emitRuns(runs);
        this.newline(3);
    }

    codeBlock(text) {
        this.spacer(4);
        this.x = MARGIN;
        this.setStyle({ family: 'courier', size: FONT.code.size, color: COLOR.code });
        const lines = text.split('\n');
        for (const line of lines) {
            const wrapped = this.doc.splitTextToSize(line || ' ', this.lineWidth());
            for (const w of wrapped) {
                this.needSpace(this.lh);
                this.doc.text(w, this.x, this.y);
                this.y += this.lh;
            }
        }
        this.spacer(8);
        this.x = MARGIN;
    }

    blockquote(runs) {
        // Indented + italic. Could draw a left rule, but a left margin
        // shift is enough signal at this PDF density.
        const oldX = this.x;
        this.x = MARGIN + 14;
        this.needSpace(this.lh);
        const styled = runs.map(r => ({ ...r, italic: true, color: COLOR.blockquote }));
        this.emitRuns(styled);
        this.newline(8);
        this.x = oldX;
    }

    horizontalRule() {
        this.spacer(8);
        this.doc.setDrawColor(COLOR.rule[0], COLOR.rule[1], COLOR.rule[2]);
        this.doc.setLineWidth(0.5);
        this.doc.line(MARGIN, this.y, this.pageRight(), this.y);
        this.spacer(12);
    }

    async image(dataUrl) {
        const img = new Image();
        try {
            await new Promise((res, rej) => {
                img.onload = res;
                img.onerror = rej;
                img.src = dataUrl;
            });
        } catch {
            return;  // can't decode → skip
        }
        const maxW = this.lineWidth();
        const maxH = PAGE.h * 0.6;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w === 0 || h === 0) return;
        const ratio = w / h;
        if (w > maxW) { w = maxW; h = w / ratio; }
        if (h > maxH) { h = maxH; w = h * ratio; }

        this.x = MARGIN;
        this.needSpace(h + 8);
        // Format guess: jsPDF supports PNG / JPEG / WEBP. Pull from data URI prefix.
        const fmt = dataUrl.startsWith('data:image/jpeg') ? 'JPEG'
                  : dataUrl.startsWith('data:image/webp') ? 'WEBP'
                  : 'PNG';
        try {
            this.doc.addImage(dataUrl, fmt, this.x, this.y, w, h);
            this.y += h + 8;
        } catch (err) {
            console.warn('[pdf] addImage failed:', err);
        }
    }

    // Internal helper shared by paragraph / heading / listItem / blockquote.
    // `forcedLh` lets headings use a non-derived line height during wrap.
    emitRuns(runs, baseStyle = null) {
        for (const r of runs) {
            const family = r.code ? 'courier' : (baseStyle?.family ?? 'helvetica');
            const size = r.code ? FONT.code.size : (baseStyle?.size ?? FONT.body.size);
            const weight = r.bold || baseStyle?.weight === 'bold' ? 'bold' : 'normal';
            const italic = !!r.italic;
            const color = r.link ? COLOR.link
                        : r.code ? COLOR.code
                        : (baseStyle?.color ?? COLOR.text);
            this.setStyle({ family, size, weight, italic, color });
            if (baseStyle?.forcedLh) this.lh = baseStyle.forcedLh;
            this.writeInline(r.text, { link: r.link });
        }
    }

    finalize() {
        for (const link of this.deferredLinks) {
            const target = this.sectionAnchors.get(link.target);
            if (!target) continue;
            this.doc.setPage(link.page);
            this.doc.link(link.x, link.y, link.w, link.h, { pageNumber: target.page });
        }
        return this.doc;
    }
}

// ── DOM → PdfBuilder ───────────────────────────────────────────────────

async function renderHtmlToPdf(builder, html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return;
    for (const child of root.children) {
        await renderBlock(builder, child);
    }
}

async function renderBlock(builder, el) {
    const tag = el.tagName?.toLowerCase();
    switch (tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
            builder.heading(parseInt(tag[1], 10), collectInline(el));
            break;
        case 'p': {
            // A standalone <img> inside a <p> is a common pattern from
            // marked. Handle it as a block image rather than skipping.
            const onlyImg = el.children.length === 1
                && el.children[0].tagName?.toLowerCase() === 'img'
                && (el.textContent ?? '').trim() === (el.querySelector('img').getAttribute('alt') ?? '');
            if (onlyImg) {
                await embedImage(builder, el.querySelector('img'));
            } else {
                builder.paragraph(collectInline(el));
            }
            break;
        }
        case 'ul':
            await renderList(builder, el, false);
            break;
        case 'ol':
            await renderList(builder, el, true);
            break;
        case 'pre': {
            const code = el.querySelector('code') ?? el;
            builder.codeBlock(code.textContent);
            break;
        }
        case 'blockquote': {
            for (const child of el.children) {
                if (child.tagName?.toLowerCase() === 'p') {
                    builder.blockquote(collectInline(child));
                } else {
                    await renderBlock(builder, child);
                }
            }
            break;
        }
        case 'hr':
            builder.horizontalRule();
            break;
        case 'img':
            await embedImage(builder, el);
            break;
        case 'table':
            // Tables are awkward to lay out without a tabular grid system.
            // Render a placeholder so the export doesn't silently lose
            // content; the user can still see it in the preview pane.
            builder.paragraph([{ text: '[table omitted from PDF — see preview]', italic: true, color: [128, 128, 128] }]);
            break;
        default:
            // Generic block: descend.
            for (const child of el.children) await renderBlock(builder, child);
    }
}

async function renderList(builder, listEl, ordered, depth = 0) {
    let i = 0;
    for (const li of listEl.children) {
        if (li.tagName?.toLowerCase() !== 'li') continue;
        // Split the li into inline content (rendered with the bullet) and
        // any nested lists / blocks (rendered after, at deeper indent).
        const inlineParts = [];
        const nestedBlocks = [];
        for (const child of li.childNodes) {
            const childTag = child.tagName?.toLowerCase();
            if (childTag === 'ul' || childTag === 'ol' || childTag === 'pre' || childTag === 'blockquote') {
                nestedBlocks.push(child);
            } else {
                inlineParts.push(child);
            }
        }
        // Build a synthetic element to feed collectInline with just the
        // inline pieces.
        const synth = document.createElement('span');
        for (const p of inlineParts) synth.appendChild(p.cloneNode(true));
        builder.listItem(collectInline(synth), ordered, i, depth);
        for (const nested of nestedBlocks) {
            const nestedTag = nested.tagName?.toLowerCase();
            if (nestedTag === 'ul') await renderList(builder, nested, false, depth + 1);
            else if (nestedTag === 'ol') await renderList(builder, nested, true, depth + 1);
            else await renderBlock(builder, nested);
        }
        i++;
    }
}

// Collect inline runs out of an element. Returns an array of
// `{ text, bold?, italic?, code?, link? }` records. Whitespace
// collapsing matches the browser's inline behavior: any run of
// whitespace becomes a single space.
function collectInline(el) {
    const runs = [];
    walk(el, {});

    function walk(node, style) {
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.replace(/\s+/g, ' ');
                if (text) runs.push({ ...style, text });
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tag = child.tagName.toLowerCase();
                let next = style;
                if (tag === 'strong' || tag === 'b')        next = { ...style, bold: true };
                else if (tag === 'em' || tag === 'i')       next = { ...style, italic: true };
                else if (tag === 'code')                    next = { ...style, code: true };
                else if (tag === 'a') {
                    const href = child.getAttribute('href');
                    const link = parseHref(href);
                    if (link) next = { ...style, link };
                } else if (tag === 'br') {
                    runs.push({ ...style, text: '\n' });
                    continue;
                } else if (tag === 'img') {
                    // Inline images are uncommon in markdown blocks but
                    // possible. We skip them inline; standalone block
                    // images are handled by the block renderer.
                    continue;
                }
                walk(child, next);
            }
        }
    }
    return runs;
}

function parseHref(href) {
    if (!href) return null;
    if (href.startsWith('#')) {
        const m = href.match(/^#pdf-(\d+)$/);
        if (m) return { target: parseInt(m[1], 10) };
        return null;
    }
    if (/^[a-z][a-z0-9+.\-]*:/i.test(href) || href.startsWith('//')) {
        return { url: href };
    }
    return null;
}

async function embedImage(builder, imgEl) {
    const src = imgEl.getAttribute('src');
    if (!src) return;
    try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(r.error);
            r.readAsDataURL(blob);
        });
        await builder.image(dataUrl);
    } catch (err) {
        console.warn('[pdf] image embed skipped:', src, err);
    }
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Build a PDF from a list of pre-rendered HTML sections.
 *
 * Each section gets its own page (forced page break between them),
 * a colored title strip, and inline link annotations:
 *   - `https://…` → URL annotation (clickable in any reader)
 *   - `#pdf-N`    → intra-document jump to section N's first page
 *
 * Returns the PDF as a base64 string (no data: URI prefix), ready to
 * hand to the Rust `write_binary_file` command.
 *
 * @param {{ sections: Array<{ index: number, title: string, html: string }> }} input
 * @returns {Promise<string>} base64-encoded PDF
 */
export async function buildProjectPdf({ sections }) {
    const builder = new PdfBuilder();
    for (const s of sections) {
        builder.sectionStart(s.index, s.title);
        await renderHtmlToPdf(builder, s.html);
    }
    const doc = builder.finalize();
    // datauristring → "data:application/pdf;base64,XYZ" — strip prefix.
    const dataUri = doc.output('datauristring');
    return dataUri.split(',')[1];
}

// ─────────────────────────────────────────────────────────────
// svgSanitizer.ts – Sanitización de SVG con DOMPurify
// Maneja correctamente HTML dentro de <foreignObject> (draw.io exports)
// ─────────────────────────────────────────────────────────────
import DOMPurify from 'dompurify';

// Placeholder prefix (must be unlikely to appear in real SVGs)
const FO_PLACEHOLDER = '__SVGFLOW_FO_';

/**
 * Sanitiza SVG para evitar XSS.
 * Permite data-cell-id, xlink:href, foreignObject con HTML, estilos inline.
 *
 * Estrategia:
 *  1. Extraer el contenido HTML de cada <foreignObject> → placeholders
 *  2. Sanitizar la estructura SVG (perfil SVG)
 *  3. Sanitizar cada bloque HTML por separado (perfil HTML)
 *  4. Reinsertar el HTML sanitizado en los <foreignObject>
 */
export function sanitizeSvg(raw: string): string {
  // ── 1. Extraer <foreignObject> HTML content ──────────────
  const foContents: string[] = [];
  const foRegex = /(<foreignObject[^>]*>)([\s\S]*?)(<\/foreignObject>)/gi;

  const svgWithPlaceholders = raw.replace(foRegex, (_match, openTag, innerHtml, closeTag) => {
    const idx = foContents.length;
    foContents.push(innerHtml);
    return `${openTag}${FO_PLACEHOLDER}${idx}__${closeTag}`;
  });

  // ── 2. Sanitizar estructura SVG ──────────────────────────
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName.startsWith('data-')) {
      data.forceKeepAttr = true;
    }
  });

  let cleanSvg = DOMPurify.sanitize(svgWithPlaceholders, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use', 'foreignObject', 'switch'],
    ADD_ATTR: [
      'data-cell-id', 'xlink:href', 'xml:space',
      'preserveAspectRatio', 'viewBox', 'transform',
      'requiredFeatures', 'pointer-events', 'style',
      'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
      'stroke-miterlimit', 'font-family', 'font-size',
      'font-weight', 'text-anchor', 'dominant-baseline',
      'xmlns', 'xmlns:xlink', 'version',
      'opacity', 'clip-path', 'mask',
    ],
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
  }) as string;

  DOMPurify.removeHook('uponSanitizeAttribute');

  // ── 3. Sanitizar cada bloque HTML y reinsertar ───────────
  for (let i = 0; i < foContents.length; i++) {
    const placeholder = `${FO_PLACEHOLDER}${i}__`;
    if (!cleanSvg.includes(placeholder)) continue;

    const cleanHtml = DOMPurify.sanitize(foContents[i], {
      USE_PROFILES: { html: true },
      ADD_ATTR: [
        'xmlns', 'style', 'class', 'pointer-events',
        'color', 'face', 'size',       // <font> attrs
        'align', 'valign',             // alignment
        'colspan', 'rowspan',          // tables
      ],
      WHOLE_DOCUMENT: false,
      RETURN_DOM: false,
    }) as string;

    cleanSvg = cleanSvg.replace(placeholder, cleanHtml);
  }

  return cleanSvg;
}

/**
 * Adapta los colores del texto SVG/HTML para que sean visibles en tema oscuro.
 * Resuelve:
 *  - color: light-dark(#000000, #ffffff) → extrae el valor dark
 *  - color: light-dark(rgb(…), rgb(…))  → extrae el valor dark
 *  - color: #000000 (en style attrs)    → #ffffff
 *  - color-scheme: light-dark           → color-scheme: dark
 *  - fill="#000000" en <text>/<tspan>   → fill="#ffffff"
 */
export function adaptSvgForDarkTheme(svg: string): string {
  let out = svg;

  // Fix invalid "color-scheme: light-dark;" → "color-scheme: dark;"
  out = out.replace(/color-scheme:\s*light-dark\b/gi, 'color-scheme: dark');

  // Resolve CSS light-dark() — supports hex and rgb()/hsl() with nested parens
  out = out.replace(
    /color:\s*light-dark\(\s*((?:[^,()]+|\([^)]*\))+)\s*,\s*((?:[^()]+|\([^)]*\))+)\s*\)/gi,
    (_match, _light: string, dark: string) => `color: ${dark.trim()}`
  );

  // Replace hard-coded black text color (#000000) → white in style="..."
  out = out.replace(
    /(style\s*=\s*"[^"]*?)color:\s*#000(?:000)?\b/gi,
    '$1color: #ffffff'
  );
  // Also for style='...'
  out = out.replace(
    /(style\s*=\s*'[^']*?)color:\s*#000(?:000)?\b/gi,
    '$1color: #ffffff'
  );

  return out;
}

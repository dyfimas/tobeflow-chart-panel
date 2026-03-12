// ─────────────────────────────────────────────────────────────
// drawioConverter.ts – Convierte .drawio XML → SVG
// Soporta: rect, ellipse, cylinder, rhombus, text, edges
// Genera data-cell-id en cada grupo para integración con el plugin
// ─────────────────────────────────────────────────────────────

interface MxGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  relative?: boolean;
  sourcePoint?: { x: number; y: number };
  targetPoint?: { x: number; y: number };
  points?: Array<{ x: number; y: number }>;
}

interface MxCell {
  id: string;
  value: string;
  style: Record<string, string>;
  rawStyle: string;
  vertex: boolean;
  edge: boolean;
  parent: string;
  source?: string;
  target?: string;
  geometry: MxGeometry | null;
}

/** Default fill for shapes that will be dynamically colored */
const DEFAULT_FILL = '#cccbcb';
const DEFAULT_STROKE = '#000000';
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_FONT_FAMILY = 'Arial, Helvetica, sans-serif';

// ─── Parse mxCell style string ──────────────────────────────

function parseStyle(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const parts = raw.split(';').filter(Boolean);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    } else {
      // Shape type (e.g. "ellipse", "rhombus", "shape=cylinder3")
      out['__shape__'] = part.trim();
    }
  }
  return out;
}

function resolveColor(val: string | undefined, fallback: string): string {
  if (!val) return fallback;
  // Handle drawio light-dark(...) syntax
  const ldMatch = val.match(/light-dark\(([^,]+),\s*([^)]+)\)/);
  if (ldMatch) return ldMatch[2].trim(); // use dark theme variant
  if (val === 'none' || val === 'default') return fallback;
  return val;
}

// ─── Parse drawio XML ───────────────────────────────────────

function parseMxCells(xmlStr: string): { cells: MxCell[]; pageW: number; pageH: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'text/xml');

  const graphModel = doc.querySelector('mxGraphModel');
  const pageW = parseFloat(graphModel?.getAttribute('pageWidth') || '827');
  const pageH = parseFloat(graphModel?.getAttribute('pageHeight') || '1169');

  const cellEls = doc.querySelectorAll('mxCell');
  const cells: MxCell[] = [];

  cellEls.forEach((el) => {
    const id = el.getAttribute('id') || '';
    const rawStyle = el.getAttribute('style') || '';
    const style = parseStyle(rawStyle);

    const geoEl = el.querySelector('mxGeometry');
    let geometry: MxGeometry | null = null;
    if (geoEl) {
      geometry = {
        x: parseFloat(geoEl.getAttribute('x') || '0'),
        y: parseFloat(geoEl.getAttribute('y') || '0'),
        width: parseFloat(geoEl.getAttribute('width') || '0'),
        height: parseFloat(geoEl.getAttribute('height') || '0'),
        relative: geoEl.getAttribute('relative') === '1',
      };

      // Source/target points for edges
      const srcPt = geoEl.querySelector('mxPoint[as="sourcePoint"]');
      const tgtPt = geoEl.querySelector('mxPoint[as="targetPoint"]');
      if (srcPt) {
        geometry.sourcePoint = {
          x: parseFloat(srcPt.getAttribute('x') || '0'),
          y: parseFloat(srcPt.getAttribute('y') || '0'),
        };
      }
      if (tgtPt) {
        geometry.targetPoint = {
          x: parseFloat(tgtPt.getAttribute('x') || '0'),
          y: parseFloat(tgtPt.getAttribute('y') || '0'),
        };
      }

      // Intermediate points
      const arrEl = geoEl.querySelector('Array[as="points"]');
      if (arrEl) {
        const pts: Array<{ x: number; y: number }> = [];
        arrEl.querySelectorAll('mxPoint').forEach((pt) => {
          pts.push({
            x: parseFloat(pt.getAttribute('x') || '0'),
            y: parseFloat(pt.getAttribute('y') || '0'),
          });
        });
        geometry.points = pts;
      }
    }

    cells.push({
      id,
      value: el.getAttribute('value') || '',
      style,
      rawStyle,
      vertex: el.getAttribute('vertex') === '1',
      edge: el.getAttribute('edge') === '1',
      parent: el.getAttribute('parent') || '',
      source: el.getAttribute('source') || undefined,
      target: el.getAttribute('target') || undefined,
      geometry,
    });
  });

  return { cells, pageW, pageH };
}

// ─── Render cells to SVG ────────────────────────────────────

function getShapeType(style: Record<string, string>): string {
  const s = style['__shape__'] || '';
  if (s === 'ellipse') return 'ellipse';
  if (s === 'rhombus') return 'rhombus';
  if (s.includes('cylinder') || style['shape']?.includes('cylinder')) return 'cylinder';
  if (s.includes('triangle') || style['shape']?.includes('triangle')) return 'triangle';
  if (s.includes('hexagon') || style['shape']?.includes('hexagon')) return 'hexagon';
  if (s.includes('cloud') || style['shape']?.includes('cloud')) return 'cloud';
  if (s.includes('parallelogram') || style['shape']?.includes('parallelogram')) return 'parallelogram';
  if (s === 'text' || (style['text'] !== undefined && !style['__shape__'])) return 'text-only';
  return 'rect';
}

function renderVertex(cell: MxCell, cellMap: Map<string, MxCell>): string {
  const g = cell.geometry;
  if (!g) return '';

  const style = cell.style;
  const shape = getShapeType(style);
  const fillRaw = style['fillColor'];
  const fill = resolveColor(fillRaw, DEFAULT_FILL);
  const strokeRaw = style['strokeColor'];
  const stroke = resolveColor(strokeRaw, DEFAULT_STROKE);
  const strokeWidth = parseFloat(style['strokeWidth'] || '1');
  const rounded = style['rounded'] === '1';
  const rx = rounded ? Math.min(6, g.width / 6) : 0;
  const opacity = style['opacity'] ? parseFloat(style['opacity']) / 100 : 1;

  let shapeSvg = '';

  switch (shape) {
    case 'ellipse':
      shapeSvg = `<ellipse class="svgflow-shape" cx="${g.width / 2}" cy="${g.height / 2}" `
        + `rx="${g.width / 2}" ry="${g.height / 2}" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'rhombus': {
      const pts = `${g.width / 2},0 ${g.width},${g.height / 2} ${g.width / 2},${g.height} 0,${g.height / 2}`;
      shapeSvg = `<polygon class="svgflow-shape" points="${pts}" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;
    }

    case 'cylinder': {
      const ry = Math.min(15, g.height / 4);
      shapeSvg = `<path class="svgflow-shape" d="`
        + `M 0 ${ry} `
        + `A ${g.width / 2} ${ry} 0 0 1 ${g.width} ${ry} `
        + `L ${g.width} ${g.height - ry} `
        + `A ${g.width / 2} ${ry} 0 0 1 0 ${g.height - ry} Z" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
        + `<ellipse cx="${g.width / 2}" cy="${ry}" rx="${g.width / 2}" ry="${ry}" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;
    }

    case 'triangle': {
      const pts = `${g.width / 2},0 ${g.width},${g.height} 0,${g.height}`;
      shapeSvg = `<polygon class="svgflow-shape" points="${pts}" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;
    }

    case 'hexagon': {
      const dx = g.width * 0.25;
      const pts = `${dx},0 ${g.width - dx},0 ${g.width},${g.height / 2} `
        + `${g.width - dx},${g.height} ${dx},${g.height} 0,${g.height / 2}`;
      shapeSvg = `<polygon class="svgflow-shape" points="${pts}" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;
    }

    case 'cloud': {
      const w = g.width, h = g.height;
      shapeSvg = `<path class="svgflow-shape" d="`
        + `M ${w * 0.25} ${h * 0.8} `
        + `C ${w * -0.05} ${h * 0.8}, ${w * -0.05} ${h * 0.35}, ${w * 0.18} ${h * 0.3} `
        + `C ${w * 0.1} ${h * 0.05}, ${w * 0.4} ${h * -0.05}, ${w * 0.5} ${h * 0.15} `
        + `C ${w * 0.6} ${h * -0.05}, ${w * 0.9} ${h * 0.05}, ${w * 0.82} ${h * 0.3} `
        + `C ${w * 1.05} ${h * 0.35}, ${w * 1.05} ${h * 0.8}, ${w * 0.75} ${h * 0.8} Z" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;
    }

    case 'parallelogram': {
      const skew = g.width * 0.2;
      const pts = `${skew},0 ${g.width},0 ${g.width - skew},${g.height} 0,${g.height}`;
      shapeSvg = `<polygon class="svgflow-shape" points="${pts}" `
        + `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;
    }

    case 'text-only':
      // No background shape
      break;

    case 'rect':
    default:
      shapeSvg = `<rect class="svgflow-shape" x="0" y="0" width="${g.width}" height="${g.height}" `
        + `rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;
  }

  // Text label
  let textSvg = '';
  if (cell.value) {
    // Strip basic HTML tags from value
    const textContent = cell.value.replace(/<[^>]*>/g, '').trim();
    if (textContent) {
      const fontSize = parseFloat(style['fontSize'] || String(DEFAULT_FONT_SIZE));
      const fontFamily = style['fontFamily'] || DEFAULT_FONT_FAMILY;
      const fontColor = resolveColor(style['fontColor'], '#000000');
      const bold = style['fontStyle'] === '1' || style['bold'] === '1';
      const align = style['align'] || 'center';
      const vAlign = style['verticalAlign'] || 'middle';

      let textX = g.width / 2;
      let anchor = 'middle';
      if (align === 'left') { textX = 4; anchor = 'start'; }
      else if (align === 'right') { textX = g.width - 4; anchor = 'end'; }

      let textY = g.height / 2;
      let baseline = 'central';
      if (vAlign === 'top') { textY = fontSize + 2; baseline = 'auto'; }
      else if (vAlign === 'bottom') { textY = g.height - 4; baseline = 'auto'; }

      textSvg = `<text x="${textX}" y="${textY}" `
        + `text-anchor="${anchor}" dominant-baseline="${baseline}" `
        + `font-family="${fontFamily}" font-size="${fontSize}" `
        + `fill="${fontColor}" ${bold ? 'font-weight="bold"' : ''} `
        + `pointer-events="none">${escapeXml(textContent)}</text>`;
    }
  }

  return `<g data-cell-id="${cell.id}" class="svgflow-target" `
    + `transform="translate(${g.x}, ${g.y})" `
    + `${opacity < 1 ? `opacity="${opacity}"` : ''}>`
    + shapeSvg + textSvg + `</g>\n`;
}

function renderEdge(cell: MxCell, cellMap: Map<string, MxCell>): string {
  const style = cell.style;
  const stroke = resolveColor(style['strokeColor'], DEFAULT_STROKE);
  const strokeWidth = parseFloat(style['strokeWidth'] || '1');
  const dashed = style['dashed'] === '1';

  // Collect points: source → intermediate → target
  const points: Array<{ x: number; y: number }> = [];

  // Source point
  const srcCell = cell.source ? cellMap.get(cell.source) : null;
  if (srcCell?.geometry) {
    const sg = srcCell.geometry;
    const exitX = parseFloat(style['exitX'] || '0.5');
    const exitY = parseFloat(style['exitY'] || '1');
    points.push({ x: sg.x + sg.width * exitX, y: sg.y + sg.height * exitY });
  } else if (cell.geometry?.sourcePoint) {
    points.push(cell.geometry.sourcePoint);
  }

  // Intermediate points
  if (cell.geometry?.points) {
    points.push(...cell.geometry.points);
  }

  // Target point
  const tgtCell = cell.target ? cellMap.get(cell.target) : null;
  if (tgtCell?.geometry) {
    const tg = tgtCell.geometry;
    const entryX = parseFloat(style['entryX'] || '0.5');
    const entryY = parseFloat(style['entryY'] || '0');
    points.push({ x: tg.x + tg.width * entryX, y: tg.y + tg.height * entryY });
  } else if (cell.geometry?.targetPoint) {
    points.push(cell.geometry.targetPoint);
  }

  if (points.length < 2) return '';

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const dashAttr = dashed ? ` stroke-dasharray="8 4"` : '';

  // Arrow marker
  const endArrow = style['endArrow'];
  const hasArrow = endArrow && endArrow !== 'none';
  const markerId = hasArrow ? `arrow-${cell.id}` : '';

  let marker = '';
  if (hasArrow) {
    marker = `<defs><marker id="${markerId}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">`
      + `<polygon points="0 0, 10 3.5, 0 7" fill="${stroke}" /></marker></defs>`;
  }

  return `<g data-cell-id="${cell.id}">${marker}`
    + `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr}`
    + `${hasArrow ? ` marker-end="url(#${markerId})"` : ''} />`
    + `</g>\n`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Main converter ─────────────────────────────────────────

/**
 * Detects whether a string is a .drawio XML file.
 */
export function isDrawioXml(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.includes('<mxfile') || trimmed.includes('<mxGraphModel');
}

/**
 * Converts a .drawio XML string into an SVG string with data-cell-id attributes.
 * Shapes get fill="#cccbcb" (the default colorable fill) so the existing
 * shape selector logic works out of the box.
 */
export function drawioToSvg(xmlStr: string): string {
  const { cells, pageW, pageH } = parseMxCells(xmlStr);

  // Build cell map for edge lookups
  const cellMap = new Map<string, MxCell>();
  cells.forEach((c) => cellMap.set(c.id, c));

  // Calculate bounding box from all cells
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    if (!c.geometry || c.id === '0' || c.id === '1') continue;
    const g = c.geometry;
    if (g.relative) continue; // skip relative geometries (edge-bound)
    if (g.x < minX) minX = g.x;
    if (g.y < minY) minY = g.y;
    if (g.x + g.width > maxX) maxX = g.x + g.width;
    if (g.y + g.height > maxY) maxY = g.y + g.height;
  }

  // Add padding
  const pad = 20;
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = pageW; maxY = pageH; }
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = (maxX - minX) + pad * 2;
  const vbH = (maxY - minY) + pad * 2;

  // Render edges first (behind), then vertices
  const edgeSvg: string[] = [];
  const vertexSvg: string[] = [];

  for (const cell of cells) {
    if (cell.id === '0' || cell.id === '1') continue; // root/layer nodes
    if (cell.edge) {
      edgeSvg.push(renderEdge(cell, cellMap));
    } else if (cell.vertex && cell.geometry) {
      vertexSvg.push(renderVertex(cell, cellMap));
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" `
    + `viewBox="${vbX} ${vbY} ${vbW} ${vbH}" `
    + `width="100%" height="100%" `
    + `preserveAspectRatio="xMidYMid meet">\n`
    + edgeSvg.join('')
    + vertexSvg.join('')
    + `</svg>`;
}

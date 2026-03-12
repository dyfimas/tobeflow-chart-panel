// ─────────────────────────────────────────────────────────────
// svgSanitizer.test.ts – M1: Tests for sanitizeSvg, adaptSvgForDarkTheme
// ─────────────────────────────────────────────────────────────
import { sanitizeSvg, adaptSvgForDarkTheme } from '../svgSanitizer';

describe('sanitizeSvg', () => {
  it('returns sanitized SVG preserving structure', () => {
    const svg = '<svg><rect fill="red" /></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('<svg');
    expect(result).toContain('rect');
  });

  it('preserves data-cell-id attributes', () => {
    const svg = '<svg><g data-cell-id="myCell"><rect fill="red" /></g></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('data-cell-id="myCell"');
  });

  it('handles foreignObject content extraction and reinsertion', () => {
    const svg = `<svg>
      <foreignObject width="100" height="50">
        <div xmlns="http://www.w3.org/1999/xhtml">Hello</div>
      </foreignObject>
    </svg>`;
    const result = sanitizeSvg(svg);
    // With passthrough mock, the content should be preserved
    expect(result).toContain('foreignObject');
    expect(result).toContain('Hello');
    // Placeholders should NOT remain
    expect(result).not.toContain('__SVGFLOW_FO_');
  });

  it('handles multiple foreignObjects', () => {
    const svg = `<svg>
      <foreignObject><div>A</div></foreignObject>
      <foreignObject><div>B</div></foreignObject>
    </svg>`;
    const result = sanitizeSvg(svg);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).not.toContain('__SVGFLOW_FO_');
  });

  it('handles SVG with no foreignObject', () => {
    const svg = '<svg><circle cx="10" cy="10" r="5" fill="blue" /></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('circle');
    expect(result).toContain('blue');
  });

  it('handles empty SVG', () => {
    const result = sanitizeSvg('');
    expect(result).toBe('');
  });

  it('preserves style attributes', () => {
    const svg = '<svg><rect style="fill: red; stroke: blue;" /></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('style=');
  });

  it('preserves viewBox', () => {
    const svg = '<svg viewBox="0 0 100 100"><rect /></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('viewBox');
  });
});

describe('adaptSvgForDarkTheme', () => {
  it('replaces light-dark color-scheme', () => {
    const svg = '<svg><style>body { color-scheme: light-dark; }</style></svg>';
    const result = adaptSvgForDarkTheme(svg);
    expect(result).toContain('color-scheme: dark');
    expect(result).not.toContain('light-dark');
  });

  it('resolves CSS light-dark() color to dark value', () => {
    const svg = '<svg><text style="color: light-dark(#000000, #ffffff)">Hi</text></svg>';
    const result = adaptSvgForDarkTheme(svg);
    expect(result).toContain('color: #ffffff');
    expect(result).not.toContain('light-dark');
  });

  it('replaces hard-coded black text color with white (double quotes)', () => {
    const svg = '<svg><text style="font-size: 14px; color: #000000; font-weight: bold">Hi</text></svg>';
    const result = adaptSvgForDarkTheme(svg);
    expect(result).toContain('color: #ffffff');
    expect(result).not.toContain('#000000');
  });

  it('replaces hard-coded black text color with white (single quotes)', () => {
    const svg = "<svg><text style='font-size: 14px; color: #000000; font-weight: bold'>Hi</text></svg>";
    const result = adaptSvgForDarkTheme(svg);
    expect(result).toContain('color: #ffffff');
  });

  it('replaces shortened #000 with white', () => {
    const svg = '<svg><text style="color: #000">Hi</text></svg>';
    const result = adaptSvgForDarkTheme(svg);
    expect(result).toContain('color: #ffffff');
  });

  it('does not modify non-black colors', () => {
    const svg = '<svg><text style="color: #ff0000">Hi</text></svg>';
    const result = adaptSvgForDarkTheme(svg);
    expect(result).toContain('color: #ff0000');
  });

  it('handles SVG with no dark-theme issues', () => {
    const svg = '<svg><rect fill="blue" /></svg>';
    const result = adaptSvgForDarkTheme(svg);
    expect(result).toBe(svg);
  });

  it('resolves light-dark with rgb values', () => {
    const svg = '<svg><text style="color: light-dark(rgb(0,0,0), rgb(255,255,255))">X</text></svg>';
    const result = adaptSvgForDarkTheme(svg);
    expect(result).toContain('color: rgb(255,255,255)');
  });
});

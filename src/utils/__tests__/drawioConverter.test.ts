/**
 * @jest-environment jsdom
 */
// drawioConverter.test.ts – Tests for isDrawioXml and drawioToSvg

import { isDrawioXml, drawioToSvg } from '../drawioConverter';

// ═══════════════════════════════════════════════════════════════
// isDrawioXml
// ═══════════════════════════════════════════════════════════════

describe('isDrawioXml', () => {
  it('returns true for <mxfile> root', () => {
    expect(isDrawioXml('<mxfile><diagram></diagram></mxfile>')).toBe(true);
  });

  it('returns true for <mxGraphModel> root', () => {
    expect(isDrawioXml('<mxGraphModel><root></root></mxGraphModel>')).toBe(true);
  });

  it('returns true with leading whitespace', () => {
    expect(isDrawioXml('  \n  <mxfile></mxfile>')).toBe(true);
  });

  it('returns false for plain SVG', () => {
    expect(isDrawioXml('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isDrawioXml('')).toBe(false);
  });

  it('returns false for random text', () => {
    expect(isDrawioXml('hello world')).toBe(false);
  });

  it('returns false for HTML', () => {
    expect(isDrawioXml('<html><body>test</body></html>')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// drawioToSvg – basic conversion
// ═══════════════════════════════════════════════════════════════

describe('drawioToSvg', () => {
  const MINIMAL_DRAWIO = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile>
  <diagram name="Page-1">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1"
      connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="800" pageHeight="600">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="box1" value="Server 1" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
          vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="120" height="60" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

  it('produces valid SVG output', () => {
    const svg = drawioToSvg(MINIMAL_DRAWIO);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox');
  });

  it('adds data-cell-id to vertex groups', () => {
    const svg = drawioToSvg(MINIMAL_DRAWIO);
    expect(svg).toContain('data-cell-id="box1"');
  });

  it('renders text content', () => {
    const svg = drawioToSvg(MINIMAL_DRAWIO);
    expect(svg).toContain('Server 1');
  });

  it('renders rect shape for default style', () => {
    const svg = drawioToSvg(MINIMAL_DRAWIO);
    expect(svg).toContain('<rect');
  });

  it('applies rounded corners when rounded=1', () => {
    const svg = drawioToSvg(MINIMAL_DRAWIO);
    // Should have non-zero rx for rounded
    expect(svg).toMatch(/rx="[^0]/);
  });

  it('applies fill color from style', () => {
    const svg = drawioToSvg(MINIMAL_DRAWIO);
    expect(svg).toContain('#dae8fc');
  });

  it('applies stroke color from style', () => {
    const svg = drawioToSvg(MINIMAL_DRAWIO);
    expect(svg).toContain('#6c8ebf');
  });
});

// ═══════════════════════════════════════════════════════════════
// drawioToSvg – shapes
// ═══════════════════════════════════════════════════════════════

describe('drawioToSvg – shapes', () => {
  function wrapDrawio(cellXml: string): string {
    return `<mxfile><diagram name="P"><mxGraphModel pageWidth="800" pageHeight="600">
      <root><mxCell id="0"/><mxCell id="1" parent="0"/>${cellXml}</root>
    </mxGraphModel></diagram></mxfile>`;
  }

  it('renders ellipse shape', () => {
    const xml = wrapDrawio(`
      <mxCell id="e1" value="Circle" style="ellipse;fillColor=#d5e8d4;strokeColor=#82b366;"
        vertex="1" parent="1">
        <mxGeometry x="50" y="50" width="80" height="80" as="geometry" />
      </mxCell>
    `);
    const svg = drawioToSvg(xml);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('data-cell-id="e1"');
  });

  it('renders rhombus shape', () => {
    const xml = wrapDrawio(`
      <mxCell id="r1" value="Decision" style="rhombus;fillColor=#fff2cc;strokeColor=#d6b656;"
        vertex="1" parent="1">
        <mxGeometry x="50" y="50" width="100" height="100" as="geometry" />
      </mxCell>
    `);
    const svg = drawioToSvg(xml);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('data-cell-id="r1"');
  });

  it('renders triangle shape', () => {
    const xml = wrapDrawio(`
      <mxCell id="t1" value="" style="triangle;fillColor=#f8cecc;strokeColor=#b85450;"
        vertex="1" parent="1">
        <mxGeometry x="50" y="50" width="80" height="80" as="geometry" />
      </mxCell>
    `);
    const svg = drawioToSvg(xml);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('data-cell-id="t1"');
  });

  it('renders cylinder shape', () => {
    const xml = wrapDrawio(`
      <mxCell id="c1" value="DB" style="shape=cylinder3;fillColor=#e1d5e7;strokeColor=#9673a6;"
        vertex="1" parent="1">
        <mxGeometry x="50" y="50" width="60" height="80" as="geometry" />
      </mxCell>
    `);
    const svg = drawioToSvg(xml);
    expect(svg).toContain('data-cell-id="c1"');
    // Cylinder renders via <path> and <ellipse>
    expect(svg).toContain('<path');
  });
});

// ═══════════════════════════════════════════════════════════════
// drawioToSvg – edges
// ═══════════════════════════════════════════════════════════════

describe('drawioToSvg – edges', () => {
  it('renders edge between two vertices', () => {
    const xml = `<mxfile><diagram name="P"><mxGraphModel pageWidth="800" pageHeight="600">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="a" value="A" style="rounded=0;" vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="80" height="40" as="geometry" />
        </mxCell>
        <mxCell id="b" value="B" style="rounded=0;" vertex="1" parent="1">
          <mxGeometry x="300" y="100" width="80" height="40" as="geometry" />
        </mxCell>
        <mxCell id="e1" style="endArrow=classic;" edge="1" parent="1" source="a" target="b">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel></diagram></mxfile>`;

    const svg = drawioToSvg(xml);
    expect(svg).toContain('data-cell-id="a"');
    expect(svg).toContain('data-cell-id="b"');
    expect(svg).toContain('data-cell-id="e1"');
    // Edge uses path
    expect(svg).toContain('<path');
  });

  it('renders arrow marker for endArrow style', () => {
    const xml = `<mxfile><diagram name="P"><mxGraphModel pageWidth="800" pageHeight="600">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="s" value="S" style="" vertex="1" parent="1">
          <mxGeometry x="50" y="50" width="60" height="40" as="geometry" />
        </mxCell>
        <mxCell id="t" value="T" style="" vertex="1" parent="1">
          <mxGeometry x="200" y="50" width="60" height="40" as="geometry" />
        </mxCell>
        <mxCell id="edge1" style="endArrow=block;" edge="1" parent="1" source="s" target="t">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel></diagram></mxfile>`;

    const svg = drawioToSvg(xml);
    expect(svg).toContain('<marker');
    expect(svg).toContain('marker-end');
  });

  it('renders dashed edge', () => {
    const xml = `<mxfile><diagram name="P"><mxGraphModel pageWidth="800" pageHeight="600">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="s2" value="S" style="" vertex="1" parent="1">
          <mxGeometry x="50" y="50" width="60" height="40" as="geometry" />
        </mxCell>
        <mxCell id="t2" value="T" style="" vertex="1" parent="1">
          <mxGeometry x="200" y="50" width="60" height="40" as="geometry" />
        </mxCell>
        <mxCell id="de1" style="dashed=1;endArrow=none;" edge="1" parent="1" source="s2" target="t2">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel></diagram></mxfile>`;

    const svg = drawioToSvg(xml);
    expect(svg).toContain('stroke-dasharray');
  });
});

// ═══════════════════════════════════════════════════════════════
// drawioToSvg – edge cases
// ═══════════════════════════════════════════════════════════════

describe('drawioToSvg – edge cases', () => {
  it('handles mxGraphModel without mxfile wrapper', () => {
    const xml = `<mxGraphModel pageWidth="400" pageHeight="300">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="v1" value="Box" style="" vertex="1" parent="1">
          <mxGeometry x="50" y="50" width="100" height="50" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>`;

    const svg = drawioToSvg(xml);
    expect(svg).toContain('<svg');
    expect(svg).toContain('data-cell-id="v1"');
  });

  it('escapes XML entities in text', () => {
    const xml = `<mxfile><diagram name="P"><mxGraphModel pageWidth="800" pageHeight="600">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="x1" value="A &amp; B &lt; C" style="" vertex="1" parent="1">
          <mxGeometry x="50" y="50" width="100" height="50" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel></diagram></mxfile>`;

    const svg = drawioToSvg(xml);
    // The text should be escaped in SVG output
    expect(svg).toContain('data-cell-id="x1"');
    // Output text should contain escaped entities
    expect(svg).toMatch(/A\s*&amp;\s*B/);
  });

  it('handles empty diagram gracefully', () => {
    const xml = `<mxfile><diagram name="P"><mxGraphModel pageWidth="800" pageHeight="600">
      <root><mxCell id="0"/><mxCell id="1" parent="0"/></root>
    </mxGraphModel></diagram></mxfile>`;

    const svg = drawioToSvg(xml);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('strips HTML tags from cell value', () => {
    const xml = `<mxfile><diagram name="P"><mxGraphModel pageWidth="800" pageHeight="600">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="h1" value="&lt;b&gt;Bold Text&lt;/b&gt;" style="" vertex="1" parent="1">
          <mxGeometry x="50" y="50" width="100" height="50" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel></diagram></mxfile>`;

    const svg = drawioToSvg(xml);
    expect(svg).toContain('Bold Text');
    // Should NOT contain raw <b> tag in the SVG text element
    expect(svg).not.toMatch(/<text[^>]*>.*<b>/);
  });
});

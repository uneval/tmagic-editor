import { describe, expect, it, vi } from 'vitest';

import button from '../src/button';
import img from '../src/img';
import { buildPlaceholderRect } from '../src/placeholder';
import qrcode from '../src/qrcode';
import {
  backgroundFill,
  backgroundPaint,
  borderVisualProps,
  boxSpacing,
  commonVisualProps,
  overflowMode,
  textBoxStyle,
  textOverflowMode,
} from '../src/utils';

const MockShape = vi.hoisted(
  () =>
    class MockShape {
      public props: Record<string, unknown>;
      public children: MockShape[] = [];

      constructor(props: Record<string, unknown> = {}) {
        this.props = props;
      }

      add(child: MockShape) {
        this.children.push(child);
      }
    },
);

vi.mock('leafer-ui', () => ({
  Group: MockShape,
  Image: MockShape,
  Rect: MockShape,
  Text: MockShape,
  Frame: MockShape,
}));

describe('leafer shapes', () => {
  it('uses src for image content and keeps url as the fallback', () => {
    const node = img({ type: 'img', id: 'image', src: '/image.png', url: '/link' } as any, {} as any) as MockShape;
    expect(node.props.url).toBe('/image.png');
  });

  it('keeps placeholder nodes at their DSL position', () => {
    const node = buildPlaceholderRect({
      type: 'qrcode',
      id: 'qr',
      style: { left: '24px', top: '36px', width: '80px', height: '90px' },
    } as any);
    expect(node.props).toMatchObject({ x: 24, y: 36, width: 80, height: 90 });
  });

  it('gives button text the button box so it can be centered', () => {
    const node = button(
      {
        type: 'button',
        id: 'button',
        text: 'Open',
        style: { left: 10, top: 20, width: '120px', height: '40px' },
      } as any,
      {} as any,
    ) as MockShape;
    expect(node.children[1].props).toMatchObject({ width: 120, height: 40 });
  });

  it('maps button text styles instead of forcing the preview defaults', () => {
    const node = button(
      {
        type: 'button',
        id: 'button',
        text: 'Open',
        style: {
          width: 120,
          height: 40,
          textAlign: 'left',
          lineHeight: 20,
          letterSpacing: 2,
          fontStyle: 'italic',
          transform: { rotate: '30deg', scale: 1.5 },
        },
      } as any,
      {} as any,
    ) as MockShape;

    expect(node.children[1].props).toMatchObject({
      textAlign: 'left',
      lineHeight: 20,
      letterSpacing: 2,
      italic: true,
    });
    expect(node.props).toMatchObject({
      rotation: 30,
      scaleX: 1.5,
      scaleY: 1.5,
    });
    expect(node.children[0].props).not.toHaveProperty('rotation');
  });

  it('renders a QR code pattern instead of a generic placeholder', () => {
    const node = qrcode(
      {
        type: 'qrcode',
        id: 'qr',
        url: 'https://example.com',
        style: { left: 12, top: 18, width: 100, height: 100 },
      } as any,
      {} as any,
    ) as MockShape;
    expect(node.children.length).toBeGreaterThan(1);
  });

  it('keeps shared visual CSS on Leafer nodes', () => {
    expect(
      commonVisualProps({
        opacity: '50%',
        display: 'none',
        zIndex: 3,
        borderRadius: '8px',
        borderWidth: '2px',
        borderColor: '#f00',
        borderStyle: 'dashed',
        transform: { rotate: '30deg', scale: 1.5 },
      }),
    ).toMatchObject({
      opacity: 0.5,
      visible: false,
      zIndex: 3,
      cornerRadius: 8,
      strokeWidth: 2,
      stroke: '#f00',
      dashPattern: [6, 4],
      rotation: 30,
      scaleX: 1.5,
      scaleY: 1.5,
    });
  });

  it('keeps background fill separate from text fill', () => {
    expect(backgroundFill({ backgroundColor: '#fdd' })).toBe('#fdd');
    expect(backgroundFill({ backgroundImage: 'linear-gradient(red, blue)' })).toBe('linear-gradient(red, blue)');
    expect(
      backgroundPaint({
        backgroundImage: 'url("hero.png")',
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }),
    ).toMatchObject({
      type: 'image',
      url: 'hero.png',
      mode: 'stretch',
      align: 'center',
      repeat: false,
    });
    expect(textBoxStyle({ backgroundColor: '#fdd', borderRadius: 8 })).toMatchObject({
      fill: '#fdd',
      cornerRadius: 8,
    });
  });

  it('separates composite border props from root transform props', () => {
    expect(borderVisualProps({ borderWidth: 2, borderColor: '#f00', borderRadius: 6 })).toMatchObject({
      strokeWidth: 2,
      stroke: '#f00',
      cornerRadius: 6,
    });
    expect(commonVisualProps({ transform: { rotate: '10deg' } })).toMatchObject({ rotation: 10 });
  });

  it('maps container overflow to Leafer clipping modes', () => {
    expect(overflowMode({ overflow: 'hidden' })).toBe('hide');
    expect(overflowMode({ overflow: 'auto' })).toBe('scroll');
    expect(overflowMode({ overflow: 'visible' })).toBe('show');
  });

  it('maps CSS box spacing and text overflow', () => {
    expect(boxSpacing({ padding: '1px 2px 3px 4px' }, 'padding')).toEqual([1, 2, 3, 4]);
    expect(boxSpacing({ padding: 8, paddingLeft: 12 }, 'padding')).toEqual([8, 8, 8, 12]);
    expect(textOverflowMode({ overflow: 'hidden' })).toBe('hide');
    expect(textOverflowMode({ overflow: 'ellipsis' })).toBe('ellipsis');
  });
});

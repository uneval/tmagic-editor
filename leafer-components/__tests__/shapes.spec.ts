import { describe, expect, it, vi } from 'vitest'

const MockShape = vi.hoisted(() =>
  class MockShape {
    public props: Record<string, unknown>
    public children: MockShape[] = []

    constructor(props: Record<string, unknown> = {}) {
      this.props = props
    }

    add(child: MockShape) {
      this.children.push(child)
    }
  },
)

vi.mock('leafer-ui', () => ({
  Group: MockShape,
  Image: MockShape,
  Rect: MockShape,
  Text: MockShape,
  Frame: MockShape,
}))

import button from '../src/button'
import img from '../src/img'
import { buildPlaceholderRect } from '../src/placeholder'
import qrcode from '../src/qrcode'
import { commonVisualProps } from '../src/utils'

describe('leafer shapes', () => {
  it('uses src for image content and keeps url as the fallback', () => {
    const node = img({ type: 'img', id: 'image', src: '/image.png', url: '/link' } as any, {} as any) as MockShape
    expect(node.props.url).toBe('/image.png')
  })

  it('keeps placeholder nodes at their DSL position', () => {
    const node = buildPlaceholderRect({
      type: 'qrcode',
      id: 'qr',
      style: { left: '24px', top: '36px', width: '80px', height: '90px' },
    } as any)
    expect(node.props).toMatchObject({ x: 24, y: 36, width: 80, height: 90 })
  })

  it('gives button text the button box so it can be centered', () => {
    const node = button({
      type: 'button',
      id: 'button',
      text: 'Open',
      style: { left: 10, top: 20, width: '120px', height: '40px' },
    } as any, {} as any) as MockShape
    expect(node.children[1].props).toMatchObject({ width: 120, height: 40 })
  })

  it('renders a QR code pattern instead of a generic placeholder', () => {
    const node = qrcode({
      type: 'qrcode',
      id: 'qr',
      url: 'https://example.com',
      style: { left: 12, top: 18, width: 100, height: 100 },
    } as any, {} as any) as MockShape
    expect(node.children.length).toBeGreaterThan(1)
  })

  it('keeps shared visual CSS on Leafer nodes', () => {
    expect(commonVisualProps({ opacity: '50%', borderWidth: '2px', borderColor: '#f00' })).toMatchObject({
      opacity: 0.5,
      strokeWidth: 2,
      stroke: '#f00',
    })
  })
})

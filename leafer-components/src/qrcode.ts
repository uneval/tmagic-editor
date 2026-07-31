/*
 * Tencent is pleased to support the open source community by making TMagicEditor available.
 *
 * Copyright (C) 2025 Tencent.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import QRCode from 'qrcode'
import { Group, Rect } from 'leafer-ui'

import type { MComponent } from '@tmagic/schema'

import { parsePx, type ShapeFn } from './utils'

/**
 * qrcode = Group[白底 + 黑色模块]
 * 与 runtime 端 qrcode.toDataURL 的默认 quiet zone(4 modules)对齐，
 * 避免编辑画布只显示占位矩形而预览显示真实二维码。
 */
const shape: ShapeFn = (config) => {
  const c = config as MComponent & { url?: string }
  const width = parsePx(c.style?.width) ?? 100
  const height = parsePx(c.style?.height) ?? 100
  const size = Math.min(width, height)
  const qr = QRCode.create(c.url ?? '')
  const moduleCount = qr.modules.size
  const quietZone = 4
  const cellSize = size / (moduleCount + quietZone * 2)
  const offsetX = (width - size) / 2 + quietZone * cellSize
  const offsetY = (height - size) / 2 + quietZone * cellSize
  const group = new Group({
    x: parsePx(c.style?.left) ?? 0,
    y: parsePx(c.style?.top) ?? 0,
    width,
    height,
  })

  group.add(new Rect({ width, height, fill: '#fff' }))

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!qr.modules.data[row * moduleCount + column]) continue
      group.add(
        new Rect({
          x: offsetX + column * cellSize,
          y: offsetY + row * cellSize,
          width: cellSize + 0.01,
          height: cellSize + 0.01,
          fill: '#000',
        }),
      )
    }
  }

  return group
}

export default shape

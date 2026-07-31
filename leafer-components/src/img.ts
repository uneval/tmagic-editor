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

import { Image } from 'leafer-ui'

import type { MComponent } from '@tmagic/schema'

import { commonVisualProps, parsePx, type ShapeFn } from './utils'

const shape: ShapeFn = (config) => {
  const c = config as MComponent & { src?: string; url?: string }
  return new Image({
    // Runtime 用 src 渲染图片,url 只是点击跳转地址。
    url: c.src ?? c.url ?? '',
    x: parsePx(c.style?.left) ?? 0,
    y: parsePx(c.style?.top) ?? 0,
    width: parsePx(c.style?.width),
    height: parsePx(c.style?.height),
    ...commonVisualProps(c.style),
  })
}

export default shape

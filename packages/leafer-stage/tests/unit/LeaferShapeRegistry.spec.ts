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

import { describe, expect, it } from 'vitest'

// 直接从 src 引用,避免依赖 @tmagic/stage 的 dist
import { LeaferShapeRegistry } from '../../src/LeaferShapeRegistry'

describe('LeaferShapeRegistry', () => {
  it('register and get a shape', () => {
    const registry = new LeaferShapeRegistry()
    const fn = () => null
    registry.register('button', fn)
    expect(registry.get('button')).toBe(fn)
  })

  it('returns undefined for unregistered type', () => {
    const registry = new LeaferShapeRegistry()
    expect(registry.get('unknown')).toBeUndefined()
  })

  it('has() reports existence', () => {
    const registry = new LeaferShapeRegistry()
    expect(registry.has('text')).toBe(false)
    registry.register('text', () => null)
    expect(registry.has('text')).toBe(true)
  })

  it('registerAll() registers multiple at once', () => {
    const registry = new LeaferShapeRegistry()
    const fnA = () => null
    const fnB = () => null
    registry.registerAll({ button: fnA, text: fnB })
    expect(registry.get('button')).toBe(fnA)
    expect(registry.get('text')).toBe(fnB)
  })

  it('list() returns all registered types', () => {
    const registry = new LeaferShapeRegistry()
    registry.register('a', () => null)
    registry.register('b', () => null)
    expect(registry.list().sort()).toEqual(['a', 'b'])
  })

  it('unregister() removes a shape', () => {
    const registry = new LeaferShapeRegistry()
    registry.register('button', () => null)
    expect(registry.unregister('button')).toBe(true)
    expect(registry.has('button')).toBe(false)
  })

  it('clear() removes all', () => {
    const registry = new LeaferShapeRegistry()
    registry.registerAll({ a: () => null, b: () => null, c: () => null })
    expect(registry.list()).toHaveLength(3)
    registry.clear()
    expect(registry.list()).toHaveLength(0)
  })

  it('register() returns this for chaining', () => {
    const registry = new LeaferShapeRegistry()
    expect(registry.register('x', () => null)).toBe(registry)
    expect(registry.registerAll({})).toBe(registry)
  })
})

import { proxy, unstable_getInternalStates } from '../../vanilla.ts'

const { proxyStateMap, snapCache } = unstable_getInternalStates()
const isProxy = (x: any) => proxyStateMap.has(x)

type InternalProxyObject<K, V> = Map<K, V> & {
  data: Array<V>
  index: number
  toJSON: () => Map<K, V>
}

export function proxyMap<K, V>(entries?: Iterable<[K, V]> | undefined | null) {
  const initialData: Array<V> = []
  let initialIndex = 0
  const indexMap = new Map<K, number>()

  const snapMapCache = new WeakMap<object, Map<K, number>>()
  const registerSnapMap = () => {
    const cache = snapCache.get(vObject)
    const latestSnap = cache?.[1]
    if (latestSnap && !snapMapCache.has(latestSnap)) {
      const clonedMap = new Map(indexMap)
      snapMapCache.set(latestSnap, clonedMap)
    }
  }
  const getMapForThis = (x: any) => snapMapCache.get(x) || indexMap

  if (entries) {
    if (typeof entries[Symbol.iterator] !== 'function') {
      throw new TypeError(
        'proxyMap:\n\tinitial state must be iterable\n\t\ttip: structure should be [[key, value]]',
      )
    }
    for (const [key, value] of entries) {
      indexMap.set(key, initialIndex)
      initialData[initialIndex++] = value
    }
  }

  const vObject: InternalProxyObject<K, V> = {
    data: initialData,
    index: initialIndex,
    get size() {
      if (!isProxy(this)) {
        registerSnapMap()
      }
      const map = getMapForThis(this)
      return map.size
    },
    get(key: K) {
      const map = getMapForThis(this)
      const index = map.get(key)
      if (index === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.index // touch property for tracking
        return undefined
      }
      return this.data[index]
    },
    has(key: K) {
      const map = getMapForThis(this)
      const exists = map.has(key)
      if (!exists) {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.index // touch property for tracking
      }
      return exists
    },
    set(key: K, value: V) {
      if (!isProxy(this)) {
        throw new Error('Cannot perform mutations on a snapshot')
      }
      const index = indexMap.get(key)
      if (index === undefined) {
        indexMap.set(key, this.index)
        this.data[this.index++] = value
      } else {
        this.data[index] = value
      }
      return this
    },
    delete(key: K) {
      if (!isProxy(this)) {
        throw new Error('Cannot perform mutations on a snapshot')
      }
      const index = indexMap.get(key)
      if (index === undefined) {
        return false
      }
      delete this.data[index]
      indexMap.delete(key)
      return true
    },
    clear() {
      if (!isProxy(this)) {
        throw new Error('Cannot perform mutations on a snapshot')
      }
      this.data.length = 0 // empty array
      this.index = 0
      indexMap.clear()
    },
    forEach(cb: (value: V, key: K, map: Map<K, V>) => void) {
      const map = getMapForThis(this)
      map.forEach((index, key) => {
        cb(this.data[index]!, key, this)
      })
    },
    *entries(): MapIterator<[K, V]> {
      const map = getMapForThis(this)
      for (const [key, index] of map) {
        yield [key, this.data[index]!]
      }
    },
    *keys(): IterableIterator<K> {
      const map = getMapForThis(this)
      for (const key of map.keys()) {
        yield key
      }
    },
    *values(): IterableIterator<V> {
      const map = getMapForThis(this)
      for (const index of map.values()) {
        yield this.data[index]!
      }
    },
    [Symbol.iterator]() {
      return this.entries()
    },
    get [Symbol.toStringTag]() {
      return 'Map'
    },
    toJSON(): Map<K, V> {
      return new Map(this.entries())
    },
  }

  const proxiedObject = proxy(vObject)
  Object.defineProperties(proxiedObject, {
    size: { enumerable: false },
    index: { enumerable: false },
    data: { enumerable: false },
    toJSON: { enumerable: false },
  })
  Object.seal(proxiedObject)

  return proxiedObject as unknown as Map<K, V> & {
    $$valtioSnapshot: Omit<Map<K, V>, 'set' | 'delete' | 'clear'>
  }
}

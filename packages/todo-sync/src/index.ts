export interface Todo {
  resource_id: string
  title: string
  done: boolean
  deleted: boolean
  client_created_at: string
  version: number
  server_created_at?: string
}
interface Mutation extends Todo {
  operation_id: string
  base_version: number
}
export interface Snapshot {
  rows: Record<string, Todo>
  queue: Mutation[]
  cursor: number
  conflicts: Record<string, Todo>
}
export const empty = (): Snapshot => ({
  rows: {},
  queue: [],
  cursor: 0,
  conflicts: {}
})
const db = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('vx-todo-v1', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('workspace')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
const channel = new BroadcastChannel('vx-todo-changes')
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(fn => fn())
channel.onmessage = notify
export const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const access = async (change?: (s: Snapshot) => void): Promise<Snapshot> => {
  const database = await db
  return new Promise((resolve, reject) => {
    const tx = database.transaction(
      'workspace',
      change ? 'readwrite' : 'readonly'
    )
    const store = tx.objectStore('workspace'),
      req = store.get('local')
    let value: Snapshot
    req.onsuccess = () => {
      value = req.result ?? empty()
      if (change) {
        change(value)
        store.put(value, 'local')
      }
    }
    tx.oncomplete = () => {
      if (change) {
        notify()
        channel.postMessage(1)
      }
      resolve(value)
    }
    tx.onabort = () => reject(tx.error ?? Error('Local save failed'))
  })
}
export const read = () => access()
export const visible = (s: Snapshot): Todo[] => {
  const rows = { ...s.rows }
  for (const edit of s.queue) rows[edit.resource_id] = edit
  return Object.values(rows)
    .filter(t => !t.deleted)
    .sort((a, b) => b.client_created_at.localeCompare(a.client_created_at))
}
export const edit = async (
  id: string,
  patch: Partial<Pick<Todo, 'title' | 'done' | 'deleted'>>
) => {
  await access(s => {
    const previous =
      s.queue.filter(t => t.resource_id === id).at(-1) ?? s.rows[id]
    const base = previous?.version ?? 0
    s.queue.push({
      ...{
        resource_id: id,
        title: '',
        done: false,
        deleted: false,
        client_created_at: new Date().toISOString()
      },
      ...previous,
      ...patch,
      version: base + 1,
      base_version: base,
      operation_id: crypto.randomUUID()
    })
  })
}
export const acceptServer = async (id: string) => {
  await access(s => {
    s.queue = s.queue.filter(t => t.resource_id !== id)
    delete s.conflicts[id]
  })
}
const merge = (s: Snapshot, t: Todo) => {
  if (t.version > (s.rows[t.resource_id]?.version ?? 0))
    s.rows[t.resource_id] = t
}
export const sync = async () => {
  await navigator.locks.request('vx-todo-sync', async () => {
    for (;;) {
      const s = await read(),
        next = s.queue.find(t => !s.conflicts[t.resource_id])
      if (!next) break
      const r = await fetch('/api/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
        signal: AbortSignal.timeout(8000)
      })
      if (r.status === 409) {
        const { current } = await r.json()
        await access(s => {
          merge(s, current)
          s.conflicts[next.resource_id] = current
        })
        continue
      }
      if (!r.ok) throw Error('Sync failed (' + r.status + ')')
      const row = await r.json()
      await access(s => {
        merge(s, row)
        s.queue = s.queue.filter(x => x.operation_id !== next.operation_id)
      })
    }
    for (;;) {
      const { cursor } = await read()
      const r = await fetch('/api/changes?after=' + cursor, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000)
      })
      if (!r.ok) throw Error('Unable to refresh')
      const page: { items: Todo[]; cursor: number; more: boolean } =
        await r.json()
      if (page.items.length)
        await access(s => {
          page.items.forEach(t => merge(s, t))
          s.cursor = page.cursor
        })
      if (!page.more) break
    }
  })
}

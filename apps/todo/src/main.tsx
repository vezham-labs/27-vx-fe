import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import {
  acceptServer,
  edit,
  empty,
  read,
  subscribe,
  sync,
  visible
} from '@vezham/todo-sync'

import './style.css'

const App = () => {
  const [state, setState] = useState(empty),
    [title, setTitle] = useState(''),
    [editing, setEditing] = useState(''),
    [draft, setDraft] = useState(''),
    [message, setMessage] = useState('')
  const refresh = () =>
    sync()
      .then(() => setMessage(''))
      .catch(() => setMessage('Offline · changes stay on this device'))
  useEffect(() => {
    let live = true
    const load = () => {
      read()
        .then(s => {
          if (live) setState(s)
        })
        .catch(() => setMessage('Local storage unavailable'))
    }
    const unsub = subscribe(load)
    load()
    void refresh()
    const tick = () => {
      if (!document.hidden) void refresh()
    }
    window.addEventListener('online', tick)
    document.addEventListener('visibilitychange', tick)
    const timer = setInterval(tick, 10000)
    return () => {
      live = false
      unsub()
      clearInterval(timer)
      window.removeEventListener('online', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  const save = async (id: string, patch: Parameters<typeof edit>[1]) => {
    await edit(id, patch)
    void refresh()
  }
  const todos = visible(state)
  return (
    <main>
      <header>
        <h1>Todos</h1>
        <button onClick={refresh}>Sync</button>
      </header>
      <form
        onSubmit={async e => {
          e.preventDefault()
          if (title.trim()) {
            await save(crypto.randomUUID(), { title: title.trim() })
            setTitle('')
          }
        }}>
        <input
          placeholder="What needs doing?"
          aria-label="New todo"
          maxLength={200}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <button className="primary" disabled={!title.trim()}>
          Add
        </button>
      </form>
      <p role="status">
        {message ||
          (state.queue.length ? state.queue.length + ' pending' : 'Up to date')}
      </p>
      {Object.keys(state.conflicts).map(id => (
        <aside key={id}>
          Conflict on “
          {state.queue.filter(t => t.resource_id === id).at(-1)?.title}”.
          Server: {state.rows[id]?.deleted ? 'Deleted' : state.rows[id]?.title}.{' '}
          <button onClick={() => acceptServer(id)}>Use server version</button>
        </aside>
      ))}
      <ul>
        {todos.map(t => (
          <li key={t.resource_id}>
            <input
              type="checkbox"
              aria-label={'Complete ' + t.title}
              checked={t.done}
              onChange={() => save(t.resource_id, { done: !t.done })}
            />
            {editing === t.resource_id ? (
              <form
                onSubmit={async e => {
                  e.preventDefault()
                  if (draft.trim()) {
                    await save(t.resource_id, { title: draft.trim() })
                    setEditing('')
                  }
                }}>
                <input
                  aria-label="Edit title"
                  maxLength={200}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                />
                <button>Save</button>
                <button type="button" onClick={() => setEditing('')}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className={t.done ? 'done' : ''}>{t.title}</span>
                <button
                  onClick={() => {
                    setEditing(t.resource_id)
                    setDraft(t.title)
                  }}>
                  Edit
                </button>
                <button onClick={() => save(t.resource_id, { deleted: true })}>
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {!todos.length && <p>Your list is empty.</p>}
    </main>
  )
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  void navigator.serviceWorker.register('/sw.js')

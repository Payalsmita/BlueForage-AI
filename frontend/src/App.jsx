import { useEffect, useRef, useState } from 'react'
import { api, groupPath } from './api.js'
import Blueprint from './Blueprint.jsx'
import { Accuracy, GapCheck, Sources } from './Panels.jsx'

const TABS = [['blueprint', 'Blueprint'], ['gap', 'Gap check'], ['eval', 'Accuracy'], ['sources', 'Sources']]

export default function App() {
  const [groups, setGroups] = useState([])
  const [sel, setSel] = useState(0)
  const [tab, setTab] = useState('blueprint')
  const [status, setStatus] = useState({ msg: '', error: false })
  const [busy, setBusy] = useState(false)
  const [force, setForce] = useState(false)
  const [bp, setBp] = useState(null)
  const [doc, setDoc] = useState(null) // { id, text, quote }
  const dialog = useRef(null)
  const g = groups[sel]
  const gKey = g ? `${g.industry}/${g.workflowType}` : ''

  const fail = e => setStatus({ msg: e.message, error: true })

  /** Runs fn with an elapsed-seconds status line. fn may return a message to show when done. */
  async function run(label, fn) {
    const t0 = Date.now()
    const secs = () => Math.round((Date.now() - t0) / 1000)
    const tick = () => setStatus({ msg: `${label}… ${secs()}s`, error: false })
    tick()
    const id = setInterval(tick, 1000)
    setBusy(true)
    try {
      const msg = await fn()
      setStatus({ msg: typeof msg === 'string' ? msg : `Done in ${secs()}s.`, error: false })
    } catch (e) { fail(e) } finally { clearInterval(id); setBusy(false) }
  }

  /** Reload scenarios, keeping the current one selected. */
  async function loadGroups(keep = gKey) {
    const list = await api('/api/groups')
    setGroups(list)
    setSel(Math.max(0, list.findIndex(x => `${x.industry}/${x.workflowType}` === keep)))
  }

  useEffect(() => { loadGroups().catch(e => fail(new Error('Cannot reach the backend: ' + e.message))) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!g) return
    let live = true // ignore a slow response for a scenario the user already left
    setBp(null)
    api(`/api/blueprints/${groupPath(g)}`).then(b => live && setBp(b), e => { if (live && e.status !== 404) fail(e) })
    return () => { live = false }
  }, [gKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openDoc(id, quote) {
    try { setDoc({ id, quote, text: await api(`/api/docs/${encodeURIComponent(id)}/text`) }) } catch (e) { fail(e) }
  }

  useEffect(() => {
    if (!doc) return
    dialog.current.showModal()
    dialog.current.querySelector('mark')?.scrollIntoView({ block: 'center' })
  }, [doc])

  const generate = () => run(`Generating blueprint from ${g.docCount} implementations`, async () => {
    setBp(await api(`/api/blueprints/${groupPath(g)}?force=${force}`, { method: 'POST' }))
  })

  return (
    <>
      <header className="top">
        <h1>BlueprintForge AI <span>evidence-backed industry blueprints</span></h1>
        <div className="controls">
          <select aria-label="Scenario" value={sel} onChange={e => setSel(+e.target.value)}>
            {groups.map((x, i) => <option key={i} value={i}>{x.industry} · {x.workflowType} ({x.docCount})</option>)}
          </select>
          <label className="row" style={{ fontSize: 13, color: 'var(--muted)' }}>
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} /> re-extract
          </label>
          <button className="primary" disabled={busy || !g} onClick={generate}>Generate blueprint</button>
        </div>
      </header>
      <div className={`status${status.error ? ' error' : ''}`} role="status" aria-live="polite">{status.msg}</div>
      <nav role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <main>
        {g && <>
          <section role="tabpanel" id="panel-blueprint" aria-labelledby="tab-blueprint" hidden={tab !== 'blueprint'}>
            <Blueprint bp={bp} setBp={setBp} g={g} openDoc={openDoc} fail={fail} />
          </section>
          <section role="tabpanel" id="panel-gap" aria-labelledby="tab-gap" hidden={tab !== 'gap'}>
            <GapCheck key={gKey} g={g} run={run} busy={busy} setStatus={setStatus} />
          </section>
          <section role="tabpanel" id="panel-eval" aria-labelledby="tab-eval" hidden={tab !== 'eval'}>
            <Accuracy key={gKey} g={g} run={run} busy={busy} />
          </section>
          <section role="tabpanel" id="panel-sources" aria-labelledby="tab-sources" hidden={tab !== 'sources'}>
            <Sources key={gKey} g={g} run={run} busy={busy} openDoc={openDoc} onUploaded={loadGroups} fail={fail} />
          </section>
        </>}
      </main>
      <dialog ref={dialog} onClose={() => setDoc(null)}>
        <header><strong>{doc?.id}</strong><button className="small" style={{ marginLeft: 'auto' }} onClick={() => dialog.current.close()}>Close</button></header>
        {doc && <pre><Highlighted text={doc.text} quote={doc.quote} /></pre>}
      </dialog>
    </>
  )
}

function Highlighted({ text, quote }) {
  const at = quote ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1
  if (at < 0) return text
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + quote.length)}</mark>{text.slice(at + quote.length)}</>
}

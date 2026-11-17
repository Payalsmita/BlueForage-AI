import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { api, groupPath, pct } from './api.js'
import Blueprint from './Blueprint.jsx'
import { Accuracy, GapCheck, Sources, Stat } from './Panels.jsx'
import Agent from './Agent.jsx'

/** The guided demo flow: one numbered step per page. */
const STEPS = [
  { id: 'overview', label: 'Overview', sub: 'What BlueprintForge does',
    explain: 'The big picture: how past implementations become a reviewed blueprint, and how the agent uses it for a new customer.' },
  { id: 'sources', label: 'Sources', sub: 'Past implementations',
    explain: 'These are the past implementation documents for the selected scenario. Add more here (PDF, DOCX and PPTX are converted to Markdown).' },
  { id: 'blueprint', label: 'Blueprint', sub: 'Review the industry template',
    explain: 'The AI pulled stages, roles and approval rules from every source doc. Code counted how many implementations contain each one and verified every quote. Approve, edit or reject each item.' },
  { id: 'eval', label: 'Accuracy', sub: 'Prove it against an answer key',
    explain: 'We scored the AI\'s extractions against a hand-checked answer key. No AI calls are made on this page.' },
  { id: 'gap', label: 'Gap check', sub: 'Quick check of a new customer',
    explain: 'A one-shot comparison of a new customer\'s notes with the blueprint: what they are missing, what is unique to them and what already matches.' },
  { id: 'agent', label: 'Implementation Agent', sub: 'Kickoff notes → handover',
    explain: 'The agent takes a new customer from kickoff notes to a validated configuration, UAT tests and a handover pack. It pauses for a consultant to answer questions and to approve the result.' },
]

export default function App() {
  const [groups, setGroups] = useState([])
  const [sel, setSel] = useState(0)
  // step lives in the URL hash so a refresh or a shared link keeps the place in the demo
  const [step, setStep] = useState(() => STEPS.some(s => `#${s.id}` === location.hash) ? location.hash.slice(1) : 'overview')
  const [status, setStatus] = useState({ msg: '', error: false })
  const [busy, setBusy] = useState(false)
  const [force, setForce] = useState(false)
  const [bp, setBp] = useState(null)
  const [doc, setDoc] = useState(null) // { id, text, quote }
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

  const generate = () => run(`Generating blueprint from ${g.docCount} implementations`, async () => {
    setBp(await api(`/api/blueprints/${groupPath(g)}?force=${force}`, { method: 'POST' }))
  })

  const go = id => { setStep(id); history.replaceState(null, '', `#${id}`); window.scrollTo({ top: 0 }) }
  const idx = STEPS.findIndex(s => s.id === step)

  /** Every page: explainer on top, "Next" at the bottom. Pages stay mounted so their state survives navigation. */
  const page = (id, children) => {
    const n = STEPS.findIndex(s => s.id === id)
    const next = STEPS[n + 1]
    return (
      <section key={id} id={`page-${id}`} aria-labelledby={`step-${id}`} hidden={step !== id}>
        <h2 className="mb-2 flex items-center gap-2.5 font-heading text-xl font-semibold"><StepNum n={n} />{STEPS[n].label}</h2>
        <Alert className="mb-5"><AlertDescription className="text-foreground"><b>What's happening here:</b> {STEPS[n].explain}</AlertDescription></Alert>
        {children}
        {next && id !== 'overview' && <div className="mt-7 flex justify-end border-t pt-4"><Button onClick={() => go(next.id)}>Next: {next.label} →</Button></div>}
      </section>
    )
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b bg-card px-6 py-3.5 max-sm:px-4">
        <h1 className="font-heading text-lg font-bold">BlueprintForge AI <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">evidence-backed industry blueprints</span></h1>
        <div className="ml-auto flex flex-wrap items-center gap-3 max-sm:ml-0">
          <NativeSelect aria-label="Scenario" value={sel} onChange={e => setSel(+e.target.value)} className="w-auto">
            {groups.map((x, i) => <NativeSelectOption key={i} value={i}>{x.industry} · {x.workflowType} ({x.docCount})</NativeSelectOption>)}
          </NativeSelect>
          <Label className="text-muted-foreground">
            <Checkbox checked={force} onCheckedChange={v => setForce(!!v)} /> re-extract
          </Label>
          <Button disabled={busy || !g} onClick={generate}>Generate blueprint</Button>
        </div>
      </header>
      <div className={cn('min-h-5 px-6 pt-2 text-xs max-sm:px-4', status.error ? 'text-destructive' : 'text-muted-foreground')} role="status" aria-live="polite">{status.msg}</div>
      <div className="grid items-start lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="p-4 lg:sticky lg:top-0 max-lg:overflow-x-auto" aria-label="Demo steps">
          <ol className="grid gap-1 max-lg:auto-cols-max max-lg:grid-flow-col">
            {STEPS.map((s, n) => (
              <li key={s.id}>
                <Button variant="ghost" id={`step-${s.id}`} aria-current={step === s.id ? 'step' : undefined} onClick={() => go(s.id)}
                        className="h-auto w-full items-start justify-start gap-2.5 border border-transparent px-2.5 py-2 text-left whitespace-normal aria-[current=step]:border-border aria-[current=step]:bg-card aria-[current=step]:shadow-[inset_3px_0_0_var(--primary)]">
                  <StepNum n={n} state={step === s.id ? 'current' : n < idx ? 'done' : ''} />
                  <span className="grid font-semibold">{s.label}<small className="font-normal text-muted-foreground max-lg:hidden">{s.sub}</small></span>
                </Button>
              </li>
            ))}
          </ol>
        </nav>
        <main className="min-w-0 px-6 pt-5 pb-12 text-sm max-sm:px-4">
          {page('overview', <Overview groups={groups} onStart={() => go('sources')} />)}
          {g && <>
            {page('sources', <Sources key={gKey} g={g} run={run} busy={busy} openDoc={openDoc} onUploaded={loadGroups} fail={fail} />)}
            {page('blueprint', <Blueprint bp={bp} setBp={setBp} g={g} openDoc={openDoc} fail={fail} />)}
            {page('eval', <Accuracy key={gKey} g={g} run={run} busy={busy} />)}
            {page('gap', <GapCheck key={gKey} g={g} run={run} busy={busy} setStatus={setStatus} />)}
            {page('agent', <Agent g={g} hasBlueprint={!!bp} openDoc={openDoc} fail={fail} setStatus={setStatus} />)}
          </>}
        </main>
      </div>
      <Dialog open={!!doc} onOpenChange={o => { if (!o) setDoc(null) }}>
        <DialogContent className="max-h-[85vh] sm:max-w-3xl">
          <DialogHeader><DialogTitle>{doc?.id}</DialogTitle></DialogHeader>
          {doc && (
            <pre ref={el => el?.querySelector('mark')?.scrollIntoView({ block: 'center' })}
                 className="max-h-[70vh] overflow-auto font-mono text-xs/relaxed whitespace-pre-wrap">
              <Highlighted text={doc.text} quote={doc.quote} />
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Numbered circle used by the step rail and page titles. */
function StepNum({ n, state }) {
  return (
    <span className={cn('inline-grid size-6 flex-none place-items-center rounded-full border bg-card text-xs font-bold text-muted-foreground',
      state === 'current' && 'border-primary bg-primary text-primary-foreground',
      state === 'done' && 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300')}>{n}</span>
  )
}

const PIPELINE = [
  ['Past implementations', '35 fictional customer docs, 7 industries'],
  ['AI extraction + verbatim check', 'every quote must exist in the source'],
  ['Industry blueprint', 'code counts support per country'],
  ['Consultant review', 'approve · edit · reject'],
  ['New customer: Implementation Agent', 'gaps → questions → config → validate → UAT'],
  ['Handover', 'config + tests + open items, approved by a human'],
]

function Overview({ groups, onStart }) {
  const docs = groups.reduce((a, x) => a + x.docCount, 0)
  const industries = new Set(groups.map(x => x.industry)).size
  return (
    <>
      <p className="max-w-3xl text-sm/relaxed">
        Every new customer's hiring workflow gets configured from scratch, even though the same industry has been done dozens of times.
        <b> BlueprintForge AI</b> turns past implementations into an evidence-backed industry blueprint, then uses an
        <b> Implementation Agent</b> to take a new customer from kickoff notes to a validated configuration, with a consultant approving every decision.
      </p>
      <ol className="my-5 flex flex-wrap gap-7" aria-label="How it works">
        {PIPELINE.map(([t, s], n) => (
          <li key={n} className="relative max-w-56 flex-[1_1_140px] after:absolute after:top-1/2 after:-right-5.5 after:-translate-y-1/2 after:font-bold after:text-muted-foreground after:content-['→'] last:after:hidden">
            <Card size="sm" className="h-full border-t-2 border-t-primary"><CardContent className="grid gap-1"><b>{t}</b><span className="text-xs text-muted-foreground">{s}</span></CardContent></Card>
          </li>
        ))}
      </ol>
      <div className="mb-4 flex flex-wrap gap-4">
        <Stat big={groups.length} label="scenarios (industry × role)" />
        <Stat big={industries} label="industries" />
        <Stat big={docs} label="past implementation documents" />
      </div>
      <ProofRow groups={groups} />
      <Button size="lg" onClick={onStart}>Start →</Button>
    </>
  )
}

/** Accuracy against the answer keys (no AI calls) and the latest agent run, so the proof is on the first page. */
function ProofRow({ groups }) {
  const [proof, setProof] = useState(null)
  useEffect(() => {
    if (!groups.length) return
    Promise.all(groups.map(x => api(`/api/eval/${groupPath(x)}`).catch(() => null))).then(async reps => {
      const ok = reps.filter(r => r?.docsEvaluated > 0)
      const recall = (list, kind) => {
        const ks = ok.flatMap(r => (r[list] || []).filter(k => k.kind === kind))
        const exp = ks.reduce((a, k) => a + k.expected, 0)
        return exp ? ks.reduce((a, k) => a + k.matched, 0) / exp : null
      }
      const runs = await api('/api/runs').catch(() => [])
      const latest = runs.find(r => ['WAITING_FOR_APPROVAL', 'COMPLETED'].includes(r.status))
      const run = latest && await api(`/api/runs/${latest.id}`).catch(() => null)
      setProof({ n: ok.length, recall, run })
    })
  }, [groups.length]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!proof?.n) return null
  const { recall, run } = proof
  const agentSecs = run ? run.steps.reduce((a, s) => a + Math.max(0, (Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 1000 || 0), 0) : 0
  return (
    <>
      <h3 className="mb-2 font-heading text-base font-semibold">Proof, measured</h3>
      <div className="mb-5 flex flex-wrap gap-4">
        {['STAGE', 'ROLE', 'APPROVAL_RULE'].map(k => recall('scores', k) != null && (
          <Stat key={k} big={pct(recall('scores', k))} label={`${k.toLowerCase().replace('_', ' ')} recall vs answer keys (${proof.n} scenarios)`} />
        ))}
        {recall('withoutSelfCheck', 'ROLE') != null && recall('withoutSelfCheck', 'ROLE') < recall('scores', 'ROLE') && (
          <Stat big={`${pct(recall('withoutSelfCheck', 'ROLE'))} → ${pct(recall('scores', 'ROLE'))}`} label="role recall before → after the AI's self-check pass" />
        )}
        {run && <Stat big={agentSecs < 60 ? `${Math.round(agentSecs)}s` : `${Math.floor(agentSecs / 60)}m ${Math.round(agentSecs % 60)}s`} label={`agent time from kickoff notes to handover for ${run.customerName} (${run.finalItems?.length || 0} config items, ${run.uat?.length || 0} UAT tests)`} />}
      </div>
    </>
  )
}

function Highlighted({ text, quote }) {
  const at = quote ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1
  if (at < 0) return text
  return <>{text.slice(0, at)}<mark className="bg-yellow-200 text-black">{text.slice(at, at + quote.length)}</mark>{text.slice(at + quote.length)}</>
}

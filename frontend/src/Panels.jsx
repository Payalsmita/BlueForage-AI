import { useEffect, useState } from 'react'
import { KIND, SAMPLES, api, groupPath, json, pct } from './api.js'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

// ---------- shared bits ----------
export const ID = 'font-mono text-xs text-muted-foreground'
export const HINT = 'text-sm text-muted-foreground'
export const COLS = 'grid items-start gap-5 grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))]'
export const LINK = 'h-auto p-0 text-xs underline'

/** Colour for any enum value the backend returns. */
const TONE = {
  RUNNING: 'brand', WAITING_FOR_ANSWERS: 'warn', WAITING_FOR_APPROVAL: 'warn', COMPLETED: 'ok', REJECTED: 'bad', FAILED: 'bad',
  DONE: 'ok', PASS: 'ok', WARN: 'warn', FAIL: 'bad', POSITIVE: 'ok', NEGATIVE: 'bad', EDGE: 'warn',
  INCLUDE: 'ok', EXCLUDE: 'bad', UNSURE: 'warn', CUSTOMER_STATED: 'brand', PEER_CONFIRMED: 'ok', CUSTOM: 'warn',
  MISSING: 'bad', UNIQUE: 'warn', ALIGNED: 'ok', APPROVED: 'ok', EDITED: 'brand',
}
const TONE_CLASS = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  brand: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
}
export const Pill = ({ v, children, className, ...props }) => (
  <Badge variant="secondary" className={cn(TONE_CLASS[TONE[v]], className)} {...props}>{children ?? String(v ?? '').toLowerCase().replaceAll('_', ' ')}</Badge>
)
export const Stat = ({ big, label }) => (
  <Card size="sm" className="min-w-40"><CardContent><div className="text-2xl font-bold">{big}</div><div className="text-xs text-muted-foreground">{label}</div></CardContent></Card>
)
export const H2 = ({ count, className, children }) => (
  <h2 className={cn('mb-2.5 font-heading text-base font-semibold', className)}>{children} {count != null && <small className="font-mono text-xs font-normal text-muted-foreground">{count}</small>}</h2>
)
export const Empty = ({ className, children }) => <div className={cn('border border-dashed p-10 text-center text-muted-foreground', className)}>{children}</div>
export const EvList = ({ children }) => <ul className="mt-1.5 space-y-1.5 text-xs">{children}</ul>
export const Ev = ({ children }) => <li className="border-l-2 pl-2">{children}</li>
export const Quotes = ({ qs }) => qs?.length ? <EvList>{qs.map((q, k) => <Ev key={k}>“{q}”</Ev>)}</EvList> : null
/** Small "Evidence (n)"-style disclosure. */
export const More = ({ title, children }) => (
  <Collapsible className="mt-1.5">
    <CollapsibleTrigger render={<Button variant="link" className={LINK} />}>{title}</CollapsibleTrigger>
    <CollapsibleContent>{children}</CollapsibleContent>
  </Collapsible>
)
const Field = ({ label, className, children }) => <Label className={cn('grid gap-1 text-muted-foreground', className)}>{label}{children}</Label>

// ---------- Gap check ----------
export function GapCheck({ g, run, busy, setStatus }) {
  const [text, setText] = useState('')
  const [geo, setGeo] = useState('')
  const [report, setReport] = useState(null)

  async function loadSample() {
    const s = SAMPLES[g.industry]
    if (!s) return setStatus({ msg: `No sample customer for ${g.industry}; paste your own notes.`, error: false })
    setText(await api(s.file)); setGeo(s.geo)
  }

  const check = () => run('Checking customer against blueprint', async () => {
    setReport(await api(`/api/blueprints/${groupPath(g)}/gap-check`, json({ text, geography: geo })))
  })

  return (
    <>
      <div className="mb-5 grid max-w-4xl gap-2.5">
        <p className={HINT}>Paste a new customer's requirements or meeting notes. They are compared with the current blueprint (rejected items excluded).</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Customer country"><Input className="w-24" placeholder="e.g. US" value={geo} onChange={e => setGeo(e.target.value)} /></Field>
          <Button variant="outline" size="sm" onClick={loadSample}>Load sample customer</Button>
        </div>
        <Textarea aria-label="Customer requirements" className="min-h-56 font-mono" value={text} onChange={e => setText(e.target.value)} />
        <div><Button disabled={busy} onClick={check}>Check against blueprint</Button></div>
      </div>
      {report && <Findings findings={report.findings} />}
    </>
  )
}

/** MISSING / UNIQUE / ALIGNED columns; shared by the Gap check page and the Implementation Agent. */
export function Findings({ findings = [] }) {
  const section = (type, title, hint) => {
    const fs = findings.filter(f => f.type === type)
    return (
      <div className="grid gap-2.5">
        <div><H2 count={fs.length} className="mb-1">{title}</H2><p className={HINT}>{hint}</p></div>
        {fs.length === 0 && <Empty className="p-4">None</Empty>}
        {fs.map((f, n) => (
          <Card size="sm" key={n}>
            <CardContent className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={ID}>{f.blueprintItemId || 'new'}</span>
                <span className="font-semibold">{f.name}</span>
                <Pill v={type} className="ml-auto">{KIND[f.kind] || f.kind}</Pill>
              </div>
              <div className="text-xs text-muted-foreground">peers: {f.peerSupport}</div>
              <div>{f.message}</div>
              <Quotes qs={f.customerQuotes} />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }
  return (
    <div className={COLS}>
      {section('MISSING', 'Missing', 'Common among peers (50%+, country-aware) but absent from this customer.')}
      {section('UNIQUE', 'Unique to this customer', 'Not seen at any peer. Confirm it is intentional.')}
      {section('ALIGNED', 'Aligned', 'Matches the industry blueprint.')}
    </div>
  )
}

// ---------- Accuracy ----------
export function Accuracy({ g, run, busy }) {
  const [r, setR] = useState(null)
  const evaluate = () => run('Scoring extractions', async () => setR(await api(`/api/eval/${groupPath(g)}`)))

  let body = null
  if (r) {
    const all = r.scores.reduce((a, s) => ({ m: a.m + s.matched, x: a.x + s.extracted, e: a.e + s.expected }), { m: 0, x: 0, e: 0 })
    const quoteRate = r.quotesKept / Math.max(1, r.quotesKept + r.quotesDropped)
    const list = (title, xs) => xs.length > 0 && (
      <More title={`${title} (${xs.length})`}><EvList>{xs.map((x, n) => <Ev key={n}>{x}</Ev>)}</EvList></More>
    )
    body = (
      <>
        <div className="mb-4 flex flex-wrap gap-4">
          <Stat big={pct(all.m / Math.max(1, all.e))} label="recall: items in the answer key that were found" />
          <Stat big={pct(all.m / Math.max(1, all.x))} label="precision: extracted items that are correct" />
          <Stat big={pct(quoteRate)} label={`quotes found verbatim in source (${r.quotesDropped} dropped)`} />
          <Stat big={r.docsEvaluated} label={`docs scored${r.docsSkipped.length ? ` · skipped ${r.docsSkipped.join(', ')}` : ''}`} />
        </div>
        {r.withoutSelfCheck ? (
          <p className={cn(HINT, 'mb-3')}>
            <b>Self-check:</b> a second AI pass recovered {r.selfCheckAdded} item(s) the first pass missed. Recall without it:{' '}
            {r.withoutSelfCheck.map((s, n) => (
              <span key={s.kind}>{n > 0 && ' · '}{KIND[s.kind]} {pct(s.recall)} → <b>{pct(r.scores.find(x => x.kind === s.kind)?.recall ?? 0)}</b></span>
            ))}
          </p>
        ) : (
          <p className={cn(HINT, 'mb-3')}>Self-check recovered nothing extra for these extractions (or they were cached before the self-check existed; tick <i>re-extract</i> and generate again).</p>
        )}
        <Table className="border">
          <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Expected</TableHead><TableHead>Extracted</TableHead><TableHead>Matched</TableHead><TableHead>Precision</TableHead><TableHead>Recall</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {r.scores.map(s => (
              <TableRow key={s.kind} className="align-top tabular-nums">
                <TableCell>{KIND[s.kind]}</TableCell><TableCell>{s.expected}</TableCell><TableCell>{s.extracted}</TableCell>
                <TableCell>{s.matched}</TableCell><TableCell>{pct(s.precision)}</TableCell><TableCell>{pct(s.recall)}</TableCell>
                <TableCell className="whitespace-normal">{list('missed', s.missed)}{list('extra', s.extra)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    )
  }

  return (
    <>
      <p className={cn(HINT, 'mb-3')}>Compares the AI's extractions with the answer key in <code>docs/ground_truth.json</code>. No AI calls; generate the blueprint first.</p>
      <Button disabled={busy} onClick={evaluate}>Run accuracy check</Button>
      <div className="mt-4">{body}</div>
    </>
  )
}

// ---------- Sources ----------
export function Sources({ g, run, busy, openDoc, onUploaded, fail }) {
  const [docs, setDocs] = useState([])
  const [form, setForm] = useState({ docId: '', geography: '', industry: g.industry, workflowType: g.workflowType })
  const [file, setFile] = useState(null)

  const loadDocs = () => api('/api/docs').then(setDocs, fail)
  useEffect(() => { loadDocs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = k => e => setForm({ ...form, [k]: e.target.value })
  const mine = docs.filter(d => d.industry === g.industry && d.workflowType === g.workflowType)

  const upload = e => {
    e.preventDefault()
    run(`Uploading ${file.name}`, async () => {
      const body = new FormData()
      body.append('file', file)
      Object.entries(form).forEach(([k, v]) => body.append(k, v.trim()))
      const d = await api('/api/docs', { method: 'POST', body })
      await Promise.all([loadDocs(), onUploaded(`${d.industry}/${d.workflowType}`)])
      e.target.reset(); setFile(null); setForm({ ...form, docId: '' })
      return `Uploaded ${d.docId}. Click Generate blueprint for ${d.industry} · ${d.workflowType} to include it (only the new doc is sent to the AI).`
    })
  }

  const text = (label, k, placeholder) => (
    <Field label={label}><Input required pattern="[A-Za-z0-9-]{1,64}" placeholder={placeholder} value={form[k]} onChange={set(k)} /></Field>
  )

  return (
    <>
      <H2 count={mine.length}>Source implementations</H2>
      <Table className="border">
        <TableHeader><TableRow><TableHead>Doc</TableHead><TableHead>File</TableHead><TableHead>Country</TableHead></TableRow></TableHeader>
        <TableBody>
          {mine.map(d => (
            <TableRow key={d.docId}>
              <TableCell><Button variant="link" className={LINK} onClick={() => openDoc(d.docId)}>{d.docId}</Button></TableCell>
              <TableCell>{d.filename}</TableCell><TableCell>{d.geography}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <H2 className="mt-6">Add an implementation document</H2>
      <form className="mb-6 grid max-w-4xl grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-2.5" onSubmit={upload}>
        <Field label="File (.md, .txt, .pdf, .docx, .pptx)">
          <Input type="file" required accept=".md,.txt,.pdf,.docx,.pptx" onChange={e => setFile(e.target.files[0] || null)} />
        </Field>
        {text('Doc ID', 'docId', 'e.g. AIR-007')}
        {text('Country', 'geography', 'e.g. US')}
        {text('Industry', 'industry')}
        {text('Workflow type', 'workflowType')}
        <div><Button type="submit" disabled={busy}>Upload</Button></div>
      </form>
    </>
  )
}

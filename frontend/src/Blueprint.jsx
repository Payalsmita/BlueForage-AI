import { useState } from 'react'
import { KIND, api, groupPath, json, pct } from './api.js'
import { COLS, Empty, Ev, EvList, H2, ID, LINK, More, Pill } from './Panels.jsx'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'

export default function Blueprint({ bp, setBp, g, openDoc, fail }) {
  if (!bp) return (
    <Empty>
      No blueprint yet for <b>{g.industry} / {g.workflowType}</b> ({g.docCount} source implementations).<br />
      Click <b>Generate blueprint</b>.
    </Empty>
  )

  const review = async (id, status, editedDetail) => {
    try {
      setBp(await api(`/api/blueprints/${groupPath(g)}/items/${encodeURIComponent(id)}`, { ...json({ status, editedDetail }), method: 'PATCH' }))
    } catch (e) { fail(e) }
  }
  const counts = bp.items.reduce((a, i) => ({ ...a, [i.status]: (a[i.status] || 0) + 1 }), {})
  const base = `/api/blueprints/${groupPath(g)}`
  const a = 'underline underline-offset-2 hover:text-foreground'

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground">
        <span><b className="text-foreground">{bp.items.length}</b> items from <b className="text-foreground">{bp.sourceDocIds.length}</b> implementations</span>
        <span>{['APPROVED', 'EDITED', 'PENDING', 'REJECTED'].map(s => `${s.toLowerCase()} ${counts[s] || 0}`).join(' · ')}</span>
        <span>Export (approved + edited):{' '}
          <a className={a} href={`${base}/export.md`} target="_blank" rel="noreferrer">Markdown</a> ·{' '}
          <a className={a} href={`${base}/export.json`} target="_blank" rel="noreferrer">JSON</a> ·{' '}
          <a className={a} href={`${base}/export.icims.json`} target="_blank" rel="noreferrer">iCIMS config (mock)</a>
        </span>
      </div>
      <OrderConflicts conflicts={bp.orderConflicts} />
      <div className={COLS}>
        {Object.keys(KIND).map(k => {
          const items = bp.items.filter(i => i.kind === k)
          return (
            <div key={k} className="grid gap-2.5">
              <H2 count={items.length} className="mb-0">{KIND[k]}</H2>
              {items.map(i => <ItemCard key={i.id} item={i} review={review} openDoc={openDoc} />)}
            </div>
          )
        })}
      </div>
    </>
  )
}

function OrderConflicts({ conflicts }) {
  if (!conflicts?.length) return null
  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <AlertTitle className="text-amber-800 dark:text-amber-300">Order differences ({conflicts.length})</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4 text-foreground">
          {conflicts.map((c, n) => (
            <li key={n}>
              <b>{c.stageA}</b> before <b>{c.stageB}</b> in {(c.aFirstDocIds || []).join(', ') || '—'}
              {' · '}after in {(c.bFirstDocIds || []).join(', ') || '—'}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function ItemCard({ item: i, review, openDoc }) {
  const [editing, setEditing] = useState(false)
  const current = i.status === 'EDITED' ? i.editedDetail : i.detail
  const [draft, setDraft] = useState(current)
  const share = i.support / i.total

  return (
    <Card size="sm" className={cn(i.status === 'REJECTED' && 'opacity-55')}>
      <CardContent className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={ID}>{i.id}</span>
          <span className="font-semibold">{i.name}</span>
          <span className="ml-auto flex gap-1">
            {i.support === 1 && i.total > 2 && <Pill v="UNIQUE" title="Seen at only one company">unique practice</Pill>}
            <Pill v={i.status} />
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Progress value={share * 100} aria-label={pct(share)} className="flex-1" />
          {i.support}/{i.total} implementations
        </div>
        <div className="flex flex-wrap gap-1">
          {(i.geoSupport || []).map(gs => (
            <span key={gs.geography} title={`${gs.support} of ${gs.total} in ${gs.geography}`}
                  className={cn('border px-1.5 text-[11px] text-muted-foreground',
                    gs.support === gs.total && 'border-primary text-foreground', gs.support === 0 && 'line-through opacity-60')}>
              {gs.geography} {gs.support}/{gs.total}
            </span>
          ))}
        </div>
        {i.aliases?.length > 0 && <div className="text-xs text-muted-foreground">Also called: {i.aliases.join(', ')}</div>}
        {i.approvers?.length > 0 && <div className="text-xs text-muted-foreground">Approvers: {i.approvers.join(', ')}</div>}
        {editing
          ? <Textarea className="min-h-20" aria-label="Edited description" autoFocus value={draft} onChange={e => setDraft(e.target.value)} />
          : <div>{current}</div>}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {editing ? <>
            <Button size="sm" onClick={() => { setEditing(false); review(i.id, 'EDITED', draft) }}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setDraft(current) }}>Cancel</Button>
          </> : <>
            <Button size="sm" variant="outline" onClick={() => review(i.id, 'APPROVED')}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => { setDraft(current); setEditing(true) }}>Edit</Button>
            <Button size="sm" variant="outline" onClick={() => review(i.id, 'REJECTED')}>Reject</Button>
          </>}
        </div>
        <More title={`Evidence (${i.evidence.length})`}>
          <EvList>
            {i.evidence.map((e, n) => (
              <Ev key={n}>“{e.quote}” — <Button variant="link" className={LINK} onClick={() => openDoc(e.docId, e.quote)}>{e.docId}</Button></Ev>
            ))}
          </EvList>
        </More>
      </CardContent>
    </Card>
  )
}

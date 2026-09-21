'use client'

import { useEffect, useMemo, useState } from 'react'
import { CallerObservation, TriState, rankCallers, scoreCaller } from '@/lib/reputation'
import s from './remora.module.css'

type Trader={address:string;label:string;realizedPnl:number;unrealizedPnl:number;totalPnl:number;volumeUsd:number;trades:number;tags:string[]}

const STORAGE='remora_caller_reputation_v1'
const triOptions=[['unknown','Unknown'],['yes','Yes'],['no','No']] as const

function pct(v:number|null){return v===null?'—':(v*100).toFixed(0)+'%'}
function moneyPct(v:number|null){return v===null?'—':(v>=0?'+':'')+v.toFixed(1)+'%'}
function short(v:string){return v.length>15?v.slice(0,7)+'…'+v.slice(-5):v}

export default function ReputationPanel({tokenSymbol,traders}:{tokenSymbol:string;traders:Trader[]}){
  const [rows,setRows]=useState<CallerObservation[]>([])
  const [wallet,setWallet]=useState('')
  const [source,setSource]=useState<CallerObservation['source']>('gmgn')
  const [entry,setEntry]=useState<TriState>('unknown')
  const [dump,setDump]=useState<TriState>('unknown')
  const [rugged,setRugged]=useState<TriState>('unknown')
  const [roi,setRoi]=useState('')
  const [thesis,setThesis]=useState('')
  const [note,setNote]=useState('')
  const [open,setOpen]=useState(false)

  useEffect(()=>{
    try{setRows(JSON.parse(localStorage.getItem(STORAGE)||'[]'))}catch{}
  },[])
  useEffect(()=>{
    if(!wallet&&traders[0]?.address)setWallet(traders[0].address)
  },[traders,wallet])

  const reputation=useMemo(()=>wallet?scoreCaller(wallet,rows):null,[wallet,rows])
  const ranking=useMemo(()=>rankCallers(rows).slice(0,5),[rows])

  function saveRows(next:CallerObservation[]){
    setRows(next)
    localStorage.setItem(STORAGE,JSON.stringify(next))
  }
  function add(){
    const w=wallet.trim()
    if(!w)return
    const roiValue=roi.trim()===''?null:Number(roi)
    const thesisValue=thesis.trim()===''?null:Math.max(1,Math.min(5,Number(thesis)))
    const obs:CallerObservation={
      id:crypto.randomUUID(),
      wallet:w,
      source,
      tokenSymbol,
      recordedAt:new Date().toISOString(),
      entryBeforeCall:entry,
      dumpAfterCall:dump,
      rugged,
      roiPct:Number.isFinite(roiValue as number)?roiValue:null,
      thesisScore:Number.isFinite(thesisValue as number)?thesisValue:null,
      note:note.trim(),
    }
    saveRows([obs,...rows])
    setRoi('');setThesis('');setNote('');setEntry('unknown');setDump('unknown');setRugged('unknown')
  }

  return <div className={s.reputationBox}>
    <div className={s.repHeader}>
      <div><p className={s.eyebrow}>CALLER REPUTATION DATABASE</p><h4>{reputation?reputation.status:'SELECT / ENTER WALLET'}</h4></div>
      <button className={s.repToggle} onClick={()=>setOpen(v=>!v)}>{open?'Close observation':'Add observation'}</button>
    </div>

    <div className={s.repWallet}>
      <input value={wallet} onChange={e=>setWallet(e.target.value)} placeholder="Caller / wallet address"/>
      {traders.length>0&&<select value={wallet} onChange={e=>setWallet(e.target.value)}><option value="">Birdeye trader…</option>{traders.map(t=><option key={t.address} value={t.address}>{t.label||short(t.address)}</option>)}</select>}
    </div>

    {reputation&&<div className={s.repScoreGrid}>
      <div className={s.repBig}><strong>{reputation.sampleSize?reputation.score:'—'}</strong><span>Reputation</span></div>
      <div><span>Confidence</span><strong>{reputation.confidence}%</strong></div>
      <div><span>Sample</span><strong>{reputation.sampleSize}</strong></div>
      <div><span>Win rate</span><strong>{pct(reputation.winRate)}</strong></div>
      <div><span>Median ROI</span><strong>{moneyPct(reputation.medianRoi)}</strong></div>
      <div><span>Entry before call</span><strong>{pct(reputation.entryBeforeCallRate)}</strong></div>
      <div><span>Post-call dump</span><strong>{pct(reputation.dumpAfterCallRate)}</strong></div>
      <div><span>Rug exposure</span><strong>{pct(reputation.rugExposureRate)}</strong></div>
    </div>}

    {reputation?.flags.length?<div className={s.repFlags}>{reputation.flags.map(f=><span key={f}>{f}</span>)}</div>:null}

    {open&&<div className={s.repForm}>
      <div><label>Source</label><select value={source} onChange={e=>setSource(e.target.value as CallerObservation['source'])}><option value="gmgn">GMGN</option><option value="fomo">FOMO</option><option value="birdeye">Birdeye</option><option value="nansen">Nansen</option><option value="manual">Manual verification</option></select></div>
      <div><label>Entry before public call?</label><select value={entry} onChange={e=>setEntry(e.target.value as TriState)}>{triOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div><label>Dumped after call?</label><select value={dump} onChange={e=>setDump(e.target.value as TriState)}>{triOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div><label>Rug / scam exposure?</label><select value={rugged} onChange={e=>setRugged(e.target.value as TriState)}>{triOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div><label>Observed ROI %</label><input type="number" step="0.1" value={roi} onChange={e=>setRoi(e.target.value)} placeholder="e.g. 38.5"/></div>
      <div><label>Thesis quality 1–5</label><input type="number" min="1" max="5" value={thesis} onChange={e=>setThesis(e.target.value)} placeholder="optional"/></div>
      <div className={s.repWide}><label>Verification note</label><input value={note} onChange={e=>setNote(e.target.value)} placeholder="What did you verify on GMGN/FOMO/Nansen?"/></div>
      <button className={s.repSave} onClick={add} disabled={!wallet.trim()}>Save verified observation</button>
    </div>}

    {ranking.length>0&&<div className={s.repRanking}><p className={s.eyebrow}>LOCAL REPUTATION LEADERBOARD</p>{ranking.map(r=><button key={r.wallet} onClick={()=>setWallet(r.wallet)}><span>{short(r.wallet)}</span><b>{r.score}</b><small>{r.sampleSize} obs · {r.status}</small></button>)}</div>}

    <p className={s.repNote}>This database stores verified observations in this browser only. Scores are evidence-weighted and shrink toward neutral when the sample is small; they are not proof that a caller will be profitable in the future.</p>
  </div>
}

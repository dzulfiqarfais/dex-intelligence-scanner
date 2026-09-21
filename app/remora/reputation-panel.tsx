'use client'

import { useEffect, useMemo, useState } from 'react'
import { CallerObservation, TriState, rankCallers, scoreCaller } from '@/lib/reputation'
import s from './remora.module.css'

type Trader={address:string;label:string;realizedPnl:number;unrealizedPnl:number;totalPnl:number;volumeUsd:number;trades:number;tags:string[]}

const STORAGE='remora_caller_reputation_v1'
const KEY_STORAGE='remora_db_key'
const triOptions=[['unknown','Unknown'],['yes','Yes'],['no','No']] as const

function pct(v:number|null){return v===null?'—':(v*100).toFixed(0)+'%'}
function moneyPct(v:number|null){return v===null?'—':(v>=0?'+':'')+v.toFixed(1)+'%'}
function short(v:string){return v.length>15?v.slice(0,7)+'…'+v.slice(-5):v}
function tri(v:any):TriState{return v===true?'yes':v===false?'no':'unknown'}

function fromDb(row:any):CallerObservation{
  return{
    id:String(row.client_id||row.id),
    wallet:String(row.wallet||''),
    source:row.source||'manual',
    tokenSymbol:String(row.token_symbol||'UNKNOWN'),
    recordedAt:String(row.recorded_at||new Date().toISOString()),
    entryBeforeCall:tri(row.entry_before_call),
    dumpAfterCall:tri(row.dump_after_call),
    rugged:tri(row.rugged),
    roiPct:row.roi_pct===null||row.roi_pct===undefined?null:Number(row.roi_pct),
    thesisScore:row.thesis_score===null||row.thesis_score===undefined?null:Number(row.thesis_score),
    note:String(row.note||''),
  }
}

function mergeRows(a:CallerObservation[],b:CallerObservation[]){
  const map=new Map<string,CallerObservation>()
  for(const row of [...b,...a]) map.set(row.id,row)
  return [...map.values()].sort((x,y)=>new Date(y.recordedAt).getTime()-new Date(x.recordedAt).getTime())
}

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
  const [dbKey,setDbKey]=useState('')
  const [cloudStatus,setCloudStatus]=useState<'locked'|'checking'|'connected'|'error'>('locked')
  const [cloudMessage,setCloudMessage]=useState('Cloud database locked')

  useEffect(()=>{
    try{
      const local=JSON.parse(localStorage.getItem(STORAGE)||'[]')
      setRows(Array.isArray(local)?local:[])
      const savedKey=localStorage.getItem(KEY_STORAGE)||''
      setDbKey(savedKey)
      if(savedKey) void connectCloud(savedKey,Array.isArray(local)?local:[])
    }catch{}
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function cloud(action:string,payload:Record<string,unknown>={},keyOverride?:string){
    const key=(keyOverride??dbKey).trim()
    if(!key) throw new Error('Enter Remora DB Key')
    const res=await fetch('/api/reputation',{
      method:'POST',
      headers:{'content-type':'application/json','x-remora-key':key},
      body:JSON.stringify({action,...payload}),
      cache:'no-store',
    })
    const json=await res.json()
    if(!res.ok) throw new Error(json.error||'Cloud database request failed')
    return json
  }

  async function connectCloud(keyOverride?:string,localRows?:CallerObservation[]){
    const key=(keyOverride??dbKey).trim()
    if(!key){setCloudStatus('locked');setCloudMessage('Enter Remora DB Key');return}
    setCloudStatus('checking');setCloudMessage('Checking secure cloud…')
    try{
      await cloud('health',{},key)
      const result=await cloud('list',{limit:1000},key)
      const serverRows=Array.isArray(result.observations)?result.observations.map(fromDb):[]
      const merged=mergeRows(localRows??rows,serverRows)
      saveRows(merged)
      localStorage.setItem(KEY_STORAGE,key)
      setDbKey(key)
      setCloudStatus('connected')
      setCloudMessage('Cloud DB connected · '+serverRows.length+' server observations')
    }catch(error){
      setCloudStatus('error')
      setCloudMessage(error instanceof Error?error.message:'Cloud connection failed')
    }
  }

  async function syncAll(){
    if(!dbKey.trim())return
    setCloudStatus('checking');setCloudMessage('Syncing local observations…')
    try{
      const result=await cloud('bulk',{observations:rows})
      setCloudStatus('connected')
      setCloudMessage('Synced '+Number(result.count||0)+' observations to cloud')
      const fresh=await cloud('list',{limit:1000})
      const serverRows=Array.isArray(fresh.observations)?fresh.observations.map(fromDb):[]
      saveRows(mergeRows(rows,serverRows))
    }catch(error){
      setCloudStatus('error')
      setCloudMessage(error instanceof Error?error.message:'Sync failed')
    }
  }

  async function add(){
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
    const next=[obs,...rows]
    saveRows(next)
    setRoi('');setThesis('');setNote('');setEntry('unknown');setDump('unknown');setRugged('unknown')

    if(dbKey.trim()){
      try{
        await cloud('save',{observation:obs})
        setCloudStatus('connected')
        setCloudMessage('Observation saved locally + cloud')
      }catch(error){
        setCloudStatus('error')
        setCloudMessage('Saved locally; cloud failed: '+(error instanceof Error?error.message:'unknown error'))
      }
    }
  }

  function disconnect(){
    localStorage.removeItem(KEY_STORAGE)
    setDbKey('')
    setCloudStatus('locked')
    setCloudMessage('Cloud database locked')
  }

  return <div className={s.reputationBox}>
    <div className={s.repHeader}>
      <div><p className={s.eyebrow}>CALLER REPUTATION DATABASE</p><h4>{reputation?reputation.status:'SELECT / ENTER WALLET'}</h4></div>
      <button className={s.repToggle} onClick={()=>setOpen(v=>!v)}>{open?'Close observation':'Add observation'}</button>
    </div>

    <div className={s.cloudBar}>
      <div className={s.cloudKeyWrap}><input type="password" value={dbKey} onChange={e=>setDbKey(e.target.value)} placeholder="Remora DB Key"/><button onClick={()=>void connectCloud()} disabled={cloudStatus==='checking'}>{cloudStatus==='checking'?'Checking…':'Connect'}</button></div>
      <div className={s.cloudState+' '+(cloudStatus==='connected'?s.cloudGood:cloudStatus==='error'?s.cloudBad:'')}><span>{cloudStatus.toUpperCase()}</span><small>{cloudMessage}</small></div>
      {cloudStatus==='connected'&&<div className={s.cloudActions}><button onClick={()=>void syncAll()}>Sync local → cloud</button><button onClick={disconnect}>Lock</button></div>}
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
      <button className={s.repSave} onClick={()=>void add()} disabled={!wallet.trim()}>Save verified observation</button>
    </div>}

    {ranking.length>0&&<div className={s.repRanking}><p className={s.eyebrow}>REPUTATION LEADERBOARD</p>{ranking.map(r=><button key={r.wallet} onClick={()=>setWallet(r.wallet)}><span>{short(r.wallet)}</span><b>{r.score}</b><small>{r.sampleSize} obs · {r.status}</small></button>)}</div>}

    <p className={s.repNote}>Local cache remains available offline. When the cloud key is connected, observations are synced to the dedicated Remora Supabase project and can be recovered on another device with the same key.</p>
  </div>
}

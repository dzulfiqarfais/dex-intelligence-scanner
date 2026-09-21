'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import s from './remora.module.css'
import ReputationPanel from './reputation-panel'

type CandidateLike={
  tokenAddress:string|null
  chain?:string|null
  platform:string|null
  symbol:string
  slug:string
  cmcUrl:string
  marketCap:number
  volumeToMarketCap:number
  fdvToMarketCap:number
  change1h:number
  change24h:number
  behavior:{state:string;activeWhaleBuyers:number;activeSmartMoneyBuyers:number;whaleNetFlowUsd:number;smartMoneyNetFlowUsd:number}
  security:{status:string}
}
type Provider={id:string;name:string;status:string;role:string;note:string;url:string}
type Trader={address:string;label:string;realizedPnl:number;unrealizedPnl:number;totalPnl:number;volumeUsd:number;trades:number;tags:string[]}
type Intel={
  generatedAt:string
  verifiedProviderCount:number
  providerCount:number
  provenanceScore:number
  professionalConsensus:string
  signalStatus:string
  publicCallerThesis:string|null
  publicCallerThesisStatus:string
  inferredThesis:string
  whyNow:string[]
  professionalTraders:Trader[]
  evidence:string[]
  conflicts:string[]
  providers:Provider[]
  caveats:string[]
  error?:string
}

function money(v:number){
  if(!Number.isFinite(v))return '$0'
  if(Math.abs(v)>=1e9)return (v<0?'-$':'$')+(Math.abs(v)/1e9).toFixed(2)+'B'
  if(Math.abs(v)>=1e6)return (v<0?'-$':'$')+(Math.abs(v)/1e6).toFixed(2)+'M'
  if(Math.abs(v)>=1e3)return (v<0?'-$':'$')+(Math.abs(v)/1e3).toFixed(1)+'K'
  return (v<0?'-$':'$')+Math.abs(v).toFixed(0)
}
function short(a:string){return a.length>14?a.slice(0,6)+'…'+a.slice(-4):a}
function statusLabel(v:string){
  return v==='qualified_for_monitoring'?'QUALIFIED FOR MONITORING':v==='blocked'?'BLOCKED':'RESEARCH MORE'
}

export default function SourcePanel({candidate}:{candidate:CandidateLike}){
  const [intel,setIntel]=useState<Intel|null>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const savedProvenance=useRef('')

  const query=useMemo(()=>{
    useEffect(()=>{
    if(!intel||!candidate.tokenAddress)return
    const key=localStorage.getItem('remora_db_key')||''
    if(!key)return
    const marker=candidate.tokenAddress+':'+intel.generatedAt
    if(savedProvenance.current===marker)return
    savedProvenance.current=marker
    void fetch('/api/reputation',{
      method:'POST',
      headers:{'content-type':'application/json','x-remora-key':key},
      body:JSON.stringify({action:'provenance',payload:{
        tokenAddress:candidate.tokenAddress,
        chain:candidate.platform,
        symbol:candidate.symbol,
        provenanceScore:intel.provenanceScore,
        professionalConsensus:intel.professionalConsensus,
        signalStatus:intel.signalStatus,
        inferredThesis:intel.inferredThesis,
        publicCallerThesis:intel.publicCallerThesis,
        providers:intel.providers,
        evidence:intel.evidence,
        conflicts:intel.conflicts,
        snapshot:{marketCap:candidate.marketCap,volumeToMarketCap:candidate.volumeToMarketCap,fdvToMarketCap:candidate.fdvToMarketCap,change1h:candidate.change1h,change24h:candidate.change24h,behavior:candidate.behavior,security:candidate.security},
        capturedAt:intel.generatedAt,
      }})
    }).catch(()=>{})
  },[intel,candidate])

  if(!candidate.tokenAddress)return ''
    const q=new URLSearchParams({
      tokenAddress:candidate.tokenAddress,
      chain:candidate.platform||'solana',
      symbol:candidate.symbol,
      slug:candidate.slug,
      cmcUrl:candidate.cmcUrl,
      marketCap:String(candidate.marketCap),
      volumeToMarketCap:String(candidate.volumeToMarketCap),
      fdvToMarketCap:String(candidate.fdvToMarketCap),
      change1h:String(candidate.change1h),
      change24h:String(candidate.change24h),
      behavior:candidate.behavior.state,
      whaleBuyers:String(candidate.behavior.activeWhaleBuyers),
      smartBuyers:String(candidate.behavior.activeSmartMoneyBuyers),
      whaleNetFlow:String(candidate.behavior.whaleNetFlowUsd),
      smartNetFlow:String(candidate.behavior.smartMoneyNetFlowUsd),
      security:candidate.security.status,
    })
    return q.toString()
  },[candidate])

  useEffect(()=>{
    if(!query){setIntel(null);return}
    let active=true
    setLoading(true);setError('')
    fetch('/api/source-intelligence?'+query,{cache:'no-store'})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'Source Intelligence failed');return j as Intel})
      .then(j=>{if(active)setIntel(j)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Source Intelligence failed')})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[query])

  if(!candidate.tokenAddress)return <section className={s.sourceBox}><p className={s.eyebrow}>SOURCE INTELLIGENCE</p><p className={s.sourceMuted}>Contract address unavailable, so professional-source verification cannot run for this asset.</p></section>
  if(loading&&!intel)return <section className={s.sourceBox}><p className={s.eyebrow}>SOURCE INTELLIGENCE</p><p className={s.sourceMuted}>Investigating professional-source evidence…</p></section>
  if(error)return <section className={s.sourceBox}><p className={s.eyebrow}>SOURCE INTELLIGENCE</p><p className={s.sourceError}>{error}</p></section>
  if(!intel)return null

  return <section className={s.sourceBox}>
    <div className={s.sourceHeader}>
      <div><p className={s.eyebrow}>SOURCE INTELLIGENCE</p><h4>{statusLabel(intel.signalStatus)}</h4></div>
      <div className={s.provenance}><strong>{intel.provenanceScore}</strong><span>Provenance</span></div>
    </div>

    <div className={s.sourceKpis}>
      <div><span>Consensus</span><strong>{intel.professionalConsensus.toUpperCase()}</strong></div>
      <div><span>Verified sources</span><strong>{intel.verifiedProviderCount}/{intel.providerCount}</strong></div>
      <div><span>Public thesis</span><strong>{intel.publicCallerThesis?'VERIFIED':'NOT AVAILABLE'}</strong></div>
    </div>

    <div className={s.thesis}>
      <span>Remora Inferred Thesis</span>
      <p>{intel.inferredThesis}</p>
    </div>

    <div className={s.sourceSection}>
      <p className={s.eyebrow}>WHY NOW?</p>
      {intel.whyNow.length?intel.whyNow.slice(0,5).map(x=><div className={s.evidenceRow} key={x}><b>+</b><span>{x}</span></div>):<p className={s.sourceMuted}>No strong rationale generated yet.</p>}
    </div>

    {intel.professionalTraders.length>0&&<div className={s.sourceSection}>
      <p className={s.eyebrow}>BIRDEYE PROFESSIONAL-WALLET CHECK</p>
      {intel.professionalTraders.slice(0,5).map(t=><div className={s.traderRow} key={t.address}>
        <div><strong>{t.label||short(t.address)}</strong><span>{t.tags.length?t.tags.join(' · '):'top trader'}</span></div>
        <div><b className={t.realizedPnl>=0?s.pos:s.neg}>{money(t.realizedPnl)}</b><span>realized</span></div>
      </div>)}
    </div>}

    <div className={s.sourceSection}>
      <p className={s.eyebrow}>EVIDENCE / CONFLICT</p>
      {intel.evidence.slice(0,5).map(x=><div className={s.evidenceRow} key={'e'+x}><b>✓</b><span>{x}</span></div>)}
      {intel.conflicts.slice(0,5).map(x=><div className={s.conflictRow} key={'c'+x}><b>!</b><span>{x}</span></div>)}
    </div>

    <div className={s.providerGrid}>
      {intel.providers.map(p=><a key={p.id} href={p.url} target="_blank" rel="noreferrer" className={s.providerCard}>
        <div><strong>{p.name}</strong><span>{p.role}</span></div>
        <b className={p.status==='connected'?s.pos:p.status==='error'?s.neg:s.caution}>{p.status.replace('_',' ').toUpperCase()}</b>
        <small>{p.note}</small>
      </a>)}
    </div>

    <ReputationPanel tokenSymbol={candidate.symbol} traders={intel.professionalTraders}/>

    {!intel.publicCallerThesis&&<p className={s.sourceWarning}><strong>Public thesis intentionally blank.</strong> FOMO/GMGN caller text is not being scraped or invented. When an official source/API is connected, the exact call/thesis can be attached here with timestamp and entry-before-call analysis.</p>}
  </section>
}

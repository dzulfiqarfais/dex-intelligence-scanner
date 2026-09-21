'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import s from './remora.module.css'

type Actor={address:string;label:string;role:'whale'|'smart_money';status:'new_entry'|'adding'|'distribution'|'holding';buyUsd:number;sellUsd:number;netUsd:number;holdingPct:number;lastActiveTime:number|null;spotOpenTs:number|null;explorerUrl:string|null}
type Behavior={state:'accumulation'|'distribution'|'mixed'|'quiet'|'unavailable';newWhaleEntries:number;addingWhales:number;distributingWhales:number;activeWhaleBuyers:number;activeSmartMoneyBuyers:number;whaleNetFlowUsd:number;smartMoneyNetFlowUsd:number;multiWhaleAccumulation:boolean;actors:Actor[];note:string}
type Security={status:'pass'|'caution'|'fail'|'unknown';securityLevel:string|null;honeypot:string|null;verified:string|null;mintable:string|null;freezable:string|null;rugPull:string|null;fakeToken:string|null;buyTax:number|null;sellTax:number|null;flags:string[]}
type Whale={status:'confirmed'|'probable'|'none'|'unavailable';largeBuyCount:number;largestBuyUsd:number;taggedWhaleCount:number;activeNetBuyWhales:number;thresholdUsd:number;lastLargeBuyAt:number|null;note:string}
type Candidate={id:number;name:string;symbol:string;slug:string;cmcRank:number;priceUsd:number;marketCap:number;fdv:number;volume24h:number;volumeToMarketCap:number;fdvToMarketCap:number;circulatingRatio:number;change1h:number;change24h:number;change7d:number;marketPairs:number;ageDays:number;tokenAddress:string|null;platform:string|null;platformName:string|null;baseScore:number;riskScore:number;remoraScore:number;finalScore:number;flags:string[];whale:Whale;behavior:Behavior;security:Security;alertEligible:boolean;cmcUrl:string;dexUrl:string|null}
type Api={generatedAt:string;authMode:'keyed'|'keyless';recommendedRefreshSeconds:number;intelligenceEnrichedCount:number;telegramConfigured:boolean;candidates:Candidate[];error?:string}
type Snapshot={at:number;whaleFlow:number;smartFlow:number;buyers:number;smartBuyers:number}
type Delta={whaleFlow:number;smartFlow:number;buyers:number;smartBuyers:number}

function money(v:number){if(!Number.isFinite(v))return '$0';if(Math.abs(v)>=1e9)return (v<0?'-$':'$')+(Math.abs(v)/1e9).toFixed(2)+'B';if(Math.abs(v)>=1e6)return (v<0?'-$':'$')+(Math.abs(v)/1e6).toFixed(2)+'M';if(Math.abs(v)>=1e3)return (v<0?'-$':'$')+(Math.abs(v)/1e3).toFixed(1)+'K';return (v<0?'-$':'$')+Math.abs(v).toFixed(v<1?5:2)}
function price(v:number){if(!v)return '$0';if(v<.000001)return '$'+v.toExponential(3);if(v<.01)return '$'+v.toFixed(8);return '$'+v.toLocaleString(undefined,{maximumFractionDigits:6})}
function clsScore(v:number){return v>=75?s.high:v>=55?s.mid:s.low}
function flowClass(v:number){return v>0?s.pos:v<0?s.neg:''}
function whaleLabel(v:Whale['status']){return v==='confirmed'?'WHALE ✓':v==='probable'?'WHALE ?':v==='none'?'No whale':'N/A'}
function securityLabel(v:Security['status']){return v==='pass'?'PASS':v==='caution'?'CAUTION':v==='fail'?'BLOCK':'UNKNOWN'}
function behaviorLabel(v:Behavior['state']){return v==='accumulation'?'ACCUMULATION':v==='distribution'?'DISTRIBUTION':v==='mixed'?'MIXED':v==='quiet'?'QUIET':'N/A'}
function actorLabel(v:Actor['status']){return v==='new_entry'?'NEW ENTRY':v==='adding'?'ADDING':v==='distribution'?'EXIT / SELL':'HOLDING'}

export default function Remora(){
  const [coins,setCoins]=useState<Candidate[]>([])
  const [selected,setSelected]=useState<Candidate|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [updated,setUpdated]=useState<Date|null>(null)
  const [auto,setAuto]=useState(true)
  const [refreshSec,setRefreshSec]=useState(120)
  const [authMode,setAuthMode]=useState<'keyed'|'keyless'>('keyless')
  const [telegram,setTelegram]=useState(false)
  const [alerts,setAlerts]=useState(false)
  const [search,setSearch]=useState('')
  const [maxCap,setMaxCap]=useState(250_000_000)
  const [minScore,setMinScore]=useState(55)
  const [minRatio,setMinRatio]=useState(.1)
  const [signalOnly,setSignalOnly]=useState(false)
  const [watchlist,setWatchlist]=useState<number[]>([])
  const [deltas,setDeltas]=useState<Record<number,Delta>>({})
  const notified=useRef(new Set<string>())

  useEffect(()=>{
    try{setWatchlist(JSON.parse(localStorage.getItem('remora_watchlist')||'[]'));setAlerts(Notification.permission==='granted')}catch{}
  },[])

  const persistSnapshots=useCallback((items:Candidate[])=>{
    try{
      const previous=JSON.parse(localStorage.getItem('remora_v2_snapshots')||'{}') as Record<string,Snapshot>
      const next:Record<string,Snapshot>={}
      const ds:Record<number,Delta>={}
      for(const c of items){
        if(c.behavior.state==='unavailable') continue
        const cur:Snapshot={at:Date.now(),whaleFlow:c.behavior.whaleNetFlowUsd,smartFlow:c.behavior.smartMoneyNetFlowUsd,buyers:c.behavior.activeWhaleBuyers,smartBuyers:c.behavior.activeSmartMoneyBuyers}
        next[String(c.id)]=cur
        const old=previous[String(c.id)]
        if(old) ds[c.id]={whaleFlow:cur.whaleFlow-old.whaleFlow,smartFlow:cur.smartFlow-old.smartFlow,buyers:cur.buyers-old.buyers,smartBuyers:cur.smartBuyers-old.smartBuyers}
      }
      localStorage.setItem('remora_v2_snapshots',JSON.stringify({...previous,...next}))
      setDeltas(ds)
    }catch{}
  },[])

  const pushAlerts=useCallback((items:Candidate[])=>{
    if(Notification.permission!=='granted') return
    for(const c of items){
      if(!c.alertEligible) continue
      const key=[c.id,c.behavior.state,c.behavior.newWhaleEntries,c.behavior.activeSmartMoneyBuyers,c.whale.lastLargeBuyAt].join(':')
      if(notified.current.has(key)) continue
      notified.current.add(key)
      new Notification('Remora v2: '+c.symbol,{
        body:'Score '+c.finalScore+' · '+behaviorLabel(c.behavior.state)+' · Security '+securityLabel(c.security.status)+' · Whale buyers '+c.behavior.activeWhaleBuyers,
      })
    }
  },[])

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const qs=new URLSearchParams({maxMarketCap:String(maxCap),minVolume:'100000'})
      const res=await fetch('/api/remora?'+qs,{cache:'no-store'})
      const json:Api=await res.json()
      if(!res.ok) throw new Error(json.error||'Remora scan failed')
      setCoins(json.candidates||[]);setUpdated(new Date(json.generatedAt));setRefreshSec(json.recommendedRefreshSeconds||120);setAuthMode(json.authMode||'keyless');setTelegram(Boolean(json.telegramConfigured))
      setSelected(cur=>json.candidates.find(c=>c.id===cur?.id)||json.candidates[0]||null)
      persistSnapshots(json.candidates||[]);pushAlerts(json.candidates||[])
    }catch(e){setError(e instanceof Error?e.message:'Remora scan failed')}finally{setLoading(false)}
  },[maxCap,persistSnapshots,pushAlerts])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{if(!auto)return;const id=window.setInterval(()=>void load(),refreshSec*1000);return()=>window.clearInterval(id)},[auto,load,refreshSec])

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase()
    return coins.filter(c=>{
      const match=!q||c.symbol.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||(c.tokenAddress||'').toLowerCase().includes(q)
      return match&&c.finalScore>=minScore&&c.volumeToMarketCap>=minRatio&&(!signalOnly||c.alertEligible)
    })
  },[coins,search,minScore,minRatio,signalOnly])

  const stats=useMemo(()=>({
    alerts:filtered.filter(c=>c.alertEligible).length,
    accumulating:filtered.filter(c=>c.behavior.state==='accumulation').length,
    smart:filtered.filter(c=>c.behavior.activeSmartMoneyBuyers>0).length,
    blocked:filtered.filter(c=>c.security.status==='fail').length,
  }),[filtered])

  async function enableAlerts(){if(!('Notification'in window))return;setAlerts((await Notification.requestPermission())==='granted')}
  function toggleWatch(id:number){setWatchlist(prev=>{const n=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id];localStorage.setItem('remora_watchlist',JSON.stringify(n));return n})}

  return <main className={s.page}><div className={s.shell}>
    <header className={s.top}>
      <div className={s.brand}><div className={s.mark}>RM</div><div><p className={s.eyebrow}>WHALE BEHAVIOR INTELLIGENCE</p><h1>Remora Intelligence v2</h1></div></div>
      <nav className={s.nav}><a className={s.link} href="/">DEX Scanner</a><span className={s.link}>{authMode==='keyed'?'CMC KEYED':'CMC KEYLESS'}</span><button className={s.btn} onClick={enableAlerts}>{alerts?'Browser alerts ON':'Enable alerts'}</button></nav>
    </header>

    <section className={s.hero}>
      <div><p className={s.eyebrow}>COINMARKETCAP + HOLDER FLOW + SECURITY GATE</p><h2>Follow capital flow, not just green candles.</h2><p className={s.lede}>V2 memisahkan market opportunity, whale behavior, smart-money activity, dan token security. Alert hanya lolos bila skor cukup, security gate tidak gagal, dan ada bukti akumulasi/large-actor flow.</p></div>
      <div className={s.heroActions}><button className={s.btn+' '+s.btnPrimary} onClick={()=>void load()} disabled={loading}>{loading?'Scanning…':'Run v2 Scan'}</button><label className={s.link}><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Auto {refreshSec}s</label></div>
    </section>

    <section className={s.stats}>
      <article className={s.stat}><span>Alert eligible</span><strong>{stats.alerts}</strong><small>security gate passed</small></article>
      <article className={s.stat}><span>Accumulation</span><strong>{stats.accumulating}</strong><small>whale/smart-money net buy</small></article>
      <article className={s.stat}><span>Smart money active</span><strong>{stats.smart}</strong><small>current scan window</small></article>
      <article className={s.stat}><span>Security blocked</span><strong>{stats.blocked}</strong><small>excluded from alerts</small></article>
    </section>

    <section className={s.panel+' '+s.controls}>
      <div className={s.field+' '+s.wide}><label>Search</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Coin, symbol, contract"/></div>
      <div className={s.field}><label>Max market cap</label><select value={maxCap} onChange={e=>setMaxCap(Number(e.target.value))}><option value={20_000_000}>$20M</option><option value={50_000_000}>$50M</option><option value={100_000_000}>$100M</option><option value={250_000_000}>$250M</option><option value={500_000_000}>$500M</option></select></div>
      <div className={s.field}><label>Min score</label><select value={minScore} onChange={e=>setMinScore(Number(e.target.value))}><option value={0}>Any</option><option value={40}>40+</option><option value={55}>55+</option><option value={70}>70+</option><option value={80}>80+</option></select></div>
      <div className={s.field}><label>Min Vol / MC</label><select value={minRatio} onChange={e=>setMinRatio(Number(e.target.value))}><option value={0}>Any</option><option value={.05}>0.05x</option><option value={.1}>0.10x</option><option value={.2}>0.20x</option><option value={.5}>0.50x</option><option value={1}>1.00x</option></select></div>
      <div className={s.field}><label>Signal filter</label><select value={signalOnly?'yes':'no'} onChange={e=>setSignalOnly(e.target.value==='yes')}><option value="no">All candidates</option><option value="yes">Alert eligible only</option></select></div>
    </section>

    {error&&<div className={s.error}>{error}</div>}
    <div className={s.statusbar}><span>Browser: {alerts?'ON':'OFF'}</span><span>Telegram: {telegram?'READY':'NOT CONFIGURED'}</span><span>Local snapshot delta: ON</span><span>Updated: {updated?updated.toLocaleTimeString():'—'}</span></div>

    <section className={s.workspace}>
      <div className={s.panel+' '+s.tablePanel}>
        <div className={s.panelHead}><div><p className={s.eyebrow}>REMORA RADAR</p><h3>Capital-flow candidates</h3></div><span className={s.badge}>{filtered.length}/{coins.length}</span></div>
        <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Coin</th><th>Score</th><th>Behavior</th><th>Whale</th><th>Smart</th><th>Security</th><th>MC</th><th>Vol/MC</th><th>24h</th></tr></thead>
        <tbody>{filtered.map(c=><tr key={c.id} onClick={()=>setSelected(c)} className={selected?.id===c.id?s.selected:undefined}>
          <td><div className={s.token}><div className={s.coin}>{c.symbol.slice(0,2)}</div><div><strong>{c.symbol}{watchlist.includes(c.id)?' ★':''}</strong><span>{c.name}</span></div></div></td>
          <td><span className={s.score+' '+clsScore(c.finalScore)}>{c.finalScore}</span>{c.alertEligible&&<b className={s.signal}>ALERT</b>}</td>
          <td><span className={s.behavior+' '+(c.behavior.state==='accumulation'?s.acc:c.behavior.state==='distribution'?s.dist:'')}>{behaviorLabel(c.behavior.state)}</span></td>
          <td>{c.behavior.activeWhaleBuyers}{c.behavior.multiWhaleAccumulation?' 🐋🐋':''}</td><td>{c.behavior.activeSmartMoneyBuyers}</td>
          <td><span className={s.security+' '+(c.security.status==='pass'?s.pass:c.security.status==='fail'?s.fail:s.caution)}>{securityLabel(c.security.status)}</span></td>
          <td>{money(c.marketCap)}</td><td>{c.volumeToMarketCap.toFixed(2)}x</td><td className={c.change24h>=0?s.pos:s.neg}>{c.change24h>=0?'+':''}{c.change24h.toFixed(1)}%</td>
        </tr>)}</tbody></table></div>
      </div>

      <aside className={s.panel+' '+s.detail}>
        <div className={s.panelHead}><div><p className={s.eyebrow}>INTELLIGENCE INSPECTOR</p><h3>{selected?selected.symbol:'Select coin'}</h3></div></div>
        {selected?<>
          <div className={s.scores}><div><span>Final</span><strong>{selected.finalScore}</strong></div><div><span>Market</span><strong>{selected.remoraScore}</strong></div><div><span>Risk</span><strong>{selected.riskScore}</strong></div></div>
          <div className={s.metrics}><div><span>Price</span><strong>{price(selected.priceUsd)}</strong></div><div><span>Market cap</span><strong>{money(selected.marketCap)}</strong></div><div><span>FDV</span><strong>{money(selected.fdv)}</strong></div><div><span>24h volume</span><strong>{money(selected.volume24h)}</strong></div><div><span>Volume / MC</span><strong>{selected.volumeToMarketCap.toFixed(2)}x</strong></div><div><span>FDV / MC</span><strong>{selected.fdvToMarketCap.toFixed(2)}x</strong></div></div>

          <section className={s.intelBox}><div className={s.boxHead}><h4>{behaviorLabel(selected.behavior.state)}</h4><span>{selected.behavior.multiWhaleAccumulation?'MULTI-WHALE':''}</span></div><p>{selected.behavior.note}</p>
            <div className={s.metrics}><div><span>New whale entries</span><strong>{selected.behavior.newWhaleEntries}</strong></div><div><span>Whales adding</span><strong>{selected.behavior.addingWhales}</strong></div><div><span>Whales distributing</span><strong>{selected.behavior.distributingWhales}</strong></div><div><span>Smart-money buyers</span><strong>{selected.behavior.activeSmartMoneyBuyers}</strong></div><div><span>Whale net flow</span><strong className={flowClass(selected.behavior.whaleNetFlowUsd)}>{money(selected.behavior.whaleNetFlowUsd)}</strong></div><div><span>Smart-money net flow</span><strong className={flowClass(selected.behavior.smartMoneyNetFlowUsd)}>{money(selected.behavior.smartMoneyNetFlowUsd)}</strong></div></div>
            {deltas[selected.id]&&<p className={s.delta}>Δ previous local scan: whale flow {money(deltas[selected.id].whaleFlow)} · smart flow {money(deltas[selected.id].smartFlow)} · whale buyers {deltas[selected.id].buyers>=0?'+':''}{deltas[selected.id].buyers}</p>}
          </section>

          <section className={s.intelBox}><div className={s.boxHead}><h4>Security Gate: {securityLabel(selected.security.status)}</h4><span>{selected.security.securityLevel||''}</span></div>
            <div className={s.metrics}><div><span>Honeypot</span><strong>{selected.security.honeypot||'—'}</strong></div><div><span>Contract</span><strong>{selected.security.verified||'—'}</strong></div><div><span>Mint</span><strong>{selected.security.mintable||'—'}</strong></div><div><span>Freeze</span><strong>{selected.security.freezable||'—'}</strong></div><div><span>Rug pull</span><strong>{selected.security.rugPull||'—'}</strong></div><div><span>Fake token</span><strong>{selected.security.fakeToken||'—'}</strong></div></div>
            <div className={s.flags}>{selected.security.flags.map(x=><span key={x}>{x}</span>)}</div>
          </section>

          {selected.behavior.actors.length>0&&<section className={s.actors}><p className={s.eyebrow}>LARGE ACTORS</p>{selected.behavior.actors.map((a,i)=><a key={a.address+i} href={a.explorerUrl||'#'} target={a.explorerUrl?'_blank':undefined} rel="noreferrer"><div><strong>{a.role==='smart_money'?'SMART':'WHALE'} · {actorLabel(a.status)}</strong><span>{a.label}</span></div><b className={flowClass(a.netUsd)}>{money(a.netUsd)}</b></a>)}</section>}

          <div className={s.flags}>{selected.flags.map(f=><span key={f}>{f}</span>)}</div>
          <div className={s.buttons}><a className={s.action} href={selected.cmcUrl} target="_blank" rel="noreferrer">CMC Markets ↗</a>{selected.dexUrl?<a className={s.action} href={selected.dexUrl} target="_blank" rel="noreferrer">DEX Market ↗</a>:<span className={s.action}>No DEX contract</span>}</div>
          <button className={s.btn+' '+s.watch} onClick={()=>toggleWatch(selected.id)}>{watchlist.includes(selected.id)?'Remove from watchlist':'Add to watchlist'}</button>
          <p className={s.note}>{selected.alertEligible?'Alert condition is currently satisfied.':'Alert condition is not satisfied.'} Security status “pass” means no configured CMC security rule blocked this scan; it is not a guarantee of safety.</p>
        </>:<p className={s.note}>Choose a candidate.</p>}
      </aside>
    </section>

    <footer className={s.footer}><p>Remora v2 adalah intelligence filter, bukan auto-buy atau jaminan pergerakan harga. Whale/smart-money tags dan security data berasal dari CoinMarketCap/on-chain sources and can be incomplete. Verifikasi market depth, contract, wallet history, dan execution venue sebelum mengambil keputusan.</p></footer>
  </div></main>
}

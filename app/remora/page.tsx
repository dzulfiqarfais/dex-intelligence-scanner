'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import s from './remora.module.css'

type Whale={
  status:'confirmed'|'probable'|'none'|'unavailable'
  largeBuyCount:number
  largestBuyUsd:number
  taggedWhaleCount:number
  activeNetBuyWhales:number
  thresholdUsd:number
  lastLargeBuyAt:number|null
  note:string
}

type Candidate={
  id:number
  name:string
  symbol:string
  slug:string
  cmcRank:number
  priceUsd:number
  marketCap:number
  fdv:number
  volume24h:number
  volumeToMarketCap:number
  fdvToMarketCap:number
  circulatingRatio:number
  change1h:number
  change24h:number
  change7d:number
  marketPairs:number
  ageDays:number
  tokenAddress:string|null
  platform:string|null
  platformName:string|null
  baseScore:number
  riskScore:number
  remoraScore:number
  finalScore:number
  flags:string[]
  whale:Whale
  cmcUrl:string
  dexUrl:string|null
}

type ResponseData={
  generatedAt:string
  whaleEnrichedCount:number
  candidates:Candidate[]
  error?:string
}

function money(v:number){
  if(!Number.isFinite(v)) return '$0'
  if(v>=1e9) return '$'+(v/1e9).toFixed(2)+'B'
  if(v>=1e6) return '$'+(v/1e6).toFixed(2)+'M'
  if(v>=1e3) return '$'+(v/1e3).toFixed(1)+'K'
  return '$'+v.toFixed(v<1?5:2)
}
function price(v:number){
  if(!v) return '$0'
  if(v<.000001) return '$'+v.toExponential(3)
  if(v<.01) return '$'+v.toFixed(8)
  return '$'+v.toLocaleString(undefined,{maximumFractionDigits:6})
}
function scoreClass(v:number){return v>=75?s.high:v>=55?s.mid:s.low}
function whaleClass(v:Whale['status']){
  return v==='confirmed'?s.whaleConfirmed:v==='probable'?s.whaleProbable:s.whaleNone
}
function whaleLabel(v:Whale['status']){
  return v==='confirmed'?'WHALE ✓':v==='probable'?'WHALE ?':v==='none'?'No whale':'N/A'
}

export default function RemoraPage(){
  const [data,setData]=useState<Candidate[]>([])
  const [selected,setSelected]=useState<Candidate|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [updated,setUpdated]=useState<Date|null>(null)
  const [auto,setAuto]=useState(true)
  const [alerts,setAlerts]=useState(false)
  const [search,setSearch]=useState('')
  const [maxCap,setMaxCap]=useState(250_000_000)
  const [minScore,setMinScore]=useState(55)
  const [minRatio,setMinRatio]=useState(.1)
  const [whaleOnly,setWhaleOnly]=useState(false)
  const [watchlist,setWatchlist]=useState<number[]>([])
  const notified=useRef(new Set<string>())

  useEffect(()=>{
    try{
      setWatchlist(JSON.parse(localStorage.getItem('remora_watchlist')||'[]'))
      setAlerts(Notification.permission==='granted')
    }catch{}
  },[])

  const pushAlerts=useCallback((coins:Candidate[])=>{
    if(Notification.permission!=='granted') return
    for(const coin of coins){
      if(coin.finalScore<70) continue
      if(!['confirmed','probable'].includes(coin.whale.status)) continue
      const key=coin.id+':'+coin.whale.status+':'+coin.whale.lastLargeBuyAt
      if(notified.current.has(key)) continue
      notified.current.add(key)
      new Notification('Remora signal: '+coin.symbol,{
        body:'Score '+coin.finalScore+' · '+whaleLabel(coin.whale.status)+' · MC '+money(coin.marketCap)+' · Vol/MC '+coin.volumeToMarketCap.toFixed(2)+'x',
      })
    }
  },[])

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const qs=new URLSearchParams({maxMarketCap:String(maxCap),minVolume:'100000'})
      const res=await fetch('/api/remora?'+qs.toString(),{cache:'no-store'})
      const json:ResponseData=await res.json()
      if(!res.ok) throw new Error(json.error||'Remora scan failed')
      setData(json.candidates||[])
      setUpdated(new Date(json.generatedAt))
      setSelected(cur=>{
        if(!cur) return json.candidates?.[0]||null
        return json.candidates?.find(c=>c.id===cur.id)||json.candidates?.[0]||null
      })
      pushAlerts(json.candidates||[])
    }catch(e){
      setError(e instanceof Error?e.message:'Remora scan failed')
    }finally{setLoading(false)}
  },[maxCap,pushAlerts])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    if(!auto) return
    const id=window.setInterval(()=>void load(),60_000)
    return()=>window.clearInterval(id)
  },[auto,load])

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase()
    return data.filter(c=>{
      const match=!q||c.symbol.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||(c.tokenAddress||'').toLowerCase().includes(q)
      const whalePass=!whaleOnly||c.whale.status==='confirmed'||c.whale.status==='probable'
      return match&&c.finalScore>=minScore&&c.volumeToMarketCap>=minRatio&&whalePass
    })
  },[data,search,minScore,minRatio,whaleOnly])

  const stats=useMemo(()=>({
    high:filtered.filter(c=>c.finalScore>=70).length,
    whales:filtered.filter(c=>c.whale.status==='confirmed'||c.whale.status==='probable').length,
    avgCap:filtered.length?filtered.reduce((a,b)=>a+b.marketCap,0)/filtered.length:0,
  }),[filtered])

  async function enableAlerts(){
    if(!('Notification'in window)) return
    const permission=await Notification.requestPermission()
    setAlerts(permission==='granted')
  }

  function toggleWatch(id:number){
    setWatchlist(prev=>{
      const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]
      localStorage.setItem('remora_watchlist',JSON.stringify(next))
      return next
    })
  }

  return <main className={s.page}><div className={s.shell}>
    <header className={s.top}>
      <div className={s.brand}><div className={s.mark}>RM</div><div><p className={s.eyebrow}>WHALE-FOLLOWING INTELLIGENCE</p><h1>Remora Scanner</h1></div></div>
      <nav className={s.nav}><a className={s.link} href="/">DEX Scanner</a><button className={s.btn} onClick={enableAlerts}>{alerts?'Alerts enabled':'Enable alerts'}</button></nav>
    </header>

    <section className={s.hero}>
      <div><p className={s.eyebrow}>COINMARKETCAP + ON-CHAIN DEX DATA</p><h2>Small-cap discovery with whale evidence.</h2><p className={s.lede}>Remora mencari market cap relatif kecil tetapi aktivitas modalnya besar. Sinyal whale hanya dinaikkan bila CoinMarketCap mendeteksi large buy swap dan/atau holder berlabel whale dengan aktivitas net-buy.</p></div>
      <div className={s.heroActions}><button className={s.btn+' '+s.btnPrimary} onClick={()=>void load()} disabled={loading}>{loading?'Scanning…':'Run Remora Scan'}</button><label className={s.link}><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Auto 60s</label></div>
    </section>

    <section className={s.stats}>
      <article className={s.stat}><span>Filtered candidates</span><strong>{filtered.length}</strong><small>current rules</small></article>
      <article className={s.stat}><span>Score ≥ 70</span><strong>{stats.high}</strong><small>high-interest heuristic</small></article>
      <article className={s.stat}><span>Whale evidence</span><strong>{stats.whales}</strong><small>confirmed or probable</small></article>
      <article className={s.stat}><span>Average market cap</span><strong>{money(stats.avgCap)}</strong><small>filtered set</small></article>
    </section>

    <section className={s.panel+' '+s.controls}>
      <div className={s.field+' '+s.wide}><label>Search</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Coin, symbol, contract"/></div>
      <div className={s.field}><label>Max market cap</label><select value={maxCap} onChange={e=>setMaxCap(Number(e.target.value))}><option value={20_000_000}>$20M</option><option value={50_000_000}>$50M</option><option value={100_000_000}>$100M</option><option value={250_000_000}>$250M</option><option value={500_000_000}>$500M</option></select></div>
      <div className={s.field}><label>Min Remora score</label><select value={minScore} onChange={e=>setMinScore(Number(e.target.value))}><option value={0}>Any</option><option value={40}>40+</option><option value={55}>55+</option><option value={70}>70+</option><option value={80}>80+</option></select></div>
      <div className={s.field}><label>Min Vol / MC</label><select value={minRatio} onChange={e=>setMinRatio(Number(e.target.value))}><option value={0}>Any</option><option value={.05}>0.05x</option><option value={.1}>0.10x</option><option value={.2}>0.20x</option><option value={.5}>0.50x</option><option value={1}>1.00x</option></select></div>
      <div className={s.field}><label>Whale filter</label><select value={whaleOnly?'yes':'no'} onChange={e=>setWhaleOnly(e.target.value==='yes')}><option value="no">All candidates</option><option value="yes">Whale evidence only</option></select></div>
    </section>

    {error&&<div className={s.error}>{error}</div>}

    <section className={s.workspace}>
      <div className={s.panel+' '+s.tablePanel}>
        <div className={s.panelHead}><div><p className={s.eyebrow}>REMORA RADAR</p><h3>Small-cap candidates</h3></div><span className={s.badge}>{updated?updated.toLocaleTimeString():'—'} · {filtered.length}/{data.length}</span></div>
        <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Coin</th><th>Score</th><th>Whale</th><th>Market cap</th><th>Vol / MC</th><th>FDV / MC</th><th>1h</th><th>24h</th><th>Pairs</th></tr></thead>
          <tbody>{filtered.map(c=><tr key={c.id} onClick={()=>setSelected(c)} className={selected?.id===c.id?s.selected:undefined}>
            <td><div className={s.token}><div className={s.coin}>{c.symbol.slice(0,2)}</div><div><strong>{c.symbol}</strong><span>{c.name}</span></div></div></td>
            <td><span className={s.score+' '+scoreClass(c.finalScore)}>{c.finalScore}</span></td>
            <td><span className={s.whale+' '+whaleClass(c.whale.status)}>{whaleLabel(c.whale.status)}</span></td>
            <td>{money(c.marketCap)}</td><td>{c.volumeToMarketCap.toFixed(2)}x</td><td>{c.fdvToMarketCap.toFixed(2)}x</td>
            <td className={c.change1h>=0?s.pos:s.neg}>{c.change1h>=0?'+':''}{c.change1h.toFixed(1)}%</td>
            <td className={c.change24h>=0?s.pos:s.neg}>{c.change24h>=0?'+':''}{c.change24h.toFixed(1)}%</td>
            <td>{c.marketPairs}</td>
          </tr>)}</tbody>
        </table></div>
      </div>

      <aside className={s.panel+' '+s.detail}>
        <div className={s.panelHead}><div><p className={s.eyebrow}>REMORA INSPECTOR</p><h3>{selected?selected.symbol:'Select coin'}</h3></div></div>
        {selected?<>
          <div className={s.scores}><div><span>Final</span><strong>{selected.finalScore}</strong></div><div><span>Base</span><strong>{selected.remoraScore}</strong></div><div><span>Risk</span><strong>{selected.riskScore}</strong></div></div>
          <div className={s.metrics}>
            <div><span>Price</span><strong>{price(selected.priceUsd)}</strong></div><div><span>Market cap</span><strong>{money(selected.marketCap)}</strong></div><div><span>FDV</span><strong>{money(selected.fdv)}</strong></div><div><span>24h volume</span><strong>{money(selected.volume24h)}</strong></div><div><span>Volume / MC</span><strong>{selected.volumeToMarketCap.toFixed(2)}x</strong></div><div><span>Circulating proxy</span><strong>{(selected.circulatingRatio*100).toFixed(0)}%</strong></div><div><span>CMC rank</span><strong>#{selected.cmcRank||'—'}</strong></div><div><span>Platform</span><strong>{selected.platformName||'native/unknown'}</strong></div>
          </div>
          <div className={s.whaleBox}><h4>{whaleLabel(selected.whale.status)}</h4><p>{selected.whale.note}</p><div className={s.metrics}><div><span>Large buys ≥ {money(selected.whale.thresholdUsd)}</span><strong>{selected.whale.largeBuyCount}</strong></div><div><span>Largest buy</span><strong>{money(selected.whale.largestBuyUsd)}</strong></div><div><span>Tagged whales</span><strong>{selected.whale.taggedWhaleCount}</strong></div><div><span>Whales net-buy</span><strong>{selected.whale.activeNetBuyWhales}</strong></div></div></div>
          <div className={s.flags}>{selected.flags.map(f=><span key={f}>{f}</span>)}</div>
          <div className={s.buttons}><a className={s.action} href={selected.cmcUrl} target="_blank" rel="noreferrer">Open CMC Markets ↗</a>{selected.dexUrl?<a className={s.action} href={selected.dexUrl} target="_blank" rel="noreferrer">Open DEX Market ↗</a>:<span className={s.action}>No contract market</span>}</div>
          <button className={s.btn+' '+s.watch} onClick={()=>toggleWatch(selected.id)}>{watchlist.includes(selected.id)?'Remove from watchlist':'Add to watchlist'}</button>
          <p className={s.note}>{selected.tokenAddress||'Native coin / contract address unavailable in listing data.'}</p>
        </>:<p className={s.note}>Choose a candidate.</p>}
      </aside>
    </section>

    <footer className={s.footer}><p>Remora Score adalah heuristic discovery, bukan prediksi profit. “Whale” berarti bukti aktivitas wallet/transaksi yang memenuhi filter CoinMarketCap, bukan jaminan bahwa wallet tersebut akan terus membeli atau harga akan naik. Browser alerts bekerja ketika web aktif; alert background/Telegram akan ditambahkan sebagai worker terpisah.</p></footer>
  </div></main>
}

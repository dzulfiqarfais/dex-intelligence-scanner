'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type TokenRow={
  chainId:string
  dexId:string
  pairAddress:string
  tokenAddress:string
  name:string
  symbol:string
  quote:string
  url:string
  priceUsd:number
  liquidityUsd:number
  marketCap:number
  fdv:number
  volume5m:number
  volume1h:number
  buys5m:number
  sells5m:number
  priceChange5m:number
  priceChange1h:number
  boosts:number
  opportunityScore:number
  marketRiskScore:number
  ageMinutes:number
  buyShare:number
  volToLiq:number
  flags:string[]
}

type ApiResponse={generatedAt:string;chain:string;tokens:TokenRow[];error?:string}

const CHAINS=[['solana','Solana'],['base','Base'],['bsc','BNB Chain'],['ethereum','Ethereum'],['all','All chains']]

function money(v:number){
  if(!Number.isFinite(v)) return '$0'
  if(v>=1e9) return '$'+(v/1e9).toFixed(2)+'B'
  if(v>=1e6) return '$'+(v/1e6).toFixed(2)+'M'
  if(v>=1e3) return '$'+(v/1e3).toFixed(1)+'K'
  return '$'+v.toFixed(v<1?4:2)
}

function price(v:number){
  if(!Number.isFinite(v)||v===0) return '$0'
  if(v<.000001) return '$'+v.toExponential(3)
  if(v<.01) return '$'+v.toFixed(8)
  return '$'+v.toLocaleString(undefined,{maximumFractionDigits:6})
}

function ageText(m:number){
  if(m<60) return Math.round(m)+'m'
  if(m<1440) return (m/60).toFixed(1)+'h'
  return (m/1440).toFixed(1)+'d'
}

function tone(n:number){
  if(n>=75) return 'score high'
  if(n>=55) return 'score mid'
  return 'score low'
}

export default function Home(){
  const [chain,setChain]=useState('solana')
  const [tokens,setTokens]=useState<TokenRow[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [updated,setUpdated]=useState<Date|null>(null)
  const [minLiquidity,setMinLiquidity]=useState(10000)
  const [maxAgeHours,setMaxAgeHours]=useState(24)
  const [minScore,setMinScore]=useState(0)
  const [search,setSearch]=useState('')
  const [auto,setAuto]=useState(false)
  const [selected,setSelected]=useState<TokenRow|null>(null)

  const load=useCallback(async()=>{
    setLoading(true)
    setError('')
    try{
      const res=await fetch('/api/scan?chain='+encodeURIComponent(chain),{cache:'no-store'})
      const data:ApiResponse=await res.json()
      if(!res.ok) throw new Error(data.error||'Scanner request failed')
      setTokens(data.tokens||[])
      setUpdated(new Date(data.generatedAt))
      setSelected(current=>{
        if(!current) return data.tokens?.[0]||null
        return data.tokens?.find(t=>t.pairAddress===current.pairAddress)||data.tokens?.[0]||null
      })
    }catch(e){
      setError(e instanceof Error?e.message:'Failed to load scanner')
    }finally{
      setLoading(false)
    }
  },[chain])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    if(!auto) return
    const id=window.setInterval(()=>void load(),30000)
    return()=>window.clearInterval(id)
  },[auto,load])

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase()
    return tokens.filter(t=>{
      const match=!q||t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)||t.tokenAddress.toLowerCase().includes(q)
      return match&&t.liquidityUsd>=minLiquidity&&t.ageMinutes<=maxAgeHours*60&&t.opportunityScore>=minScore
    })
  },[tokens,search,minLiquidity,maxAgeHours,minScore])

  const stats=useMemo(()=>{
    const high=filtered.filter(t=>t.opportunityScore>=75).length
    const avgLiq=filtered.length?filtered.reduce((a,b)=>a+b.liquidityUsd,0)/filtered.length:0
    const avgBuy=filtered.length?filtered.reduce((a,b)=>a+b.buyShare,0)/filtered.length:0
    return{high,avgLiq,avgBuy}
  },[filtered])

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="mark">DX</div><div><p className="eyebrow">MARKET INTELLIGENCE</p><h1>DEX Intelligence Scanner</h1></div></div>
      <div className="live">LIVE API · <span className="muted">{updated?updated.toLocaleTimeString():'—'}</span></div>
    </header>

    <section className="hero">
      <div><p className="eyebrow">EARLY-MOVER DISCOVERY</p><h2>Find momentum. Measure risk. Verify before acting.</h2><p className="lede">Discovery dari latest token profiles dan boosts DEX Screener, lalu diperkaya dengan liquidity, transactions, volume, market cap, pair age, dan price momentum.</p></div>
      <div className="actions"><button className="primary" onClick={()=>void load()} disabled={loading}>{loading?'Scanning…':'Run Scan'}</button><label className="toggle"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Auto 30s</label></div>
    </section>

    <section className="stats">
      <article className="stat"><span>Visible opportunities</span><strong>{filtered.length}</strong><small>after filters</small></article>
      <article className="stat"><span>Score ≥ 75</span><strong>{stats.high}</strong><small>heuristic only</small></article>
      <article className="stat"><span>Average liquidity</span><strong>{money(stats.avgLiq)}</strong><small>primary pairs</small></article>
      <article className="stat"><span>Average buy share</span><strong>{(stats.avgBuy*100).toFixed(0)}%</strong><small>5-minute transactions</small></article>
    </section>

    <section className="panel controls">
      <div className="field wide"><label>Search</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Symbol, token name, contract address"/></div>
      <div className="field"><label>Chain</label><select value={chain} onChange={e=>{setChain(e.target.value);setSelected(null)}}>{CHAINS.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></div>
      <div className="field"><label>Min liquidity</label><select value={minLiquidity} onChange={e=>setMinLiquidity(Number(e.target.value))}><option value={0}>Any</option><option value={10000}>$10K</option><option value={30000}>$30K</option><option value={75000}>$75K</option><option value={150000}>$150K</option></select></div>
      <div className="field"><label>Max pair age</label><select value={maxAgeHours} onChange={e=>setMaxAgeHours(Number(e.target.value))}><option value={1}>1 hour</option><option value={6}>6 hours</option><option value={24}>24 hours</option><option value={168}>7 days</option><option value={99999}>Any</option></select></div>
      <div className="field"><label>Min score</label><select value={minScore} onChange={e=>setMinScore(Number(e.target.value))}><option value={0}>Any</option><option value={40}>40+</option><option value={55}>55+</option><option value={70}>70+</option><option value={80}>80+</option></select></div>
    </section>

    {error&&<div className="error">{error}</div>}

    <section className="workspace">
      <div className="panel tablepanel">
        <div className="panelhead"><div><p className="eyebrow">SCANNER</p><h3>Market candidates</h3></div><span className="badge">{filtered.length} / {tokens.length}</span></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Token</th><th>Score</th><th>Risk</th><th>Liquidity</th><th>Vol 5m</th><th>Buys / Sells</th><th>5m</th><th>Age</th></tr></thead>
          <tbody>{filtered.map(t=><tr key={t.chainId+':'+t.pairAddress} onClick={()=>setSelected(t)} className={selected?.pairAddress===t.pairAddress?'selected':''}>
            <td><div className="token"><div className="tokenicon">{t.symbol.slice(0,2).toUpperCase()}</div><div><strong>{t.symbol}</strong><span>{t.name}</span></div></div></td>
            <td><span className={tone(t.opportunityScore)}>{t.opportunityScore}</span></td>
            <td><span className="risk">{t.marketRiskScore}</span></td>
            <td>{money(t.liquidityUsd)}</td><td>{money(t.volume5m)}</td>
            <td><span className="buy">{t.buys5m}</span> / <span className="sell">{t.sells5m}</span></td>
            <td className={t.priceChange5m>=0?'buy':'sell'}>{t.priceChange5m>=0?'+':''}{t.priceChange5m.toFixed(1)}%</td>
            <td>{ageText(t.ageMinutes)}</td>
          </tr>)}</tbody>
        </table></div>
      </div>

      <aside className="panel detail">
        <div className="panelhead"><div><p className="eyebrow">INSPECTOR</p><h3>{selected?selected.symbol+' / '+selected.quote:'Select a token'}</h3></div></div>
        {selected?<><div className="scores"><div><span>Opportunity</span><strong>{selected.opportunityScore}</strong></div><div><span>Market risk</span><strong>{selected.marketRiskScore}</strong></div></div>
        <div className="metrics"><div><span>Price</span><strong>{price(selected.priceUsd)}</strong></div><div><span>Market cap</span><strong>{money(selected.marketCap)}</strong></div><div><span>Liquidity</span><strong>{money(selected.liquidityUsd)}</strong></div><div><span>Volume 1h</span><strong>{money(selected.volume1h)}</strong></div><div><span>Buy share 5m</span><strong>{(selected.buyShare*100).toFixed(1)}%</strong></div><div><span>Vol / liq</span><strong>{selected.volToLiq.toFixed(2)}x</strong></div><div><span>Pair age</span><strong>{ageText(selected.ageMinutes)}</strong></div></div>
        <div className="flags"><p className="eyebrow">RISK FLAGS</p>{selected.flags.length?selected.flags.map(f=><span key={f}>{f}</span>):<span className="ok">No market-data flag triggered</span>}</div>
        <a className="dexlink" href={selected.url} target="_blank" rel="noreferrer">Open pair on DEX Screener ↗</a><code className="address">{selected.tokenAddress}</code></>:<p className="muted" style={{padding:16}}>Choose a row to inspect.</p>}
      </aside>
    </section>

    <footer className="footer"><p><strong>Important:</strong> Opportunity Score is a heuristic, not a prediction or trading recommendation. Market Risk does not yet inspect contract permissions, top-holder concentration, LP locks, honeypots, dev wallets, or bundled transactions.</p></footer>
  </main>
}

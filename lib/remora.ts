const CMC_BASE='https://pro-api.coinmarketcap.com/public-api'

const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,n))
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0

type CmcQuote={
  price?:number
  volume_24h?:number
  volume_change_24h?:number
  percent_change_1h?:number
  percent_change_24h?:number
  percent_change_7d?:number
  market_cap?:number
  fully_diluted_market_cap?:number
}

type CmcListing={
  id:number
  name:string
  symbol:string
  slug:string
  cmc_rank?:number
  num_market_pairs?:number
  date_added?:string
  tags?:string[]
  circulating_supply?:number
  total_supply?:number
  max_supply?:number|null
  platform?:{
    id?:number
    name?:string
    symbol?:string
    slug?:string
    token_address?:string
  }|null
  quote?:Record<string,CmcQuote>|CmcQuote[]
}

export type WhaleEvidence={
  status:'confirmed'|'probable'|'none'|'unavailable'
  largeBuyCount:number
  largestBuyUsd:number
  taggedWhaleCount:number
  activeNetBuyWhales:number
  thresholdUsd:number
  lastLargeBuyAt:number|null
  note:string
}

export type RemoraCandidate={
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
  whale:WhaleEvidence
  cmcUrl:string
  dexUrl:string|null
}

async function cmcFetch<T>(path:string,init?:RequestInit):Promise<T>{
  const res=await fetch(CMC_BASE+path,{
    ...init,
    headers:{
      Accept:'application/json',
      ...(init?.body?{'Content-Type':'application/json'}:{}),
      ...(init?.headers||{}),
    },
    cache:'no-store',
    signal:AbortSignal.timeout(15000),
  })
  if(!res.ok) throw new Error('CoinMarketCap returned '+res.status)
  const json=await res.json()
  const status=(json as {status?:{error_code?:number;error_message?:string}})?.status
  if(status?.error_code) throw new Error(status.error_message||('CoinMarketCap error '+status.error_code))
  return json as T
}

function usdQuote(listing:CmcListing):CmcQuote{
  const q=listing.quote
  if(Array.isArray(q)){
    return q.find((item:any)=>item?.symbol==='USD'||item?.id===2781)??q[0]??{}
  }
  return q?.USD??{}
}

function normalizePlatform(p:CmcListing['platform']){
  if(!p) return null
  const raw=(p.slug||p.name||p.symbol||'').toLowerCase()
  if(raw.includes('solana')||raw==='sol') return 'sol'
  if(raw.includes('base')) return 'base'
  if(raw.includes('bnb')||raw.includes('bsc')||raw.includes('binance')) return 'bsc'
  if(raw.includes('ethereum')||raw==='eth') return 'ethereum'
  return p.slug?.toLowerCase()||p.name?.toLowerCase()||null
}

function emptyWhale(note='No contract/platform available'):WhaleEvidence{
  return{
    status:'unavailable',
    largeBuyCount:0,
    largestBuyUsd:0,
    taggedWhaleCount:0,
    activeNetBuyWhales:0,
    thresholdUsd:0,
    lastLargeBuyAt:null,
    note,
  }
}

function scoreListing(listing:CmcListing):RemoraCandidate|null{
  const q=usdQuote(listing)
  const marketCap=num(q.market_cap)
  const volume24h=num(q.volume_24h)
  const priceUsd=num(q.price)
  if(marketCap<=0||volume24h<=0) return null

  const tags=(listing.tags||[]).map(t=>String(t).toLowerCase())
  if(tags.some(t=>t.includes('stablecoin'))) return null

  const fdv=num(q.fully_diluted_market_cap)
  const change1h=num(q.percent_change_1h)
  const change24h=num(q.percent_change_24h)
  const change7d=num(q.percent_change_7d)
  const pairs=num(listing.num_market_pairs)
  const volumeToMarketCap=volume24h/marketCap
  const fdvToMarketCap=marketCap>0&&fdv>0?fdv/marketCap:1
  const circulatingRatio=fdv>0?clamp(marketCap/fdv,0,1):1
  const ageDays=listing.date_added?Math.max(0,(Date.now()-new Date(listing.date_added).getTime())/86400000):9999

  let opportunity=0
  if(marketCap<=5_000_000) opportunity+=28
  else if(marketCap<=20_000_000) opportunity+=24
  else if(marketCap<=50_000_000) opportunity+=20
  else if(marketCap<=100_000_000) opportunity+=15
  else opportunity+=8

  if(volumeToMarketCap>=1) opportunity+=22
  else if(volumeToMarketCap>=.5) opportunity+=18
  else if(volumeToMarketCap>=.2) opportunity+=13
  else if(volumeToMarketCap>=.1) opportunity+=8
  else opportunity+=2

  if(change1h>=1&&change1h<=10) opportunity+=12
  else if(change1h>10&&change1h<=20) opportunity+=8
  else if(change1h>0) opportunity+=4

  if(change24h>=3&&change24h<=30) opportunity+=12
  else if(change24h>30&&change24h<=60) opportunity+=6
  else if(change24h>0) opportunity+=3

  if(circulatingRatio>=.7) opportunity+=10
  else if(circulatingRatio>=.4) opportunity+=6
  else if(circulatingRatio>=.2) opportunity+=3

  if(pairs>=20) opportunity+=8
  else if(pairs>=5) opportunity+=5
  else if(pairs>=2) opportunity+=2

  if(ageDays<=90) opportunity+=8
  else if(ageDays<=365) opportunity+=4

  let risk=0
  const flags:string[]=[]
  if(marketCap<1_000_000){risk+=20;flags.push('Ultra-low market cap')}
  if(volumeToMarketCap>3){risk+=15;flags.push('Extreme volume/market-cap')}
  if(Math.abs(change24h)>80){risk+=20;flags.push('Extreme 24h move')}
  else if(Math.abs(change24h)>50){risk+=10;flags.push('High 24h volatility')}
  if(fdvToMarketCap>5){risk+=20;flags.push('High dilution / FDV gap')}
  else if(fdvToMarketCap>2.5){risk+=10;flags.push('Elevated FDV gap')}
  if(pairs<3){risk+=10;flags.push('Few market pairs')}
  if(ageDays<7){risk+=15;flags.push('Very new listing')}
  else if(ageDays<30){risk+=7;flags.push('New listing')}

  const baseScore=Math.round(clamp(opportunity))
  const riskScore=Math.round(clamp(risk))
  const remoraScore=Math.round(clamp(opportunity-risk*.25))
  const tokenAddress=listing.platform?.token_address||null
  const platform=normalizePlatform(listing.platform)
  return{
    id:listing.id,
    name:listing.name,
    symbol:listing.symbol,
    slug:listing.slug,
    cmcRank:num(listing.cmc_rank),
    priceUsd,
    marketCap,
    fdv,
    volume24h,
    volumeToMarketCap,
    fdvToMarketCap,
    circulatingRatio,
    change1h,
    change24h,
    change7d,
    marketPairs:pairs,
    ageDays,
    tokenAddress,
    platform,
    platformName:listing.platform?.name||null,
    baseScore,
    riskScore,
    remoraScore,
    finalScore:remoraScore,
    flags,
    whale:emptyWhale(),
    cmcUrl:'https://coinmarketcap.com/currencies/'+listing.slug+'/#Markets',
    dexUrl:tokenAddress?'https://dexscreener.com/search?q='+encodeURIComponent(tokenAddress):null,
  }
}

function unwrap<T>(json:any):T{
  return (json?.data??json) as T
}

function normalizeEpoch(v:unknown){
  const n=num(v)
  if(!n) return 0
  return n>1e12?Math.floor(n/1000):n
}

async function whaleEvidence(candidate:RemoraCandidate):Promise<WhaleEvidence>{
  if(!candidate.tokenAddress||!candidate.platform) return emptyWhale()
  const thresholdUsd=Math.round(Math.max(10_000,Math.min(250_000,candidate.marketCap*.002)))
  const startTime=Math.floor(Date.now()/1000)-6*3600

  try{
    const txParams=new URLSearchParams({
      platform:candidate.platform,
      address:candidate.tokenAddress,
      type:'0',
      minVolume:String(thresholdUsd),
      startTime:String(startTime),
      sortBy:'time',
      sortType:'desc',
      limit:'20',
    })

    const [txResult,holderResult]=await Promise.allSettled([
      cmcFetch<any>('/v1/dex/tokens/transactions?'+txParams.toString()),
      cmcFetch<any>('/v1/dex/holders/list',{
        method:'POST',
        body:JSON.stringify({
          tokenAddress:candidate.tokenAddress,
          platform:candidate.platform,
          tag:'tag_whale',
        }),
      }),
    ])

    const txJson=txResult.status==='fulfilled'?txResult.value:null
    const holderJson=holderResult.status==='fulfilled'?holderResult.value:null

    const txData=txJson?unwrap<any>(txJson):null
    const swaps=Array.isArray(txData)?txData:(txData?.swaps||[])
    const largeBuys=swaps.filter((s:any)=>num(s?.v)>=thresholdUsd)
    const largestBuyUsd=largeBuys.reduce((m:number,s:any)=>Math.max(m,num(s?.v)),0)
    const lastLargeBuyAt=largeBuys.reduce((m:number,s:any)=>Math.max(m,normalizeEpoch(s?.ts)),0)||null

    const holderData=holderJson?unwrap<any>(holderJson):null
    const holders=Array.isArray(holderData)?holderData:(holderData?.holders||[])
    const now=Math.floor(Date.now()/1000)
    const netBuyWhales=holders.filter((h:any)=>{
      const buy=num(h?.buyUsd)
      const sell=num(h?.sellUsd)
      const last=normalizeEpoch(h?.lastActiveTime)
      const recent=!last||now-last<=24*3600
      return recent&&buy>sell
    })

    const confirmed=largeBuys.length>0&&netBuyWhales.length>0
    const probable=!confirmed&&(largeBuys.length>0||netBuyWhales.length>0)
    const holderUnavailable=holderResult.status==='rejected'
    const txUnavailable=txResult.status==='rejected'
    return{
      status:confirmed?'confirmed':probable?'probable':(txUnavailable&&holderUnavailable)?'unavailable':'none',
      largeBuyCount:largeBuys.length,
      largestBuyUsd,
      taggedWhaleCount:holders.length,
      activeNetBuyWhales:netBuyWhales.length,
      thresholdUsd,
      lastLargeBuyAt,
      note:confirmed
        ?'Large buy swaps and tagged whale net-buy activity both detected.'
        :probable
          ?'At least one whale evidence channel is positive; verify before acting.'
          :holderUnavailable
            ?'No large buy detected; tagged-holder channel is unavailable in this keyless scan.'
            :'No qualifying whale evidence found in this scan window.',
    }
  }catch(error){
    return{
      ...emptyWhale(error instanceof Error?error.message:'Whale scan unavailable'),
      thresholdUsd,
    }
  }
}

export async function scanRemora(opts?:{maxMarketCap?:number;minVolume?:number}){
  const maxMarketCap=Math.min(Math.max(opts?.maxMarketCap??250_000_000,1_000_000),2_000_000_000)
  const minVolume=Math.min(Math.max(opts?.minVolume??100_000,10_000),100_000_000)
  const params=new URLSearchParams({
    start:'1',
    limit:'100',
    convert:'USD',
    market_cap_min:'500000',
    market_cap_max:String(maxMarketCap),
    volume_24h_min:String(minVolume),
    sort:'volume_24h',
    sort_dir:'desc',
  })
  const json=await cmcFetch<any>('/v3/cryptocurrency/listings/latest?'+params.toString())
  const raw=unwrap<CmcListing[]>(json)
  const base=(Array.isArray(raw)?raw:[])
    .map(scoreListing)
    .filter((x):x is RemoraCandidate=>Boolean(x))
    .sort((a,b)=>b.remoraScore-a.remoraScore)

  const enrichable=base.filter(c=>c.tokenAddress&&c.platform).slice(0,5)
  const evidence=await Promise.all(enrichable.map(whaleEvidence))
  const map=new Map(enrichable.map((c,i)=>[c.id,evidence[i]]))

  const candidates=base.map(candidate=>{
    const whale=map.get(candidate.id)??candidate.whale
    const whaleBonus=whale.status==='confirmed'?14:whale.status==='probable'?7:0
    return{
      ...candidate,
      whale,
      finalScore:Math.round(clamp(candidate.remoraScore+whaleBonus)),
    }
  }).sort((a,b)=>b.finalScore-a.finalScore)

  return{
    generatedAt:new Date().toISOString(),
    source:'CoinMarketCap Keyless Standard + DEX API',
    scanWindowHours:6,
    whaleEnrichedCount:enrichable.length,
    candidates,
  }
}

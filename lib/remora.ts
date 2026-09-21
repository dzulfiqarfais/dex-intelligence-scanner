const CMC_KEY=process.env.CMC_API_KEY?.trim()
const CMC_BASE=CMC_KEY?'https://pro-api.coinmarketcap.com':'https://pro-api.coinmarketcap.com/public-api'

const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,n))
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0

type CmcQuote={
  price?:number
  volume_24h?:number
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
  platform?:{
    name?:string
    slug?:string
    symbol?:string
    token_address?:string
  }|null
  quote?:Record<string,CmcQuote>|CmcQuote[]
}

type HolderRaw={
  walletAddress?:string
  publicName?:string
  tags?:string
  buyUsd?:string|number
  sellUsd?:string|number
  percent?:string|number
  balance?:string|number
  spotPosition?:string|number
  firstActiveTime?:number
  lastActiveTime?:number
  spotOpenTs?:number
  spotClearanceTs?:number
  addressExplorerUrl?:string
}

export type RemoraActor={
  address:string
  label:string
  role:'whale'|'smart_money'
  status:'new_entry'|'adding'|'distribution'|'holding'
  buyUsd:number
  sellUsd:number
  netUsd:number
  holdingPct:number
  lastActiveTime:number|null
  spotOpenTs:number|null
  explorerUrl:string|null
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

export type BehaviorSummary={
  state:'accumulation'|'distribution'|'mixed'|'quiet'|'unavailable'
  newWhaleEntries:number
  addingWhales:number
  distributingWhales:number
  activeWhaleBuyers:number
  activeSmartMoneyBuyers:number
  whaleNetFlowUsd:number
  smartMoneyNetFlowUsd:number
  multiWhaleAccumulation:boolean
  actors:RemoraActor[]
  note:string
}

export type SecurityGate={
  status:'pass'|'caution'|'fail'|'unknown'
  securityLevel:string|null
  honeypot:string|null
  verified:string|null
  mintable:string|null
  freezable:string|null
  rugPull:string|null
  fakeToken:string|null
  buyTax:number|null
  sellTax:number|null
  flags:string[]
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
  behavior:BehaviorSummary
  security:SecurityGate
  alertEligible:boolean
  cmcUrl:string
  dexUrl:string|null
}

async function cmcFetch<T>(path:string,init?:RequestInit):Promise<T>{
  const res=await fetch(CMC_BASE+path,{
    ...init,
    headers:{
      Accept:'application/json',
      ...(init?.body?{'Content-Type':'application/json'}:{}),
      ...(CMC_KEY?{'X-CMC_PRO_API_KEY':CMC_KEY}:{}),
      ...(init?.headers||{}),
    },
    cache:'no-store',
    signal:AbortSignal.timeout(15000),
  })
  if(!res.ok) throw new Error('CoinMarketCap returned '+res.status)
  const json=await res.json()
  const status=(json as {status?:{error_code?:number|string;error_message?:string}})?.status
  if(Number(status?.error_code??0)!==0) throw new Error(status?.error_message||('CoinMarketCap error '+status?.error_code))
  return json as T
}

function unwrap<T>(json:any):T{return (json?.data??json) as T}
function normalizeEpoch(v:unknown){
  const n=num(v)
  if(!n) return 0
  return n>1e12?Math.floor(n/1000):n
}
function quoteOf(listing:CmcListing):CmcQuote{
  const q=listing.quote
  if(Array.isArray(q)) return q.find((x:any)=>x?.symbol==='USD'||x?.id===2781)??q[0]??{}
  return q?.USD??{}
}
function normalizePlatform(p:CmcListing['platform']){
  if(!p) return null
  const raw=(p.slug||p.name||p.symbol||'').toLowerCase()
  if(raw.includes('solana')||raw==='sol') return 'sol'
  if(raw.includes('base')) return 'base'
  if(raw.includes('bnb')||raw.includes('bsc')||raw.includes('binance')) return 'bsc'
  if(raw.includes('ethereum')||raw==='eth') return 'ethereum'
  return p.slug?.toLowerCase()||null
}
function securityPlatform(platform:string|null){
  if(platform==='sol') return 'sol'
  return platform
}

function emptyWhale(note='Whale data unavailable'):WhaleEvidence{
  return{status:'unavailable',largeBuyCount:0,largestBuyUsd:0,taggedWhaleCount:0,activeNetBuyWhales:0,thresholdUsd:0,lastLargeBuyAt:null,note}
}
function emptyBehavior(note='Behavior data unavailable'):BehaviorSummary{
  return{state:'unavailable',newWhaleEntries:0,addingWhales:0,distributingWhales:0,activeWhaleBuyers:0,activeSmartMoneyBuyers:0,whaleNetFlowUsd:0,smartMoneyNetFlowUsd:0,multiWhaleAccumulation:false,actors:[],note}
}
function emptySecurity():SecurityGate{
  return{status:'unknown',securityLevel:null,honeypot:null,verified:null,mintable:null,freezable:null,rugPull:null,fakeToken:null,buyTax:null,sellTax:null,flags:[]}
}

function scoreListing(listing:CmcListing):RemoraCandidate|null{
  const q=quoteOf(listing)
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

  const tokenAddress=listing.platform?.token_address||null
  const platform=normalizePlatform(listing.platform)
  const remoraScore=Math.round(clamp(opportunity-risk*.25))

  return{
    id:listing.id,name:listing.name,symbol:listing.symbol,slug:listing.slug,
    cmcRank:num(listing.cmc_rank),priceUsd,marketCap,fdv,volume24h,volumeToMarketCap,fdvToMarketCap,
    circulatingRatio,change1h,change24h,change7d,marketPairs:pairs,ageDays,tokenAddress,platform,
    platformName:listing.platform?.name||null,baseScore:Math.round(clamp(opportunity)),riskScore:Math.round(clamp(risk)),
    remoraScore,finalScore:remoraScore,flags,
    whale:emptyWhale(tokenAddress&&platform?'Whale check queued.':'No contract/platform available'),
    behavior:emptyBehavior(tokenAddress&&platform?'Behavior check queued.':'No contract/platform available'),
    security:emptySecurity(),alertEligible:false,
    cmcUrl:'https://coinmarketcap.com/currencies/'+listing.slug+'/#Markets',
    dexUrl:tokenAddress?'https://dexscreener.com/search?q='+encodeURIComponent(tokenAddress):null,
  }
}

function holderArray(json:any):HolderRaw[]{
  const data=unwrap<any>(json)
  return Array.isArray(data)?data:(data?.holders||[])
}
function actorFrom(holder:HolderRaw,role:RemoraActor['role'],now:number):RemoraActor{
  const buy=num(holder.buyUsd)
  const sell=num(holder.sellUsd)
  const net=buy-sell
  const balance=num(holder.balance)
  const spotOpen=normalizeEpoch(holder.spotOpenTs)
  const last=normalizeEpoch(holder.lastActiveTime)
  const recentOpen=spotOpen>0&&now-spotOpen<=6*3600
  const recent=!last||now-last<=24*3600
  let status:RemoraActor['status']='holding'
  if(recentOpen&&net>0&&balance>0) status='new_entry'
  else if(recent&&net>Math.max(1000,sell*.15)&&balance>0) status='adding'
  else if(recent&&net<-Math.max(1000,buy*.15)) status='distribution'
  const address=String(holder.walletAddress||'')
  const explorer=holder.addressExplorerUrl?String(holder.addressExplorerUrl).replace('%s',address):null
  return{
    address,
    label:String(holder.publicName||'').trim()||(address.slice(0,6)+'…'+address.slice(-4)),
    role,status,buyUsd:buy,sellUsd:sell,netUsd:net,holdingPct:num(holder.percent),
    lastActiveTime:last||null,spotOpenTs:spotOpen||null,explorerUrl:explorer,
  }
}

function parseSecurity(json:any):SecurityGate{
  try{
    const data=unwrap<any>(json)
    const item=Array.isArray(data)?data[0]:data
    if(!item||item.exist===false) return emptySecurity()
    const display=item.evmDisplay||item.solanaDisplay||{}
    const flags:string[]=[]
    let status:SecurityGate['status']='pass'
    const lower=(v:unknown)=>String(v??'').toLowerCase()
    const failWords=['honeypot','malicious','fake','rug risk','high risk','danger']
    const cautionWords=['unverified','mintable','freezable','warning','medium risk']

    const fields=[
      ['Honeypot',display.honeypotStatus],
      ['Contract',display.unverifiedContractStatus],
      ['Mint',display.mintableStatus],
      ['Freeze',display.freezableStatus],
      ['Rug pull',display.rugPullStatus],
      ['Fake token',display.fakeTokenStatus],
    ] as const

    for(const [name,value] of fields){
      const v=lower(value)
      if(!v) continue
      if(failWords.some(w=>v.includes(w))&&!v.includes('no risk')){
        status='fail';flags.push(name+': '+String(value))
      }else if(cautionWords.some(w=>v.includes(w))&&!v.includes('non-mintable')&&!v.includes('non-freezable')){
        if(status!=='fail') status='caution'
        flags.push(name+': '+String(value))
      }
    }

    const hits=Array.isArray(item.securityItems)?item.securityItems.filter((x:any)=>x?.isHit):[]
    for(const hit of hits.slice(0,4)){
      const level=lower(hit.riskyLevel)
      if(level.includes('high')||level.includes('critical')) status='fail'
      else if(status!=='fail') status='caution'
      if(hit.des) flags.push(String(hit.des))
    }

    const buyTax=item.extra?.buyTax===undefined?null:num(item.extra.buyTax)
    const sellTax=item.extra?.sellTax===undefined?null:num(item.extra.sellTax)
    if((buyTax??0)>20||(sellTax??0)>20){status='fail';flags.push('Very high token tax')}
    else if((buyTax??0)>10||(sellTax??0)>10){if(status!=='fail')status='caution';flags.push('Elevated token tax')}

    return{
      status,securityLevel:item.securityLevel?String(item.securityLevel):null,
      honeypot:display.honeypotStatus||null,verified:display.unverifiedContractStatus||null,
      mintable:display.mintableStatus||null,freezable:display.freezableStatus||null,
      rugPull:display.rugPullStatus||null,fakeToken:display.fakeTokenStatus||null,
      buyTax,sellTax,flags:[...new Set(flags)].slice(0,8),
    }
  }catch{return emptySecurity()}
}

async function intelligence(candidate:RemoraCandidate){
  if(!candidate.tokenAddress||!candidate.platform) return candidate
  const now=Math.floor(Date.now()/1000)
  const thresholdUsd=Math.round(Math.max(10_000,Math.min(250_000,candidate.marketCap*.002)))
  const startTime=now-6*3600
  const txParams=new URLSearchParams({
    platform:candidate.platform,address:candidate.tokenAddress,type:'0',minVolume:String(thresholdUsd),
    startTime:String(startTime),sortBy:'time',sortType:'desc',limit:'20',
  })
  const holderBody=(tag:string)=>JSON.stringify({tokenAddress:candidate.tokenAddress,platform:candidate.platform,tag})
  const secParams=new URLSearchParams({platformName:securityPlatform(candidate.platform)||candidate.platform,address:candidate.tokenAddress})

  const [txR,whaleR,smartR,securityR]=await Promise.allSettled([
    cmcFetch<any>('/v1/dex/tokens/transactions?'+txParams),
    cmcFetch<any>('/v1/dex/holders/list',{method:'POST',body:holderBody('tag_whale')}),
    cmcFetch<any>('/v1/dex/holders/list',{method:'POST',body:holderBody('tag_smart_money')}),
    cmcFetch<any>('/v1/dex/security/detail?'+secParams),
  ])

  const txData=txR.status==='fulfilled'?unwrap<any>(txR.value):null
  const swaps=Array.isArray(txData)?txData:(txData?.swaps||[])
  const largeBuys=swaps.filter((x:any)=>num(x?.v)>=thresholdUsd)
  const largestBuyUsd=largeBuys.reduce((m:number,x:any)=>Math.max(m,num(x?.v)),0)
  const lastLargeBuyAt=largeBuys.reduce((m:number,x:any)=>Math.max(m,normalizeEpoch(x?.ts)),0)||null

  const whaleHolders=whaleR.status==='fulfilled'?holderArray(whaleR.value):[]
  const smartHolders=smartR.status==='fulfilled'?holderArray(smartR.value):[]
  const whaleActors=whaleHolders.map(h=>actorFrom(h,'whale',now))
  const smartActors=smartHolders.map(h=>actorFrom(h,'smart_money',now))

  const activeWhaleBuyers=whaleActors.filter(a=>a.status==='new_entry'||a.status==='adding').length
  const activeSmartMoneyBuyers=smartActors.filter(a=>a.status==='new_entry'||a.status==='adding').length
  const newWhaleEntries=whaleActors.filter(a=>a.status==='new_entry').length
  const addingWhales=whaleActors.filter(a=>a.status==='adding').length
  const distributingWhales=whaleActors.filter(a=>a.status==='distribution').length
  const whaleNetFlowUsd=whaleActors.reduce((a,b)=>a+b.netUsd,0)
  const smartMoneyNetFlowUsd=smartActors.reduce((a,b)=>a+b.netUsd,0)
  const multiWhaleAccumulation=activeWhaleBuyers>=3

  let state:BehaviorSummary['state']='quiet'
  if(whaleR.status==='rejected'&&smartR.status==='rejected') state='unavailable'
  else if((activeWhaleBuyers>=2||activeSmartMoneyBuyers>=1)&&(whaleNetFlowUsd+smartMoneyNetFlowUsd)>0) state='accumulation'
  else if(distributingWhales>=2||whaleNetFlowUsd<0) state='distribution'
  else if(activeWhaleBuyers>0&&distributingWhales>0) state='mixed'

  const actors=[...whaleActors,...smartActors]
    .filter(a=>a.status!=='holding'||Math.abs(a.netUsd)>5000)
    .sort((a,b)=>Math.abs(b.netUsd)-Math.abs(a.netUsd))
    .slice(0,8)

  const behavior:BehaviorSummary={
    state,newWhaleEntries,addingWhales,distributingWhales,activeWhaleBuyers,activeSmartMoneyBuyers,
    whaleNetFlowUsd,smartMoneyNetFlowUsd,multiWhaleAccumulation,actors,
    note:state==='accumulation'
      ?'Net buying from whale/smart-money actors is active.'
      :state==='distribution'
        ?'Whale flow is net negative; distribution evidence is present.'
        :state==='mixed'
          ?'Large actors are buying and selling at the same time.'
          :state==='quiet'
            ?'No strong whale behavior cluster is active in the current window.'
            :'Holder behavior channel is unavailable.',
  }

  const confirmed=largeBuys.length>0&&activeWhaleBuyers>0
  const probable=!confirmed&&(largeBuys.length>0||activeWhaleBuyers>0||activeSmartMoneyBuyers>0)
  const whale:WhaleEvidence={
    status:confirmed?'confirmed':probable?'probable':(txR.status==='rejected'&&whaleR.status==='rejected')?'unavailable':'none',
    largeBuyCount:largeBuys.length,largestBuyUsd,taggedWhaleCount:whaleHolders.length,
    activeNetBuyWhales:activeWhaleBuyers,thresholdUsd,lastLargeBuyAt,
    note:confirmed?'Large buy swaps and active whale net-buy are both present.'
      :probable?'At least one whale/smart-money evidence channel is positive.'
      :'No qualifying whale evidence found in this scan window.',
  }

  const security=securityR.status==='fulfilled'?parseSecurity(securityR.value):emptySecurity()
  let bonus=0
  if(whale.status==='confirmed') bonus+=8
  else if(whale.status==='probable') bonus+=4
  if(state==='accumulation') bonus+=8
  if(multiWhaleAccumulation) bonus+=5
  if(newWhaleEntries>0) bonus+=3
  if(activeSmartMoneyBuyers>0) bonus+=4
  let penalty=0
  if(state==='distribution') penalty+=10
  if(security.status==='caution') penalty+=5
  if(security.status==='fail') penalty+=28

  const finalScore=Math.round(clamp(candidate.remoraScore+bonus-penalty))
  const securityVerified=security.status==='pass'||security.status==='caution'
  const positiveWhaleCluster=multiWhaleAccumulation&&whaleNetFlowUsd>0
  const positiveSmartMoney=activeSmartMoneyBuyers>0&&smartMoneyNetFlowUsd>0
  const alertEligible=finalScore>=70&&securityVerified&&state!=='distribution'&&(state==='accumulation'||positiveWhaleCluster||positiveSmartMoney||(whale.status==='confirmed'&&whaleNetFlowUsd>=0))

  return{...candidate,whale,behavior,security,finalScore,alertEligible}
}

export async function scanRemora(opts?:{maxMarketCap?:number;minVolume?:number}){
  const maxMarketCap=Math.min(Math.max(opts?.maxMarketCap??250_000_000,1_000_000),2_000_000_000)
  const minVolume=Math.min(Math.max(opts?.minVolume??100_000,10_000),100_000_000)
  const params=new URLSearchParams({
    start:'1',limit:'100',convert:'USD',market_cap_min:'500000',
    market_cap_max:String(maxMarketCap),volume_24h_min:String(minVolume),
    sort:'volume_24h',sort_dir:'desc',
  })
  const json=await cmcFetch<any>('/v3/cryptocurrency/listings/latest?'+params)
  const raw=unwrap<CmcListing[]>(json)
  const base=(Array.isArray(raw)?raw:[])
    .map(scoreListing).filter((x):x is RemoraCandidate=>Boolean(x))
    .sort((a,b)=>b.remoraScore-a.remoraScore)

  const enrichable=base.filter(c=>c.tokenAddress&&c.platform&&c.remoraScore>=55).slice(0,5)
  const enriched=await Promise.all(enrichable.map(intelligence))
  const map=new Map(enriched.map(x=>[x.id,x]))
  const candidates=base.map(c=>map.get(c.id)??c).sort((a,b)=>b.finalScore-a.finalScore)

  return{
    generatedAt:new Date().toISOString(),
    source:'CoinMarketCap '+(CMC_KEY?'API key':'Keyless Public API')+' + DEX holder/security data',
    authMode:CMC_KEY?'keyed':'keyless',
    recommendedRefreshSeconds:CMC_KEY?60:120,
    scanWindowHours:6,
    intelligenceEnrichedCount:enriched.length,
    telegramConfigured:Boolean(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID),
    candidates,
  }
}

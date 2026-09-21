const BIRDEYE_KEY=process.env.BIRDEYE_API_KEY?.trim()

type ProviderStatus='connected'|'available'|'not_connected'|'unsupported'|'error'

export type SourceProvider={
  id:'cmc'|'birdeye'|'gmgn'|'fomo'|'nansen'
  name:string
  status:ProviderStatus
  role:string
  note:string
  url:string
}

export type ProTrader={
  address:string
  label:string
  realizedPnl:number
  unrealizedPnl:number
  totalPnl:number
  volumeUsd:number
  trades:number
  tags:string[]
  source:'birdeye'
}

export type EarlyBuyer={
  address:string
  status:string
  firstBuyUsd:number
  totalBuyUsd:number
  tags:string[]
}

export type SourceIntelligence={
  generatedAt:string
  providerCount:number
  verifiedProviderCount:number
  provenanceScore:number
  professionalConsensus:'supportive'|'mixed'|'weak'|'conflicting'|'unavailable'
  signalStatus:'qualified_for_monitoring'|'research_more'|'blocked'
  publicCallerThesis:string|null
  publicCallerThesisStatus:'verified'|'not_available'
  inferredThesis:string
  whyNow:string[]
  professionalTraders:ProTrader[]
  earlyBuyers:EarlyBuyer[]
  evidence:string[]
  conflicts:string[]
  providers:SourceProvider[]
  caveats:string[]
}

const num=(v:unknown)=>{
  const n=Number(v)
  return Number.isFinite(n)?n:0
}

function chainForBirdeye(chain:string){
  if(chain==='sol'||chain==='solana') return 'solana'
  if(chain==='bsc') return 'bsc'
  if(chain==='base') return 'base'
  if(chain==='ethereum'||chain==='eth') return 'ethereum'
  return chain||'solana'
}

function chainForGmgn(chain:string){
  if(chain==='solana') return 'sol'
  if(chain==='ethereum') return 'eth'
  return chain
}

function gmgnUrl(chain:string,address:string){
  return address?'https://gmgn.ai/'+chainForGmgn(chain)+'/token/'+encodeURIComponent(address):'https://gmgn.ai/'
}

function birdeyeUrl(chain:string,address:string){
  return address?'https://birdeye.so/token/'+encodeURIComponent(address)+'?chain='+encodeURIComponent(chainForBirdeye(chain)):'https://birdeye.so/'
}

function nansenUrl(){
  return 'https://app.nansen.ai/'
}

function fomoUrl(){
  return 'https://fomo.family/'
}

async function birdeyeFetch(path:string,chain:string){
  if(!BIRDEYE_KEY) throw new Error('BIRDEYE_API_KEY is not configured')
  const res=await fetch('https://public-api.birdeye.so'+path,{
    headers:{accept:'application/json','x-api-key':BIRDEYE_KEY,'x-chain':chainForBirdeye(chain)},
    cache:'no-store',
    signal:AbortSignal.timeout(12000),
  })
  if(!res.ok) throw new Error('Birdeye returned '+res.status)
  const json=await res.json()
  if(json?.success===false) throw new Error(json?.message||'Birdeye request failed')
  return json?.data??json
}

function parseTags(v:any):string[]{
  if(Array.isArray(v)) return v.map(String)
  if(typeof v==='string') return v.split(',').map(x=>x.trim()).filter(Boolean)
  return []
}

function parseTopTraders(data:any):ProTrader[]{
  const rows=Array.isArray(data)?data:(data?.items||data?.traders||data?.list||[])
  return rows.slice(0,10).map((row:any)=>({
    address:String(row?.owner||row?.address||row?.wallet||row?.walletAddress||''),
    label:String(row?.name||row?.label||row?.walletName||''),
    realizedPnl:num(row?.realizedPnl??row?.realized_pnl??row?.pnlRealized),
    unrealizedPnl:num(row?.unrealizedPnl??row?.unrealized_pnl??row?.pnlUnrealized),
    totalPnl:num(row?.totalPnl??row?.total_pnl??row?.pnl),
    volumeUsd:num(row?.volumeUsd??row?.volume_usd??row?.volumeUSD),
    trades:num(row?.tradeCount??row?.trade_count??row?.trades),
    tags:parseTags(row?.tags),
    source:'birdeye' as const,
  })).filter((x:ProTrader)=>x.address)
}

function parseFirstBuyers(data:any):EarlyBuyer[]{
  const rows=Array.isArray(data)?data:(data?.items||data?.buyers||data?.list||[])
  return rows.slice(0,20).map((row:any)=>({
    address:String(row?.owner||row?.address||row?.wallet||row?.walletAddress||''),
    status:String(row?.positionStatus||row?.position_status||row?.status||'unknown'),
    firstBuyUsd:num(row?.firstBuyUsd??row?.first_buy_usd??row?.firstBuyVolumeUsd),
    totalBuyUsd:num(row?.totalBuyUsd??row?.total_buy_usd??row?.totalBuyVolumeUsd),
    tags:parseTags(row?.tags),
  })).filter((x:EarlyBuyer)=>x.address)
}

function inference(input:{
  symbol:string
  marketCap:number
  volumeToMarketCap:number
  change1h:number
  change24h:number
  behavior:string
  whaleBuyers:number
  smartBuyers:number
  whaleNetFlow:number
  smartNetFlow:number
  security:string
  fdvToMarketCap:number
}){
  const why:string[]=[]
  const conflicts:string[]=[]
  if(input.marketCap>0&&input.marketCap<=20_000_000) why.push('Very small market-cap tier can react sharply to new capital.')
  else if(input.marketCap<=100_000_000) why.push('Small-cap valuation leaves room for larger percentage moves than mature large caps.')
  if(input.volumeToMarketCap>=1) why.push('24h volume is at least as large as market cap, showing unusually high turnover.')
  else if(input.volumeToMarketCap>=.2) why.push('Volume/market-cap ratio indicates meaningful market participation.')
  if(input.whaleBuyers>=2) why.push(input.whaleBuyers+' whale-tagged wallets are currently classified as buyers/adders.')
  if(input.smartBuyers>0) why.push(input.smartBuyers+' smart-money-tagged wallet(s) are currently buying.')
  if(input.whaleNetFlow>0) why.push('Whale net flow is positive in the current analysis window.')
  if(input.smartNetFlow>0) why.push('Smart-money net flow is positive in the current analysis window.')
  if(input.change1h>0&&input.change1h<=10) why.push('Short-term price action is positive without already being extremely extended.')
  if(input.fdvToMarketCap>2.5) conflicts.push('FDV is materially above current market cap, creating dilution risk.')
  if(input.behavior==='distribution'||input.whaleNetFlow<0) conflicts.push('Large-wallet flow is net negative / distribution-like.')
  if(input.security==='fail') conflicts.push('Security gate has blocked the token.')
  if(input.security==='unknown') conflicts.push('Security evidence is incomplete, so conviction should remain limited.')
  if(Math.abs(input.change24h)>60) conflicts.push('24h move is already extreme and may represent late-stage momentum.')
  const inferred='Remora hypothesis: '+(why.length?why.slice(0,4).join(' '):'market structure is not yet strong enough to explain a professional-quality setup.')+
    (conflicts.length?' Key conflict: '+conflicts[0]:'')
  return{why,conflicts,inferred}
}

export async function buildSourceIntelligence(input:{
  tokenAddress:string
  chain:string
  symbol:string
  slug:string
  cmcUrl:string
  marketCap:number
  volumeToMarketCap:number
  fdvToMarketCap:number
  change1h:number
  change24h:number
  behavior:string
  whaleBuyers:number
  smartBuyers:number
  whaleNetFlow:number
  smartNetFlow:number
  security:string
}):Promise<SourceIntelligence>{
  const providers:SourceProvider[]=[
    {id:'cmc',name:'CoinMarketCap',status:'connected',role:'Market + holder/security evidence',note:'Already connected to Remora live data.',url:input.cmcUrl||'https://coinmarketcap.com/'},
    {id:'birdeye',name:'Birdeye',status:BIRDEYE_KEY?'available':'not_connected',role:'Top traders + first buyers + wallet quality',note:BIRDEYE_KEY?'API key detected; querying official endpoints.':'Add BIRDEYE_API_KEY to activate official trader/first-buyer verification.',url:birdeyeUrl(input.chain,input.tokenAddress)},
    {id:'gmgn',name:'GMGN',status:'available',role:'Smart-money/KOL/copy-trade verification',note:'Use token/wallet pages for call, wallet PnL, KOL and tracker verification. Agent API access requires GMGN credentials.',url:gmgnUrl(input.chain,input.tokenAddress)},
    {id:'fomo',name:'FOMO',status:'available',role:'Public trader thesis + real-trade social context',note:'No documented public thesis API was used; verify public trader thesis manually rather than fabricating one.',url:fomoUrl()},
    {id:'nansen',name:'Nansen',status:'available',role:'Independent wallet reputation + smart-money confirmation',note:'Use Profiler/Smart Money as a second-opinion source; API requires separate credentials/credits.',url:nansenUrl()},
  ]

  let professionalTraders:ProTrader[]=[]
  let earlyBuyers:EarlyBuyer[]=[]
  const evidence:string[]=[]
  const caveats:string[]=[
    'A profitable wallet on one token is not automatically a consistently skilled trader.',
    'Public calls can occur after the caller has already entered; entry-before-call and post-call selling must be checked.',
    'Source Intelligence qualifies research candidates, not automatic buys.',
  ]

  if(BIRDEYE_KEY&&input.tokenAddress){
    try{
      const top=await birdeyeFetch('/defi/v2/tokens/top_traders?address='+encodeURIComponent(input.tokenAddress)+'&time_frame=30d&sort_by=realized_pnl&sort_type=desc&limit=10',input.chain)
      professionalTraders=parseTopTraders(top)
      providers[1].status='connected'
      providers[1].note='Official Top Traders API connected.'
      if(professionalTraders.length){
        const positive=professionalTraders.filter(x=>x.realizedPnl>0).length
        evidence.push(positive+'/'+professionalTraders.length+' Birdeye top traders show positive realized PnL in parsed results.')
      }
    }catch(error){
      providers[1].status='error'
      providers[1].note=error instanceof Error?error.message:'Birdeye Top Traders failed'
    }

    if(chainForBirdeye(input.chain)==='solana'){
      try{
        const first=await birdeyeFetch('/token/v1/first-buyers?token_address='+encodeURIComponent(input.tokenAddress)+'&offset=0&limit=20',input.chain)
        earlyBuyers=parseFirstBuyers(first)
        if(earlyBuyers.length){
          const holding=earlyBuyers.filter(x=>['buy_more','hold','sell_partial'].includes(x.status)).length
          evidence.push(holding+'/'+earlyBuyers.length+' parsed early buyers have not fully exited.')
        }
      }catch(error){
        caveats.push('Birdeye first-buyer verification unavailable: '+(error instanceof Error?error.message:'unknown error'))
      }
    }
  }

  const {why,conflicts,inferred}=inference(input)
  if(input.behavior==='accumulation') evidence.push('CMC/Remora holder analysis currently classifies large-wallet behavior as accumulation.')
  if(input.whaleBuyers>=3) evidence.push('Multiple whale-tagged buyers are active simultaneously.')
  if(input.smartBuyers>0) evidence.push('Smart-money-tagged buying is present.')
  if(input.security==='pass') evidence.push('Configured CoinMarketCap security gate currently passes.')

  const positiveProTraders=professionalTraders.filter(x=>x.realizedPnl>0).length
  const independentConfirmations=[
    input.behavior==='accumulation',
    input.whaleBuyers>=2&&input.whaleNetFlow>0,
    input.smartBuyers>0&&input.smartNetFlow>0,
    positiveProTraders>=2,
    earlyBuyers.length>0&&earlyBuyers.filter(x=>x.status==='sell_all').length<earlyBuyers.length/2,
  ].filter(Boolean).length

  let provenanceScore=25
  provenanceScore+=Math.min(25,independentConfirmations*7)
  provenanceScore+=input.security==='pass'?15:input.security==='caution'?7:0
  provenanceScore+=professionalTraders.length>=5?15:professionalTraders.length?8:0
  provenanceScore-=input.behavior==='distribution'?25:0
  provenanceScore-=input.security==='fail'?40:input.security==='unknown'?10:0
  provenanceScore=Math.max(0,Math.min(100,Math.round(provenanceScore)))

  let professionalConsensus:SourceIntelligence['professionalConsensus']='unavailable'
  if(input.behavior==='distribution'||input.whaleNetFlow<0) professionalConsensus='conflicting'
  else if(independentConfirmations>=4) professionalConsensus='supportive'
  else if(independentConfirmations>=2) professionalConsensus='mixed'
  else if(independentConfirmations>=1) professionalConsensus='weak'

  const signalStatus:SourceIntelligence['signalStatus']=
    input.security==='fail'||input.behavior==='distribution'
      ?'blocked'
      :provenanceScore>=70&&professionalConsensus==='supportive'
        ?'qualified_for_monitoring'
        :'research_more'

  return{
    generatedAt:new Date().toISOString(),
    providerCount:providers.length,
    verifiedProviderCount:providers.filter(p=>p.status==='connected').length,
    provenanceScore,professionalConsensus,signalStatus,
    publicCallerThesis:null,
    publicCallerThesisStatus:'not_available',
    inferredThesis:inferred,
    whyNow:why,
    professionalTraders,earlyBuyers,
    evidence,
    conflicts:[...conflicts],
    providers,caveats,
  }
}

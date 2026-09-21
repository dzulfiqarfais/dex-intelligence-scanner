import { scorePair } from './scoring'

const API='https://api.dexscreener.com'
const ALLOWED_CHAINS=new Set(['solana','base','bsc','ethereum','all'])

export type DexPair={
  chainId:string
  dexId:string
  url:string
  pairAddress:string
  baseToken:{address:string;name:string;symbol:string}
  quoteToken:{address?:string|null;name?:string|null;symbol?:string|null}
  priceUsd?:string|null
  txns?:Record<string,{buys?:number;sells?:number}>
  volume?:Record<string,number>
  priceChange?:Record<string,number>|null
  liquidity?:{usd?:number|null}|null
  fdv?:number|null
  marketCap?:number|null
  pairCreatedAt?:number|null
  boosts?:{active?:number}|null
}

type DiscoveryToken={
  chainId?:string
  tokenAddress?:string
  amount?:number
  totalAmount?:number
}

async function dexFetch<T>(path:string):Promise<T>{
  const res=await fetch(API+path,{
    headers:{Accept:'application/json'},
    cache:'no-store',
    signal:AbortSignal.timeout(12000),
  })
  if(!res.ok) throw new Error('DEX Screener returned '+res.status)
  return res.json() as Promise<T>
}

async function discovery(chain:string){
  const safe=ALLOWED_CHAINS.has(chain)?chain:'solana'
  const [profiles,boosts]=await Promise.all([
    dexFetch<DiscoveryToken[]>('/token-profiles/latest/v1'),
    dexFetch<DiscoveryToken[]>('/token-boosts/latest/v1'),
  ])

  const map=new Map<string,DiscoveryToken>()
  for(const item of [...profiles,...boosts]){
    if(!item.chainId || !item.tokenAddress) continue
    if(safe!=='all' && item.chainId!==safe) continue
    const key=item.chainId+':'+item.tokenAddress
    const old=map.get(key)
    map.set(key,{
      ...old,
      ...item,
      totalAmount:Math.max(Number(old?.totalAmount ?? 0),Number(item.totalAmount ?? 0)),
    })
  }
  return [...map.values()].slice(0,30)
}

async function batchPairs(chainId:string,addresses:string[]){
  if(!addresses.length) return [] as DexPair[]
  const encoded=addresses.map(encodeURIComponent).join(',')
  return dexFetch<DexPair[]>('/tokens/v1/'+encodeURIComponent(chainId)+'/'+encoded)
}

export async function scanMarket(chain:string){
  const items=await discovery(chain)
  const groups=new Map<string,DiscoveryToken[]>()
  for(const token of items){
    const list=groups.get(token.chainId!) ?? []
    list.push(token)
    groups.set(token.chainId!,list)
  }

  const batches=await Promise.all(
    [...groups.entries()].map(async([chainId,tokens])=>{
      try{
        return await batchPairs(chainId,tokens.map(t=>t.tokenAddress!))
      }catch{
        return [] as DexPair[]
      }
    })
  )

  const boostMap=new Map(
    items.map(item=>[
      item.chainId+':'+item.tokenAddress,
      Number(item.totalAmount ?? item.amount ?? 0),
    ])
  )

  const rows=batches.flat().map(pair=>{
    const scored=scorePair(pair)
    const tokenAddress=pair.baseToken.address
    return {
      chainId:pair.chainId,
      dexId:pair.dexId,
      pairAddress:pair.pairAddress,
      tokenAddress,
      name:pair.baseToken.name,
      symbol:pair.baseToken.symbol,
      quote:pair.quoteToken.symbol ?? '?',
      url:pair.url,
      priceUsd:Number(pair.priceUsd ?? 0),
      liquidityUsd:Number(pair.liquidity?.usd ?? 0),
      marketCap:Number(pair.marketCap ?? pair.fdv ?? 0),
      fdv:Number(pair.fdv ?? 0),
      volume5m:Number(pair.volume?.m5 ?? 0),
      volume1h:Number(pair.volume?.h1 ?? 0),
      buys5m:Number(pair.txns?.m5?.buys ?? 0),
      sells5m:Number(pair.txns?.m5?.sells ?? 0),
      priceChange5m:Number(pair.priceChange?.m5 ?? 0),
      priceChange1h:Number(pair.priceChange?.h1 ?? 0),
      boosts:Math.max(Number(pair.boosts?.active ?? 0),boostMap.get(pair.chainId+':'+tokenAddress) ?? 0),
      ...scored,
    }
  })

  const unique=new Map<string,(typeof rows)[number]>()
  for(const row of rows){
    const key=row.chainId+':'+row.tokenAddress
    const current=unique.get(key)
    if(!current || row.liquidityUsd>current.liquidityUsd) unique.set(key,row)
  }

  return [...unique.values()].sort((a,b)=>b.opportunityScore-a.opportunityScore)
}

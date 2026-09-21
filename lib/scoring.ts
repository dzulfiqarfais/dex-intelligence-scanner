export type PairLike = {
  txns?: Record<string, { buys?: number; sells?: number }>
  volume?: Record<string, number>
  priceChange?: Record<string, number> | null
  liquidity?: { usd?: number | null } | null
  pairCreatedAt?: number | null
  boosts?: { active?: number } | null
}

const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,n))

export function scorePair(pair: PairLike) {
  const liquidity=Number(pair.liquidity?.usd ?? 0)
  const vol5m=Number(pair.volume?.m5 ?? 0)
  const buys5m=Number(pair.txns?.m5?.buys ?? 0)
  const sells5m=Number(pair.txns?.m5?.sells ?? 0)
  const change5m=Number(pair.priceChange?.m5 ?? 0)
  const createdAt=Number(pair.pairCreatedAt ?? Date.now())
  const ageMinutes=Math.max(0,(Date.now()-createdAt)/60000)
  const trades=buys5m+sells5m
  const buyShare=trades>0 ? buys5m/trades : .5
  const volToLiq=liquidity>0 ? vol5m/liquidity : 0

  let opportunity=0
  opportunity+=clamp((Math.log10(Math.max(liquidity,1))-3.7)*18,0,25)
  opportunity+=clamp(volToLiq*26,0,20)
  opportunity+=clamp((buyShare-.45)*80,0,20)
  opportunity+=change5m>=0 && change5m<=20 ? clamp(change5m*.75+8,0,18) : 2
  opportunity+=ageMinutes<=180 ? 10 : ageMinutes<=720 ? 5 : 2
  opportunity+=trades>=25 ? 7 : trades>=10 ? 4 : 1

  let risk=0
  if(liquidity<10000) risk+=35
  else if(liquidity<30000) risk+=20
  else if(liquidity<75000) risk+=10
  if(ageMinutes<10) risk+=20
  else if(ageMinutes<30) risk+=10
  if(Math.abs(change5m)>80) risk+=20
  else if(Math.abs(change5m)>40) risk+=12
  if(volToLiq>4) risk+=15
  if(trades>0 && (buyShare>.93 || buyShare<.07)) risk+=10
  if(Number(pair.boosts?.active ?? 0)>0) risk+=5

  const flags:string[]=[]
  if(liquidity<30000) flags.push('Low liquidity')
  if(ageMinutes<30) flags.push('Very new pair')
  if(Math.abs(change5m)>40) flags.push('Extreme 5m move')
  if(volToLiq>4) flags.push('Unusual volume/liquidity')
  if(Number(pair.boosts?.active ?? 0)>0) flags.push('Boosted token')

  return {
    opportunityScore:Math.round(clamp(opportunity-risk*.25)),
    marketRiskScore:Math.round(clamp(risk)),
    ageMinutes,
    buyShare,
    volToLiq,
    flags,
  }
}

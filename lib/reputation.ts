export type TriState='yes'|'no'|'unknown'

export type CallerObservation={
  id:string
  wallet:string
  source:'gmgn'|'fomo'|'birdeye'|'nansen'|'manual'
  tokenSymbol:string
  recordedAt:string
  entryBeforeCall:TriState
  dumpAfterCall:TriState
  rugged:TriState
  roiPct:number|null
  thesisScore:number|null
  note:string
}

export type CallerReputation={
  wallet:string
  sampleSize:number
  scoredSampleSize:number
  score:number
  confidence:number
  status:'UNVERIFIED'|'LOW SAMPLE'|'STRONG HISTORY'|'WATCH POSITIVE'|'MIXED HISTORY'|'HIGH-RISK HISTORY'
  winRate:number|null
  medianRoi:number|null
  entryBeforeCallRate:number|null
  dumpAfterCallRate:number|null
  rugExposureRate:number|null
  thesisQuality:number|null
  flags:string[]
  sourceMix:string[]
}

const clamp=(v:number,min=0,max=1)=>Math.min(max,Math.max(min,v))
const rate=(yes:number,total:number)=>total?yes/total:null

function median(values:number[]){
  if(!values.length)return null
  const a=[...values].sort((x,y)=>x-y)
  const m=Math.floor(a.length/2)
  return a.length%2?a[m]:(a[m-1]+a[m])/2
}

export function scoreCaller(wallet:string,observations:CallerObservation[]):CallerReputation{
  const rows=observations.filter(o=>o.wallet===wallet)
  if(!rows.length){
    return{wallet,sampleSize:0,scoredSampleSize:0,score:0,confidence:0,status:'UNVERIFIED',winRate:null,medianRoi:null,entryBeforeCallRate:null,dumpAfterCallRate:null,rugExposureRate:null,thesisQuality:null,flags:[],sourceMix:[]}
  }

  const roiRows=rows.filter(o=>o.roiPct!==null)
  const entryRows=rows.filter(o=>o.entryBeforeCall!=='unknown')
  const dumpRows=rows.filter(o=>o.dumpAfterCall!=='unknown')
  const rugRows=rows.filter(o=>o.rugged!=='unknown')
  const thesisRows=rows.filter(o=>o.thesisScore!==null)

  const winRate=roiRows.length?roiRows.filter(o=>(o.roiPct??0)>0).length/roiRows.length:null
  const medianRoi=median(roiRows.map(o=>o.roiPct as number))
  const entryBeforeCallRate=rate(entryRows.filter(o=>o.entryBeforeCall==='yes').length,entryRows.length)
  const dumpAfterCallRate=rate(dumpRows.filter(o=>o.dumpAfterCall==='yes').length,dumpRows.length)
  const rugExposureRate=rate(rugRows.filter(o=>o.rugged==='yes').length,rugRows.length)
  const thesisQuality=thesisRows.length?thesisRows.reduce((a,b)=>a+(b.thesisScore??0),0)/thesisRows.length:null

  let weighted=0
  let weight=0
  if(winRate!==null){weighted+=winRate*20;weight+=20}
  if(medianRoi!==null){weighted+=clamp((medianRoi+30)/80)*15;weight+=15}
  if(entryBeforeCallRate!==null){weighted+=entryBeforeCallRate*20;weight+=20}
  if(dumpAfterCallRate!==null){weighted+=(1-dumpAfterCallRate)*15;weight+=15}
  if(rugExposureRate!==null){weighted+=(1-rugExposureRate)*20;weight+=20}
  if(thesisQuality!==null){weighted+=clamp(thesisQuality/5)*10;weight+=10}

  const evidenceScore=weight?weighted/weight*100:50
  const scoredSampleSize=new Set([...roiRows,...entryRows,...dumpRows,...rugRows,...thesisRows].map(x=>x.id)).size
  const confidence=clamp(scoredSampleSize/12)
  let score=Math.round(50*(1-confidence)+evidenceScore*confidence)
  if(rows.length<3)score=Math.min(score,65)

  const flags:string[]=[]
  if(winRate!==null&&winRate<.4)flags.push('Observed win rate below 40%')
  if(medianRoi!==null&&medianRoi<0)flags.push('Median observed ROI is negative')
  if(entryBeforeCallRate!==null&&entryBeforeCallRate<.5)flags.push('Often enters at/after public call')
  if(dumpAfterCallRate!==null&&dumpAfterCallRate>.3)flags.push('Frequent post-call selling pattern')
  if(rugExposureRate!==null&&rugExposureRate>.15)flags.push('Elevated rug exposure')
  if(rows.length<5)flags.push('Small observation sample')

  let status:CallerReputation['status']='MIXED HISTORY'
  if(rows.length<3)status='LOW SAMPLE'
  else if(score>=75&&confidence>=.5)status='STRONG HISTORY'
  else if(score>=60)status='WATCH POSITIVE'
  else if(score<40)status='HIGH-RISK HISTORY'

  return{
    wallet,sampleSize:rows.length,scoredSampleSize,score,confidence:Math.round(confidence*100),
    status,winRate,medianRoi,entryBeforeCallRate,dumpAfterCallRate,rugExposureRate,thesisQuality,
    flags,sourceMix:[...new Set(rows.map(x=>x.source))],
  }
}

export function rankCallers(observations:CallerObservation[]){
  const wallets=[...new Set(observations.map(o=>o.wallet).filter(Boolean))]
  return wallets.map(w=>scoreCaller(w,observations)).sort((a,b)=>b.score-a.score||b.sampleSize-a.sampleSize)
}

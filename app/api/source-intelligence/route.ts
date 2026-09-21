import { NextRequest, NextResponse } from 'next/server'
import { buildSourceIntelligence } from '@/lib/source-intelligence'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const n=(request:NextRequest,key:string)=>Number(request.nextUrl.searchParams.get(key)||0)

export async function GET(request:NextRequest){
  const p=request.nextUrl.searchParams
  const tokenAddress=p.get('tokenAddress')||''
  const chain=p.get('chain')||'solana'
  const symbol=p.get('symbol')||'TOKEN'
  const slug=p.get('slug')||''
  const cmcUrl=p.get('cmcUrl')||''

  if(!tokenAddress){
    return NextResponse.json({error:'tokenAddress is required for Source Intelligence'},{status:400})
  }

  try{
    const data=await buildSourceIntelligence({
      tokenAddress,chain,symbol,slug,cmcUrl,
      marketCap:n(request,'marketCap'),
      volumeToMarketCap:n(request,'volumeToMarketCap'),
      fdvToMarketCap:n(request,'fdvToMarketCap'),
      change1h:n(request,'change1h'),
      change24h:n(request,'change24h'),
      behavior:p.get('behavior')||'unavailable',
      whaleBuyers:n(request,'whaleBuyers'),
      smartBuyers:n(request,'smartBuyers'),
      whaleNetFlow:n(request,'whaleNetFlow'),
      smartNetFlow:n(request,'smartNetFlow'),
      security:p.get('security')||'unknown',
    })
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store, max-age=0'}})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Source Intelligence failed'},{status:502})
  }
}

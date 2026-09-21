import { NextRequest, NextResponse } from 'next/server'
import { scanMarket } from '@/lib/dexscreener'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const ALLOWED=new Set(['solana','base','bsc','ethereum','all'])

export async function GET(request:NextRequest){
  const requested=request.nextUrl.searchParams.get('chain') ?? 'solana'
  const chain=ALLOWED.has(requested)?requested:'solana'

  try{
    const tokens=await scanMarket(chain)
    return NextResponse.json({
      generatedAt:new Date().toISOString(),
      chain,
      source:'DEX Screener public API',
      coverage:'latest profiles + boosts, enriched with pair market data',
      tokens,
    },{headers:{'Cache-Control':'no-store, max-age=0'}})
  }catch(error){
    const message=error instanceof Error?error.message:'Unknown scanner error'
    return NextResponse.json({error:message},{status:502})
  }
}

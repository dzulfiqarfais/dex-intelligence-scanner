import { NextRequest, NextResponse } from 'next/server'
import { scanRemora } from '@/lib/remora'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request:NextRequest){
  const maxMarketCap=Number(request.nextUrl.searchParams.get('maxMarketCap')||250_000_000)
  const minVolume=Number(request.nextUrl.searchParams.get('minVolume')||100_000)

  try{
    const result=await scanRemora({maxMarketCap,minVolume})
    return NextResponse.json(result,{
      headers:{'Cache-Control':'no-store, max-age=0'},
    })
  }catch(error){
    const message=error instanceof Error?error.message:'Remora scan failed'
    return NextResponse.json({error:message},{status:502})
  }
}

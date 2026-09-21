import { NextRequest, NextResponse } from 'next/server'
import { scanRemora } from '@/lib/remora'
import { sendRemoraTelegram, telegramConfigured } from '@/lib/telegram'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request:NextRequest){
  const secret=process.env.CRON_SECRET?.trim()
  if(!secret) return NextResponse.json({ok:false,error:'CRON_SECRET is not configured'},{status:503})
  if(request.headers.get('authorization')!=='Bearer '+secret) return NextResponse.json({ok:false,error:'Unauthorized'},{status:401})
  if(!telegramConfigured()) return NextResponse.json({ok:false,error:'Telegram credentials are not configured'},{status:503})

  try{
    const scan=await scanRemora({maxMarketCap:250_000_000,minVolume:100_000})
    const result=await sendRemoraTelegram(scan.candidates)
    return NextResponse.json({ok:true,generatedAt:scan.generatedAt,result})
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Background scan failed'},{status:502})
  }
}

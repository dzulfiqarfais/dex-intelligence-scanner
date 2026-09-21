import { NextRequest, NextResponse } from 'next/server'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const EDGE_URL='https://hilkjrfudfuybayqdnbv.supabase.co/functions/v1/remora-db'

export async function POST(request:NextRequest){
  const key=request.headers.get('x-remora-key')||''
  if(!key) return NextResponse.json({error:'Remora database key is required'},{status:401})

  try{
    const body=await request.json()
    const res=await fetch(EDGE_URL,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-remora-key':key,
      },
      body:JSON.stringify(body),
      cache:'no-store',
      signal:AbortSignal.timeout(15000),
    })
    const text=await res.text()
    let data:any
    try{data=text?JSON.parse(text):{}}catch{data={error:text||'Invalid database response'}}
    return NextResponse.json(data,{
      status:res.status,
      headers:{'Cache-Control':'no-store, max-age=0'},
    })
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Remora database proxy failed'},{status:502})
  }
}

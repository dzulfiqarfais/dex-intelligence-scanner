import type { RemoraCandidate } from './remora'

export function telegramConfigured(){
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()&&process.env.TELEGRAM_CHAT_ID?.trim())
}

function money(v:number){
  if(v>=1e9)return '$'+(v/1e9).toFixed(2)+'B'
  if(v>=1e6)return '$'+(v/1e6).toFixed(2)+'M'
  if(v>=1e3)return '$'+(v/1e3).toFixed(1)+'K'
  return '$'+v.toFixed(0)
}

export async function sendRemoraTelegram(candidates:RemoraCandidate[]){
  const token=process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId=process.env.TELEGRAM_CHAT_ID?.trim()
  if(!token||!chatId) return {sent:false,reason:'Telegram is not configured'}

  const selected=candidates.filter(c=>c.alertEligible).slice(0,3)
  if(!selected.length) return {sent:false,reason:'No eligible Remora signal'}

  const lines=selected.flatMap(c=>[
    '🐋 '+c.symbol+' · Remora '+c.finalScore,
    'MC '+money(c.marketCap)+' · Vol/MC '+c.volumeToMarketCap.toFixed(2)+'x',
    'Flow '+c.behavior.state+' · whales buying '+c.behavior.activeWhaleBuyers+' · smart money '+c.behavior.activeSmartMoneyBuyers,
    'Security '+c.security.status.toUpperCase(),
    c.cmcUrl,
    '',
  ])
  const res=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text:'REMORA INTELLIGENCE\n\n'+lines.join('\n'),disable_web_page_preview:true}),
    signal:AbortSignal.timeout(12000),
  })
  if(!res.ok) throw new Error('Telegram returned '+res.status)
  return {sent:true,count:selected.length}
}

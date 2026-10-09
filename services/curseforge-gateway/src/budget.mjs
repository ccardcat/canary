// One publisher-wide Durable Object: atomic accounting across all Worker POPs.
export function configuredBudget(env) {
 const names=['GATEWAY_API_PER_MINUTE','GATEWAY_API_PER_DAY','GATEWAY_DOWNLOADS_PER_MINUTE','GATEWAY_BYTES_PER_DAY','GATEWAY_CONCURRENT_DOWNLOADS'];
 const values=names.map(name=>Number(env[name]));
 return values.every(v=>Number.isSafeInteger(v)&&v>0)?Object.fromEntries(names.map((n,i)=>[n,values[i]])):null;
}
export class GatewayBudget {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){
  const limits=configuredBudget(this.env);if(!limits)return new Response(null,{status:503});
  let input;try{input=await request.json();}catch{return new Response(null,{status:400});}
  const now=Date.now();const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
  if(input.release){
   await this.ctx.storage.transaction(async tx=>{const state=await tx.get('budget');if(state?.leases){delete state.leases[input.release];await tx.put('budget',state);}});
   return Response.json({ok:true});
  }
  if(!['api','bytes','downloads'].every(k=>Number.isSafeInteger(input[k]??0)&&(input[k]??0)>=0)||typeof input.lease!=='boolean')return new Response(null,{status:400});
  const result=await this.ctx.storage.transaction(async tx=>{
   const state=await tx.get('budget')||{minute,day,apiMinute:0,apiDay:0,downloads:0,bytes:0,leases:{}};
   if(state.minute!==minute){state.minute=minute;state.apiMinute=0;state.downloads=0;}
   if(state.day!==day){state.day=day;state.apiDay=0;state.bytes=0;}
   state.leases=Object.fromEntries(Object.entries(state.leases||{}).filter(([,expires])=>expires>now));
   const api=input.api||0,bytes=input.bytes||0,downloads=input.downloads||0;
   if(state.apiMinute+api>limits.GATEWAY_API_PER_MINUTE||state.apiDay+api>limits.GATEWAY_API_PER_DAY||state.downloads+downloads>limits.GATEWAY_DOWNLOADS_PER_MINUTE||state.bytes+bytes>limits.GATEWAY_BYTES_PER_DAY||input.lease&&Object.keys(state.leases).length>=limits.GATEWAY_CONCURRENT_DOWNLOADS)return {ok:false};
   state.apiMinute+=api;state.apiDay+=api;state.downloads+=downloads;state.bytes+=bytes;
   const lease=input.lease?crypto.randomUUID():null;if(lease)state.leases[lease]=now+310000;
   await tx.put('budget',state);return {ok:true,lease};
  });
  return Response.json(result,{status:result.ok?200:429});
 }
}
export async function reserve(env,input){
 const stub=env.GATEWAY_BUDGET.get(env.GATEWAY_BUDGET.idFromName('publisher-global'));
 const response=await stub.fetch('https://budget.internal/reserve',{method:'POST',body:JSON.stringify({api:0,bytes:0,downloads:0,lease:false,...input})});
 if(!response.ok)return {ok:false,status:response.status};
 const value=await response.json();return {...value,status:200};
}
export async function release(env,lease){
 if(!lease)return;
 try{await reserve(env,{release:lease});}catch{/* the bounded lease expires even if a POP disconnects */}
}

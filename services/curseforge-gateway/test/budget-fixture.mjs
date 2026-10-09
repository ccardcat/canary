import {GatewayBudget} from '../src/budget.mjs';
export function budgetBinding(env){
 const values=new Map();let queue=Promise.resolve();
 const storage={async transaction(action){const run=queue.then(()=>action({get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v))}));queue=run.catch(()=>{});return run;}};
 const object=new GatewayBudget({storage},env);
 return {idFromName:name=>name,get:id=>({fetch:(url,options)=>object.fetch(new Request(url,options))}),values};
}
export const limits={GATEWAY_API_PER_MINUTE:'5000',GATEWAY_API_PER_DAY:'100000',GATEWAY_DOWNLOADS_PER_MINUTE:'1000',GATEWAY_BYTES_PER_DAY:'1099511627776',GATEWAY_CONCURRENT_DOWNLOADS:'128'};

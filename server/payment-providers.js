function createSimulatedProvider({ enabled }) {
  return {
    name: "simulation",
    enabled,
    async initialize(transaction) { return { ok: true, status: "pending", reference: transaction.reference, simulated: true }; },
    result(transaction, outcome) {
      if (outcome === "success") return { status: "successful", amount: transaction.expectedAmount, currency: transaction.currency, providerReference: `SIM-${transaction.reference}` };
      if (outcome === "amount_mismatch") return { status: "successful", amount: transaction.expectedAmount + 1, currency: transaction.currency, providerReference: `SIM-${transaction.reference}` };
      if (["failed","cancelled","pending"].includes(outcome)) return { status: outcome, reason: `simulated_${outcome}` };
      return null;
    }
  };
}

function createPaystackProvider({ secretKey, mode = "test", fetchImpl = fetch }) {
  const expectedPrefix=mode==="live"?"sk_live_":"sk_test_";
  const enabled = secretKey.startsWith(expectedPrefix);
  return {
    name: `paystack_${mode}`, enabled, mode,
    async initialize(transaction, payer) {
      const response = await fetchImpl("https://api.paystack.co/charge", { method:"POST",headers:{Authorization:`Bearer ${secretKey}`,"Content-Type":"application/json"},body:JSON.stringify({email:payer.email,amount:transaction.expectedAmount,currency:transaction.currency,reference:transaction.reference,mobile_money:{phone:payer.phone,provider:payer.network},metadata:{nominee_id:transaction.nominee.id,votes:transaction.votes,purpose:"SRC Awards voting"}}) });
      const result=await response.json();
      if(!response.ok||!result.status) return {ok:false,message:result.message||"Payment provider could not start the charge."};
      return {ok:true,status:result.data?.status||"pending",displayText:result.data?.display_text||"Approve the prompt on your phone."};
    },
    async verify(reference) {
      const response=await fetchImpl(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${secretKey}`}});
      const result=await response.json();
      if(!response.ok||!result.status) return {status:"pending",reason:"provider_unavailable"};
      const data=result.data||{};
      if(data.status==="success") return {status:"successful",amount:data.amount,currency:data.currency,providerReference:String(data.id||data.reference||""),metadata:data.metadata||null};
      if(["failed","abandoned","reversed"].includes(data.status)) return {status:data.status==="abandoned"?"cancelled":"failed",reason:`provider_${data.status}`};
      return {status:"pending"};
    }
  };
}

module.exports={createSimulatedProvider,createPaystackProvider};

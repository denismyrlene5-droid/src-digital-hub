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

function safeDiagnosticText(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/sk_(?:test|live)_[A-Za-z0-9_-]+/gi, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\+?\d[\d\s()-]{8,}\d/g, "[redacted-phone]")
    .slice(0, 240);
}

function chargeClassification(responseOk, result) {
  if (!responseOk || !result?.status) return "failed";
  const status = String(result.data?.status || "pending").toLowerCase();
  if (status === "success") return "successful";
  if (["failed", "abandoned", "reversed"].includes(status)) return "failed";
  return "pending";
}

function errorCategory(error, phase) {
  if (phase === "parse") return "http_parsing";
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (name.includes("timeout") || name === "aborterror" || message.includes("timeout")) return "timeout";
  if (name === "typeerror" || message.includes("fetch") || message.includes("network") || message.includes("socket")) return "network";
  return "request";
}

function createPaystackProvider({ secretKey, mode = "test", fetchImpl = fetch, diagnosticsEnabled = false, diagnosticLogger = console.info, timeoutMs = 15_000 }) {
  const expectedPrefix=mode==="live"?"sk_live_":"sk_test_";
  const enabled = secretKey.startsWith(expectedPrefix);
  const request = (url, options = {}) => fetchImpl(url, { ...options, signal: options.signal || AbortSignal.timeout(timeoutMs) });
  function logCharge(fields) {
    if (diagnosticsEnabled) diagnosticLogger(`[paystack_charge] ${JSON.stringify(fields)}`);
  }
  return {
    name: `paystack_${mode}`, enabled, mode,
    async initialize(transaction, payer) {
      const context={reference:transaction.reference,provider:payer.network,currency:transaction.currency,amount:transaction.expectedAmount};
      let response;
      try {
        response = await request("https://api.paystack.co/charge", { method:"POST",headers:{Authorization:`Bearer ${secretKey}`,"Content-Type":"application/json"},body:JSON.stringify({email:payer.email,amount:transaction.expectedAmount,currency:transaction.currency,reference:transaction.reference,mobile_money:{phone:payer.phone,provider:payer.network},metadata:{nominee_id:transaction.nominee.id,votes:transaction.votes,purpose:"SRC Awards voting"}}) });
      } catch (error) {
        logCharge({...context,errorType:safeDiagnosticText(error?.name||"Error"),errorMessage:safeDiagnosticText(error?.message||"Payment request failed."),errorCategory:errorCategory(error,"request"),classification:"failed"});
        throw error;
      }
      let result;
      try {
        result=await response.json();
      } catch (error) {
        logCharge({...context,httpStatus:Number(response.status)||null,errorType:safeDiagnosticText(error?.name||"Error"),errorMessage:safeDiagnosticText(error?.message||"Payment response parsing failed."),errorCategory:errorCategory(error,"parse"),classification:"failed"});
        throw error;
      }
      const classification=chargeClassification(response.ok,result);
      logCharge({...context,httpStatus:Number(response.status)||null,topLevelStatus:Boolean(result.status),message:safeDiagnosticText(result.message),dataStatus:safeDiagnosticText(result.data?.status),dataDisplayText:safeDiagnosticText(result.data?.display_text),classification});
      if(!response.ok||!result.status) return {ok:false,message:result.message||"Payment provider could not start the charge."};
      if(classification==="failed") return {ok:false,message:result.message||"Payment provider rejected the charge."};
      return {ok:true,status:result.data?.status||"pending",displayText:result.data?.display_text||"Approve the prompt on your phone."};
    },
    async verify(reference) {
      let response,result;
      try {
        response=await request(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${secretKey}`}});
        result=await response.json();
      } catch {
        return {status:"pending",reason:"provider_unavailable"};
      }
      if(!response.ok||!result.status) return {status:"pending",reason:"provider_unavailable"};
      const data=result.data||{};
      if(data.status==="success") return {status:"successful",amount:data.amount,currency:data.currency,providerReference:String(data.id||data.reference||""),metadata:data.metadata||null};
      if(["failed","abandoned","reversed"].includes(data.status)) return {status:data.status==="abandoned"?"cancelled":"failed",reason:`provider_${data.status}`};
      return {status:"pending"};
    }
  };
}

module.exports={createSimulatedProvider,createPaystackProvider};

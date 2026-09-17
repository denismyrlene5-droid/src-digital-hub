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

function normalizeAccountNumber(value) {
  return String(value || "").trim();
}

function moolreStatus(value) {
  const status = Number(value);
  if (status === 1) return "successful";
  if (status === 2) return "failed";
  return "pending";
}

function createMoolreProvider({
  apiUser,
  publicKey,
  accountNumber,
  businessEmail,
  mode = "sandbox",
  fetchImpl = fetch,
  timeoutMs = 15_000,
  expirationMinutes = 15
}) {
  const credentials = {
    apiUser: String(apiUser || "").trim(),
    publicKey: String(publicKey || "").trim(),
    accountNumber: normalizeAccountNumber(accountNumber),
    businessEmail: String(businessEmail || "").trim()
  };
  const enabled = Boolean(credentials.apiUser && credentials.publicKey && credentials.accountNumber && credentials.businessEmail);
  const baseUrl = mode === "live" ? "https://api.moolre.com" : "https://sandbox.moolre.com";
  const headers = {
    "Content-Type": "application/json",
    "X-API-USER": credentials.apiUser,
    "X-API-PUBKEY": credentials.publicKey
  };
  const request = (pathname, body) => fetchImpl(`${baseUrl}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });

  return {
    name: `moolre_${mode}`,
    enabled,
    mode,
    accountNumber: credentials.accountNumber,
    async initialize(transaction, { callbackUrl, redirectUrl } = {}) {
      if (!enabled) return { ok: false, message: "Moolre payments are not configured." };
      const body = {
        type: 1,
        amount: (Number(transaction.expectedAmount) / 100).toFixed(2),
        email: credentials.businessEmail,
        externalref: transaction.reference,
        reusable: "0",
        currency: transaction.currency,
        accountnumber: credentials.accountNumber,
        expiration_time: Math.floor(Math.max(1, Math.min(1440, Number(expirationMinutes) || 15))),
        metadata: {
          nominee_id: transaction.nominee.id,
          votes: transaction.votes,
          purpose: "SRC Awards voting"
        }
      };
      if (callbackUrl) body.callback = callbackUrl;
      if (redirectUrl) body.redirect = redirectUrl;
      let response;
      let result;
      try {
        response = await request("/embed/link", body);
        result = await response.json();
      } catch (error) {
        return { ok: false, uncertain: true, status: "pending", message: "The payment link status is uncertain. Check this transaction again." };
      }
      if (!response.ok) {
        const uncertain = Number(response.status) >= 500 || Number(response.status) === 429;
        return { ok: false, uncertain, status: uncertain ? "pending" : "failed", message: uncertain ? "The payment provider is temporarily unavailable. Check this transaction again." : "Moolre could not create the payment link." };
      }
      const authorizationUrl = String(result?.data?.authorization_url || "");
      let safeUrl;
      try {
        safeUrl = new URL(authorizationUrl);
      } catch {
        safeUrl = null;
      }
      if (Number(result?.status) !== 1 || !safeUrl || safeUrl.protocol !== "https:" || !/(^|\.)moolre\.com$/i.test(safeUrl.hostname)) {
        return { ok: false, status: "failed", message: String(result?.message || "Moolre returned an invalid payment link.").slice(0, 180) };
      }
      return {
        ok: true,
        status: "pending",
        authorizationUrl: safeUrl.href,
        providerReference: String(result?.data?.reference || "")
      };
    },
    async collectMobileMoney(transaction, { payer, channel, sessionId } = {}) {
      if (!enabled) return { ok: false, status: "failed", message: "Moolre payments are not configured." };
      const normalizedPayer = String(payer || "").replace(/\D/g, "");
      const localPayer = normalizedPayer.startsWith("233") && normalizedPayer.length === 12
        ? `0${normalizedPayer.slice(3)}`
        : normalizedPayer;
      const network = String(channel || "").toUpperCase();
      if (!/^0\d{9}$/.test(localPayer) || !new Set(["MTN", "TELECEL", "AT"]).has(network)) {
        return { ok: false, status: "failed", message: "The USSD payment details are invalid." };
      }
      let response;
      let result;
      try {
        response = await request("/open/transact/payment", {
          type: 1,
          channel: network,
          currency: transaction.currency,
          payer: localPayer,
          amount: (Number(transaction.expectedAmount) / 100).toFixed(2),
          externalref: transaction.reference,
          reference: "SRC Awards vote",
          sessionid: String(sessionId || "").slice(0, 128),
          accountnumber: credentials.accountNumber
        });
        result = await response.json();
      } catch {
        return { ok: false, uncertain: true, status: "pending", message: "The payment prompt status is uncertain." };
      }
      if (!response.ok || Number(result?.status) !== 1) {
        const uncertain = Number(response.status) >= 500 || Number(response.status) === 429;
        return { ok: false, uncertain, status: uncertain ? "pending" : "failed", message: "Moolre could not start the payment prompt." };
      }
      return {
        ok: true,
        status: "pending",
        // The collection response ID is not the final status transactionid.
        promptReference: typeof result?.data === "string" ? result.data.slice(0, 160) : "",
        requiresOtp: String(result?.code || "").toUpperCase() === "TP14"
      };
    },
    async verify(reference, transaction = {}) {
      if (!enabled) return { status: "pending", reason: "provider_unavailable" };
      let response;
      let result;
      try {
        response = await request("/open/transact/status", { type: 1, idtype: 1, id: reference, accountnumber: credentials.accountNumber });
        result = await response.json();
      } catch {
        return { status: "pending", reason: "provider_unavailable" };
      }
      if (!response.ok || Number(result?.status) !== 1 || !result?.data) return { status: "pending", reason: "provider_unavailable" };
      const data = result.data;
      if (String(data.externalref || "") !== reference) return { status: "failed", reason: "provider_reference_mismatch" };
      if (normalizeAccountNumber(data.accountnumber) !== credentials.accountNumber) return { status: "failed", reason: "recipient_account_mismatch" };
      if (data.currency && String(data.currency).toUpperCase() !== String(transaction.currency || "GHS").toUpperCase()) return { status: "failed", reason: "currency_mismatch" };
      const status = moolreStatus(data.txstatus);
      if (status === "successful") {
        if (!String(data.transactionid || "").trim()) return { status: "pending", reason: "missing_provider_transaction_id" };
        const majorAmount = Number(data.amount);
        if (!Number.isFinite(majorAmount) || majorAmount < 0) return { status: "failed", reason: "invalid_provider_amount" };
        return {
          status,
          reference: String(data.externalref),
          amount: Math.round((majorAmount + Number.EPSILON) * 100),
          currency: String(transaction.currency || "GHS").toUpperCase(),
          recipientAccount: normalizeAccountNumber(data.accountnumber),
          providerReference: String(data.transactionid || "")
        };
      }
      return status === "failed" ? { status, reason: "provider_failed" } : { status };
    }
  };
}

module.exports={createSimulatedProvider,createPaystackProvider,createMoolreProvider};

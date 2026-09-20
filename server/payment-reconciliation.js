const awards = require("./awards");

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

async function scanDailyPayments(db, { date, afterId = 0, providerForTransaction }) {
  const parsed = datePattern.test(String(date)) ? new Date(`${date}T00:00:00.000Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return { error: "Choose a valid UTC report date." };
  }
  if (!Number.isSafeInteger(afterId) || afterId < 0) return { error: "Invalid report cursor." };
  const total = db.prepare(`SELECT COUNT(*) AS count FROM payments WHERE provider IN ('moolre_live','moolre_sandbox') AND date(created_at)=?`).get(date).count;
  const rows = db.prepare(`SELECT rowid AS cursor, reference FROM payments
    WHERE provider IN ('moolre_live','moolre_sandbox') AND date(created_at)=? AND rowid>?
    ORDER BY rowid LIMIT 6`).all(date, afterId);
  const batch = rows.slice(0, 5);
  const entries = [];
  for (const row of batch) {
    const payment = awards.transaction(db, row.reference, true);
    const entry = {
      reference: payment.reference, nominee: payment.nominee, category: payment.category,
      source: payment.metadata?.source === "ussd" ? "USSD" : "Website",
      expectedAmount: payment.expectedAmount, currency: payment.currency, votes: payment.votes,
      paymentStatus: payment.paymentStatus, verificationStatus: payment.verificationStatus,
      creditStatus: payment.voteCreditStatus, createdAt: payment.createdAt,
      providerStatus: "not_checked", finding: "none"
    };
    if (payment.voteCreditStatus === "credited" || ["reversed", "refunded"].includes(payment.paymentStatus)) {
      entry.finding = "already_settled_locally";
    } else {
      const provider = providerForTransaction(payment);
      if (!provider) {
        entry.providerStatus = "unavailable";
        entry.finding = "provider_unavailable";
      } else {
        let result;
        try { result = await provider.verify(payment.reference, payment); }
        catch { result = { status: "pending", reason: "provider_unavailable" }; }
        entry.providerStatus = result.status;
        if (result.status === "successful") {
          const amountMatches = result.amount === payment.expectedAmount;
          const accountMatches = !payment.metadata?.recipientAccount || result.recipientAccount === payment.metadata.recipientAccount;
          const referenceMatches = result.reference === payment.reference;
          const currencyMatches = result.currency === payment.currency;
          entry.finding = amountMatches && accountMatches && referenceMatches && currencyMatches
            ? "provider_success_uncredited" : "payment_details_mismatch";
        } else if (result.reason === "provider_unavailable") {
          entry.finding = "provider_unavailable";
        } else if (result.reason?.endsWith("mismatch")) {
          entry.finding = "payment_details_mismatch";
        } else {
          entry.finding = result.status === "failed" ? "provider_failed" : "provider_pending";
        }
      }
    }
    entries.push(entry);
  }
  return {
    date, timeZone: "UTC", total, entries,
    hasMore: rows.length > 5,
    nextCursor: batch.at(-1)?.cursor ?? afterId,
    summary: entries.reduce((summary, entry) => {
      summary[entry.finding] = (summary[entry.finding] || 0) + 1;
      return summary;
    }, {})
  };
}

module.exports = { scanDailyPayments };

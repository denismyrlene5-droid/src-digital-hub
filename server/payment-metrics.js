// Reporting only: payment amounts are stored in minor currency units.
function verifiedRevenue(db) {
  const { amount } = db.prepare("SELECT COALESCE(SUM(paid_amount),0) AS amount FROM payments WHERE payment_status='successful' AND verification_status='verified'").get();
  return { verifiedAmount: Number(amount), paidRevenue: Number(amount) / 100 };
}
module.exports = { verifiedRevenue };

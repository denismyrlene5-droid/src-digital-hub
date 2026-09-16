// Stable per nominee/category entry; do not replace the existing administrative code.
function votingCode(id) { return String(Number(id) + 1000); }
function nomineeIdFromCode(value) {
  const text = String(value || "").trim();
  if (!/^[1-9][0-9]{3,9}$/.test(text)) return null;
  const id = Number(text) - 1000;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
module.exports = { votingCode, nomineeIdFromCode };

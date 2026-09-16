# Nominee-code voting

The shared Moolre USSD menu offers code entry and category browsing. Each nominee/category entry has its own stable numeric voting code, derived from its immutable SQLite nominee ID plus 1000. Existing administrative codes and records are unchanged; no data migration is required.

Codes are public identifiers, not credentials. Only active, published nominees in active categories can be selected. Code entry displays the name and category for confirmation before quantity and amount confirmation. Payment and vote fulfillment use the existing server-verified ledger.

Codes appear on nominee cards/profiles and newly generated flyers. Previously downloaded flyers must be regenerated. No dial code is advertised until Moolre approval; the USSD callback URL and Railway token remain unchanged.

In Admin → Awards & Voting → USSD voting instructions, enter the approved shared dial code and enable display. The toggle defaults off. Instructions appear only while voting is open; this does not activate the Moolre service. The two new settings columns are added idempotently at startup without changing existing data.

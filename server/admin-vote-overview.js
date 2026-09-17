// Private reporting only. Stored nominee totals remain the server-owned authority.
function adminVoteOverview(db) {
  const nominees=db.prepare(`SELECT n.id,n.name,n.publication_status AS publicationStatus,c.name AS category,c.id AS categoryId,n.vote_total AS votes
    FROM nominees n JOIN categories c ON c.id=n.category_id WHERE n.source<>'demo' ORDER BY c.sort_order,n.name,n.id`).all();
  const credited=db.prepare(`SELECT v.nominee_id AS nomineeId,v.votes,p.provider,p.metadata_json AS metadata
    FROM vote_transactions v JOIN payments p ON p.reference=v.reference
    WHERE p.payment_status='successful' AND p.verification_status='verified' AND p.vote_credit_status='credited'
    AND p.provider IN ('moolre_live','paystack_live')`).all();
  const channels=new Map();
  for(const row of credited){
    let metadata={};try{metadata=JSON.parse(row.metadata||'{}');}catch{}
    const totals=channels.get(row.nomineeId)||{website:0,ussd:0};
    totals[metadata?.source==='ussd'?'ussd':'website']+=Number(row.votes);
    channels.set(row.nomineeId,totals);
  }
  const categoryMap=new Map(db.prepare("SELECT c.id,c.name FROM categories c WHERE c.active=1 OR EXISTS(SELECT 1 FROM nominees n WHERE n.category_id=c.id AND n.source<>'demo') ORDER BY c.sort_order,c.id").all().map(row=>[row.id,{...row,nominees:0,votes:0,websiteVotes:0,ussdVotes:0}]));
  let totalVotes=0,websiteVotes=0,ussdVotes=0;
  for(const nominee of nominees){
    const counts=channels.get(nominee.id)||{website:0,ussd:0};
    nominee.websiteVotes=counts.website;nominee.ussdVotes=counts.ussd;
    nominee.otherVotes=Number(nominee.votes)-counts.website-counts.ussd;
    const category=categoryMap.get(nominee.categoryId)||{id:nominee.categoryId,name:nominee.category,nominees:0,votes:0,websiteVotes:0,ussdVotes:0};
    category.nominees++;category.votes+=Number(nominee.votes);category.websiteVotes+=counts.website;category.ussdVotes+=counts.ussd;
    categoryMap.set(category.id,category);
    totalVotes+=Number(nominee.votes);websiteVotes+=counts.website;ussdVotes+=counts.ussd;
  }
  const paymentCounts=db.prepare(`SELECT COALESCE(SUM(p.payment_status='pending'),0) AS pendingPayments,
    COALESCE(SUM(p.verification_status='rejected' AND p.vote_credit_status='not_credited'),0) AS rejectedPayments
    FROM payments p JOIN nominees n ON n.id=p.nominee_id WHERE n.source<>'demo'`).get();
  return {totalVotes,verifiedLiveVotes:websiteVotes+ussdVotes,websiteVotes,ussdVotes,otherVotes:totalVotes-websiteVotes-ussdVotes,
    ...paymentCounts,nominees,categories:[...categoryMap.values()]};
}
module.exports={adminVoteOverview};

const crypto=require("crypto");
const fs=require("fs");
const path=require("path");
const {DatabaseSync}=require("node:sqlite");

function main(){
  if(!process.argv[2])throw new Error("Usage: npm run verify-backup -- <backup-directory>");
  const directory=path.resolve(process.argv[2]);
  const databasePath=path.join(directory,"src-digital-hub.sqlite");
  const manifestPath=path.join(directory,"manifest.json");
  if(!fs.existsSync(databasePath)||!fs.existsSync(manifestPath))throw new Error("Backup database or manifest is missing.");
  const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
  const digest=crypto.createHash("sha256").update(fs.readFileSync(databasePath)).digest("hex");
  if(digest!==manifest.databaseSha256)throw new Error("Backup checksum does not match its manifest.");
  const db=new DatabaseSync(databasePath,{readOnly:true});
  try{
    if(db.prepare("PRAGMA integrity_check").get().integrity_check!=="ok")throw new Error("SQLite integrity check failed.");
    const foreignKeys=db.prepare("PRAGMA foreign_key_check").all();if(foreignKeys.length)throw new Error("Backup contains foreign-key violations.");
    const required=["categories","nominees","payments","vote_transactions","payment_adjustments","audit_log","announcements","events","feedback_submissions","media_albums","src_executives"];
    const existing=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row=>row.name));
    const missing=required.filter(name=>!existing.has(name));if(missing.length)throw new Error(`Backup is missing required tables: ${missing.join(", ")}`);
    const summary={integrity:"ok",foreignKeys:"ok",tables:required.length,transactions:db.prepare("SELECT COUNT(*) AS count FROM payments").get().count,adjustments:db.prepare("SELECT COUNT(*) AS count FROM payment_adjustments").get().count,uploadsDirectory:fs.existsSync(path.join(directory,"uploads"))};
    console.log(JSON.stringify(summary));
  }finally{db.close();}
}

try{main();}catch(error){console.error(`Backup verification failed: ${error.message}`);process.exitCode=1;}

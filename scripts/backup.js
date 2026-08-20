const crypto=require("crypto");
const fs=require("fs");
const path=require("path");
const {DatabaseSync,backup}=require("node:sqlite");

async function main(){
  const root=path.resolve(__dirname,"..");
  const databasePath=path.resolve(process.env.DATABASE_PATH||path.join(root,"data","src-awards.sqlite"));
  const uploadDirectory=path.resolve(process.env.UPLOAD_DIRECTORY||path.join(root,"data","uploads"));
  if(!fs.existsSync(databasePath))throw new Error("Database does not exist.");
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const destination=path.resolve(process.argv[2]||path.join(root,"backups",stamp));
  if(destination.startsWith(path.join(root,"public")+path.sep))throw new Error("Backups must never be written inside the public directory.");
  fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
  fs.mkdirSync(destination,{recursive:false,mode:0o700});
  const targetDatabase=path.join(destination,"src-digital-hub.sqlite");
  const source=new DatabaseSync(databasePath,{readOnly:true});
  try{await backup(source,targetDatabase);}finally{source.close();}
  const targetUploads=path.join(destination,"uploads");
  if(fs.existsSync(uploadDirectory))fs.cpSync(uploadDirectory,targetUploads,{recursive:true,errorOnExist:true});
  const check=new DatabaseSync(targetDatabase,{readOnly:true});
  let integrity;try{integrity=check.prepare("PRAGMA integrity_check").get().integrity_check;}finally{check.close();}
  if(integrity!=="ok")throw new Error("Backup integrity check failed.");
  const digest=crypto.createHash("sha256").update(fs.readFileSync(targetDatabase)).digest("hex");
  const manifest={createdAt:new Date().toISOString(),databaseFile:"src-digital-hub.sqlite",databaseSha256:digest,uploadsIncluded:fs.existsSync(targetUploads),encrypted:false,integrity};
  fs.writeFileSync(path.join(destination,"manifest.json"),JSON.stringify(manifest,null,2),{flag:"wx",mode:0o600});
  console.log(`Backup created: ${destination}`);
  console.log("Encryption status: NOT ENCRYPTED — encrypt before off-site storage.");
}

main().catch(error=>{console.error(`Backup failed: ${error.message}`);process.exitCode=1;});

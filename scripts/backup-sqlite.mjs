import {DatabaseSync, backup} from 'node:sqlite';
import {existsSync, chmodSync, mkdirSync, renameSync, unlinkSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Consistent backup of the local *demo* SQLite DB; NOT persistent Render storage. */
export async function backupDemoDatabase(source, target) {
  if(typeof source!=='string'||!source||source===':memory:')throw new Error('Expected a persistent source DB_FILE');
  if(typeof target!=='string'||!target)throw new Error('Expected an explicit backup destination');
  const src=resolve(source), dst=resolve(target);
  if(src===dst)throw new Error('Source and backup destination must differ');
  if(!existsSync(src))throw new Error('Source database is missing');
  if(existsSync(dst))throw new Error('Backup destination already exists; refusing overwrite');
  mkdirSync(dirname(dst),{recursive:true});
  const temp=dst+'.tmp-'+randomBytes(8).toString('hex');
  const db=new DatabaseSync(src,{readOnly:true});
  try {
    await backup(db,temp);
    chmodSync(temp,0o600);
    renameSync(temp,dst);
    return dst;
  } catch(error) {
    if(existsSync(temp))unlinkSync(temp);
    throw error;
  } finally {db.close()}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  backupDemoDatabase(process.env.DB_FILE,process.argv[2]).then(path=>{
    process.stdout.write('Backup saved to '+path+'. Secure the file and test a restore.\n');
  }).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1});
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore} from '../src/store.mjs';
import {backupDemoDatabase} from '../scripts/backup-sqlite.mjs';

test('Demo snapshot restores sites, catalog and user credentials',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'jame3-backup-'));
  try{
    const source=path.join(dir,'active.sqlite'),target=path.join(dir,'backup.sqlite');
    const db=createStore(source);
    const uid=db.bootstrapOwner('owner@example.com','test-only-strong-owner-password-2026');
    const site=db.createSite({slug:'site-a',name:'Site A',tagline:'Test',accent:'#223344',plan:'starter'},uid);
    db.addProduct(site,'Demo',12300,5,uid);
    assert.equal(await backupDemoDatabase(source,target),target);
    assert.equal(statSync(target).mode&0o777,0o600);
    db.close();
    const restored=createStore(target);
    try{
      assert.equal(restored.listSites().length,1);
      assert.equal(restored.countProducts(restored.getSite('site-a').id),1);
      assert.ok(restored.verifyLogin('owner@example.com','test-only-strong-owner-password-2026'));
    }finally{restored.close()}
    await assert.rejects(()=>backupDemoDatabase(source,target),/already exists/);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
test('Backup rejects memory, missing source, and identical paths',async()=>{
  await assert.rejects(()=>backupDemoDatabase(':memory:','/tmp/foo'),/persistent source/);
  await assert.rejects(()=>backupDemoDatabase('/missing/file.sqlite','/tmp/foo'),/missing/);
  await assert.rejects(()=>backupDemoDatabase('/tmp/foo','/tmp/foo'),/differ/);
});

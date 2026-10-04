import assert from 'node:assert/strict';
import { lstat, readFile, symlink, truncate, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
const png=Buffer.from([137,80,78,71,13,10,26,10,0]);

test('AP HEIC decoder uses private files and removes them after success and failure',async()=>{
  const {decodeHeicImage}=await import('../src/heic-decoder.js');
  let root='';
  const value=await decodeHeicImage(Buffer.from('synthetic-heic'),async(input,output)=>{
    root=dirname(input);assert.equal((await lstat(root)).mode&0o777,0o700);
    assert.equal((await lstat(input)).mode&0o777,0o600);
    assert.equal((await readFile(input)).toString(),'synthetic-heic');
    await writeFile(output,png);
  });
  assert.deepEqual(value,png);await assert.rejects(lstat(root),{code:'ENOENT'});
  assert.equal(await decodeHeicImage(Buffer.from('bad'),async(input)=>{root=dirname(input);throw new Error('decode failed');}),null);
  await assert.rejects(lstat(root),{code:'ENOENT'});
});

test('AP HEIC decoder rejects multiple images, symlinks, non-PNG and oversized output',async()=>{
  const {decodeHeicImage}=await import('../src/heic-decoder.js');
  for(const decode of [
    async(input:string,output:string)=>{await writeFile(output,png);await writeFile(resolve(dirname(input),'output-1.png'),png);},
    async(input:string,output:string)=>{await symlink(input,output);},
    async(_input:string,output:string)=>{await writeFile(output,Buffer.from('not a png image'));},
    async(_input:string,output:string)=>{await writeFile(output,png);await truncate(output,100*1024*1024+1);},
  ])assert.equal(await decodeHeicImage(Buffer.from('synthetic'),decode),null);
});

test('AP HEIC decoder limits two concurrent decodes and releases slots after cleanup',async()=>{
  const {decodeHeicImage}=await import('../src/heic-decoder.js');
  let release=()=>{},entered=0,ready=()=>{};
  const hold=new Promise<void>(done=>{release=done;}),both=new Promise<void>(done=>{ready=done;});
  const decode=async(_input:string,output:string)=>{if(++entered===2)ready();await hold;await writeFile(output,png);};
  const pending=[decodeHeicImage(Buffer.from('1'),decode),decodeHeicImage(Buffer.from('2'),decode)];
  try{await both;assert.equal(await decodeHeicImage(Buffer.from('3'),decode),null);}
  finally{release();}
  assert.deepEqual(await Promise.all(pending),[png,png]);
  assert.deepEqual(await decodeHeicImage(Buffer.from('4'),async(_input,output)=>{await writeFile(output,png);}),png);
});

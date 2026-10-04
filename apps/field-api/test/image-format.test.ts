import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { isHeicImage, normalizeSiteImage, unsupportedImageError } from '../src/site-media.js';
import { SYNTHETIC_HEIC } from './heic-fixture.js';
import { dirname, resolve } from 'node:path';
import { lstat, stat, writeFile, symlink } from 'node:fs/promises';
import { heicDecoderAvailable } from '../src/heic-decoder.js';

test('Field really converts iPhone HEIC when the bounded decoder exists and reports missing capability honestly', async () => {
  const heic=await normalizeSiteImage(SYNTHETIC_HEIC);
  if(heicDecoderAvailable()){assert.ok(heic);assert.deepEqual([heic.width,heic.height],[16,16]);assert.equal((await sharp(heic.data).metadata()).format,'webp');}
  else assert.equal(heic,null);
  assert.equal(isHeicImage(SYNTHETIC_HEIC), true);
  assert.deepEqual(unsupportedImageError(SYNTHETIC_HEIC), { error: 'unsupported_image_format', hint: 'heic_unsupported' });
  const avif = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#f16e50' } }).avif().toBuffer();
  const jpeg = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#f16e50' } }).jpeg().toBuffer();
  for (const supported of [avif, jpeg]) {
    assert.equal(isHeicImage(supported), false);
    assert.ok(await normalizeSiteImage(supported));
  }
  assert.deepEqual(unsupportedImageError(Buffer.from('<svg onload="alert(1)"/>')), { error: 'unsupported_image' });
  assert.deepEqual(unsupportedImageError(undefined), { error: 'unsupported_image' });
});

test('Field bounded HEIC decoder accepts one private PNG output and rejects extra or unsafe files',async()=>{
  const module=await import('../src/heic-decoder.js').catch(()=>null);assert.ok(module,'bounded HEIC decoder must exist');
  const png=await sharp({create:{width:16,height:16,channels:3,background:'#123456'}}).png().toBuffer();
  let temporary='';
  const converted=await module.decodeHeicImage(SYNTHETIC_HEIC,async(input:string,output:string)=>{
    temporary=dirname(input);assert.equal((await stat(temporary)).mode&0o777,0o700);assert.equal((await stat(input)).mode&0o777,0o600);
    await writeFile(output,png,{mode:0o600});
  });
  assert.deepEqual(converted,png);await assert.rejects(lstat(temporary),{code:'ENOENT'});
  assert.equal(await module.decodeHeicImage(SYNTHETIC_HEIC,async(_input:string,output:string)=>{
    await writeFile(output,png);await writeFile(resolve(dirname(output),'extra.png'),png);
  }),null);
  assert.equal(await module.decodeHeicImage(SYNTHETIC_HEIC,async(input:string,output:string)=>{await symlink(input,output);}),null);
  assert.equal(await module.decodeHeicImage(SYNTHETIC_HEIC,async()=>{throw new Error('decoder timed out');}),null);
  let release!:()=>void;const blocked=new Promise<void>(done=>{release=done;});let started=0;
  const run=async(_input:string,output:string)=>{started++;await blocked;await writeFile(output,png);};
  const first=module.decodeHeicImage(SYNTHETIC_HEIC,run),second=module.decodeHeicImage(SYNTHETIC_HEIC,run);
  while(started<2)await new Promise(done=>setTimeout(done,1));
  assert.equal(await module.decodeHeicImage(SYNTHETIC_HEIC,run),null);release();assert.ok(await first);assert.ok(await second);
});

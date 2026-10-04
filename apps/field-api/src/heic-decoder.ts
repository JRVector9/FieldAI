import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

type Decoder=(input:string,output:string)=>Promise<void>;
let active=0;
export function heicDecoderAvailable(){return process.platform==='linux'&&existsSync('/usr/bin/prlimit')&&existsSync('/usr/bin/heif-convert');}
const nativeDecode:Decoder=async(input,output)=>{
  if(!heicDecoderAvailable())throw new Error('HEIC decoder unavailable');
  await promisify(execFile)('/usr/bin/prlimit',['--as=536870912','--cpu=10','--fsize=104857600','--','/usr/bin/heif-convert',input,output],
    {timeout:15_000,killSignal:'SIGKILL',maxBuffer:16_384,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}});
};
// Decode only; WebP output and metadata removal remain in the existing sharp path.
// Multiple images are rejected. No shell or runtime executable override is used.
export async function decodeHeicImage(input:Buffer,decode:Decoder=nativeDecode):Promise<Buffer|null> {
  if(!input.length||input.length>8*1024*1024||active>=2)return null;
  active++;let directory:string|undefined;
  try {
    directory=await mkdtemp(resolve(tmpdir(),'field-heic-'));
    const source=resolve(directory,'input.heic'),output=resolve(directory,'output.png');
    await writeFile(source,input,{mode:0o600});await decode(source,output);
    const names=(await readdir(directory)).sort();
    if(names.length!==2||names[0]!=='input.heic'||names[1]!=='output.png')return null;
    const file=await lstat(output);
    if(!file.isFile()||file.isSymbolicLink()||file.size<8||file.size>100*1024*1024)return null;
    const data=await readFile(output);
    return data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?data:null;
  }catch{return null;}
  finally{try{if(directory)await rm(directory,{recursive:true,force:true});}finally{active--;}}
}

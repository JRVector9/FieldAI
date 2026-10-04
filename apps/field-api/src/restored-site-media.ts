import { constants } from 'node:fs';
import { lstat,open,realpath,unlink } from 'node:fs/promises';
import { dirname,isAbsolute,relative,resolve,sep } from 'node:path';
import type { FieldSiteMediaStore } from './site-media.js';

const nested=(parent:string,child:string)=>{const path=relative(parent,child);return path===''||(!path.startsWith(`..${sep}`)&&path!=='..'&&!isAbsolute(path));};
export async function createRestoredSiteMediaStore(restored:string,active:string):Promise<FieldSiteMediaStore>{
  const root=await realpath(resolve(restored)),activeRoot=await realpath(resolve(active));
  if(nested(root,activeRoot)||nested(activeRoot,root))throw new Error('restore site media roots must be disjoint');
  const initial=await lstat(root);
  if(!initial.isDirectory()||initial.isSymbolicLink())throw new Error('restore media path is not confined');
  const path=async(key:string)=>{
    if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(key))throw new Error('invalid Field media key');
    const current=await lstat(root);
    if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==initial.dev||current.ino!==initial.ino)throw new Error('restore media path is not confined');
    const target=resolve(root,key),parent=dirname(target);
    try {
      const directory=await lstat(parent);
      if(!directory.isDirectory()||directory.isSymbolicLink()||await realpath(parent)!==parent)throw new Error('restore media path is not confined');
      const file=await lstat(target);
      if(!file.isFile()||file.isSymbolicLink()||file.nlink!==1)throw new Error('restore media path is not confined');
      return {target,file};
    }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  };
  return {
    put:async()=>{throw new Error('restore media store does not accept uploads');},
    get:async(key)=>{
      const item=await path(key);if(!item)return null;
      const handle=await open(item.target,constants.O_RDONLY|constants.O_NOFOLLOW);
      try{const actual=await handle.stat();if(!actual.isFile()||actual.nlink!==1||actual.dev!==item.file.dev||actual.ino!==item.file.ino)throw new Error('restore media path is not confined');return await handle.readFile();}
      finally{await handle.close();}
    },
    exists:async(key)=>!!await path(key),
    delete:async(key)=>{const item=await path(key);if(item)await unlink(item.target);},
  };
}

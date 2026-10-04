// PostgreSQL text/jsonb cannot store NUL. Validate decoded text before authorization or writes;
// uploaded/signed binary bodies remain byte-for-byte unchanged.
export function containsNul(value:unknown):boolean {
  const pending=[value],seen=new Set<object>();
  while(pending.length){
    const item=pending.pop();
    if(typeof item==='string'){if(item.includes('\0'))return true;continue;}
    if(!item||typeof item!=='object'||ArrayBuffer.isView(item)||item instanceof ArrayBuffer||seen.has(item))continue;
    seen.add(item);
    for(const [key,child] of Object.entries(item)){if(key.includes('\0'))return true;pending.push(child);}
  }
  return false;
}

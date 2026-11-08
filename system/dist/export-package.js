(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SeismicExportPackage=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let bit=0;bit<8;bit++)c=c&1 ? 0xedb88320^(c>>>1) : c>>>1;table[n]=c>>>0;}
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function header(length){const bytes=new Uint8Array(length);return {bytes,view:new DataView(bytes.buffer)};}
  function zipStored(entries){
    if(!Array.isArray(entries)||entries.length>65535)throw new RangeError('ZIP entry count');
    const seen=new Set(),parts=[],directory=[];let offset=0;
    for(const entry of entries){
      if(typeof entry.name!=='string'||!entry.name||entry.name.includes('..')||/[\\/\u0000]/.test(entry.name)||seen.has(entry.name))throw new TypeError('Unique flat ZIP filenames required');
      seen.add(entry.name);const name=new TextEncoder().encode(entry.name),data=typeof entry.data==='string'?new TextEncoder().encode(entry.data):entry.data;
      if(!(data instanceof Uint8Array)||name.length>65535||data.length>0xffffffff)throw new TypeError('ZIP entry bytes');
      const crc=crc32(data),local=header(30),v=local.view;
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);
      v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
      parts.push(local.bytes,name,data);
      const central=header(46),c=central.view;c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);
      c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
      directory.push(central.bytes,name);offset+=30+name.length+data.length;
      if(offset>0xffffffff)throw new RangeError('ZIP64 is not supported');
    }
    const centralSize=directory.reduce((n,b)=>n+b.length,0),end=header(22),e=end.view;
    if(offset+centralSize>0xffffffff)throw new RangeError('ZIP64 is not supported');
    e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    return new Blob([...parts,...directory,end.bytes],{type:'application/zip'});
  }
  return Object.freeze({zipStored,crc32});
});

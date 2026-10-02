/* Clipboard parsing never follows pasted URLs or uploads image contents. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ColorbarClipboard=api;})(globalThis,function(){
  function imageFile(transfer){
    if(!transfer)return null;
    for(const item of Array.from(transfer.items||[]))if(item.kind==='file'&&item.type.startsWith('image/')){
      const file=item.getAsFile();if(file)return file;
    }
    return Array.from(transfer.files||[]).find(file=>file.type.startsWith('image/'))||null;
  }
  return {imageFile};
});

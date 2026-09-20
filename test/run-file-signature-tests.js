const assert=require('assert');
const path=require('path');
let failures=0;
function t(name,fn){try{fn();console.log('PASS:',name)}catch(e){console.error('FAIL:',name,e);failures++}}
(async()=>{
 const {bytesMatchDeclaredType,isPlausibleText}=await import(path.join(__dirname,'../api/_lib/file-signature.js'));
 t('PNG accepted',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),'image/png'),true));
 t('fake PNG rejected',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from('not png'),'image/png'),false));
 t('JPEG accepted',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from([0xff,0xd8,0xff,0xe0]),'image/jpeg'),true));
 t('fake JPEG rejected',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from([0x89,0x50,0x4e,0x47]),'image/jpeg'),false));
 t('WEBP accepted',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]),'image/webp'),true));
 t('fake WEBP rejected',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from('RIFF....AVI '),'image/webp'),false));
 t('PDF accepted',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from('%PDF-1.7'),'application/pdf'),true));
 t('fake PDF rejected',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from('plain text'),'application/pdf'),false));
 t('DOCX ZIP accepted',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from([0x50,0x4b,0x03,0x04]),'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),true));
 t('fake DOCX rejected',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from('%PDF-1.7'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),false));
 t('ASCII text accepted',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from('Hello syllabus'),'text/plain'),true));
 t('UTF-8 text accepted',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from('Tamil தமிழ் text'),'text/plain'),true));
 t('NUL text rejected',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from([65,0,66]),'text/plain'),false));
 t('control-heavy text rejected',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.alloc(100,1),'text/plain'),false));
 t('unknown type fails closed',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from('anything'),'application/octet-stream'),false));
 t('short buffer rejected',()=>assert.strictEqual(bytesMatchDeclaredType(Buffer.from([1,2]),'image/png'),false));
 t('isPlausibleText exported',()=>assert.strictEqual(isPlausibleText(Buffer.from('plain text')),true));
 if(failures){process.exit(1)} console.log('ALL FILE-SIGNATURE TESTS PASSED');
})();

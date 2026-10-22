import {composeAnswer} from '../core/orchestrator/answerComposer';

test.each(['en','ar'])('edit and read-back describe the actual mutation in %s', language => {
 const reply=composeAnswer([
  {id:'edit',tool:'file_edit',status:'completed',input:{path:'notes.txt'},result:{success:true}},
  {id:'read',tool:'read_file',status:'completed',input:{path:'notes.txt'},result:{content:'ready\nkept',totalLines:2}},
 ],language);
 expect(reply).toContain('ready\nkept');
 expect(reply).toContain('notes.txt');
 expect(reply).not.toMatch(/No files were written or modified|لم تُجرَ أي كتابة أو تعديل/);
 expect(reply).toMatch(language==='ar'?/تم تعديل النص المحدد/:/specified text was replaced/);
});

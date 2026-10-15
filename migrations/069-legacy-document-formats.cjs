exports.up=pgm=>pgm.sql(`
 ALTER TABLE artifact_versions DROP CONSTRAINT artifact_versions_detected_format_check;
 ALTER TABLE artifact_versions ADD CONSTRAINT artifact_versions_detected_format_check
  CHECK(detected_format IS NULL OR detected_format IN
   ('pdf','docx','pptx','xlsx','csv','txt','md','png','jpeg','json','html','rtf','epub','odt','ods','odp','odg'));
`);
exports.down=()=>{throw Error('Retained document formats require forward recovery');};

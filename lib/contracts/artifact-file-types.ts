/** Browser upload and replacement controls use the same declared MIME types. */
export const artifactFileTypes: Record<string,string> = {
 pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 csv:'text/csv',txt:'text/plain',md:'text/markdown',log:'text/plain',
 json:'application/json',yaml:'text/yaml',yml:'text/yaml',xml:'application/xml',
 html:'text/html',rtf:'application/rtf',epub:'application/epub+zip',
 odt:'application/vnd.oasis.opendocument.text',ods:'application/vnd.oasis.opendocument.spreadsheet',
 odp:'application/vnd.oasis.opendocument.presentation',odg:'application/vnd.oasis.opendocument.graphics',
 png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
};
export const artifactFileAccept=Object.keys(artifactFileTypes).map(extension=>'.'+extension).join(',');

"""Bounded, offline inspection of generated native report artifacts."""
import hashlib, io, json, re, subprocess, sys, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main','c':'http://schemas.openxmlformats.org/drawingml/2006/chart'}
def check(directory):
 root=Path(directory); pdf=root/'report.pdf'; pptx=root/'report.pptx'
 result=json.loads((root/'renderer.json').read_text())
 assert result['schemaVersion']=='report-render-result-v1'
 for key,path in [('pdf',pdf),('pptx',pptx)]:
  data=path.read_bytes();assert 0<len(data)<=10485760 and len(data)==result[key]['sizeBytes']
  assert hashlib.sha256(data).hexdigest()==result[key]['digest'],'Artifact bytes changed'
 assert pdf.stat().st_size+pptx.stat().st_size<=15728640
 info=subprocess.run(['pdfinfo',str(pdf)],capture_output=True,check=True,timeout=15).stdout.decode()
 pages=int(re.search(r'^Pages:\s+(\d+)',info,re.M)[1])
 assert 1<=pages<=40 and pages==result['pages']
 fonts=subprocess.run(['pdffonts',str(pdf)],capture_output=True,check=True,timeout=15).stdout.decode()
 lines=fonts.splitlines()[2:]; assert lines and all('Geist' in line for line in lines), 'Unapproved PDF font'
 assert all(re.search(r'\byes\s+yes\s+yes\b',line) for line in lines),'PDF font must be embedded, subset, Unicode'
 text=subprocess.run(['pdftotext','-layout',str(pdf),'-'],capture_output=True,check=True,timeout=15).stdout.decode()
 assert '\ufffd' not in text and text.strip()
 for title in ['Executive Decision Brief','Maturity Journey','Value and Adoption','Delivery Portfolio','Risk and Readiness','Next Period Plan','Appendix','Evidence and Review']:
  assert title in text, 'Missing required PDF heading: '+title
 with zipfile.ZipFile(pptx) as archive:
  entries=archive.infolist()
  assert len(entries)<1000 and sum(x.file_size for x in entries)<50*1024*1024
  assert all(x.file_size<=10*1024*1024 and not x.filename.startswith('/') and '..' not in x.filename.split('/') for x in entries)
  slides=sorted(x.filename for x in entries if re.fullmatch(r'ppt/slides/slide\d+\.xml',x.filename))
  assert len(slides)==result['slides'] and 1<=len(slides)<=40
  tables=charts=0; native=[]
  for filename in slides:
   tree=ET.fromstring(archive.read(filename)); assert tree.attrib.get('show','1')!='0','Hidden slide'; native.extend(n.text or '' for n in tree.findall('.//a:t',NS))
   tables+=len(tree.findall('.//a:tbl',NS)); charts+=len(tree.findall('.//c:chart',NS))
   assert tree.findall('.//p:sp',NS), 'Slide is not native editable text'
   for face in tree.findall('.//a:latin',NS): assert face.attrib['typeface']=='Geist','Unexpected slide font'
  assert tables>=1
  for filename in [x.filename for x in entries if x.filename.endswith('.rels')]:
   tree=ET.fromstring(archive.read(filename))
   assert not any(n.attrib.get('TargetMode')=='External' for n in tree),'External artifact relationship'
  for entry in entries:
   if entry.filename.startswith('ppt/embeddings/') and not entry.is_dir():
    assert entry.filename.endswith('.xlsx'),'Unexpected embedded object'
    with zipfile.ZipFile(io.BytesIO(archive.read(entry.filename))) as workbook:
     parts=workbook.infolist();assert len(parts)<100 and sum(part.file_size for part in parts)<10485760
     assert all(not any(segment in part.filename for segment in ['externalLinks','connections','queryTables','vbaProject']) for part in parts),'Unsafe embedded workbook'
     for part in parts:
      if part.filename.endswith('.xml'):
       xml=ET.fromstring(workbook.read(part.filename));assert not any(node.tag.endswith('}f') for node in xml.iter()),'Embedded formula'
      if part.filename.endswith('.rels'):
       assert not any(node.attrib.get('TargetMode')=='External' for node in ET.fromstring(workbook.read(part.filename)))
  assert any(value.strip() for value in native)
  presentation=ET.fromstring(archive.read('ppt/presentation.xml'))
  size=presentation.find('p:sldSz',NS); assert abs(int(size.attrib['cx'])/int(size.attrib['cy'])-16/9)<.001
 return {'pages':pages,'slides':len(slides),'nativeTables':tables,'nativeCharts':charts,'approvedEmbeddedFonts':True}
if __name__=='__main__': print(json.dumps(check(sys.argv[1])))

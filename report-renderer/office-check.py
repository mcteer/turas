"""Edit a separate native presentation copy, reopen it, and export both copies for visual QA."""
import json, os, subprocess, sys, time
import uno
from com.sun.star.beans import PropertyValue

def prop(name,value):
 p=PropertyValue();p.Name=name;p.Value=value;return p
source,root=sys.argv[1:3]
server=subprocess.Popen(['soffice','--headless','--norestore','--nodefault','--nofirststartwizard','-env:UserInstallation=file:///tmp/report-office','--accept=socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 local=uno.getComponentContext();resolver=local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local)
 context=None
 for _ in range(100):
  try:context=resolver.resolve('uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext');break
  except Exception:time.sleep(.1)
 if context is None:raise RuntimeError('Office service unavailable')
 desktop=context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',context)
 doc=desktop.loadComponentFromURL(uno.systemPathToFileUrl(source),'_blank',0,(prop('Hidden',True),))
 doc.storeToURL(uno.systemPathToFileUrl(root+'/slides.pdf'),(prop('FilterName','impress_pdf_Export'),))
 changed={'text':None,'table':None,'chart':None};chart_expected=None
 for page_index in range(doc.getDrawPages().getCount()):
  page=doc.getDrawPages().getByIndex(page_index)
  for shape_index,shape in enumerate(page):
   if shape.ShapeType=='com.sun.star.drawing.TableShape' and changed['table'] is None:
    cell=shape.Model.getCellByPosition(1,0);cell.String='Office edit verified';changed['table']=(page_index,shape_index)
   elif shape.supportsService('com.sun.star.drawing.OLE2Shape') and shape.Model.supportsService('com.sun.star.chart2.ChartDocument') and changed['chart'] is None:
    data=[list(row) for row in shape.Model.getData().getData()];data[0][0]+=1;chart_expected=data[0][0]
    shape.Model.getData().setData(tuple(tuple(row) for row in data));changed['chart']=(page_index,shape_index)
   elif hasattr(shape,'String') and shape.String and changed['text'] is None:
    shape.String='Office text edit verified';changed['text']=(page_index,shape_index)
 if changed['text'] is None or changed['table'] is None:raise RuntimeError('Native objects missing')
 doc.storeAsURL(uno.systemPathToFileUrl(root+'/edited.pptx'),(prop('FilterName','Impress MS PowerPoint 2007 XML'),))
 doc.close(True);doc=None
 reopened=desktop.loadComponentFromURL(uno.systemPathToFileUrl(root+'/edited.pptx'),'_blank',0,(prop('Hidden',True),))
 checks={}
 for kind,position in changed.items():
  if position is None:checks[kind]='not_applicable';continue
  shape=reopened.getDrawPages().getByIndex(position[0]).getByIndex(position[1])
  checks[kind]=(shape.String=='Office text edit verified') if kind=='text' else (shape.Model.getCellByPosition(1,0).String=='Office edit verified') if kind=='table' else abs(shape.Model.getData().getData()[0][0]-chart_expected)<.0001
 if not all(value is True or value=='not_applicable' for value in checks.values()):raise RuntimeError('Native edits did not persist')
 reopened.storeToURL(uno.systemPathToFileUrl(root+'/edited.pdf'),(prop('FilterName','impress_pdf_Export'),))
 reopened.close(True)
 with open(root+'/office.json','x') as stream:json.dump({'nativeSaveReopen':checks},stream)
 print('Native office save/reopen verified')
finally:
 if 'doc' in locals() and doc is not None:
  try:doc.close(True)
  except Exception:pass
 server.terminate()
 try:server.wait(timeout=10)
 except subprocess.TimeoutExpired:server.kill()

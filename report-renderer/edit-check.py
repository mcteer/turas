import os, subprocess, time, sys
import uno
from com.sun.star.beans import PropertyValue

def prop(name,value):
    p=PropertyValue();p.Name=name;p.Value=value;return p
root=sys.argv[1] if len(sys.argv)>1 else '/output'
server=subprocess.Popen(['soffice','--headless','--norestore','--nodefault','--nofirststartwizard','-env:UserInstallation=file:///tmp/turas-office','--accept=socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    local=uno.getComponentContext(); resolver=local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local)
    context=None
    for _ in range(100):
        try: context=resolver.resolve('uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext');break
        except Exception:time.sleep(.1)
    if context is None:raise RuntimeError('Office editing service unavailable')
    desktop=context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',context)
    doc=desktop.loadComponentFromURL(uno.systemPathToFileUrl(root+'/spike.pptx'),'_blank',0,(prop('Hidden',True),))
    text=False;table=False;chart=False
    page=doc.getDrawPages().getByIndex(0)
    for shape in page:
        if shape.ShapeType=='com.sun.star.drawing.TableShape':
            shape.Model.getCellByPosition(1,1).String='61';table=True
        elif shape.supportsService('com.sun.star.drawing.OLE2Shape'):
            model=shape.Model
            if model.supportsService('com.sun.star.chart2.ChartDocument'):
                model.getData().setData(((61.0,),(91.0,)));chart=True
        elif hasattr(shape,'String') and shape.String=='Executive Review':
            shape.String='Edited Executive Review';text=True
    if not (text and table and chart):raise RuntimeError('Native editable object missing: '+str((text,table,chart)))
    doc.storeAsURL(uno.systemPathToFileUrl(root+'/edited.pptx'),(prop('FilterName','Impress MS PowerPoint 2007 XML'),prop('Overwrite',True)))
    doc.close(True)
    reopened=desktop.loadComponentFromURL(uno.systemPathToFileUrl(root+'/edited.pptx'),'_blank',0,(prop('Hidden',True),))
    checks={'text':False,'table':False,'chart':False}
    for shape in reopened.getDrawPages().getByIndex(0):
        if shape.ShapeType=='com.sun.star.drawing.TableShape':checks['table']=shape.Model.getCellByPosition(1,1).String=='61'
        elif shape.supportsService('com.sun.star.drawing.OLE2Shape') and shape.Model.supportsService('com.sun.star.chart2.ChartDocument'):checks['chart']=abs(shape.Model.getData().getData()[0][0]-61)<.01
        elif hasattr(shape,'String') and shape.String=='Edited Executive Review':checks['text']=True
    if not all(checks.values()):raise RuntimeError('Saved native edit did not persist: '+str(checks))
    reopened.storeToURL(uno.systemPathToFileUrl(root+'/edited.pdf'),(prop('FilterName','impress_pdf_Export'),prop('Overwrite',True)))
    reopened.close(True)
    print('Native text/table/chart edits survived save and reopen')
finally:
    if 'doc' in locals() and doc is not None:
        try:doc.close(True)
        except Exception:pass
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill()

import pathlib
H=pathlib.Path(__file__).parent; P=H.parent.parent; L="/tmp/libs/"
safe=lambda s:s.replace("</script","<\\/script")
pdf=open(L+"pdfjs-dist-3.11.174/package/build/pdf.min.js").read()
wk=open(L+"pdfjs-dist-3.11.174/package/build/pdf.worker.min.js").read()
mm=open(L+"mammoth-1.8.0/package/mammoth.browser.min.js").read()
libs=(f'<script>{safe(pdf)}</script>\n<script id="pdfWorker" type="text/plain">{safe(wk)}</script>\n'
 '<script>pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([document.getElementById("pdfWorker").textContent],{type:"text/javascript"}));</script>\n'
 f'<script>{safe(mm)}</script>')
s=(H/"shell.html").read_text().replace("/*CSS*/",(P/"static/app.css").read_text()).replace("<!--LIBS-->",libs).replace("/*APP*/",safe((H/"app.js").read_text()))
for n in ("index.html","飞检依据检索.html"): (H.parent/n).write_text(s)
print(len(s))

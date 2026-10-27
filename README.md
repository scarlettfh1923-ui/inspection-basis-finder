# 飞检依据检索（单文件版）

医保飞行检查辅助工具：输入问题描述 → 识别项目与问题类型（重复收费/过度检查等）→ 检索项目内涵、临床意义原文并排对照，支持收藏、复制引用、导出 MD/Word。

- **直接双击 `飞检依据检索.html`（或 `index.html`）即可使用**，无需安装，所有库已内联，可离线。
- 本地知识库：上传 PDF（文字版）/ Word .docx / TXT / MD，存于浏览器 IndexedDB，前端 BM25 检索，显示书名与页码，**无需 Key**。
- 可选 DeepSeek：在「设置」填写 Key（仅存本浏览器 localStorage）。网页搜索/抓取调用 DeepSeek `/v1/tools/search`、`/v1/tools/fetch`，**按次收费**，默认关闭。
- 工具只汇集原文，不作定性；AI 摘录须与原文核对。扫描版 PDF 暂不支持。

源码在 `src/`，`python src/build.py` 重新打包（需本地放置 pdf.js / mammoth）。

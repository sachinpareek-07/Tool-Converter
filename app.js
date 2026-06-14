/* =============================================
   BETTER CONVERTER — app.js
   Vanilla JS · jsPDF · PDF.js · PDF-lib · PapaParse
   ============================================= */

'use strict';

// ── PDF.js worker ─────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── State ─────────────────────────────────────
const fileStore = {}; // toolId → File or File[]

// ── Toast ─────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ── Progress ──────────────────────────────────
function showProgress(toolId, pct) {
  const wrap = document.getElementById(`prog-${toolId}`);
  const bar  = wrap?.querySelector('.progress-bar');
  if (!wrap || !bar) return;
  wrap.classList.add('active');
  bar.style.width = pct + '%';
  if (pct >= 100) setTimeout(() => { wrap.classList.remove('active'); bar.style.width = '0%'; }, 600);
}

// ── Open / Close panels ───────────────────────
function openTool(toolId) {
  document.getElementById(`panel-${toolId}`)?.classList.add('active');
  document.getElementById('overlay')?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeTool(toolId) {
  document.getElementById(`panel-${toolId}`)?.classList.remove('active');
  document.getElementById('overlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

function closeAllTools() {
  document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('overlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

// ── Drag & Drop ───────────────────────────────
document.querySelectorAll('.dropzone').forEach(dz => {
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('dragover');
    const toolId = dz.id.replace('dz-', '');
    const input  = document.getElementById(`file-${toolId}`);
    const files  = e.dataTransfer.files;
    if (!files.length) return;
    // Simulate input change
    const dt = new DataTransfer();
    Array.from(files).forEach(f => dt.items.add(f));
    input.files = dt.files;
    handleFile(toolId, input);
  });
});

// ── Handle File Upload ────────────────────────
function handleFile(toolId, input) {
  const files  = Array.from(input.files);
  if (!files.length) return;

  const isMulti = ['image-to-pdf', 'merge-pdf'].includes(toolId);
  fileStore[toolId] = isMulti ? files : files[0];

  // Show file chips
  const infoEl = document.getElementById(`info-${toolId}`);
  if (infoEl) {
    infoEl.innerHTML = files.map(f =>
      `<span class="file-chip">📎 ${f.name} <span style="opacity:.5">${formatSize(f.size)}</span></span>`
    ).join('');
  }

  // Enable button
  const btn = document.getElementById(`btn-${toolId}`);
  if (btn) btn.disabled = false;

  // Previews
  renderPreview(toolId, files);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ── Previews ──────────────────────────────────
async function renderPreview(toolId, files) {
  const el = document.getElementById(`preview-${toolId}`);
  if (!el) return;

  if (toolId === 'image-to-pdf') {
    el.innerHTML = '';
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      const img = document.createElement('img');
      img.src = url;
      el.appendChild(img);
    });
    return;
  }

  if (toolId === 'pdf-to-word' || toolId === 'compress-pdf' || toolId === 'pdf-to-image') {
    el.innerHTML = `<div class="preview-text">📄 ${files[0].name} — ${formatSize(files[0].size)}\nReady to convert.</div>`;
    return;
  }

  if (toolId === 'word-to-pdf') {
    const text = await files[0].text();
    el.innerHTML = `<div class="preview-text">${escHtml(text.slice(0, 300))}${text.length > 300 ? '…' : ''}</div>`;
    return;
  }

  if (toolId === 'excel-to-pdf') {
    const text = await files[0].text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (parsed.data.length) {
      const headers = Object.keys(parsed.data[0]);
      const rows    = parsed.data.slice(0, 6);
      el.innerHTML = `
        <table class="preview-table">
          <thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${escHtml(String(r[h] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
    }
    return;
  }

  if (toolId === 'merge-pdf') {
    el.innerHTML = `<div class="preview-text">${files.map((f, i) => `${i + 1}. ${f.name} (${formatSize(f.size)})`).join('\n')}</div>`;
    return;
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Main Convert Dispatcher ───────────────────
async function convert(toolId) {
  const btn = document.getElementById(`btn-${toolId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Converting…'; }

  try {
    showProgress(toolId, 20);

    switch (toolId) {
      case 'pdf-to-word':   await convertPdfToWord();   break;
      case 'word-to-pdf':   await convertWordToPdf();   break;
      case 'image-to-pdf':  await convertImageToPdf();  break;
      case 'pdf-to-image':  await convertPdfToImage();  break;
      case 'excel-to-pdf':  await convertExcelToPdf();  break;
      case 'merge-pdf':     await mergePdfs();           break;
      case 'compress-pdf':  await compressPdf();         break;
      case 'text-to-pdf':   await convertTextToPdf();   break;
    }

    showProgress(toolId, 100);
    toast('✅ Done! File downloaded successfully.');
  } catch (err) {
    console.error(err);
    toast('❌ Error: ' + (err.message || 'Something went wrong.'), 'error');
    showProgress(toolId, 0);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = getOriginalLabel(toolId);
    }
  }
}

function getOriginalLabel(toolId) {
  const labels = {
    'pdf-to-word':  'Extract & Download Text',
    'word-to-pdf':  'Convert to PDF',
    'image-to-pdf': 'Convert to PDF',
    'pdf-to-image': 'Convert Pages to PNG',
    'excel-to-pdf': 'Convert to PDF',
    'merge-pdf':    'Merge & Download PDF',
    'compress-pdf': 'Compress & Download',
    'text-to-pdf':  'Generate PDF',
  };
  return labels[toolId] || 'Convert';
}

// ── 1. PDF → Word (text extraction) ──────────
async function convertPdfToWord() {
  const file = fileStore['pdf-to-word'];
  if (!file) throw new Error('No file selected.');

  showProgress('pdf-to-word', 40);
  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText      = `Extracted from: ${file.name}\n${'─'.repeat(40)}\n\n`;

  for (let i = 1; i <= pdf.numPages; i++) {
    showProgress('pdf-to-word', 40 + Math.round((i / pdf.numPages) * 50));
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += `[Page ${i}]\n${pageText}\n\n`;
  }

  downloadText(fullText, file.name.replace('.pdf', '') + '_extracted.txt');
}

// ── 2. Word/Text → PDF ────────────────────────
async function convertWordToPdf() {
  const file = fileStore['word-to-pdf'];
  if (!file) throw new Error('No file selected.');

  showProgress('word-to-pdf', 40);
  const text = await file.text();
  showProgress('word-to-pdf', 70);

  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
  const lines = doc.splitTextToSize(text, 170);
  let y = 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  lines.forEach(line => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(line, 20, y);
    y += 6;
  });

  doc.save(file.name.replace(/\.[^.]+$/, '') + '.pdf');
}

// ── 3. Image → PDF ────────────────────────────
async function convertImageToPdf() {
  const files = fileStore['image-to-pdf'];
  if (!files?.length) throw new Error('No images selected.');

  showProgress('image-to-pdf', 20);
  const { jsPDF } = window.jspdf;
  let doc = null;

  for (let i = 0; i < files.length; i++) {
    showProgress('image-to-pdf', 20 + Math.round((i / files.length) * 70));
    const dataUrl = await fileToDataURL(files[i]);
    const img     = await loadImage(dataUrl);

    const pageW = 210, pageH = 297; // A4 mm
    const ratio  = Math.min(pageW / img.width, pageH / img.height);
    const w      = img.width  * ratio;
    const h      = img.height * ratio;
    const x      = (pageW - w) / 2;
    const y      = (pageH - h) / 2;

    const fmt = files[i].type === 'image/png' ? 'PNG' : 'JPEG';

    if (!doc) {
      doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: w > h ? 'landscape' : 'portrait' });
    } else {
      doc.addPage();
    }
    doc.addImage(dataUrl, fmt, x, y, w, h);
  }

  doc.save('images-converted.pdf');
}

// ── 4. PDF → Image ────────────────────────────
async function convertPdfToImage() {
  const file = fileStore['pdf-to-image'];
  if (!file) throw new Error('No file selected.');

  showProgress('pdf-to-image', 30);
  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    showProgress('pdf-to-image', 30 + Math.round((i / pdf.numPages) * 65));
    const page     = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const link = document.createElement('a');
    link.href  = canvas.toDataURL('image/png');
    link.download = `${file.name.replace('.pdf','')}_page${i}.png`;
    link.click();
    await sleep(200);
  }
}

// ── 5. Excel/CSV → PDF ───────────────────────
async function convertExcelToPdf() {
  const file = fileStore['excel-to-pdf'];
  if (!file) throw new Error('No file selected.');

  showProgress('excel-to-pdf', 30);
  const text   = await file.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const data   = parsed.data;
  const headers = data.length ? Object.keys(data[0]) : [];

  showProgress('excel-to-pdf', 60);
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ unit: 'mm', format: 'a4', orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  const pw   = doc.internal.pageSize.getWidth();

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(file.name.replace(/\.[^.]+$/, ''), 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated by BetterConverter · ${new Date().toLocaleDateString()}`, 14, 22);

  // Table
  doc.setTextColor(0);
  const colW  = Math.min(36, (pw - 28) / headers.length);
  let y       = 32;

  // Header row
  doc.setFillColor(60, 60, 100);
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.rect(14, y, pw - 28, 8, 'F');
  headers.forEach((h, i) => doc.text(String(h).slice(0, 14), 16 + i * colW, y + 5.5));
  y += 10;

  // Data rows
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30);
  data.forEach((row, ri) => {
    if (y > doc.internal.pageSize.getHeight() - 16) { doc.addPage(); y = 20; }
    if (ri % 2 === 0) { doc.setFillColor(245, 245, 252); doc.rect(14, y - 1, pw - 28, 7, 'F'); }
    headers.forEach((h, i) => {
      const val = String(row[h] ?? '').slice(0, 16);
      doc.text(val, 16 + i * colW, y + 4.5);
    });
    y += 7;
  });

  doc.save(file.name.replace(/\.[^.]+$/, '') + '.pdf');
}

// ── 6. Merge PDFs ─────────────────────────────
async function mergePdfs() {
  const files = fileStore['merge-pdf'];
  if (!files || files.length < 2) throw new Error('Select at least 2 PDF files.');

  showProgress('merge-pdf', 20);
  const { PDFDocument } = PDFLib;
  const merged = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    showProgress('merge-pdf', 20 + Math.round((i / files.length) * 70));
    const bytes = await files[i].arrayBuffer();
    const pdf   = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }

  showProgress('merge-pdf', 95);
  const mergedBytes = await merged.save();
  downloadBytes(mergedBytes, 'merged.pdf', 'application/pdf');
}

// ── 7. Compress PDF ───────────────────────────
async function compressPdf() {
  const file = fileStore['compress-pdf'];
  if (!file) throw new Error('No file selected.');

  showProgress('compress-pdf', 30);
  const { PDFDocument } = PDFLib;
  const bytes = await file.arrayBuffer();
  const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });

  // Remove metadata to reduce size
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('BetterConverter');
  pdf.setCreator('BetterConverter');

  showProgress('compress-pdf', 70);
  const saved = await pdf.save({ useObjectStreams: true });
  const reduction = (((bytes.byteLength - saved.byteLength) / bytes.byteLength) * 100).toFixed(1);

  downloadBytes(saved, file.name.replace('.pdf', '') + '_compressed.pdf', 'application/pdf');
  toast(`✅ Compressed! Reduced by ~${reduction}%`);
}

// ── 8. Text → PDF ─────────────────────────────
async function convertTextToPdf() {
  const content = document.getElementById('text-pdf-content')?.value?.trim();
  const title   = document.getElementById('text-pdf-title')?.value?.trim() || 'Document';
  const size    = parseInt(document.getElementById('text-pdf-size')?.value || '12');
  const align   = document.getElementById('text-pdf-align')?.value || 'left';

  if (!content) throw new Error('Please type some text first.');

  showProgress('text-to-pdf', 40);
  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxW   = pageW - margin * 2;

  // Title
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size + 4);
    doc.text(title, align === 'center' ? pageW / 2 : align === 'right' ? pageW - margin : margin, 24, { align });
  }

  // Body
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(content, maxW);
  let y = title ? 36 : 24;

  lines.forEach(line => {
    if (y > 278) { doc.addPage(); y = 20; }
    const x = align === 'center' ? pageW / 2 : align === 'right' ? pageW - margin : margin;
    doc.text(line, x, y, { align });
    y += size * 0.55;
  });

  showProgress('text-to-pdf', 80);
  doc.save(`${title.replace(/\s+/g, '_') || 'document'}.pdf`);
}

// ── Utils ──────────────────────────────────────

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadBytes(bytes, filename, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Keyboard close ─────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllTools();
});

// src/utils/skpImageHelper.ts
// Utilitas untuk memproses lampiran scan SKP (JPG/PNG/PDF 1 halaman) dan lampiran multi-halaman Folio

const MAX_SKP_WIDTH = 1100; // Lebar ideal Folio/A4 ~135-150 DPI, tajam & aman dari batas payload
const MAX_FOLIO_PAGE_BYTES = 150 * 1024; // ~150KB per halaman agar multi-halaman aman di Vercel

export interface ProcessedPageImage {
  pageNumber: number;
  dataUrl: string;
}

function drawResizedCanvas(sourceCanvas: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  if (sourceCanvas.width <= maxWidth) return sourceCanvas;
  const scale = maxWidth / sourceCanvas.width;
  const resized = document.createElement('canvas');
  resized.width = maxWidth;
  resized.height = Math.round(sourceCanvas.height * scale);
  const ctx = resized.getContext('2d');
  if (!ctx) return sourceCanvas;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, resized.width, resized.height);
  ctx.drawImage(sourceCanvas, 0, 0, resized.width, resized.height);
  return resized;
}

function estimateBase64Bytes(dataUrl: string): number {
  const idx = dataUrl.indexOf('base64,');
  if (idx === -1) return dataUrl.length;
  return Math.floor(((dataUrl.length - (idx + 7)) * 3) / 4);
}

function encodeFolioJpegUnderLimit(canvas: HTMLCanvasElement, initialQuality = 0.78): string {
  const targetCanvas = drawResizedCanvas(canvas, MAX_SKP_WIDTH);
  const qualities = [initialQuality, 0.68, 0.58, 0.48];
  let result = targetCanvas.toDataURL('image/jpeg', initialQuality);
  for (const q of qualities) {
    result = targetCanvas.toDataURL('image/jpeg', q);
    if (estimateBase64Bytes(result) <= MAX_FOLIO_PAGE_BYTES) {
      return result;
    }
  }
  return result;
}

function resizeCanvasToDataUrl(canvas: HTMLCanvasElement): string {
  const targetCanvas = drawResizedCanvas(canvas, MAX_SKP_WIDTH);
  const pngUrl = targetCanvas.toDataURL('image/png');
  if (estimateBase64Bytes(pngUrl) <= 450 * 1024) {
    return pngUrl;
  }
  return encodeFolioJpegUnderLimit(targetCanvas, 0.82);
}

async function loadImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Gagal memproses gambar.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error(`File gambar "${file.name}" tidak valid atau rusak.`));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error(`Gagal membaca file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

async function loadPdfDocument(file: File) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}

async function renderPdfPageToCanvas(pdf: any, pageNum: number, scale = 1.75): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(`Gagal membuat canvas untuk halaman ${pageNum}.`);
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport } as any).promise;
  return canvas;
}

/**
 * Mengonversi file SKP (JPG/PNG atau PDF halaman 1) menjadi Data URL tunggal.
 */
export async function processSkpFileToImageDataUrl(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const pdf = await loadPdfDocument(file);
    const canvas = await renderPdfPageToCanvas(pdf, 1, 2.0);
    return resizeCanvasToDataUrl(canvas);
  }

  const canvas = await loadImageToCanvas(file);
  return resizeCanvasToDataUrl(canvas);
}

/**
 * Membaca seluruh halaman dari file PDF maupun file gambar (.jpg/.png),
 * lalu mengonversinya menjadi array gambar berproporsi Folio (JPEG <= ~150KB/halaman).
 */
export async function processPdfOrImagePages(file: File): Promise<ProcessedPageImage[]> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const pdf = await loadPdfDocument(file);
    const pages: ProcessedPageImage[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const canvas = await renderPdfPageToCanvas(pdf, pageNum, 1.75);
      pages.push({
        pageNumber: pageNum,
        dataUrl: encodeFolioJpegUnderLimit(canvas, 0.78),
      });
    }
    return pages;
  }

  const canvas = await loadImageToCanvas(file);
  return [
    {
      pageNumber: 1,
      dataUrl: encodeFolioJpegUnderLimit(canvas, 0.78),
    },
  ];
}

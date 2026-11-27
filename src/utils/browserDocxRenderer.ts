// src/utils/browserDocxRenderer.ts
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import { injectBapLoopIntoDocumentXml } from './reportTemplatePayload';

const MODULE_NAME = 'open-xml-templating/docxtemplater-image-module';
const dimensionCache = new Map<string, [number, number]>();

function dataUrlCacheKey(dataUrl: string): string {
  return `${dataUrl.length}:${dataUrl.slice(0, 64)}:${dataUrl.slice(-32)}`;
}

function decodeBase64ToUint8Array(dataUrl: string): Uint8Array | null {
  const idx = dataUrl.indexOf('base64,');
  if (idx === -1) return null;
  const b64 = dataUrl.slice(idx + 7).trim();
  if (!b64) return null;
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getExtensionFromDataUrl(dataUrl: string): { ext: string; mime: string } {
  const match = dataUrl.match(/^data:(image\/[a-z0-9+.-]+);base64,/i);
  const mime = (match?.[1] || 'image/jpeg').toLowerCase();
  if (mime.includes('png')) return { ext: 'png', mime: 'image/png' };
  if (mime.includes('webp')) return { ext: 'webp', mime: 'image/webp' };
  return { ext: 'jpg', mime: 'image/jpeg' };
}

function collectBase64Strings(obj: any, out = new Set<string>()): Set<string> {
  if (!obj) return out;
  if (typeof obj === 'string') {
    if (obj.includes('base64,') && obj.startsWith('data:image/')) {
      out.add(obj);
    }
    return out;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectBase64Strings(item, out);
  } else if (typeof obj === 'object') {
    for (const val of Object.values(obj)) collectBase64Strings(val, out);
  }
  return out;
}

async function preloadImageDimensions(dataUrls: Iterable<string>): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const url of dataUrls) {
    const key = dataUrlCacheKey(url);
    if (dimensionCache.has(key)) continue;
    tasks.push(
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          dimensionCache.set(key, [img.naturalWidth || 550, img.naturalHeight || 350]);
          resolve();
        };
        img.onerror = () => {
          dimensionCache.set(key, [550, 350]);
          resolve();
        };
        img.src = url;
      })
    );
  }
  if (tasks.length > 0) await Promise.all(tasks);
}

function computeFittedImageSize(dataUrl: string, tagName: string): [number, number] {
  const [natW, natH] = dimensionCache.get(dataUrlCacheKey(dataUrl)) || [550, 350];
  let maxWidth = 550;
  let maxHeight = 350;

  if (tagName === 'img1' || tagName === 'img2' || tagName === 'img3') {
    maxWidth = 190;
    maxHeight = 215;
  } else if (tagName === 'jointPhoto') {
    maxWidth = 540;
    maxHeight = 420;
  } else if (
    tagName === 'skpAhliImage' ||
    tagName === 'skpPerusahaanImage' ||
    tagName === 'bapImage' ||
    tagName === 'image'
  ) {
    maxWidth = 560;
    maxHeight = 840;
  }

  let width = natW || maxWidth;
  let height = natH || maxHeight;
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }
  if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height);
    height = maxHeight;
  }
  return [width, height];
}

function buildImageXml(rId: number, emuSize: [number, number], centered: boolean): string {
  const drawing =
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${emuSize[0]}" cy="${emuSize[1]}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${rId}" name="Picture ${rId}" descr="image"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${rId}" name="Picture ${rId}" descr="image"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuSize[0]}" cy="${emuSize[1]}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;

  if (centered) {
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${drawing}</w:r></w:p>`;
  }
  return drawing;
}

/**
 * Module gambar ringan 100% browser-native untuk Docxtemplater (tanpa Node Buffer / xmldom CJS).
 */
class BrowserDocxImageModule {
  name = 'BrowserDocxImageModule';
  private zip: any;
  private xmlDocuments: any;
  private fileTypeConfig: any;
  private imageCounter = 1;

  optionsTransformer(options: any, docxtemplater: any) {
    const relsFiles = docxtemplater.zip
      .file(/\.xml\.rels/)
      .concat(docxtemplater.zip.file(/\[Content_Types\]\.xml/))
      .map((file: any) => file.name);
    this.fileTypeConfig = docxtemplater.fileTypeConfig;
    this.zip = docxtemplater.zip;
    options.xmlFileNames = options.xmlFileNames.concat(relsFiles);
    return options;
  }

  set(options: any) {
    if (options.zip) this.zip = options.zip;
    if (options.xmlDocuments) this.xmlDocuments = options.xmlDocuments;
  }

  parse(placeholder: string) {
    if (placeholder.startsWith('%%')) {
      return { type: 'placeholder', value: placeholder.slice(2), module: MODULE_NAME, centered: true };
    }
    if (placeholder.startsWith('%')) {
      return { type: 'placeholder', value: placeholder.slice(1), module: MODULE_NAME, centered: false };
    }
    return null;
  }

  postparse(parsed: any) {
    const DocUtils = (Docxtemplater as any).DocUtils;
    return DocUtils.traits.expandToOne(parsed, {
      moduleName: MODULE_NAME,
      expandTo: 'w:t',
      getInner: ({ part }: any) => part,
    });
  }

  render(part: any, options: any) {
    if (part.type !== 'placeholder' || part.module !== MODULE_NAME) return null;
    const tagValue = options.scopeManager.getValue(part.value, { part });
    if (!tagValue || typeof tagValue !== 'string' || !tagValue.includes('base64,')) {
      return { value: this.fileTypeConfig?.tagTextXml || '<w:t></w:t>' };
    }

    const bytes = decodeBase64ToUint8Array(tagValue);
    if (!bytes || bytes.length === 0) {
      return { value: this.fileTypeConfig?.tagTextXml || '<w:t></w:t>' };
    }

    const { ext, mime } = getExtensionFromDataUrl(tagValue);
    const rId = this.addImageToZip(options.filePath, bytes, ext, mime);
    const [wPx, hPx] = computeFittedImageSize(tagValue, part.value);
    const emu: [number, number] = [Math.round(wPx * 9525), Math.round(hPx * 9525)];
    return { value: buildImageXml(rId, emu, Boolean(part.centered)) };
  }

  private addImageToZip(filePath: string, bytes: Uint8Array, ext: string, mime: string): number {
    const baseName = filePath.replace(/^.*?([a-zA-Z0-9]+)\.xml$/, '$1');
    const relsPath = `word/_rels/${baseName}.xml.rels`;
    const relsDoc =
      this.xmlDocuments?.[relsPath] || this.xmlDocuments?.['word/_rels/document.xml.rels'];

    let imgFileName = `preview_img_${this.imageCounter++}.${ext}`;
    while (this.zip.files[`word/media/${imgFileName}`]) {
      imgFileName = `preview_img_${this.imageCounter++}.${ext}`;
    }
    this.zip.file(`word/media/${imgFileName}`, bytes, { binary: true });

    // Daftarkan extension MIME di [Content_Types].xml
    const ctDoc = this.xmlDocuments?.['[Content_Types].xml'];
    if (ctDoc) {
      const defaults = ctDoc.getElementsByTagName('Default');
      const exists = Array.prototype.some.call(
        defaults,
        (t: any) => String(t.getAttribute('Extension') || '').toLowerCase() === ext
      );
      if (!exists) {
        const typesNode = ctDoc.getElementsByTagName('Types')[0];
        if (typesNode) {
          const defNode = ctDoc.createElement('Default');
          defNode.setAttribute('Extension', ext);
          defNode.setAttribute('ContentType', mime);
          typesNode.appendChild(defNode);
        }
      }
    }

    if (!relsDoc) return 1;
    const rels = relsDoc.getElementsByTagName('Relationship');
    let maxId = 0;
    for (let i = 0; i < rels.length; i++) {
      const idAttr = rels[i].getAttribute('Id') || '';
      if (/^rId\d+$/.test(idAttr)) {
        maxId = Math.max(maxId, parseInt(idAttr.slice(3), 10));
      }
    }
    const nextId = maxId + 1;
    const relsRoot = relsDoc.getElementsByTagName('Relationships')[0];
    if (relsRoot) {
      const newRel = relsDoc.createElement('Relationship');
      newRel.setAttribute('Id', `rId${nextId}`);
      newRel.setAttribute(
        'Type',
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
      );
      newRel.setAttribute('Target', `media/${imgFileName}`);
      relsRoot.appendChild(newRel);
    }
    return nextId;
  }
}

export async function renderFilledDocxIntoElement(
  templateBuffer: ArrayBuffer,
  templateData: Record<string, any>,
  bodyTarget: HTMLElement,
  styleTarget: HTMLElement
): Promise<void> {
  // 1. Pre-load dimensi gambar agar rasio aspek gambar pas saat doc.render berjalan sinkron
  const allImages = collectBase64Strings(templateData);
  await preloadImageDimensions(allImages);

  // 2. Isi template dengan PizZip + Docxtemplater
  const zip = new PizZip(templateBuffer.slice(0));
  const hasBap = Array.isArray(templateData.bapAttachments) && templateData.bapAttachments.length > 0;
  injectBapLoopIntoDocumentXml(zip, hasBap);

  const doc = new Docxtemplater(zip, {
    modules: [new BrowserDocxImageModule() as any],
    paragraphLoop: true,
    linebreaks: true,
    nullGetter() {
      return '';
    },
  });

  doc.render(templateData);
  const blob = doc.toBlob({ compression: 'STORE' });

  // 3. Render ke staging off-screen lebih dulu agar UI visible tidak berkedip/lompat ke halaman 1
  const stagingBody = document.createElement('div');
  const stagingStyle = document.createElement('div');
  await renderAsync(blob, stagingBody, stagingStyle, {
    className: 'aksara-docx-preview',
    inWrapper: true,
    breakPages: true,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    renderHeaders: true,
    renderFooters: true,
    useBase64URL: true,
  });

  styleTarget.replaceChildren(...Array.from(stagingStyle.childNodes));
  bodyTarget.replaceChildren(...Array.from(stagingBody.childNodes));
}

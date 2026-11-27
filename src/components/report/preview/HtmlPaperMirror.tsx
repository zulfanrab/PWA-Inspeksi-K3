// src/components/report/preview/HtmlPaperMirror.tsx
import { useMemo } from 'react';
import {
  buildTemplateRenderData,
  type ReportPreviewData,
} from '../../../utils/reportTemplatePayload';
import { IppPaperMirror } from './IppPaperMirror';
import { IlPaperMirror } from './IlPaperMirror';
import { GenericPaperMirror } from './GenericPaperMirror';

export function hasDedicatedHtmlMirror(typeCode: string): boolean {
  const upper = String(typeCode || '').toUpperCase();
  return upper === 'IPP' || upper === 'IL';
}

interface HtmlPaperMirrorProps {
  previewData: ReportPreviewData;
  showMedia: boolean;
  apiBase: string;
}

export function HtmlPaperMirror({ previewData, showMedia, apiBase }: HtmlPaperMirrorProps) {
  const code = String(previewData.inspectionTypeCode || '').toUpperCase();
  const renderedData = useMemo(
    () => buildTemplateRenderData(previewData, { includeMedia: showMedia }),
    [previewData, showMedia]
  );

  if (code === 'IPP') {
    return (
      <IppPaperMirror
        renderedData={renderedData}
        previewData={previewData}
        showMedia={showMedia}
        apiBase={apiBase}
      />
    );
  }
  if (code === 'IL') {
    return (
      <IlPaperMirror
        renderedData={renderedData}
        previewData={previewData}
        showMedia={showMedia}
        apiBase={apiBase}
      />
    );
  }
  return (
    <GenericPaperMirror
      renderedData={renderedData}
      previewData={previewData}
      showMedia={showMedia}
      apiBase={apiBase}
    />
  );
}

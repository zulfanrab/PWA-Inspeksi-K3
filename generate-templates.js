// generate-templates.js
import fs from 'fs';
import { 
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
  WidthType, AlignmentType, BorderStyle, HeadingLevel 
} from 'docx';

function createCell(text, bold = false, size = 20, width = 100, align = AlignmentType.LEFT, fill = null) {
  const cellOptions = {
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: text,
            bold: bold,
            size: size,
            font: 'Arial'
          })
        ]
      })
    ],
    width: {
      size: width,
      type: WidthType.PERCENTAGE
    }
  };
  if (fill) {
    cellOptions.shading = { fill: fill };
  }
  return new TableCell(cellOptions);
}

function createTitleCell(text, bold = true, size = 22, width = 100, align = AlignmentType.CENTER, fill = '10B981') {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: text,
            bold: bold,
            size: size,
            color: 'FFFFFF',
            font: 'Arial'
          })
        ]
      })
    ],
    width: {
      size: width,
      type: WidthType.PERCENTAGE
    },
    shading: { fill: fill }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GENERATE TEMPLATE INSTALASI LISTRIK (IL)
// ─────────────────────────────────────────────────────────────────────────────
async function generateIL() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Header
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "PT. AKSARA RIKSA PERDANA", bold: true, size: 28, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Jl. Cibodas Raya No.2, Antapani Wetan, Bandung | Tel: 0821 2984 9515", size: 18, font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Title
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "LAPORAN PEMERIKSAAN DAN PENGUJIAN\nINSTALASI LISTRIK", bold: true, size: 24, font: "Arial" })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Nomor : {reportNumber}", bold: true, size: 20, color: "B91C1C", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Metadata Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [createCell("Nama Pemilik", true, 20, 30), createCell(": {companyName}", false, 20, 70)] }),
            new TableRow({ children: [createCell("Alamat", true, 20, 30), createCell(": {companyAddress}", false, 20, 70)] }),
            new TableRow({ children: [createCell("Tanggal Pemeriksaan", true, 20, 30), createCell(": {inspectionDate}", false, 20, 70)] }),
            new TableRow({ children: [createCell("Pemeriksa", true, 20, 30), createCell(": {inspectorName}", false, 20, 70)] })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section Title
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "I. DATA UMUM", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Data Umum Grid
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [createCell("1. Sumber Tegangan", true, 20, 40), createCell(": {sumberTegangan}", false, 20, 60)] }),
            new TableRow({ children: [createCell("2. Sumber Daya Listrik", true, 20, 40), createCell(": {sumberDayaListrik} kVA", false, 20, 60)] }),
            new TableRow({ children: [createCell("3. Daya Penerangan", true, 20, 40), createCell(": {dayaPenerangan} kVA", false, 20, 60)] }),
            new TableRow({ children: [createCell("4. Daya Tenaga", true, 20, 40), createCell(": {dayaTenaga} kVA", false, 20, 60)] }),
            new TableRow({ children: [createCell("5. Jumlah Phasa", true, 20, 40), createCell(": {jumlahPhasa}", false, 20, 60)] }),
            new TableRow({ children: [createCell("6. Frekuensi", true, 20, 40), createCell(": {frekuensi} Hz", false, 20, 60)] }),
            new TableRow({ children: [createCell("7. Jenis Arus", true, 20, 40), createCell(": {jenisArus}", false, 20, 60)] }),
            new TableRow({ children: [createCell("8. Tegangan Kerja", true, 20, 40), createCell(": {teganganKerja} Volt", false, 20, 60)] }),
            new TableRow({ children: [createCell("9. Lokasi Panel", true, 20, 40), createCell(": {lokasiPanel}", false, 20, 60)] })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section II: Visual Checklist
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "II. DATA CHECKLIST PEMERIKSAAN VISUAL", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Checklist Loop Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                createTitleCell("OBYEK PEMERIKSAAN", true, 20, 60),
                createTitleCell("STATUS", true, 20, 20),
                createTitleCell("KETERANGAN", true, 20, 20)
              ]
            }),
            // Loop Components
            new TableRow({
              children: [
                createCell("{#components}Kategori: {componentName}", true, 18, 60, AlignmentType.LEFT, "E2E8F0"),
                createCell("", false, 18, 20, AlignmentType.CENTER, "E2E8F0"),
                createCell("", false, 18, 20, AlignmentType.LEFT, "E2E8F0")
              ]
            }),
            // Loop Items
            new TableRow({
              children: [
                createCell("{#items}- {description}", false, 18, 60),
                createCell("{result}", false, 18, 20, AlignmentType.CENTER),
                createCell("{remarks}{/items}", false, 18, 20)
              ]
            }),
            // End Loop Components
            new TableRow({
              children: [
                createCell("{/components}", false, 18, 60, AlignmentType.LEFT, "F1F5F9"),
                createCell("", false, 18, 20, AlignmentType.CENTER, "F1F5F9"),
                createCell("", false, 18, 20, AlignmentType.LEFT, "F1F5F9")
              ]
            })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section III: Pengujian & Analisis
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "III. ANALISIS FORMULA & HASIL PENGUJIAN", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Calculations loop table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                createTitleCell("NAMA FORMULA / PENGUJIAN", true, 20, 40),
                createTitleCell("RUMUS ACUAN", true, 20, 30),
                createTitleCell("NILAI / HASIL", true, 20, 30)
              ]
            }),
            new TableRow({
              children: [
                createCell("{#calculations}{formulaName}", true, 18, 40),
                createCell("{formula}", false, 18, 30),
                createCell("{result} {unit} ({details}){/calculations}", false, 18, 30)
              ]
            })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section IV: AI Narrative
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "IV. ANALISIS & REKOMENDASI K3 (AI NARRATIVE)", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        new Paragraph({
          children: [
            new TextRun({ text: "1. Ringkasan Eksekutif\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{executiveSummary}\n\n", size: 18, font: "Arial" }),
            new TextRun({ text: "2. Analisis Temuan Lapangan\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{findingsNarrative}\n\n", size: 18, font: "Arial" }),
            new TextRun({ text: "3. Evaluasi Hasil Pengujian\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{testResultsNarrative}\n\n", size: 18, font: "Arial" }),
            new TextRun({ text: "4. Saran & Rekomendasi Perbaikan\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{recommendations}\n\n", size: 18, font: "Arial" }),
            new TextRun({ text: "5. Kesimpulan\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{conclusion}", size: 18, font: "Arial" })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section V: Photos
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "V. DOKUMENTASI HASIL PEMERIKSAAN", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        new Paragraph({
          children: [
            new TextRun({ text: "{#photos}", size: 12, font: "Arial" }),
            new TextRun({ text: "\n[Gambar Dokumentasi]\n", size: 14, font: "Arial" }),
            new TextRun({ text: "{%image}\n", size: 12, font: "Arial" }),
            new TextRun({ text: "Keterangan: {caption}\n\n", italic: true, size: 18, font: "Arial" }),
            new TextRun({ text: "{/photos}", size: 12, font: "Arial" })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Signatures
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Bandung, {reportDate}\n", size: 20, font: "Arial" }),
            new TextRun({ text: "PT. AKSARA RIKSA PERDANA\n\n\n\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{inspectorName}\n", bold: true, underline: {}, size: 20, font: "Arial" }),
            new TextRun({ text: "No. Reg: {inspectorCertNumber}", size: 18, font: "Arial" })
          ]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('Template_IL.docx', buffer);
  console.log('✓ Berhasil menulis Template_IL.docx');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GENERATE TEMPLATE PENYALUR PETIR (IPP)
// ─────────────────────────────────────────────────────────────────────────────
async function generateIPP() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Header
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "PT. AKSARA RIKSA PERDANA", bold: true, size: 28, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Jl. Cibodas Raya No.2, Antapani Wetan, Bandung | Tel: 0821 2984 9515", size: 18, font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Title
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "LAPORAN PEMERIKSAAN DAN PENGUJIAN\nINSTALASI PENYALUR PETIR", bold: true, size: 24, font: "Arial" })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Nomor : {reportNumber}", bold: true, size: 20, color: "B91C1C", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Metadata Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [createCell("Nama Pemilik", true, 20, 30), createCell(": {companyName}", false, 20, 70)] }),
            new TableRow({ children: [createCell("Alamat", true, 20, 30), createCell(": {companyAddress}", false, 20, 70)] }),
            new TableRow({ children: [createCell("Tanggal Pemeriksaan", true, 20, 30), createCell(": {inspectionDate}", false, 20, 70)] }),
            new TableRow({ children: [createCell("Pemeriksa", true, 20, 30), createCell(": {inspectorName}", false, 20, 70)] })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section Title
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "I. DATA UMUM", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Data Umum Grid
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [createCell("1. Jenis Penyalur Petir", true, 20, 45), createCell(": {jenisPenyalurPetir}", false, 20, 55)] }),
            new TableRow({ children: [createCell("2. Bentuk Penerima (Air Terminal)", true, 20, 45), createCell(": {bentukPenerima}", false, 20, 55)] }),
            new TableRow({ children: [createCell("3. Tinggi Tiang Penerima", true, 20, 45), createCell(": {tinggiTiangPenerima} meter", false, 20, 55)] }),
            new TableRow({ children: [createCell("4. Tinggi Bangunan", true, 20, 45), createCell(": {tinggiBangunan} meter", false, 20, 55)] }),
            new TableRow({ children: [createCell("5. Jumlah Air Terminal", true, 20, 45), createCell(": {jumlahAirTerminal} unit", false, 20, 55)] }),
            new TableRow({ children: [createCell("6. Jumlah Box Kontrol", true, 20, 45), createCell(": {jumlahBoxKontrol} unit", false, 20, 55)] }),
            new TableRow({ children: [createCell("7. Jumlah Elektroda Pembumian", true, 20, 45), createCell(": {jumlahElektrodaPembumian} buah", false, 20, 55)] }),
            new TableRow({ children: [createCell("8. Radius Perlindungan", true, 20, 45), createCell(": {radiusPerlindungan} meter", false, 20, 55)] }),
            new TableRow({ children: [createCell("9. Jenis Down Conductor", true, 20, 45), createCell(": {jenisDownConductor}", false, 20, 55)] }),
            new TableRow({ children: [createCell("10. Ukuran Down Conductor", true, 20, 45), createCell(": {ukuranDownConductor} mm2", false, 20, 55)] }),
            new TableRow({ children: [createCell("11. Lokasi Pemasangan", true, 20, 45), createCell(": {lokasiPemasangan}", false, 20, 55)] }),
            new TableRow({ children: [createCell("12. Konstruksi Bangunan", true, 20, 45), createCell(": {jenisKonstruksi}", false, 20, 55)] })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section II: Visual Checklist
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "II. DATA CHECKLIST PEMERIKSAAN VISUAL", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Checklist Loop Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                createTitleCell("OBYEK PEMERIKSAAN", true, 20, 60),
                createTitleCell("STATUS", true, 20, 20),
                createTitleCell("KETERANGAN", true, 20, 20)
              ]
            }),
            // Loop Components
            new TableRow({
              children: [
                createCell("{#components}Kategori: {componentName}", true, 18, 60, AlignmentType.LEFT, "E2E8F0"),
                createCell("", false, 18, 20, AlignmentType.CENTER, "E2E8F0"),
                createCell("", false, 18, 20, AlignmentType.LEFT, "E2E8F0")
              ]
            }),
            // Loop Items
            new TableRow({
              children: [
                createCell("{#items}- {description}", false, 18, 60),
                createCell("{result}", false, 18, 20, AlignmentType.CENTER),
                createCell("{remarks}{/items}", false, 18, 20)
              ]
            }),
            // End Loop Components
            new TableRow({
              children: [
                createCell("{/components}", false, 18, 60, AlignmentType.LEFT, "F1F5F9"),
                createCell("", false, 18, 20, AlignmentType.CENTER, "F1F5F9"),
                createCell("", false, 18, 20, AlignmentType.LEFT, "F1F5F9")
              ]
            })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section III: Pengujian & Analisis
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "III. HASIL PENGUJIAN TAHANAN PEMBUMIAN (GROUNDING)", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Calculations loop table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                createTitleCell("IDENTITAS GROUNDING", true, 20, 40),
                createTitleCell("RUMUS / STANDAR", true, 20, 30),
                createTitleCell("TAHANAN PENGUKURAN", true, 20, 30)
              ]
            }),
            new TableRow({
              children: [
                createCell("{#calculations}{formulaName}", true, 18, 40),
                createCell("{formula}", false, 18, 30),
                createCell("{result} {unit} ({details}){/calculations}", false, 18, 30)
              ]
            })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section IV: AI Narrative
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "IV. ANALISIS & REKOMENDASI K3 (AI NARRATIVE)", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        new Paragraph({
          children: [
            new TextRun({ text: "1. Ringkasan Eksekutif\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{executiveSummary}\n\n", size: 18, font: "Arial" }),
            new TextRun({ text: "2. Analisis Temuan Lapangan\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{findingsNarrative}\n\n", size: 18, font: "Arial" }),
            new TextRun({ text: "3. Evaluasi Hasil Pengujian\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{testResultsNarrative}\n\n", size: 18, font: "Arial" }),
            new TextRun({ text: "4. Saran & Rekomendasi Perbaikan\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{recommendations}\n\n", size: 18, font: "Arial" }),
            new TextRun({ text: "5. Kesimpulan\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{conclusion}", size: 18, font: "Arial" })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Section V: Photos
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: "V. DOKUMENTASI HASIL PEMERIKSAAN", bold: true, size: 22, color: "065F46", font: "Arial" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        new Paragraph({
          children: [
            new TextRun({ text: "{#photos}", size: 12, font: "Arial" }),
            new TextRun({ text: "\n[Gambar Dokumentasi]\n", size: 14, font: "Arial" }),
            new TextRun({ text: "{%image}\n", size: 12, font: "Arial" }),
            new TextRun({ text: "Keterangan: {caption}\n\n", italic: true, size: 18, font: "Arial" }),
            new TextRun({ text: "{/photos}", size: 12, font: "Arial" })
          ]
        }),

        new Paragraph({ children: [new TextRun({ text: "\n" })] }),

        // Signatures
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Bandung, {reportDate}\n", size: 20, font: "Arial" }),
            new TextRun({ text: "PT. AKSARA RIKSA PERDANA\n\n\n\n", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: "{inspectorName}\n", bold: true, underline: {}, size: 20, font: "Arial" }),
            new TextRun({ text: "No. Reg: {inspectorCertNumber}", size: 18, font: "Arial" })
          ]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('Template_IPP.docx', buffer);
  console.log('✓ Berhasil menulis Template_IPP.docx');
}

async function main() {
  await generateIL();
  await generateIPP();
}

main().catch(err => console.error(err));

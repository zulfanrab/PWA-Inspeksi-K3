import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const exportToPDF = (item: any, fileName: string) => {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Laporan Inspeksi K3", 14, 15);
  doc.setFontSize(10);
  doc.text(`Klien: ${item.clientName}`, 14, 22);
  doc.text(`Unit: ${item.unitData?.namaUnit || '-'}`, 14, 27);

  // Ubah data object jadi list buat tabel
  const tableData = Object.entries(item.unitData || {}).map(([key, value]) => [key, value]);

  autoTable(doc, {
    startY: 35,
    head: [['Field', 'Value']],
    body: tableData as any,
  });

  doc.save(`${fileName}.pdf`);
};
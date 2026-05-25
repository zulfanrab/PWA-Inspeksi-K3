// src/services/driveService.ts

export const uploadToDrive = async (sessionData: any, photos: any[]) => {
  const token = localStorage.getItem('google_token');
  if (!token) throw new Error("Belum login Google, Token tidak ditemukan!");

  const namaUnit = sessionData.unitData?.namaUnit || sessionData.unitData['Nama Unit'] || 'Unit';
  const noSeri = sessionData.unitData?.nomorSeri || sessionData.unitData['Nomor Seri'] || 'No-Seri';
  
  const dateObj = new Date(sessionData.createdAt);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const folderTanggalName = `${year}-${month}-${day}`;

  try {
    // 1. BUAT/CARI FOLDER UTAMA (Wadah Semua Inspeksi)
    // Sekarang semua bakal masuk ke dalam folder ini, tidak langsung di root
    const mainFolderId = await getOrCreateFolder(token, 'DATABASE_INSPEKSI_K3', 'root');

    // 2. BUAT/CARI FOLDER KLIEN (Di dalam mainFolderId, BUKAN 'root')
    const clientIdFolder = await getOrCreateFolder(token, sessionData.clientName, mainFolderId);

    // 3. TERUSKAN ALUR SEPERTI BIASA
    const dateFolderId = await getOrCreateFolder(token, folderTanggalName, clientIdFolder);
    const objectTypeFolder = await getOrCreateFolder(token, sessionData.objectType, dateFolderId);
    const finalFolderId = await getOrCreateFolder(token, `${namaUnit} - ${noSeri}`, objectTypeFolder);

    // 4. RAKIT & UPLOAD FILE TEKS (LAPORAN)
    const reportName = `LAPORAN_INSPEKSI_${sessionData.objectType}_${namaUnit}_${noSeri}.txt`;
    
    let reportContent = `==================================================\n`;
    reportContent += `          LAPORAN INSPEKSI TEKNIS K3             \n`;
    reportContent += `        PT AKSARA RIKSA PERDANA                  \n`;
    reportContent += `==================================================\n\n`;
    reportContent += `KLIEN          : ${sessionData.clientName}\n`;
    reportContent += `JENIS OBJEK    : ${sessionData.objectType}\n`;
    reportContent += `TANGGAL UTAMA  : ${folderTanggalName}\n\n`;
    reportContent += `---------------- DETAIL UNIT ---------------------\n`;
    
    for (const [key, value] of Object.entries(sessionData.unitData)) {
      if (value) {
        reportContent += `${key.padEnd(20)} : ${value}\n`;
      }
    }
    reportContent += `--------------------------------------------------\n\n`;
    reportContent += `Status Dokumen : ${sessionData.status.toUpperCase()}\n`;
    reportContent += `Total Foto     : ${photos.length} file gambar terupload.\n`;

    await uploadTextFile(token, reportName, reportContent, finalFolderId);

    // 5. UPLOAD FOTO (Jalur Tol Base64 - ANTI GAGAL)
    for (let i = 0; i < photos.length; i++) {
      const photoDataUrl = photos[i].dataUrl;
      if (!photoDataUrl) continue;

      const parts = photoDataUrl.split(',');
      if (parts.length !== 2) continue;

      const mimeMatch = parts[0].match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = parts[1];
      const ext = mimeType.includes('png') ? 'png' : 'jpg';

      const photoName = `DSC_${String(i + 1).padStart(3, '0')}.${ext}`;
      await uploadBase64Image(token, photoName, mimeType, base64Data, finalFolderId);
    }

    return { success: true };
  } catch (error) {
    console.error("Error Upload Drive:", error);
    throw error;
  }
};

// ==========================================
// KUMPULAN FUNGSI HELPER
// ==========================================

async function getOrCreateFolder(token: string, folderName: string, parentId: string): Promise<string> {
  const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const urlList = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`;
  
  const listRes = await fetch(urlList, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
  if (listRes.ok) {
    const data = await listRes.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
  }

  const metadata = { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: parentId === 'root' ? undefined : [parentId] };
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) });
  if (!createRes.ok) throw new Error(`Gagal membuat folder: ${folderName}`);
  const folder = await createRes.json();
  return folder.id;
}

async function uploadTextFile(token: string, name: string, content: string, parentId: string) {
  const boundary = 'foo_bar_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;
  const metadata = { name, mimeType: 'text/plain', parents: [parentId] };

  const mediaBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: text/plain\r\n\r\n` +
    content +
    close_delim;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: mediaBody
  });
  if (!response.ok) throw new Error(`Gagal upload file teks ${name}`);
}

async function uploadBase64Image(token: string, name: string, mimeType: string, base64Data: string, parentId: string) {
  const boundary = 'foo_bar_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;
  const metadata = { name, mimeType, parents: [parentId] };

  const mediaBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
    base64Data +
    close_delim;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: mediaBody
  });
  if (!response.ok) throw new Error(`Gagal upload foto ${name}`);
}
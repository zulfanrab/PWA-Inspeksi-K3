import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputFile = path.join(__dirname, 'all_code.txt');

if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

function readFilesRecursively(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'public') {
        readFilesRecursively(fullPath);
      }
    } else {
      if (/\.(ts|tsx|js|css|html|json)$/.test(file) && file !== 'package-lock.json' && file !== 'all_code.txt' && file !== 'generate-all-code.js') {
        const relativePath = path.relative(__dirname, fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        
        fs.appendFileSync(outputFile, `\n\n// ==========================================\n// FILE: ${relativePath}\n// ==========================================\n\n${content}`);
      }
    }
  });
}

console.log('⏳ Mengumpulkan semua kodingan terbaru lo...');
readFilesRecursively(__dirname);
console.log('✅ Sukses! all_code.txt udah paling update.');
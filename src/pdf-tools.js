import { itemId } from "./utils.js";

export function configurePdfWorker(){
  if(window.pdfjsLib){
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
}

export async function extractPdfText(file){
  if(!window.pdfjsLib) throw new Error("PDF kütüphanesi yüklenemedi.");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  let fullText = "";

  for(let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1){
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    let lastY = null;
    let line = "";
    const lines = [];

    content.items.forEach(item => {
      const y = item.transform[5];
      if(lastY !== null && Math.abs(y - lastY) > 3){
        if(line.trim()) lines.push(line.trim());
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    });
    if(line.trim()) lines.push(line.trim());
    fullText += lines.join("\n") + "\n";
  }
  return fullText.trim();
}

export function parseBirimFiyatCetveli(fullText){
  const noisePatterns = [
    /^ARA TOPLAM/i, /^KDV/i, /^GENEL TOPLAM/i, /^POZ NO\b/i,
    /^İŞ YERİ/i, /^IŞ YERI/i, /^İHALE/i, /^IHALE/i, /^İKN\b/i, /^IKN\b/i,
    /^İDARE/i, /^IDARE/i, /^YÜKLENİCİ/i, /^YUKLENICI/i,
    /^HAZIRLAYAN/i, /^HAZIRLAMA TARİHİ/i, /^HAZIRLAMA TARIHI/i,
    /^REVİZYON/i, /^REVIZYON/i, /^KONTROL EDEN/i, /^ONAYLAYAN/i,
    /^Toplam Kalem/i, /^Bu belge/i, /^\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}/,
    /about:blank/i, /^\d+\s*\/\s*\d+$/, /^Birim Fiyat Teklif Cetveli/i,
    /^\d{1,3}\s*-\s*[A-ZÇĞİÖŞÜ]+$/
  ];
  const dataLineRe = /^(\S+)\s+([\d.,]+)\s+([\d.,]+|—|-)\s+([\d.,]+|—|-)\s+([\d.,]+|—|-)(?:\s*\([^)]*\))?\s+([\d.,]+|—|-)\s*$/;
  const lines = fullText.split("\n").map(line => line.trim()).filter(Boolean);
  const results = [];
  let started = false;
  let buffer = "";

  for(const line of lines){
    if(!started){
      if(/^POZ NO\b/i.test(line)) started = true;
      continue;
    }
    if(noisePatterns.some(re => re.test(line))){
      buffer = "";
      continue;
    }
    const match = line.match(dataLineRe);
    if(match){
      const unit = match[1];
      const quantity = match[2];
      const estimatedUnitPrice = match[3];
      let description = buffer.replace(/\s+/g, " ").trim();
      let posNo = "";
      const posMatch = description.match(/^(\S+)\s+(.*)$/);
      if(posMatch && /\d/.test(posMatch[1]) && posMatch[1].length >= 3){
        posNo = posMatch[1];
        description = posMatch[2].trim();
      }
      if(description){
        results.push({
          id: itemId(),
          posNo,
          description,
          unit,
          quantity: quantity === "—" || quantity === "-" ? "" : quantity,
          estimatedUnitPrice: estimatedUnitPrice === "—" || estimatedUnitPrice === "-" ? "" : estimatedUnitPrice
        });
      }
      buffer = "";
    }else{
      buffer += (buffer ? " " : "") + line;
    }
  }
  return results;
}

export function fallbackRowsFromText(fullText){
  return fullText
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => ({
      id: itemId(),
      posNo: "",
      description: line,
      quantity: "",
      unit: "adet",
      estimatedUnitPrice: ""
    }));
}

import * as db from "./db.js";
import { configurePdfWorker, extractPdfText, fallbackRowsFromText, parseBirimFiyatCetveli } from "./pdf-tools.js";
import { registerPwa } from "./pwa.js";
import {
  $, banner, copyText, diffInfo, esc, estimateTotal, fmtDate, fmtTL,
  itemId, offerTotal, parseNumber, uid, vendorLink
} from "./utils.js";

const state = {
  requests: [],
  offers: [],
  selectedRequestId: null,
  selectedRequest: null,
  selectedOffers: [],
  draftItems: [],
  rawText: "",
  pdfName: "",
  lastCode: "",
  vendorRequest: null,
  vendorCompany: null,
  vendorItems: []
};

const viewMeta = {
  dashboard: ["Yönetici Paneli", "Teklif Operasyon Merkezi"],
  builder: ["Dosya Hazırlama", "Teklif Dosyası Oluştur"],
  comparison: ["Analiz", "Firma Teklif Karşılaştırması"]
};

function refreshIcons(){
  if(window.lucide) window.lucide.createIcons();
}

function setView(viewName){
  document.querySelectorAll(".nav__item").forEach(item => {
    item.classList.toggle("is-active", item.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("is-active", view.id === "view-" + viewName);
  });
  $("viewEyebrow").textContent = viewMeta[viewName]?.[0] || "";
  $("viewTitle").textContent = viewMeta[viewName]?.[1] || "";
  refreshIcons();
}

function wireNavigation(){
  document.querySelectorAll(".nav__item").forEach(item => {
    item.addEventListener("click", () => setView(item.dataset.view));
  });
  $("quickNewBtn").addEventListener("click", () => setView("builder"));
  $("refreshBtn").addEventListener("click", refreshAll);
}

async function refreshAll(){
  state.requests = (await db.all("requests")).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  state.offers = await db.all("offers");
  renderDashboard();
  renderRequestsList();
  if(state.selectedRequestId) await openRequestDetail(state.selectedRequestId, false);
  refreshIcons();
}

function renderDashboard(){
  $("statRequests").textContent = state.requests.length;
  $("statOffers").textContent = state.offers.length;
  $("statEstimate").textContent = fmtTL(state.requests.reduce((sum, request) => sum + estimateTotal(request.items), 0));

  const best = [];
  for(const request of state.requests){
    state.offers
      .filter(offer => offer.requestId === request.id)
      .forEach(offer => best.push({request, offer, total: offerTotal(request, offer)}));
  }
  best.sort((a, b) => a.total - b.total);
  $("statBest").textContent = best.length ? `${fmtTL(best[0].total)}` : "Yok";
}

function renderRequestsList(){
  const container = $("dashboardRequests");
  if(!state.requests.length){
    container.innerHTML = `<div class="summary-empty">Henüz teklif dosyası yok.</div>`;
    renderSelectedSummary();
    return;
  }
  container.innerHTML = "";
  state.requests.forEach(request => {
    const offerCount = state.offers.filter(offer => offer.requestId === request.id).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "request-card" + (state.selectedRequestId === request.id ? " is-active" : "");
    button.innerHTML = `
      <div class="request-card__top">
        <div>
          <h3>${esc(request.title)}</h3>
          <p>${esc(request.id)} · ${request.items.length} kalem · ${fmtDate(request.createdAt)}</p>
        </div>
        <span class="badge ${offerCount ? "" : "badge--gray"}">${offerCount} teklif</span>
      </div>
    `;
    button.addEventListener("click", async () => {
      await openRequestDetail(request.id);
      setView("comparison");
    });
    container.appendChild(button);
  });
  renderSelectedSummary();
}

function renderSelectedSummary(){
  const wrap = $("selectedSummary");
  if(!state.selectedRequest){
    $("selectedSummaryText").textContent = "Henüz dosya seçilmedi.";
    $("selectedVendorLinkBtn").disabled = true;
    wrap.innerHTML = `<div class="summary-empty">Sol listeden bir teklif dosyası seçin.</div>`;
    return;
  }
  const request = state.selectedRequest;
  const offers = state.selectedOffers;
  const estimate = estimateTotal(request.items);
  const totals = offers.map(offer => ({offer, total: offerTotal(request, offer)})).sort((a, b) => a.total - b.total);
  $("selectedSummaryText").textContent = `${request.id} · ${request.items.length} kalem · ${offers.length} firma teklifi`;
  $("selectedVendorLinkBtn").disabled = false;
  wrap.innerHTML = `
    <div class="summary-grid">
      <div><span>Yaklaşık maliyet</span><strong>${fmtTL(estimate)}</strong></div>
      <div><span>En düşük teklif</span><strong>${totals.length ? fmtTL(totals[0].total) : "Yok"}</strong></div>
      <div><span>Firma sayısı</span><strong>${offers.length}</strong></div>
    </div>
    <div class="table-shell">
      <table>
        <thead><tr><th>Firma</th><th class="num">Toplam</th><th class="num">Fark</th></tr></thead>
        <tbody>
          ${totals.map(row => {
            const diff = diffInfo(row.total, estimate);
            return `<tr><td>${esc(row.offer.companyName)}</td><td class="num">${fmtTL(row.total)}</td><td class="num ${diff.cls}">${diff.text}</td></tr>`;
          }).join("") || `<tr><td colspan="3" class="empty">Henüz firma teklifi yok.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderDraftMetrics(){
  $("metricItems").textContent = state.draftItems.length;
  $("metricEstimate").textContent = fmtTL(estimateTotal(state.draftItems));
  $("metricPdf").textContent = state.pdfName ? "Okundu" : "Yok";
}

function renderDraftItems(){
  const body = $("itemsBody");
  body.innerHTML = "";
  $("itemsEmpty").style.display = state.draftItems.length ? "none" : "block";
  state.draftItems.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="num">${index + 1}</td>
      <td><input data-id="${item.id}" data-field="posNo" value="${esc(item.posNo)}" placeholder="Poz no"></td>
      <td><input data-id="${item.id}" data-field="description" value="${esc(item.description)}" placeholder="İş kalemi adı"></td>
      <td><input class="num" data-id="${item.id}" data-field="quantity" value="${esc(item.quantity)}" inputmode="decimal"></td>
      <td><input data-id="${item.id}" data-field="unit" value="${esc(item.unit)}" placeholder="adet"></td>
      <td><input class="num" data-id="${item.id}" data-field="estimatedUnitPrice" value="${esc(item.estimatedUnitPrice)}" inputmode="decimal"></td>
      <td class="num" data-total="${item.id}">${lineEstimate(item)}</td>
      <td>
        <div class="row-tools">
          <button class="button button--ghost button--sm" data-remove="${item.id}" type="button"><i data-lucide="x"></i></button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", event => {
      const item = state.draftItems.find(row => row.id === event.target.dataset.id);
      if(!item) return;
      item[event.target.dataset.field] = event.target.value;
      renderDraftMetrics();
      const totalCell = document.querySelector(`[data-total="${item.id}"]`);
      if(totalCell) totalCell.textContent = lineEstimate(item);
    });
  });
  body.querySelectorAll("[data-remove]").forEach(button => {
    button.addEventListener("click", () => {
      state.draftItems = state.draftItems.filter(item => item.id !== button.dataset.remove);
      renderDraftItems();
      renderDraftMetrics();
    });
  });
  renderDraftMetrics();
  refreshIcons();
}

function lineEstimate(item){
  const q = parseNumber(item.quantity);
  const p = parseNumber(item.estimatedUnitPrice);
  return Number.isFinite(q) && Number.isFinite(p) ? fmtTL(q * p) : "—";
}

function addDraftItem(prefill = {}){
  state.draftItems.push({
    id: itemId(),
    posNo: "",
    description: "",
    quantity: "",
    unit: "adet",
    estimatedUnitPrice: "",
    ...prefill
  });
}

function clearDraft(){
  state.draftItems = [];
  state.rawText = "";
  state.pdfName = "";
  $("reqTitle").value = "";
  $("reqOwner").value = "";
  $("fname").textContent = "Dosya seçilmedi";
  $("rawText").value = "";
  $("rawText").classList.remove("is-open");
  $("createBanner").innerHTML = "";
  renderDraftItems();
}

async function loadPdfFile(file){
  $("fname").textContent = file.name + " okunuyor";
  $("createBanner").innerHTML = "";
  try{
    const text = await extractPdfText(file);
    const parsed = parseBirimFiyatCetveli(text);
    state.rawText = text;
    state.pdfName = file.name;
    $("rawText").value = text;
    state.draftItems = parsed.length ? parsed : fallbackRowsFromText(text);
    $("fname").textContent = parsed.length ? `${file.name} · ${parsed.length} kalem bulundu` : `${file.name} · metin çıkarıldı`;
    if(!$("reqTitle").value.trim()) $("reqTitle").value = file.name.replace(/\.pdf$/i, "");
    renderDraftItems();
  }catch(err){
    console.error(err);
    $("fname").textContent = file.name + " okunamadı";
    $("createBanner").innerHTML = banner(esc(err.message || "PDF okunurken hata oluştu."), "err");
  }
}

function wireBuilder(){
  $("filedrop").addEventListener("click", () => $("pdfInput").click());
  $("pdfInput").addEventListener("change", event => {
    const file = event.target.files[0];
    if(file) loadPdfFile(file);
  });
  $("loadSamplePdfBtn").addEventListener("click", async () => {
    try{
      const response = await fetch("ffffff.pdf");
      if(!response.ok) throw new Error("ffffff.pdf bulunamadı.");
      const blob = await response.blob();
      await loadPdfFile(new File([blob], "ffffff.pdf", {type: "application/pdf"}));
    }catch{
      $("createBanner").innerHTML = banner("Mevcut PDF okunamadı. Dosyayı Gözat ile seçin.", "err");
    }
  });
  $("addRowBtn").addEventListener("click", () => {
    addDraftItem();
    renderDraftItems();
  });
  $("toggleRawBtn").addEventListener("click", () => $("rawText").classList.toggle("is-open"));
  $("clearDraftBtn").addEventListener("click", clearDraft);
  $("saveRequestBtn").addEventListener("click", saveRequest);
  $("copyLastCodeBtn").addEventListener("click", () => copyText(state.lastCode));
  $("copyLastVendorLinkBtn").addEventListener("click", () => copyText(vendorLink(state.lastCode)));
}

async function saveRequest(){
  const title = $("reqTitle").value.trim();
  const owner = $("reqOwner").value.trim();
  const items = state.draftItems
    .map(item => ({
      id: item.id || itemId(),
      posNo: (item.posNo || "").trim(),
      description: (item.description || "").trim(),
      quantity: (item.quantity || "").trim(),
      unit: (item.unit || "").trim(),
      estimatedUnitPrice: (item.estimatedUnitPrice || "").trim()
    }))
    .filter(item => item.description);

  if(!title){
    $("createBanner").innerHTML = banner("Teklif başlığı girin.", "err");
    return;
  }
  if(!items.length){
    $("createBanner").innerHTML = banner("En az bir iş kalemi ekleyin.", "err");
    return;
  }

  const request = {
    id: uid(),
    title,
    owner,
    pdfName: state.pdfName,
    rawText: state.rawText,
    items,
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await db.put("requests", request);
  state.lastCode = request.id;
  $("copyLastCodeBtn").disabled = false;
  $("copyLastVendorLinkBtn").disabled = false;
  $("createBanner").innerHTML = banner(`Teklif dosyası kaydedildi. Firma giriş kodu: <strong class="mono">${request.id}</strong>`, "ok");
  await refreshAll();
  await openRequestDetail(request.id);
}

async function openRequestDetail(requestId, switchView = true){
  const request = await db.get("requests", requestId);
  if(!request) return;
  const offers = (await db.allByIndex("offers", "requestId", requestId)).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  state.selectedRequestId = requestId;
  state.selectedRequest = request;
  state.selectedOffers = offers;
  renderComparison(request, offers);
  renderSelectedSummary();
  renderRequestsList();
  if(switchView) setView("comparison");
}

function renderComparison(request, offers){
  const estimate = estimateTotal(request.items);
  const totals = offers.map(offer => ({offer, total: offerTotal(request, offer)})).sort((a, b) => a.total - b.total);
  $("detailTitle").textContent = request.title;
  $("detailMeta").textContent = `Kod: ${request.id} · ${request.items.length} kalem · ${fmtDate(request.createdAt)}`;
  $("detailEstimate").textContent = fmtTL(estimate);
  $("detailOfferCount").textContent = String(offers.length);
  $("detailBestOffer").textContent = totals.length ? `${fmtTL(totals[0].total)} · ${totals[0].offer.companyName}` : "Yok";
  ["detailCopyCodeBtn", "detailCopyVendorLinkBtn", "deleteRequestBtn"].forEach(id => $(id).disabled = false);
  $("exportComparisonBtn").disabled = !offers.length;

  const offerCards = $("offersCards");
  offerCards.innerHTML = offers.length ? offers.map(offer => {
    const total = offerTotal(request, offer);
    const diff = diffInfo(total, estimate);
    return `
      <article class="offer-card">
        <h3>${esc(offer.companyName)}</h3>
        <p>${esc(offer.contactName || "Yetkili girilmedi")}${offer.contactPhone ? " · " + esc(offer.contactPhone) : ""}</p>
        <p>${fmtDate(offer.submittedAt)}</p>
        <strong>${fmtTL(total)}</strong>
        <span class="${diff.cls}">${estimate ? diff.text : "Yaklaşık maliyet yok"}</span>
      </article>
    `;
  }).join("") : `<div class="summary-empty">Henüz firma teklifi yok.</div>`;

  $("comparisonEmpty").style.display = offers.length ? "none" : "block";
  $("comparisonHead").innerHTML = "";
  $("comparisonBody").innerHTML = "";
  if(!offers.length) return;

  $("comparisonHead").innerHTML = `
    <tr>
      <th class="num">#</th>
      <th>Poz No</th>
      <th style="min-width:280px">Kalem</th>
      <th class="num">Miktar</th>
      <th>Birim</th>
      <th class="num">Yaklaşık BF</th>
      <th class="num">Yaklaşık tutar</th>
      ${offers.map(offer => `<th class="num">${esc(offer.companyName)}<br><span class="muted">BF / Fark</span></th>`).join("")}
    </tr>
  `;

  request.items.forEach((item, index) => {
    const q = parseNumber(item.quantity);
    const estimated = parseNumber(item.estimatedUnitPrice);
    const estimatedTotal = Number.isFinite(q) && Number.isFinite(estimated) ? q * estimated : 0;
    const cells = offers.map(offer => {
      const row = (offer.items || []).find(x => x.itemId === item.id);
      const price = Number(row?.unitPrice) || 0;
      const diff = diffInfo(price, Number.isFinite(estimated) ? estimated : 0);
      return `<td class="num"><div>${fmtTL(price)}</div><div class="${diff.cls}">${diff.text}</div></td>`;
    }).join("");
    $("comparisonBody").insertAdjacentHTML("beforeend", `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="mono">${esc(item.posNo)}</td>
        <td>${esc(item.description)}</td>
        <td class="num">${esc(item.quantity)}</td>
        <td>${esc(item.unit)}</td>
        <td class="num">${Number.isFinite(estimated) ? fmtTL(estimated) : "—"}</td>
        <td class="num">${estimatedTotal ? fmtTL(estimatedTotal) : "—"}</td>
        ${cells}
      </tr>
    `);
  });
}

function wireComparisonActions(){
  $("selectedVendorLinkBtn").addEventListener("click", () => copyText(vendorLink(state.selectedRequestId)));
  $("detailCopyCodeBtn").addEventListener("click", () => copyText(state.selectedRequestId));
  $("detailCopyVendorLinkBtn").addEventListener("click", () => copyText(vendorLink(state.selectedRequestId)));
  $("exportComparisonBtn").addEventListener("click", exportComparisonPdf);
  $("deleteRequestBtn").addEventListener("click", async () => {
    if(!state.selectedRequestId) return;
    if(!confirm("Bu teklif dosyası ve bağlı firma teklifleri silinsin mi?")) return;
    await db.deleteOffersForRequest(state.selectedRequestId);
    await db.remove("requests", state.selectedRequestId);
    state.selectedRequestId = null;
    state.selectedRequest = null;
    state.selectedOffers = [];
    resetComparison();
    await refreshAll();
    setView("dashboard");
  });
}

function resetComparison(){
  $("detailTitle").textContent = "Karşılaştırma";
  $("detailMeta").textContent = "Bir teklif dosyası seçin.";
  $("detailEstimate").textContent = fmtTL(0);
  $("detailOfferCount").textContent = "0";
  $("detailBestOffer").textContent = "Yok";
  $("offersCards").innerHTML = "";
  $("comparisonHead").innerHTML = "";
  $("comparisonBody").innerHTML = "";
  $("comparisonEmpty").style.display = "block";
  ["detailCopyCodeBtn", "detailCopyVendorLinkBtn", "exportComparisonBtn", "deleteRequestBtn"].forEach(id => $(id).disabled = true);
}

async function exportComparisonPdf(){
  const request = state.selectedRequest;
  const offers = state.selectedOffers;
  if(!request || !offers.length) return;

  const root = document.createElement("div");
  root.className = "print-root";
  const estimate = estimateTotal(request.items);
  const totals = offers.map(offer => ({offer, total: offerTotal(request, offer)})).sort((a, b) => a.total - b.total);
  root.innerHTML = `
    <div style="font-family:Arial,sans-serif;color:#111827">
      <div style="border-bottom:3px solid #111827;padding-bottom:14px;margin-bottom:18px">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0f766e;font-weight:800">Teklif Karşılaştırma Raporu</div>
        <h1 style="margin:6px 0 4px;font-size:26px">${esc(request.title)}</h1>
        <div style="font-size:12px;color:#5c6b7a">Kod: ${esc(request.id)} · Tarih: ${fmtDate(new Date().toISOString())} · Kalem: ${request.items.length}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">
        <div style="border:1px solid #d8e0e8;padding:10px"><div style="font-size:11px;color:#5c6b7a">Yaklaşık Maliyet</div><strong>${fmtTL(estimate)}</strong></div>
        <div style="border:1px solid #d8e0e8;padding:10px"><div style="font-size:11px;color:#5c6b7a">Firma Sayısı</div><strong>${offers.length}</strong></div>
        <div style="border:1px solid #d8e0e8;padding:10px"><div style="font-size:11px;color:#5c6b7a">En Düşük</div><strong>${fmtTL(totals[0].total)} · ${esc(totals[0].offer.companyName)}</strong></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>
          <th style="text-align:right;border-bottom:2px solid #111827;padding:6px">#</th>
          <th style="text-align:left;border-bottom:2px solid #111827;padding:6px">Kalem</th>
          <th style="text-align:right;border-bottom:2px solid #111827;padding:6px">Miktar</th>
          <th style="text-align:right;border-bottom:2px solid #111827;padding:6px">Yaklaşık BF</th>
          ${offers.map(offer => `<th style="text-align:right;border-bottom:2px solid #111827;padding:6px">${esc(offer.companyName)}</th>`).join("")}
        </tr></thead>
        <tbody>
          ${request.items.map((item, index) => {
            const estimated = parseNumber(item.estimatedUnitPrice);
            return `<tr>
              <td style="text-align:right;border-bottom:1px solid #e5e7eb;padding:6px">${index + 1}</td>
              <td style="border-bottom:1px solid #e5e7eb;padding:6px">${esc(item.description)}</td>
              <td style="text-align:right;border-bottom:1px solid #e5e7eb;padding:6px">${esc(item.quantity)} ${esc(item.unit)}</td>
              <td style="text-align:right;border-bottom:1px solid #e5e7eb;padding:6px">${Number.isFinite(estimated) ? fmtTL(estimated) : "—"}</td>
              ${offers.map(offer => {
                const row = (offer.items || []).find(x => x.itemId === item.id);
                const price = Number(row?.unitPrice) || 0;
                const diff = diffInfo(price, Number.isFinite(estimated) ? estimated : 0);
                return `<td style="text-align:right;border-bottom:1px solid #e5e7eb;padding:6px">${fmtTL(price)} / ${diff.text}</td>`;
              }).join("")}
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  document.body.appendChild(root);
  try{
    const canvas = await html2canvas(root, {scale: 2, backgroundColor: "#ffffff"});
    const imgData = canvas.toDataURL("image/png");
    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF("l", "mm", "a4");
    const pageWidth = 297;
    const pageHeight = 210;
    const imgWidth = pageWidth;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while(heightLeft > 0){
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(("Karsilastirma-" + request.title + ".pdf").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_"));
  }finally{
    document.body.removeChild(root);
  }
}

function wireVendor(){
  if(!$("fetchReqBtn")) return;
  $("fetchReqBtn").addEventListener("click", fetchVendorRequest);
  $("resetVendorBtn").addEventListener("click", () => {
    state.vendorRequest = null;
    state.vendorItems = [];
    $("vendorWorkArea").classList.remove("is-open");
    $("fetchBanner").innerHTML = "";
    $("submitBanner").innerHTML = "";
  });
  $("submitOfferBtn").addEventListener("click", submitVendorOffer);
}

async function fetchVendorRequest(){
  const code = $("fetchCode").value.trim().toUpperCase();
  const companyName = $("companyName").value.trim();
  const contactName = $("contactName").value.trim();
  const contactPhone = $("contactPhone").value.trim();
  $("fetchBanner").innerHTML = "";

  if(!code){
    $("fetchBanner").innerHTML = banner("Teklif kodu girin.", "err");
    return;
  }
  if(!companyName){
    $("fetchBanner").innerHTML = banner("Firma ünvanı girin.", "err");
    return;
  }
  const request = await db.get("requests", code);
  if(!request){
    $("fetchBanner").innerHTML = banner("Bu kodla teklif dosyası bulunamadı.", "err");
    return;
  }

  state.vendorRequest = request;
  state.vendorCompany = {companyName, contactName, contactPhone};
  state.vendorItems = request.items.map(item => ({
    itemId: item.id,
    posNo: item.posNo,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: ""
  }));
  renderVendorWork();
}

function renderVendorWork(){
  const request = state.vendorRequest;
  $("vendorWorkArea").classList.add("is-open");
  $("vendorTitle").textContent = request.title;
  $("vendorMeta").textContent = `Kod: ${request.id} · ${request.items.length} kalem`;
  const body = $("vendorItemsBody");
  body.innerHTML = "";
  state.vendorItems.forEach((item, index) => {
    body.insertAdjacentHTML("beforeend", `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="mono">${esc(item.posNo)}</td>
        <td>${esc(item.description)}</td>
        <td class="num">${esc(item.quantity)}</td>
        <td>${esc(item.unit)}</td>
        <td><input class="num" data-vendor-price="${index}" value="${esc(item.unitPrice)}" inputmode="decimal" placeholder="0,00"></td>
        <td class="num" data-vendor-total="${index}">${vendorLineTotal(item)}</td>
      </tr>
    `);
  });
  body.querySelectorAll("[data-vendor-price]").forEach(input => {
    input.addEventListener("input", event => {
      const index = Number(event.target.dataset.vendorPrice);
      state.vendorItems[index].unitPrice = event.target.value;
      const totalCell = document.querySelector(`[data-vendor-total="${index}"]`);
      if(totalCell) totalCell.textContent = vendorLineTotal(state.vendorItems[index]);
      renderVendorTotal();
    });
  });
  renderVendorTotal();
}

function vendorLineTotal(item){
  const q = parseNumber(item.quantity);
  const p = parseNumber(item.unitPrice);
  return Number.isFinite(q) && Number.isFinite(p) ? fmtTL(q * p) : "—";
}

function renderVendorTotal(){
  const total = state.vendorItems.reduce((sum, item) => {
    const q = parseNumber(item.quantity);
    const p = parseNumber(item.unitPrice);
    return sum + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0);
  }, 0);
  $("vendorTotal").textContent = fmtTL(total);
}

async function submitVendorOffer(){
  if(!state.vendorRequest) return;
  const missing = state.vendorItems.some(item => !Number.isFinite(parseNumber(item.unitPrice)));
  if(missing){
    $("submitBanner").innerHTML = banner("Tüm kalemler için birim fiyat girin.", "err");
    return;
  }
  const offer = {
    offerId: uid("OF"),
    requestId: state.vendorRequest.id,
    companyName: state.vendorCompany.companyName,
    contactName: state.vendorCompany.contactName,
    contactPhone: state.vendorCompany.contactPhone,
    items: state.vendorItems.map(item => ({
      itemId: item.itemId,
      unitPrice: parseNumber(item.unitPrice)
    })),
    submittedAt: new Date().toISOString()
  };
  await db.put("offers", offer);
  $("submitBanner").innerHTML = banner(`Teklifiniz kaydedildi. Kayıt no: <strong class="mono">${offer.offerId}</strong>`, "ok");
  await refreshAll();
  if(state.selectedRequestId === state.vendorRequest.id) await openRequestDetail(state.vendorRequest.id, false);
}

function applyVendorModeFromUrl(){
  const params = new URLSearchParams(window.location.search);
  const code = (params.get("firma") || params.get("kod") || "").trim().toUpperCase();
  if(!code) return;
  window.location.replace(vendorLink(code));
}

async function init(){
  try{
    registerPwa();
    configurePdfWorker();
    wireNavigation();
    wireBuilder();
    wireComparisonActions();
    wireVendor();
    state.db = await db.initDb();
    $("dbStatus").textContent = "Hazır";
    renderDraftItems();
    resetComparison();
    await refreshAll();
    applyVendorModeFromUrl();
  }catch(err){
    console.error(err);
    $("dbStatus").textContent = "Hata";
    document.querySelector(".workspace").insertAdjacentHTML("afterbegin", banner(`SQL bağlantısı başlatılamadı: ${esc(err.message || err)}`, "err"));
  }finally{
    refreshIcons();
  }
}

init();

import * as db from "./db.js";
import { configurePdfWorker, extractPdfText, fallbackRowsFromText, parseBirimFiyatCetveli } from "./pdf-tools.js";
import { registerPwa } from "./pwa.js";
import {
  $, banner, copyText, diffInfo, esc, estimateTotal, fmtDate, fmtTL,
  itemId, offerTotal, parseNumber, uid, vendorLink
} from "./utils.js";

const ADMIN_AUTH_KEY = "fiyatladim.admin.authenticated";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const state = {
  requests: [],
  offers: [],
  selectedRequestId: null,
  selectedRequest: null,
  selectedOffers: [],
  selectedOfferKey: null,
  draftItems: [],
  rawText: "",
  pdfName: "",
  lastCode: "",
  vendorRequest: null,
  vendorCompany: null,
  vendorItems: []
};

let adminAppStarted = false;

const viewMeta = {
  dashboard: ["Yönetici Paneli", "Fiyatladim. Operasyon Merkezi"],
  builder: ["Dosya Hazırlama", "Teklif Dosyası Oluştur"],
  comparison: ["Analiz", "Firma Teklif Karşılaştırması"]
};

function refreshIcons(){
  if(window.lucide) window.lucide.createIcons();
}

function offerKey(offer){
  return String(offer?.offerId || offer?.id || `${offer?.requestId || ""}:${offer?.companyName || ""}:${offer?.submittedAt || ""}`);
}

function isAdminAuthenticated(){
  return sessionStorage.getItem(ADMIN_AUTH_KEY) === "1";
}

function showAdminShell(){
  const loginScreen = $("loginScreen");
  const adminApp = $("adminApp");
  if(loginScreen) loginScreen.hidden = true;
  if(adminApp) adminApp.hidden = false;
  document.body.classList.remove("login-active");
}

function showLoginScreen(){
  const loginScreen = $("loginScreen");
  const adminApp = $("adminApp");
  if(loginScreen) loginScreen.hidden = false;
  if(adminApp) adminApp.hidden = true;
  document.body.classList.add("login-active");
  $("adminUsername")?.focus();
  refreshIcons();
}

function wireAdminLogin(){
  const form = $("adminLoginForm");
  if(!form || form.dataset.wired === "1") return;
  form.dataset.wired = "1";
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const username = $("adminUsername").value.trim();
    const password = $("adminPassword").value;
    $("loginBanner").innerHTML = "";

    if(username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD){
      $("loginBanner").innerHTML = banner("Kullanıcı adı veya şifre hatalı.", "err");
      $("adminPassword").select();
      return;
    }

    sessionStorage.setItem(ADMIN_AUTH_KEY, "1");
    $("adminPassword").value = "";
    showAdminShell();
    await startAdminApp();
  });
}

function wireLogout(){
  const button = $("logoutBtn");
  if(!button || button.dataset.wired === "1") return;
  button.dataset.wired = "1";
  button.addEventListener("click", () => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    showLoginScreen();
  });
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
  if(state.selectedRequestId !== requestId) state.selectedOfferKey = null;
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
  if(state.selectedOfferKey && !offers.some(offer => offerKey(offer) === state.selectedOfferKey)){
    state.selectedOfferKey = null;
  }

  const offerCards = $("offersCards");
  offerCards.innerHTML = offers.length ? offers.map(offer => {
    const total = offerTotal(request, offer);
    const diff = diffInfo(total, estimate);
    const key = offerKey(offer);
    const isSelected = key === state.selectedOfferKey;
    return `
      <article class="offer-card${isSelected ? " is-selected" : ""}" data-offer-key="${esc(key)}" role="button" tabindex="0" aria-pressed="${isSelected ? "true" : "false"}">
        <h3>${esc(offer.companyName)}</h3>
        <p>${esc(offer.contactName || "Yetkili girilmedi")}${offer.contactPhone ? " · " + esc(offer.contactPhone) : ""}</p>
        <p>${fmtDate(offer.submittedAt)}</p>
        <strong>${fmtTL(total)}</strong>
        <span class="${diff.cls}">${estimate ? diff.text : "Yaklaşık maliyet yok"}</span>
      </article>
    `;
  }).join("") : `<div class="summary-empty">Henüz firma teklifi yok.</div>`;
  offerCards.querySelectorAll("[data-offer-key]").forEach(card => {
    const select = () => {
      state.selectedOfferKey = card.dataset.offerKey;
      renderComparison(request, offers);
      $("offerDetails")?.scrollIntoView({behavior: "smooth", block: "start"});
    };
    card.addEventListener("click", select);
    card.addEventListener("keydown", event => {
      if(event.key === "Enter" || event.key === " "){
        event.preventDefault();
        select();
      }
    });
  });
  renderOfferDetails(request, offers);

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
function renderOfferDetails(request, offers){
  const wrap = $("offerDetails");
  if(!wrap) return;
  if(!offers.length){
    wrap.innerHTML = `<div class="summary-empty">Henüz firma teklifi yok.</div>`;
    return;
  }

  const offer = offers.find(item => offerKey(item) === state.selectedOfferKey);
  if(!offer){
    wrap.innerHTML = `<div class="summary-empty">Detayı görmek için yukarıdaki firma kartlarından birini seçin.</div>`;
    return;
  }

  const prices = new Map((offer.items || []).map(item => [item.itemId, Number(item.unitPrice) || 0]));
  const total = offerTotal(request, offer);
  const estimate = estimateTotal(request.items);
  const totalDiff = diffInfo(total, estimate);
  const rows = request.items.map((item, index) => {
    const quantity = parseNumber(item.quantity);
    const estimated = parseNumber(item.estimatedUnitPrice);
    const price = prices.get(item.id) || 0;
    const lineTotal = Number.isFinite(quantity) ? quantity * price : 0;
    const lineDiff = diffInfo(price, Number.isFinite(estimated) ? estimated : 0);
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="mono">${esc(item.posNo)}</td>
        <td>${esc(item.description)}</td>
        <td class="num">${esc(item.quantity)}</td>
        <td>${esc(item.unit)}</td>
        <td class="num">${Number.isFinite(estimated) ? fmtTL(estimated) : "—"}</td>
        <td class="num">${fmtTL(price)}</td>
        <td class="num">${fmtTL(lineTotal)}</td>
        <td class="num ${lineDiff.cls}">${lineDiff.text}</td>
      </tr>
    `;
  }).join("");

  wrap.innerHTML = `
    <article class="firm-detail-card">
      <div class="firm-detail-card__head">
        <div>
          <h4>${esc(offer.companyName)}</h4>
          <p>${esc(offer.contactName || "Yetkili girilmedi")}${offer.contactPhone ? " · " + esc(offer.contactPhone) : ""} · ${fmtDate(offer.submittedAt)}</p>
        </div>
        <div class="firm-detail-card__total">
          <span>Toplam</span>
          <strong>${fmtTL(total)}</strong>
          <em class="${totalDiff.cls}">${estimate ? totalDiff.text : "Yaklaşık maliyet yok"}</em>
        </div>
      </div>
      <div class="table-shell firm-detail-table">
        <table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Poz No</th>
              <th>Kalem</th>
              <th class="num">Miktar</th>
              <th>Birim</th>
              <th class="num">Yaklaşık BF</th>
              <th class="num">Firma BF</th>
              <th class="num">Firma Tutar</th>
              <th class="num">Fark</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>
  `;
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
    state.selectedOfferKey = null;
    resetComparison();
    await refreshAll();
    setView("dashboard");
  });
}

function resetComparison(){
  state.selectedOfferKey = null;
  $("detailTitle").textContent = "Karşılaştırma";
  $("detailMeta").textContent = "Bir teklif dosyası seçin.";
  $("detailEstimate").textContent = fmtTL(0);
  $("detailOfferCount").textContent = "0";
  $("detailBestOffer").textContent = "Yok";
  $("offersCards").innerHTML = "";
  if($("offerDetails")) $("offerDetails").innerHTML = "";
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
  const offerRank = new Map(totals.map((entry, index) => [entry.offer.offerId || entry.offer.id, index + 1]));
  const reportDate = fmtDate(new Date().toISOString());
  const reportRows = request.items.map((item, index) => {
    const quantity = parseNumber(item.quantity);
    const estimated = parseNumber(item.estimatedUnitPrice);
    const estimatedLineTotal = Number.isFinite(quantity) && Number.isFinite(estimated) ? quantity * estimated : 0;
    const offerRows = offers.map(offer => {
      const row = (offer.items || []).find(x => x.itemId === item.id);
      const price = Number(row?.unitPrice) || 0;
      const lineTotal = Number.isFinite(quantity) ? quantity * price : 0;
      const diff = diffInfo(price, Number.isFinite(estimated) ? estimated : 0);
      return {
        offer,
        price,
        lineTotal,
        diff,
        rank: offerRank.get(offer.offerId || offer.id) || 0
      };
    }).sort((a, b) => a.price - b.price || a.rank - b.rank);

    return `
      <section style="break-inside:avoid;page-break-inside:avoid;border:1px solid #d8e0e8;border-radius:14px;margin:0 0 14px;overflow:hidden;background:#fff">
        <div style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
            <div>
              <div style="font-size:11px;color:#64748b;font-weight:800;text-transform:uppercase">Kalem ${index + 1}</div>
              <h2 style="margin:4px 0 4px;font-size:14px;line-height:1.35;color:#111827">${esc(item.description)}</h2>
              <div style="font-size:11px;color:#475569">Poz No: ${esc(item.posNo || "-")} · Miktar: ${esc(item.quantity)} ${esc(item.unit)}</div>
            </div>
            <div style="min-width:142px;text-align:right;font-size:11px;color:#475569">
              <div>Yaklaşık BF: <strong style="color:#111827">${Number.isFinite(estimated) ? fmtTL(estimated) : "—"}</strong></div>
              <div>Yaklaşık Tutar: <strong style="color:#111827">${estimatedLineTotal ? fmtTL(estimatedLineTotal) : "—"}</strong></div>
            </div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10.5px">
          <thead>
            <tr>
              <th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#475569">Firma</th>
              <th style="text-align:right;padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#475569">Birim Fiyat</th>
              <th style="text-align:right;padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#475569">Tutar</th>
              <th style="text-align:right;padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#475569">Fark</th>
            </tr>
          </thead>
          <tbody>
            ${offerRows.map(row => `
              <tr>
                <td style="padding:7px 10px;border-bottom:1px solid #eef2f7">
                  <strong>${esc(row.offer.companyName)}</strong>
                  <div style="font-size:9.5px;color:#64748b">Sıra: ${row.rank} · ${esc(row.offer.contactName || "-")}</div>
                </td>
                <td style="text-align:right;padding:7px 10px;border-bottom:1px solid #eef2f7">${fmtTL(row.price)}</td>
                <td style="text-align:right;padding:7px 10px;border-bottom:1px solid #eef2f7">${fmtTL(row.lineTotal)}</td>
                <td style="text-align:right;padding:7px 10px;border-bottom:1px solid #eef2f7;color:${row.diff.value > 0 ? "#b42318" : row.diff.value < 0 ? "#137333" : "#475569"};font-weight:800">${row.diff.text}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    `;
  }).join("");

  root.innerHTML = `
    <div style="width:760px;padding:26px;font-family:Arial,sans-serif;color:#111827;background:#ffffff">
      <div style="border-bottom:3px solid #111827;padding-bottom:14px;margin-bottom:16px">
        <div style="font-size:11px;text-transform:uppercase;color:#0f766e;font-weight:800">Teklif Karşılaştırma Raporu</div>
        <h1 style="margin:6px 0 4px;font-size:25px;line-height:1.15">${esc(request.title)}</h1>
        <div style="font-size:11px;color:#5c6b7a">Kod: ${esc(request.id)} · Rapor Tarihi: ${reportDate} · Kalem: ${request.items.length}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="border:1px solid #d8e0e8;border-radius:12px;padding:10px;background:#fbfbfd"><div style="font-size:10px;color:#5c6b7a;text-transform:uppercase;font-weight:800">Yaklaşık Maliyet</div><strong style="font-size:16px">${fmtTL(estimate)}</strong></div>
        <div style="border:1px solid #d8e0e8;border-radius:12px;padding:10px;background:#fbfbfd"><div style="font-size:10px;color:#5c6b7a;text-transform:uppercase;font-weight:800">Teklif Veren Firma</div><strong style="font-size:16px">${offers.length}</strong></div>
        <div style="border:1px solid #d8e0e8;border-radius:12px;padding:10px;background:#fbfbfd"><div style="font-size:10px;color:#5c6b7a;text-transform:uppercase;font-weight:800">En Düşük Teklif</div><strong style="font-size:16px">${fmtTL(totals[0].total)}</strong></div>
        <div style="border:1px solid #d8e0e8;border-radius:12px;padding:10px;background:#fbfbfd"><div style="font-size:10px;color:#5c6b7a;text-transform:uppercase;font-weight:800">En Düşük Firma</div><strong style="font-size:16px">${esc(totals[0].offer.companyName)}</strong></div>
      </div>

      <h2 style="margin:18px 0 8px;font-size:15px">Firma Toplamları</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px;border:1px solid #d8e0e8;border-radius:12px;overflow:hidden">
        <thead>
          <tr>
            <th style="text-align:right;background:#f8fafc;border-bottom:1px solid #d8e0e8;padding:8px">#</th>
            <th style="text-align:left;background:#f8fafc;border-bottom:1px solid #d8e0e8;padding:8px">Firma</th>
            <th style="text-align:left;background:#f8fafc;border-bottom:1px solid #d8e0e8;padding:8px">Yetkili</th>
            <th style="text-align:right;background:#f8fafc;border-bottom:1px solid #d8e0e8;padding:8px">Toplam</th>
            <th style="text-align:right;background:#f8fafc;border-bottom:1px solid #d8e0e8;padding:8px">Yaklaşık Fark</th>
          </tr>
        </thead>
        <tbody>
          ${totals.map((entry, index) => {
            const diff = diffInfo(entry.total, estimate);
            return `
              <tr>
                <td style="text-align:right;border-bottom:1px solid #eef2f7;padding:8px">${index + 1}</td>
                <td style="border-bottom:1px solid #eef2f7;padding:8px"><strong>${esc(entry.offer.companyName)}</strong></td>
                <td style="border-bottom:1px solid #eef2f7;padding:8px;color:#64748b">${esc(entry.offer.contactName || "-")}</td>
                <td style="text-align:right;border-bottom:1px solid #eef2f7;padding:8px"><strong>${fmtTL(entry.total)}</strong></td>
                <td style="text-align:right;border-bottom:1px solid #eef2f7;padding:8px;color:${diff.value > 0 ? "#b42318" : diff.value < 0 ? "#137333" : "#475569"};font-weight:800">${diff.text}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <h2 style="margin:18px 0 8px;font-size:15px">Kalem Bazlı Tüm Firma Teklifleri</h2>
      ${reportRows}
    </div>
  `;
  document.body.appendChild(root);
  try{
    const canvas = await html2canvas(root, {scale: 2, backgroundColor: "#ffffff"});
    const imgData = canvas.toDataURL("image/png");
    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = 210;
    const pageHeight = 297;
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

async function startAdminApp(){
  if(adminAppStarted) return;
  adminAppStarted = true;
  try{
    configurePdfWorker();
    wireNavigation();
    wireBuilder();
    wireComparisonActions();
    wireVendor();
    wireLogout();
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

async function init(){
  registerPwa();
  wireAdminLogin();
  applyVendorModeFromUrl();

  if(!isAdminAuthenticated()){
    showLoginScreen();
    return;
  }

  showAdminShell();
  await startAdminApp();
}

init();

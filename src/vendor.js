import * as db from "./db.js";
import { registerPwa } from "./pwa.js";
import { $, banner, esc, fmtTL, parseNumber, uid } from "./utils.js";

const state = {
  request: null,
  company: null,
  items: []
};

function refreshIcons(){
  if(window.lucide) window.lucide.createIcons();
}

async function fetchVendorRequest(){
  const code = $("fetchCode").value.trim().toUpperCase();
  const companyName = $("companyName").value.trim();
  const contactName = $("contactName").value.trim();
  const contactPhone = $("contactPhone").value.trim();
  $("fetchBanner").innerHTML = "";
  $("submitBanner").innerHTML = "";

  if(!code){
    $("fetchBanner").innerHTML = banner("Teklif kodu girin.", "err");
    return;
  }
  if(!companyName){
    $("fetchBanner").innerHTML = banner("Firma ünvanı girin.", "err");
    return;
  }

  const request = await db.getVendorRequest(code);
  if(!request){
    $("fetchBanner").innerHTML = banner("Bu kodla teklif dosyası bulunamadı. Kodu kontrol edin.", "err");
    return;
  }

  state.request = request;
  state.company = {companyName, contactName, contactPhone};
  state.items = request.items.map(item => ({
    itemId: item.id,
    posNo: item.posNo,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: ""
  }));
  renderWorkArea();
}

function renderWorkArea(){
  $("vendorWorkArea").classList.add("is-open");
  $("vendorTitle").textContent = state.request.title;
  $("vendorMeta").textContent = `Kod: ${state.request.id} · ${state.request.items.length} kalem`;
  const body = $("vendorItemsBody");
  body.innerHTML = "";

  state.items.forEach((item, index) => {
    body.insertAdjacentHTML("beforeend", `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="mono">${esc(item.posNo)}</td>
        <td>${esc(item.description)}</td>
        <td class="num">${esc(item.quantity)}</td>
        <td>${esc(item.unit)}</td>
        <td><input class="num" data-price="${index}" value="${esc(item.unitPrice)}" inputmode="decimal" placeholder="0,00"></td>
        <td class="num" data-total="${index}">${lineTotal(item)}</td>
      </tr>
    `);
  });

  body.querySelectorAll("[data-price]").forEach(input => {
    input.addEventListener("input", event => {
      const index = Number(event.target.dataset.price);
      state.items[index].unitPrice = event.target.value;
      const totalCell = document.querySelector(`[data-total="${index}"]`);
      if(totalCell) totalCell.textContent = lineTotal(state.items[index]);
      renderTotal();
    });
  });
  renderTotal();
}

function lineTotal(item){
  const quantity = parseNumber(item.quantity);
  const price = parseNumber(item.unitPrice);
  return Number.isFinite(quantity) && Number.isFinite(price) ? fmtTL(quantity * price) : "—";
}

function renderTotal(){
  const total = state.items.reduce((sum, item) => {
    const quantity = parseNumber(item.quantity);
    const price = parseNumber(item.unitPrice);
    return sum + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
  }, 0);
  $("vendorTotal").textContent = fmtTL(total);
}

async function submitOffer(){
  if(!state.request) return;
  const missing = state.items.some(item => !Number.isFinite(parseNumber(item.unitPrice)));
  if(missing){
    $("submitBanner").innerHTML = banner("Tüm kalemler için birim fiyat girin.", "err");
    return;
  }

  const offer = {
    offerId: uid("OF"),
    requestId: state.request.id,
    companyName: state.company.companyName,
    contactName: state.company.contactName,
    contactPhone: state.company.contactPhone,
    items: state.items.map(item => ({
      itemId: item.itemId,
      unitPrice: parseNumber(item.unitPrice)
    })),
    submittedAt: new Date().toISOString()
  };
  await db.put("offers", offer);
  $("submitBanner").innerHTML = banner(`Teklifiniz kaydedildi. Kayıt no: <strong class="mono">${offer.offerId}</strong>`, "ok");
  $("submitOfferBtn").disabled = true;
}

function resetForm(){
  state.request = null;
  state.company = null;
  state.items = [];
  $("vendorItemsBody").innerHTML = "";
  $("vendorTotal").textContent = fmtTL(0);
  $("vendorWorkArea").classList.remove("is-open");
  $("fetchBanner").innerHTML = "";
  $("submitBanner").innerHTML = "";
  $("submitOfferBtn").disabled = false;
}

function applyCodeFromUrl(){
  const params = new URLSearchParams(window.location.search);
  const code = (params.get("firma") || params.get("kod") || "").trim().toUpperCase();
  if(code) $("fetchCode").value = code;
}

async function init(){
  try{
    registerPwa();
    await db.initDb();
    if($("dbStatus")) $("dbStatus").textContent = "Hazır";
    applyCodeFromUrl();
    $("fetchReqBtn").addEventListener("click", fetchVendorRequest);
    $("submitOfferBtn").addEventListener("click", submitOffer);
    $("resetVendorBtn").addEventListener("click", resetForm);
  }catch(err){
    console.error(err);
    if($("dbStatus")) $("dbStatus").textContent = "Hata";
    $("fetchBanner").innerHTML = banner(`SQL bağlantısı başlatılamadı: ${esc(err.message || err)}`, "err");
  }finally{
    refreshIcons();
  }
}

init();

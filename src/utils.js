export function $(id){
  return document.getElementById(id);
}

export function esc(value){
  const d = document.createElement("div");
  d.textContent = value == null ? "" : String(value);
  return d.innerHTML;
}

export function uid(prefix = ""){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = prefix;
  for(let i = 0; i < 6; i += 1){
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function itemId(){
  return "item_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

export function parseNumber(value){
  if(value == null) return NaN;
  let s = String(value).trim();
  if(!s || s === "-" || s === "—") return NaN;
  s = s.replace(/\s/g, "");
  if(s.includes(",") && s.includes(".")){
    s = s.replace(/\./g, "").replace(",", ".");
  }else if(s.includes(",")){
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function fmtNumber(value, digits = 2){
  return (Number(value) || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function fmtTL(value){
  return fmtNumber(value, 2) + " TL";
}

export function fmtDate(iso){
  if(!iso) return "";
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

export function estimateTotal(items){
  return (items || []).reduce((sum, item) => {
    const q = parseNumber(item.quantity);
    const p = parseNumber(item.estimatedUnitPrice);
    return sum + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0);
  }, 0);
}

export function offerTotal(request, offer){
  const prices = new Map((offer.items || []).map(item => [item.itemId, Number(item.unitPrice) || 0]));
  return (request.items || []).reduce((sum, item) => {
    const q = parseNumber(item.quantity);
    return sum + (Number.isFinite(q) ? q * (prices.get(item.id) || 0) : 0);
  }, 0);
}

export function diffInfo(current, reference){
  if(!reference) return {value: 0, text: "—", cls: "diff-flat"};
  const value = ((current - reference) / reference) * 100;
  return {
    value,
    text: (value > 0 ? "+" : "") + fmtNumber(value, 1) + "%",
    cls: value > 0.0001 ? "diff-plus" : value < -0.0001 ? "diff-minus" : "diff-flat"
  };
}

export function banner(message, type = "ok"){
  return `<div class="banner banner--${type}">${message}</div>`;
}

export async function copyText(text){
  if(!text) return;
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
  }
}

export function vendorLink(code){
  const url = new URL(window.location.href);
  const basePath = url.pathname.endsWith("/")
    ? url.pathname
    : url.pathname.replace(/[^/]*$/, "");
  url.pathname = basePath + "vendor.html";
  url.search = "";
  url.hash = "";
  url.searchParams.set("firma", code);
  return url.toString();
}

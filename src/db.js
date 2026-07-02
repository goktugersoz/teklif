const API_URL = "api/index.php";

export async function initDb(){
  await request("requests");
  return true;
}

export function getDbName(){
  return "teklif";
}

export async function put(storeName, value){
  if(storeName === "requests"){
    await request("requests", {method: "POST", body: value});
    return;
  }
  if(storeName === "offers"){
    await request("offers", {method: "POST", body: value});
    return;
  }
  throw new Error(`Bilinmeyen kaynak: ${storeName}`);
}

export async function remove(storeName, key){
  if(storeName !== "requests"){
    throw new Error(`Silme desteklenmiyor: ${storeName}`);
  }
  await request("requests", {method: "DELETE", params: {id: key}});
}

export async function get(storeName, key){
  if(storeName !== "requests"){
    throw new Error(`Tekil get desteklenmiyor: ${storeName}`);
  }
  return request("requests", {params: {id: key}});
}

export async function all(storeName){
  if(storeName === "requests") return request("requests");
  if(storeName === "offers") return request("offers");
  throw new Error(`Bilinmeyen kaynak: ${storeName}`);
}

export async function allByIndex(storeName, indexName, value){
  if(storeName === "offers" && indexName === "requestId"){
    return request("offers", {params: {requestId: value}});
  }
  throw new Error(`Desteklenmeyen index: ${storeName}.${indexName}`);
}

export async function deleteOffersForRequest(requestId){
  await request("offers", {method: "DELETE", params: {requestId}});
}

export async function getVendorRequest(code){
  return request("vendor-request", {params: {id: code}});
}

async function request(resource, options = {}){
  const method = options.method || "GET";
  const url = new URL(API_URL, window.location.href);
  url.searchParams.set("resource", resource);
  Object.entries(options.params || {}).forEach(([key, value]) => {
    if(value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method,
    headers: options.body ? {"Content-Type": "application/json"} : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let data = null;
  if(text){
    if(text.trimStart().startsWith("<?php")){
      throw new Error("PHP dosyası çalıştırılmadan düz metin olarak geliyor. Siteyi statik sunucudan değil PHP destekli hostingten ya da PHP local server ile açın.");
    }
    try{
      data = JSON.parse(text);
    }catch{
      throw new Error("API JSON dönmedi. PHP çalışıyor mu ve api/config.php veritabanı bilgileri doğru mu?");
    }
  }
  if(!response.ok){
    throw new Error(data?.error || `API hatası: ${response.status}`);
  }
  return data;
}

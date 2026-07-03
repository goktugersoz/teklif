export function registerPwa(){
  document.documentElement.classList.toggle("is-standalone", isStandalone());

  if("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(error => {
        console.warn("Service worker kaydı başarısız:", error);
      });
    });
  }

  let promptEvent = null;
  const installButton = document.getElementById("installAppBtn");
  const installSheet = createInstallSheet();

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    promptEvent = event;
    showInstallButton(installButton);
  });

  installButton?.addEventListener("click", async () => {
    if(isStandalone()){
      installButton.hidden = true;
      return;
    }
    if(isIos()){
      openInstallSheet(installSheet);
      return;
    }
    if(!promptEvent){
      openInstallSheet(installSheet);
      return;
    }
    promptEvent.prompt();
    await promptEvent.userChoice;
    promptEvent = null;
    installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    if(installButton) installButton.hidden = true;
  });

  if(installButton && isIos() && !isStandalone()){
    showInstallButton(installButton);
  }
}

function showInstallButton(button){
  if(!button) return;
  button.hidden = false;
  button.setAttribute("aria-label", "Uygulamayı yükle");
}

function isIos(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(){
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function createInstallSheet(){
  let sheet = document.getElementById("pwaInstallSheet");
  if(sheet) return sheet;

  sheet = document.createElement("div");
  sheet.className = "install-sheet";
  sheet.id = "pwaInstallSheet";
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="install-sheet__backdrop" data-install-close></div>
    <section class="install-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="installSheetTitle">
      <div class="install-sheet__handle"></div>
      <div class="install-sheet__app">
        <div class="brand__mark">T</div>
        <div>
          <h2 id="installSheetTitle">Teklif'i uygulama gibi kullan</h2>
          <p>Telefonda tam ekran açılır, ana ekrandan hızlı erişilir.</p>
        </div>
      </div>
      <ol class="install-steps">
        <li><span>1</span><strong>Paylaş</strong> simgesine dokun.</li>
        <li><span>2</span><strong>Ana Ekrana Ekle</strong> seçeneğini seç.</li>
        <li><span>3</span><strong>Ekle</strong> ile tamamla.</li>
      </ol>
      <button class="button button--primary" type="button" data-install-close>Tamam</button>
    </section>
  `;
  sheet.addEventListener("click", event => {
    if(event.target.closest("[data-install-close]")){
      sheet.hidden = true;
      document.body.classList.remove("install-sheet-open");
    }
  });
  document.body.appendChild(sheet);
  return sheet;
}

function openInstallSheet(sheet){
  sheet.hidden = false;
  document.body.classList.add("install-sheet-open");
}

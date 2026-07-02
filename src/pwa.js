export function registerPwa(){
  if("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(error => {
        console.warn("Service worker kaydı başarısız:", error);
      });
    });
  }

  let promptEvent = null;
  const installButton = document.getElementById("installAppBtn");

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    promptEvent = event;
    if(installButton) installButton.hidden = false;
  });

  installButton?.addEventListener("click", async () => {
    if(!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice;
    promptEvent = null;
    installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    if(installButton) installButton.hidden = true;
  });
}

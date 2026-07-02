# Hosting Kurulumu

Bu sürüm PHP + MySQL/MariaDB ile çalışır. Tarayıcı doğrudan SQL'e bağlanmaz; `api/index.php` üzerinden veritabanına yazar.

## 1. Veritabanı oluştur

cPanel, Plesk veya hosting panelinden bir MySQL/MariaDB veritabanı oluştur:

- Veritabanı adı: `teklif` ya da hostingin verdiği ad
- Kullanıcı adı
- Şifre

Sonra `schema.sql` dosyasını phpMyAdmin içinden içe aktar.

## 2. API bağlantısını ayarla

`api/config.php` dosyasını hosting bilgilerine göre düzenle:

```php
<?php
return [
    'host' => 'localhost',
    'database' => 'VERITABANI_ADI',
    'username' => 'VERITABANI_KULLANICI',
    'password' => 'VERITABANI_SIFRE',
    'charset' => 'utf8mb4',
];
```

## 3. Dosyaları yükle

Şu dosya ve klasörleri hosting `public_html` veya site köküne yükle:

- `index.html`
- `vendor.html`
- `teklif-uygulamasi.html`
- `styles/`
- `src/`
- `api/`
- `ffffff.pdf` gerekiyorsa

`schema.sql` kurulumdan sonra public alanda kalmak zorunda değildir.

## 4. Kullanım

Yönetici ekranı:

```text
https://alanadiniz.com/index.html
```

Firma linki:

```text
https://alanadiniz.com/vendor.html?firma=TEKLIFKODU
```

Yönetici panelindeki `Firma Linki` butonu bu linki üretir.

## Not

Bu yapıda firma sayfası sadece firma giriş ekranını açar ve firma API'si yaklaşık maliyet döndürmez. Yönetici ekranını ayrıca hosting panelinden parola korumasına almak iyi olur.

## PWA

Uygulama PWA uyumludur:

- `manifest.json`
- `sw.js`
- `offline.html`
- `icons/`

PWA yükleme ve service worker için canlı ortamda HTTPS gerekir. Local testte `http://127.0.0.1` kabul edilir.

## Render Kurulumu

Render için önerilen yapı:

- Web Service runtime: `Docker`
- Branch: `master`
- Region: `Frankfurt`
- Root Directory: boş bırak
- Dockerfile Path: `./Dockerfile`
- Instance Type: test için `Free`, canlı kullanım için en az `Starter`

Render Web Service ortam değişkenleri:

```text
DB_DRIVER=pgsql
DB_SSLMODE=require
AUTO_MIGRATE=true
MIGRATION_TOKEN=uzun-rastgele-bir-deger
DATABASE_URL=Render Postgres Internal Database URL
```

Render'da ayrıca bir PostgreSQL database oluştur. Aynı region seçili olsun. PostgreSQL ekranındaki `Internal Database URL` değerini Web Service içindeki `DATABASE_URL` env değerine koy.

Free plan’da Shell yoksa sorun değil. `AUTO_MIGRATE=true` olduğu sürece ilk API isteğinde tablolar otomatik oluşturulur.

Manuel tetiklemek istersen deploy sonrası şu URL’yi aç:

```text
https://alanadiniz.onrender.com/api/migrate.php?token=MIGRATION_TOKEN_DEGERI
```

Başarılı cevap:

```json
{"ok":true,"driver":"pgsql","message":"Veritabanı şeması hazır."}
```

Shell erişimin varsa alternatif olarak PostgreSQL servisinde `schema-postgres.sql` dosyasını çalıştırabilirsin. MySQL/MariaDB kullanacaksan `schema.sql` kullanılır.

Render Docker container public HTTP portunu `PORT` env değişkeninden alır. `render-start.sh` Apache'yi bu porta göre başlatır.

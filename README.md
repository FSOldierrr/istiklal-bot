# İstiklal Discord Botu

Türkçe, production kalitesinde, slash-command tabanlı Discord botu.

## Klasör Yapısı
```
.
├── index.js                # Bot giriş noktası
├── deploy-commands.js      # Slash komut kaydı
├── ecosystem.config.js     # PM2 yapılandırması
├── package.json            # Bağımlılıklar
├── .env.example            # Ortam değişkenleri örneği
├── .gitignore              # Git'in yok sayacağı dosyalar
├── LICENSE                 # MIT lisansı
├── README.md               # Bu dosya
├── data/                   # SQLite veritabanı ve yedekler (otomatik oluşur)
└── src/
    ├── commands/           # Slash komutları
    ├── events/             # Discord eventleri
    ├── handlers/           # Komut/event/bileşen yükleyicileri
    ├── database/           # SQLite bağlantı ve şema
    └── utils/              # Logger, embed, yetki, ses yardımcıları
```

## Kurulum ve Çalıştırma

1. Bağımlılıkları yükle:
   ```bash
   npm install
   ```

2. `.env.example` dosyasını kopyalayıp `.env` oluştur ve doldur:
   ```bash
   copy .env.example .env
   # Not: TOKEN ve CLIENT_ID değerlerini kendi botunla doldur.
   ```

3. Discord Developer Portal'da (**https://discord.com/developers/applications**) botunuzun **Privileged Gateway Intentleri** açın:
   - **Presence Intent** → ON
   - **Server Members Intent** → ON
   - **Message Content Intent** → ON

4. Slash komutlarını kaydet:
   ```bash
   node deploy-commands.js
   ```
   (Komutlar global olarak kaydedilir **ve** botun bulunduğu tüm sunuculara anında kaydedilir. Böylece `/` menüsünde gecikme olmadan görünür.)

5. PM2 ile 7/24 çalıştır:
   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.js
   pm2 save
   ```

## Sunucu İzinleri
Botun sunucuda şu izinlere (veya Yönetici iznine) ihtiyacı vardır:
- Kanalları Yönet, Rolleri Yönet, Üyeleri Yasakla, Üyeleri At, Üyelerin Zaman Aşımını Yönet, Mesajları Görüntüle, Mesajları Gönder, Mesaj Yönet, Mesaj Geçmişini Okumak, Herkesi Etiketle, Seslere Bağlan, Konuş, Ses Kullanıcılarının Mikrofonunu Kapatma, Etkinlik Oluşturma

## Komutlar (hepsi `/` slash komutudur)
**Kurulum:** `/setup`
**Ticket:** `/ticket-panel`, `/ticket-kişi-ekle`, `/ticket-kişi-çıkar`
**Bilgi:** `/botbilgi`, `/sunucubilgi`, `/yardım`
**Moderasyon:** `/ban`, `/unban`, `/kick`, `/timeout`, `/timeout-kaldır`, `/uyar`, `/uyarılar`, `/uyarı-sil`, `/temizle`
**Duyuru:** `/duyur`, `/duyur-zamanla`, `/duyur-iptal`
**Diğer:** `/rol-panel`, `/veri-indir`

## Güvenlik ve Otomasyon
> ⚠️ **Önemli:** `.env` dosyası gizli token içerir ve `.gitignore` ile korunur. Bu dosyayı **asla** GitHub'a yüklemeyin. Yeni bir ortamda `.env.example` dosyasını `.env` olarak kopyalayıp doldurun.

- **Koruma Filtresi (Küfür Paneli):** Milli ve dini değerlere yönelik hakaret içeren mesajları siler ve göndereni susturur. `/setup > Koruma Filtresi` panelinden açılıp kapatılabilir, susturma süresi ve uyarı mesajı özelleştirilebilir, **Filtreyi Test Et** ile denenebilir.
- **Otomatik Ceza Sistemi:** Uyarı sayısına göre kademeli susturma, son eşikte ban uygular. Varsayılan: `3 → 10 dk`, `5 → 30 dk`, `10 → 2 saat`, `15 → 12 saat`, `20 → ban`. Kademeler `/setup > Otomatik Ceza > Kademeleri Düzenle` ile değiştirilebilir.
- **Uyarı Geçerliliği & Boost Ayrıcalığı:** Uyarılar varsayılan **15 gün** sonra düşer; boost basan üyede süre **yarıya** iner (7.5 gün, dinamik). Üye **2. kez** boost bastığında tüm uyarıları sıfırlanır. `/setup > Uyarı Sistemi & Boost` panelinden ayarlanır.
- **Bildirim Kuralı:** Üyeye uygulanan **tüm** yaptırımlarda (`/ban`, `/unban`, `/kick`, `/timeout`, `/timeout-kaldır`, `/uyar`, `/uyarı-sil`, otomatik ceza, boost sıfırlama, koruma filtresi) kullanıcıya **DM** gönderilir ve **birebir aynı mesaj** sunucunun belirlenen log kanalına yazılır.
- **Ticket Yetkilileri:** `/setup > Ticket Yetkilileri` panelinden ticket türü başına otomatik eklenecek/etiketlenecek yetkili rolleri belirlenir.
- **Zamanlanmış Duyuru:** `/duyur-zamanla` ile ileri bir zamana duyuru planlanır; `/duyur-iptal` ile listelenir veya iptal edilir.

## Lisans

Bu proje **MIT Lisansı** ile lisanslanmıştır. Ayrıntılar için [LICENSE](LICENSE) dosyasına bakın.

## Kullanım İzni

Bu botu kullanmak, kopyalamak veya kendi sunucunuzda barındırmak isteyenlerin önce izin alması gerekir:

1. **İstiklal Discord sunucusuna** katılın → **[discord.gg/istiklal](https://discord.gg/istiklal)**
2. **Destek talebi (ticket)** açın ve botu hangi sunucuda, ne amaçla kullanmak istediğinizi belirtin.
3. Yetkililer izin verdikten sonra **izinli şekilde** kullanabilirsiniz.

İzin alınmadan kullanım, kopyalama veya yeniden dağıtım kabul edilmez. Lisans hakkındaki tüm sorularınız için de aynı sunucudan destek açabilirsiniz.


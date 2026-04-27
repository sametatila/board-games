# Sunny Harbor

Tarayıcıda 8 oyuncuya kadar Catan-tarzı bir hex tabanlı strateji oyunu.
Klasik tek-ada haritasından gemi/keşif/korsan içeren çok-ada senaryolarına
kadar 6 farklı harita içerir. Server-authoritative: PartyKit ([Cloudflare
Workers](https://workers.cloudflare.com/) üzerinde) bir oda = bir Durable
Object, oyun durumu reducer ile orada güncellenir. Frontend Next.js 16 (App
Router) + Three.js + react-three-fiber.

## Hızlı başlangıç (geliştirme)

```bash
npm install
cp .env.local.example .env.local
npm run dev:all          # Next dev (port 3000) + PartyKit dev (port 1999)
```

Tarayıcıda `http://localhost:3000` aç → takma ad gir → "Yeni oda kur" → kodu
arkadaşlarına paylaş.

İki sunucu ayrı çalışır:

```bash
npm run dev              # Next.js (frontend)
npm run dev:party        # PartyKit (multiplayer state server)
```

## Test

```bash
npx tsc --noEmit                       # type check
npx next build                         # production build
npx tsx scripts/reducer_smoke.ts       # 2-oyuncu setup + zar + robber akışı
npx tsx scripts/templates_test.ts      # 6 harita × 3 oyuncu sayısı generate test
node scripts/full_game_smoke.mjs       # PartyKit'e karşı end-to-end (party'nin çalışıyor olması gerek)
```

## Üretim (production deploy)

İki ayrı servis: **frontend Vercel'de**, **multiplayer server PartyKit'te
(Cloudflare)**. Her ikisinin de ücretsiz tier'i bu proje için yeterli.

### 1. PartyKit'i deploy et

```bash
# Cloudflare hesabı + PartyKit auth (ilk kez):
npx partykit login

# Deploy:
npm run deploy:party
# Çıktıda şuna benzer bir URL görünür:
#   ✓ Deployed to https://sunny-harbor.<your-account>.partykit.dev
```

URL'i not al — Vercel env'inde lazım olacak (protokolsüz).

### 2. Vercel'e deploy

Repo'yu GitHub'a push'la ve [vercel.com/new](https://vercel.com/new)'den
import et. Build ayarları otomatik (Next.js detect eder).

**Environment variables** (Vercel dashboard → Settings → Environment Variables):

| Key | Value | Scope |
|---|---|---|
| `NEXT_PUBLIC_PARTYKIT_HOST` | `sunny-harbor.<your-account>.partykit.dev` | Production |

`NEXT_PUBLIC_` prefix'i Next.js'in client'a expose etmesi için gerekli.

### 3. Deploy sonrası

- Vercel'in verdiği `https://<proje>.vercel.app` URL'ine git → ana sayfa
  açılırsa frontend OK
- Yeni oda kur → board görünüyorsa PartyKit bağlantısı OK
- Arkadaşlarına oda kodunu yolla, gerçek zamanlı katılsınlar

### Sorun giderme

- "Sunucudan oda durumu bekleniyor" mesajında takılı kalıyorsa: tarayıcı
  konsolunda WebSocket hatası ara. PartyKit URL'i yanlış olabilir.
- "Oyun başlamış, izleyici olarak bağlandın" — başkası odayı zaten kurmuş.
  "↻ Sıfırla" butonuyla temizleyebilirsin (host gerek).
- PartyKit free tier'i ayda 10K istek/100GB transfer; 8 oyunculu bir oyun
  ortalama ~50 mesaj/dakika atar, normal kullanımda yetip artar.

## Mimari

```
┌─────────────────────────────────────────────────────────┐
│ Client (Vercel/Next.js)                                 │
│  src/games/sunny-harbor/components/Board3D.tsx     ← three.js render       │
│  src/games/sunny-harbor/components/GameView.tsx    ← UI, action dispatch   │
│  src/platform/store.ts               ← zustand state         │
│  src/platform/useParty.ts            ← WebSocket client      │
└─────────────────────────────────────────────────────────┘
                       │ WSS (PartyKit protocol)
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Server (PartyKit/Cloudflare Durable Object per room)    │
│  party/index.ts                 ← message handler       │
│  src/games/sunny-harbor/reducer.ts            ← pure state reducer    │
│  src/games/sunny-harbor/board.ts              ← board generation      │
│  src/games/sunny-harbor/mapTemplates.ts       ← 6 map definitions     │
└─────────────────────────────────────────────────────────┘
```

Reducer ve types client+server arasında **paylaşılan kod**, böylece tek
source of truth. Server tüm action'ları validate eder, snapshot broadcast
eder. State PartyKit Durable Object storage'da persist olur (oda boş bile
olsa kaybolmaz; reset için "↻ Sıfırla" butonu var).

## Telif

Sunny Harbor kişisel bir proje, Catan® markasıyla bağlantılı değildir.
Yalnızca arkadaş çevresinde kullanım için tasarlandı.

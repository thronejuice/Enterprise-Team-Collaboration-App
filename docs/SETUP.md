# Setup & Run — LAN Demo

คู่มือนี้คือขั้นตอนจริงสำหรับเครื่องพัฒนา (Windows 11 + WSL2 + Docker Desktop) ตามลำดับใน [README.md](README.md)
ทุกคำสั่ง bash รันใน WSL ที่ root ของโปรเจกต์ ส่วน PowerShell รันบน Windows

## 0. สิ่งที่ระบบนี้ทำ

| หน้า | ใครใช้ | ทำอะไร |
|---|---|---|
| `/login` | ทุกคน | เข้าสู่ระบบด้วยบัญชีที่ Admin สร้าง (ไม่มีสมัครเอง) |
| `/` Home | ทุกคน | กรอก Room Code 4 หลัก, Host สร้างห้อง, รายการ "My meetings" (Rejoin ได้โดยไม่ต้องกรอก code ใหม่) |
| `/meetings/:id` | ผู้ที่ผ่าน code แล้ว | Pre-join (เลือก/ทดสอบกล้อง-ไมค์) → ห้องประชุม (video, audio, screen share, REC indicator) |
| `/recordings` | ผู้ที่เคยเข้าร่วม, Host, Admin | ดู/ดาวน์โหลด/ลบ (Host/Admin) ไฟล์บันทึก |
| `/diagnostics` | ทุกคน | ทดสอบ HTTPS, WebSocket, WebRTC UDP/TCP, publish audio/video จากเครื่องนั้น |
| `/admin/users` | Admin | สร้างบัญชี, เปลี่ยน role, ปิดบัญชี (ตัดออกจากห้องทันที), reset password |
| `/admin/audit` | Admin | Security/audit log |

Roles: **ADMIN** (ทุกอย่าง) · **HOST** (สร้างห้อง, อัด, mute/เตะผู้เข้าร่วม, End ห้องของตัวเอง) · **MEMBER** (เข้าร่วมด้วย code)

## 1. ตรวจเครื่อง

    docker version && docker compose version
    free -h            # RAM ที่ WSL เห็น
    nproc

แนะนำเพิ่ม RAM ของ WSL (ตอนนี้ `.wslconfig` จำกัด 6GB; Egress ใช้ ~1 GB ระหว่างอัด และ LiveKit โตตามจำนวนคน)
แก้ `%UserProfile%\.wslconfig` บน Windows แล้ว `wsl --shutdown`:

    [wsl2]
    memory=10GB

> ระบบนี้ใช้ WSL **NAT mode** (ไม่ใช่ mirrored) — Docker Desktop publish พอร์ต 443/7881/7882 ไปที่ Windows host เอง
> จึงไม่ต้องแก้ networkingMode

## 2. สร้าง `.env`

    scripts/init-env.sh [hostname] [lan-ip]

- ไม่ใส่ argument: hostname = `comms-demo.home.arpa` และหา LAN IP ของ Windows (adapter ที่มี default gateway) อัตโนมัติ
- สร้าง secret สุ่มทั้งหมด + รหัส admin คนแรก (ดูใน `.env` → `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- ถ้า IP ของเครื่องเปลี่ยน (DHCP) ให้แก้ `LIVEKIT_NODE_IP` ใน `.env` แล้ว `docker compose up -d livekit`
  แนะนำจอง IP (DHCP reservation) ที่ router ก่อนวัน demo

## 3. Certificate (mkcert)

    scripts/certs.sh

- ติดตั้ง mkcert v1.4.4 ไว้ที่ `~/.local/bin` (ตรวจ checksum) แล้วออก cert ให้ `DEMO_HOSTNAME`
- `infra/certs/cert.pem`, `key.pem` → ใช้โดย Caddy (อย่าแจกจ่าย)
- `infra/certs/rootCA.crt` → **public** CA cert สำหรับติดตั้งบนเครื่องลูกค้า
- CA private key อยู่ที่ `$(mkcert -CAROOT)` บน WSL เท่านั้น — ห้ามคัดลอกออก

## 4. เริ่มระบบ

    docker compose up -d --build
    docker compose ps

ลำดับ start ถูกบังคับด้วย `depends_on` อยู่แล้ว: postgres/redis/minio → minio-init (สร้าง bucket private + identity
`egress-writer` (เขียนอย่างเดียว) และ `api-reader` (อ่าน/ลบ)) → livekit → egress, api (migrate + seed admin) → web → caddy

ตรวจสุขภาพ:

    docker compose logs --tail=50 api livekit egress caddy
    curl -s --cacert infra/certs/rootCA.crt --resolve "comms-demo.home.arpa:443:$(grep LIVEKIT_NODE_IP .env | cut -d= -f2)" https://comms-demo.home.arpa/api/health

## 5. Windows: Firewall (PowerShell **as Administrator**)

คัดลอก `scripts\windows\` ไปไว้บน Windows (หรือเปิดผ่าน `\\wsl$\...`) แล้ว:

    Set-ExecutionPolicy -Scope Process Bypass
    .\setup-firewall.ps1 -Subnet 192.168.1.0/24     # ใส่ subnet LAN จริง ไม่ใช่ตัวอย่าง

เปิดเฉพาะ 443/tcp, 7881/tcp, 7882/udp จาก subnet ที่กำหนด ลบทีหลังด้วย `.\remove-firewall.ps1`

## 6. เครื่องลูกค้าทุกเครื่อง (รวมเครื่อง dev ถ้าเปิด browser บน Windows)

1. **ชื่อโดเมน** — ถ้ามี internal DNS ให้เพิ่ม A record `DEMO_HOSTNAME → LAN IP` (แนะนำ)
   ถ้าไม่มี: `.\add-hosts-entry.ps1 -HostName comms-demo.home.arpa -Address <LAN IP>` (Admin)
2. **Trust CA** — คัดลอก `rootCA.crt` ไปที่เครื่อง แล้ว `.\install-root-ca.ps1 -Path .\rootCA.crt`
   (Mac: เปิด Keychain Access → System → ลาก rootCA.crt เข้า แล้วตั้ง "Always Trust")
3. ปิดแล้วเปิด Chrome/Edge ใหม่ → เปิด `https://comms-demo.home.arpa` → ต้องไม่มี certificate warning
4. เข้า **Connection test** ในแอป → ทุกข้อต้องเป็นเครื่องหมายถูก

## 7. ใช้งานครั้งแรก

1. Login ด้วย admin จาก `.env`
2. `/admin/users` → สร้างบัญชี HOST สำหรับผู้นำเสนอ และ MEMBER สำหรับลูกค้าแต่ละคน
3. Host: Home → Start a new meeting → แจก Room Code
4. ลูกค้า: login → กรอก code → Pre-join → Join meeting

## 8. ทดสอบอัตโนมัติ

    pnpm install
    pnpm test                 # API unit tests (room code, rate limit, access policy, recording state machine)
    tests/e2e/run.sh          # E2E ผ่าน LAN IP จาก container แยก (Chromium + fake camera/mic)

E2E ครอบคลุม: ROOM-01..09, RTC-01/05/06, REC-01..08, REC-10, NET-01/05 (CA-verified HTTPS), การทดสอบ Connection test
และ audit log — ไฟล์บันทึกที่ได้อยู่ใน `tests/e2e/results/` (ตรวจด้วย ffprobe ได้)

สิ่งที่ **ต้องทดสอบด้วยมือบนอุปกรณ์จริง** ตาม [07-acceptance-test.md](07-acceptance-test.md):
NET-02..04 (trust บนเครื่องลูกค้า), RTC-02..04/07/08, RTC-09 (10 คน), REC-09 (ตัวอักษรบนจอที่แชร์อ่านออกในไฟล์ —
E2E ใช้ fake capture จึงพิสูจน์แค่ว่า layout มีจอที่แชร์), และ load test ส่วน F

## 9. ปัญหาที่พบบ่อย

| อาการ | ตรวจ |
|---|---|
| Certificate warning | ติดตั้ง `rootCA.crt` แล้วหรือยัง, เปิดด้วย hostname (ไม่ใช่ IP), restart browser |
| Signaling ได้ แต่ภาพ/เสียงไม่มา | Firewall 7882/udp + 7881/tcp, `LIVEKIT_NODE_IP` ตรงกับ IP ปัจจุบัน, Wi-Fi AP isolation |
| Record แล้ว error "Another recording is already in progress" | จำกัด 1 job ทั้งระบบ (`MAX_CONCURRENT_RECORDINGS`) — Stop อันเดิมก่อน |
| Recording ค้าง FINALIZING | `docker compose logs egress` — ถ้าไม่มีไฟล์ใน MinIO ภายใน 5 นาที ระบบจะเปลี่ยนเป็น FAILED พร้อมเหตุผล |
| ทุกคนโดน "Too many attempts" พร้อมกัน | Docker Desktop ทำให้ทุก client มี IP เดียวกัน → limit ต่อ IP กลายเป็นของรวม ตั้ง `RATE_LIMIT_MAX_FAILURES_PER_IP=0` เพื่อปิด แล้ว `docker compose up -d api` |
| MinIO Console | `http://localhost:9001` บนเครื่อง dev เท่านั้น (bind 127.0.0.1) |

### กู้ระบบเมื่อไม่เหลือ Admin ที่ใช้งานได้

ระบบกันไม่ให้ระงับหรือลด role ของ Admin คนสุดท้าย แต่ถ้าเกิดขึ้นได้ (เช่น แก้ฐานข้อมูลเอง) ให้กู้ด้วยการสร้าง Admin ใหม่ตอนเริ่มระบบ:

1. ใน `.env` ตั้ง `ADMIN_EMAIL` เป็นอีเมลที่**ยังไม่มีบัญชี** และตั้ง `ADMIN_PASSWORD` (อย่างน้อย 10 ตัว)
2. `docker compose up -d api` (ตอนเริ่ม `seed` จะสร้าง Admin ให้เมื่อไม่มี Admin ที่ active และยังไม่ถูก anonymize)
3. ล็อกอินด้วยบัญชีนั้น แล้วเปิดคืนหรือแก้ Admin คนเดิมที่หน้า Users
4. เปลี่ยน `ADMIN_PASSWORD` หรือถอดออกจาก `.env` เมื่อเสร็จ

ถ้า `ADMIN_EMAIL` ตรงกับบัญชีที่มีอยู่แล้ว seed จะหยุดพร้อมข้อความบอกให้ใช้อีเมลอื่น

## 10. หยุดระบบ / ล้างข้อมูล

    docker compose down            # หยุด เก็บข้อมูลไว้ (DB, recordings)

ล้างข้อมูลทดสอบทั้งหมดก่อนวัน demo จริง (**ลบ DB และ recordings ถาวร** — สำรองก่อนถ้าต้องเก็บ):

    docker compose down -v && docker compose up -d

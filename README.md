# Enterprise Team Collaboration App

ระบบประชุมออนไลน์ (video meeting) สำหรับองค์กร รันบนเครื่องเดียวและให้ผู้ใช้เข้าผ่าน browser ในเครือข่าย Wi-Fi/LAN เดียวกัน สร้างขึ้นเพื่อใช้เป็น **Local LAN Demo** ให้ลูกค้าทดลองใช้งานจริง (สูงสุด 10 คนต่อห้อง)

**เวอร์ชันปัจจุบัน: 0.1.1** (User Profile & Offboarding) · ดูรายละเอียดในหัวข้อ [เวอร์ชันและการอัปเกรด](#เวอร์ชันและการอัปเกรด)

📖 **คู่มือการใช้งาน (ภาษาไทย, มีภาพประกอบ):** [docs/USER-MANUAL.md](docs/USER-MANUAL.md) — ตั้งแต่ติดตั้ง การป้อนข้อมูลโดย Admin จนถึงการสร้างห้องประชุม แบ่งตามบทบาท

## โปรเจ็คนี้คืออะไร ใช้ทำอะไร

- **ประชุมวิดีโอ/เสียง/แชร์หน้าจอ** แบบเรียลไทม์ผ่าน browser ไม่ต้องติดตั้งโปรแกรมเพิ่ม
- **เข้าห้องด้วยรหัส 4 หลัก** (Room Code `0000`–`9999`) ผู้ใช้ต้องล็อกอินก่อนจึงจะกรอกรหัสได้
- **บันทึกการประชุม** (Recording) เก็บไฟล์ใน MinIO และเปิดดูย้อนหลังได้ในหน้า Recordings
- **โปรไฟล์ผู้ใช้ (v0.1.1)** ทุกคนแก้ชื่อที่แสดง เบอร์โทร และรูป Avatar ของตัวเองได้ และดูรายการอุปกรณ์ที่ล็อกอินอยู่ (Sessions) ได้ที่หน้า **My profile**
- **Directory (v0.1.1)** หน้า **People** ค้นหาและกรองตามแผนกได้ แสดงเฉพาะข้อมูลที่ไม่ใช่ข้อมูลส่วนตัว (ไม่มีเบอร์โทร รหัสพนักงาน หรือสถานะการระงับ)
- **จัดการผู้ใช้** โดย Admin: สร้างผู้ใช้ (ต้องมีรหัสพนักงาน) ค้นหา/กรอง/Export CSV นำเข้าจาก CSV แก้ไขโปรไฟล์ เปลี่ยน role และดู Audit log
- **Offboarding (v0.1.1)** Admin ระงับผู้ใช้ทันทีหรือตั้งวันทำงานวันสุดท้ายล่วงหน้า โดยห้องประชุมและ Recording ของผู้ใช้จะโอนให้ผู้รับช่วง และสามารถเปิดบัญชีคืน หรือ Anonymize ข้อมูลส่วนตัวตาม PDPA ได้
- **หน้า Connection test** สำหรับตรวจว่า browser/เครือข่ายของผู้ใช้เชื่อมต่อได้
- **หน้าต่าง "What's new"** แสดงสิ่งที่เปลี่ยนในเวอร์ชันนั้นครั้งเดียวต่อ browser หลังล็อกอิน (แก้เนื้อหาที่ `apps/web/src/lib/release-notes.ts`)

### สิทธิ์ตาม Role

| Role | สร้างห้อง | เข้าห้อง | ควบคุมห้อง (อัด/ลบคน/ปิดเสียง/จบห้อง) | จัดการผู้ใช้ / Audit log |
|---|---|---|---|---|
| ADMIN | ได้ | ได้ | ได้ทุกห้อง | ได้ |
| HOST | ได้ | ได้ | เฉพาะห้องที่ตัวเองเป็นผู้ควบคุม (host) | ไม่ได้ |
| MEMBER | ได้ | ได้ | เฉพาะห้องที่ตัวเองเป็นผู้ควบคุม (host) | ไม่ได้ |

ผู้ควบคุมห้องคือ `hostId` ของห้อง ตั้งเป็นผู้สร้างตอนสร้างห้อง และเปลี่ยนได้เมื่อมีการโอนห้องจากการระงับผู้ใช้ (`createdBy` เก็บไว้เป็นประวัติ)

### ฟีเจอร์ตามเวอร์ชัน

| ฟีเจอร์ | เวอร์ชัน | ใครใช้ได้ |
|---|---|---|
| แก้โปรไฟล์ (ชื่อที่แสดง, เบอร์, Avatar), เปลี่ยนรหัสผ่าน, จัดการ Sessions | 0.1.1 | ทุกคน |
| People directory, จัดการแผนก | 0.1.1 | ทุกคน (แผนก: Admin) |
| แก้ Profile ผู้ใช้, Suspend / Reactivate / Anonymize | 0.1.1 | Admin |
| บังคับเปลี่ยนรหัสผ่านเมื่อเข้าใช้ครั้งแรกหรือหลัง reset | 0.1.1 | ทุกคน |
| ค้นหา/กรอง/Export CSV และนำเข้าผู้ใช้จาก CSV | 0.1.1 | Admin |
| เปิดห้องประชุม, Room Code, Recording | 0.1.0 | ตามตารางด้านบน |

## เวอร์ชันและการอัปเกรด

| เวอร์ชัน | สิ่งที่เปลี่ยน |
|---|---|
| **0.1.1** | โปรไฟล์ผู้ใช้ + Avatar, People directory, แผนก, Sessions, บังคับเปลี่ยนรหัสผ่าน, Offboarding (ระงับทันที/ล่วงหน้า + โอนห้อง), Reactivate/Anonymize, ค้นหา/Export/Import CSV, แก้ช่องโหว่จาก security review |
| 0.1.0 | ประชุมวิดีโอ, Room Code, Recording, จัดการผู้ใช้เบื้องต้น |

เอกสารของ 0.1.1: [สเปก](docs/releases/v0.1.1.md) · [Security review และสถานะการแก้ไข](docs/releases/v0.1.1-security-review.md)

**อัปเกรดจาก 0.1.0**

```bash
git pull && docker compose up -d --build   # API รัน migration 0002 ให้เองตอนเริ่ม
docker compose up minio-init               # ให้ policy ใหม่ของ MinIO มีผล (api เขียนได้เฉพาะ avatars/*)
```

- Migration เติม `host_id` ของทุกห้องจากผู้สร้างเดิม จึงไม่ต้องย้ายข้อมูลเอง
- บัญชีเดิมไม่มีรหัสพนักงาน ใช้งานต่อได้ตามปกติ Admin เติมภายหลังได้ที่หน้ารายละเอียดผู้ใช้
- ถ้าไม่เหลือ Admin ที่ใช้งานได้ ดูขั้นตอนกู้ระบบใน [docs/SETUP.md](docs/SETUP.md)

## PDPA: การแจ้งเตือน การเก็บข้อมูล และสิทธิ์ของผู้ใช้

- **ประกาศความเป็นส่วนตัว:** ผู้ใช้ต้องอ่านและยอมรับก่อนเข้าใช้งาน (และยอมรับใหม่เมื่อเวอร์ชันเปลี่ยน) เนื้อหาอยู่ที่ `apps/web/src/lib/privacy.ts` และ `apps/api/src/common/privacy.ts` **เป็นร่างที่ต้องให้ฝ่ายกฎหมายตรวจก่อนใช้จริง**
- **การแจ้งเตือนในแอป** (กระดิ่งที่แถบซ้ายล่าง): เข้าสู่ระบบจากเครื่องใหม่, มีคนพยายามล็อกอินด้วยรหัสที่ถูกต้องแต่ถูกปฏิเสธเพราะมีเครื่องอื่นอยู่, เปลี่ยนรหัสผ่าน, Admin ตัด session, เปิดบัญชีคืน และแจ้ง Admin คนอื่นเมื่อมีการ Export, นำเข้า CSV หรือ Anonymize แจ้งเตือนใช้ระบบ polling ทุก 60 วินาที จึงไม่มีการส่งอีเมลหรือ push
- **ดาวน์โหลดข้อมูลของตัวเอง:** หน้า My profile → Download my data ได้ไฟล์ JSON (โปรไฟล์, ห้องที่สร้างและเข้าร่วม, Recording ที่ขอ, การแจ้งเตือน และประวัติกิจกรรมที่เกี่ยวกับตัวเอง) ไม่มี password hash
- **ระยะเวลาเก็บข้อมูล (ทำงานทุกวัน):**
  - `AUDIT_RETENTION_DAYS` (ค่าเริ่มต้น 365) ลบ audit log ที่เก่ากว่า
  - `RECORDING_RETENTION_DAYS` (ค่าเริ่มต้น 180) ลบไฟล์ Recording ที่เก่ากว่า นับจากวันที่สร้าง
  - ตั้งเป็น `0` เพื่อเก็บตลอด การลบทุกครั้งถูกบันทึกใน audit (`retention.audit_purged`, `recording.retention_deleted`)
  - **ค่าเหล่านี้ยังไม่ได้รับการอนุมัติจากองค์กร ต้องกำหนดก่อนใช้งานจริง**

## เทคโนโลยีที่ใช้

Next.js + TypeScript (web) · NestJS (API) · PostgreSQL · Redis · LiveKit (SFU) · LiveKit Egress (recording) · MinIO (เก็บไฟล์) · Caddy (HTTPS) · Docker Compose

เอกสารเชิงลึกอยู่ในโฟลเดอร์ [docs/](docs/README.md) (สถาปัตยกรรม, เครือข่าย WSL2, certificate, LiveKit, ความปลอดภัยของ Room Code, Acceptance Test)

## การติดตั้ง

### สิ่งที่ต้องมี

- Windows 11 + WSL2 (แนะนำ mirrored networking) หรือ Linux
- Docker Engine (ใน WSL2) หรือ Docker Desktop ที่เปิด WSL integration
- Node.js 22+ และ pnpm (ดู `.nvmrc`)
- [mkcert](https://github.com/FiloSottile/mkcert) สำหรับสร้าง certificate
- เครื่องผู้ใช้ต้องอยู่ Wi-Fi/LAN เดียวกัน

### ขั้นตอน

```bash
git clone https://github.com/thronejuice/Enterprise-Team-Collaboration-App.git
cd Enterprise-Team-Collaboration-App

scripts/init-env.sh        # สร้าง .env พร้อม secret สุ่ม และตรวจ LAN IP
scripts/certs.sh           # สร้าง certificate ด้วย mkcert สำหรับ DEMO_HOSTNAME
docker compose up -d --build
```

จากนั้นเปิด `https://comms-demo.home.arpa` (หรือค่า `DEMO_HOSTNAME` ใน `.env`) ต้องให้ hostname นี้ชี้ไปที่ LAN IP ของเครื่อง และเครื่องที่ใช้เปิดต้องเชื่อถือ certificate ของ mkcert

ขั้นตอนติดตั้งแบบละเอียดทีละขั้น: [คู่มือ ส่วนที่ 2](docs/USER-MANUAL.md#2-การติดตั้ง-สำหรับผู้ดูแลระบบไอที)

รายละเอียดการตั้งค่าเครือข่าย, Firewall และ certificate: [docs/SETUP.md](docs/SETUP.md), [docs/02-wsl2-network.md](docs/02-wsl2-network.md), [docs/03-https-certificates.md](docs/03-https-certificates.md)

หลังแก้โค้ด ต้อง rebuild container ที่เกี่ยวข้อง เช่น `docker compose up -d --build api web`

### ทดสอบอัตโนมัติ

```bash
pnpm typecheck
pnpm test          # unit test ฝั่ง API (รวม state machine การระงับ, CSV, สิทธิ์)
pnpm test:e2e      # end-to-end จาก container แยก
```

- E2E ทั้ง 12 ข้อรันผ่าน `tests/e2e/run.sh` ใน container ของ Playwright
- **Scenario 5** (การระงับล่วงหน้า) ต้องเข้าถึงฐานข้อมูล ให้รันด้วย `E2E_NETWORK=enterprise-comms-demo_backend tests/e2e/run.sh` ถ้าไม่ตั้งค่านี้ scenario 5 จะถูกข้าม และ scenario 6 จะล้มตามเพราะพึ่งพากัน
- **Windows:** ก่อนให้เครื่องอื่นใน LAN เข้าใช้ ต้องรัน `scripts/windows/setup-firewall.ps1 -Subnet <subnet ของ LAN>` ใน PowerShell แบบ Administrator (443/tcp, 7881/tcp, 7882/udp)
- **ภาพ/เสียงไม่มาหลังรีสตาร์ต Docker หรือเครื่อง:** รัน `docker compose restart livekit egress` (เส้นทางสื่อ UDP อาจค้าง) และตรวจว่า `caddy` ยังรันอยู่ด้วย `docker compose ps`

## Username / Password สำหรับทดสอบ

### Admin

สร้างครั้งแรกตอน start จากค่าใน `.env` (ไฟล์นี้ไม่อยู่ใน git):

- **Username:** ค่า `ADMIN_EMAIL` (ค่าเริ่มต้นจาก `init-env.sh` คือ `admin@<DEMO_HOSTNAME>`)
- **Password:** ค่า `ADMIN_PASSWORD` ใน `.env`

### Member สำหรับทดสอบ

ระบบไม่ได้สร้าง Member ให้อัตโนมัติ ให้ล็อกอินด้วย Admin แล้วสร้างที่เมนู **Users** (Admin → Users) ตัวอย่างบัญชีทดสอบที่ใช้ระหว่างพัฒนา:

| Username (อีเมล) | Role |
|---|---|
| member1@example.com | MEMBER |
| member2@example.com | MEMBER |

รหัสผ่านของบัญชีเหล่านี้ไม่ได้เก็บไว้ใน repo ให้ Admin ตั้งเองตอนสร้างผู้ใช้ (อย่างน้อย 10 ตัวอักษร) ผู้ใช้ที่สร้างใหม่หรือถูก reset รหัสจะต้องเปลี่ยนรหัสผ่านก่อนใช้งานครั้งแรก

> บัญชีทดสอบใช้เฉพาะ demo ภายในเครื่อง/LAN เท่านั้น อย่านำรหัสผ่านทดสอบไปใช้กับระบบจริง และควรลบหรือเปลี่ยนรหัสผ่านเมื่อทดสอบเสร็จ

## วิธีทดสอบการประชุมด้วยหลายบัญชี

1. Browser A (เช่น Chrome): ล็อกอิน member1 → กดสร้างห้อง จะได้รหัสห้อง 4 หลัก
2. Browser B (เช่น Edge หรือหน้าต่าง Incognito): ล็อกอิน member2 → กรอกรหัส 4 หลักที่หน้า Home เพื่อเข้าห้อง

ต้องใช้ browser หรือ profile คนละตัว เพราะ session เก็บใน cookie การล็อกอินใหม่ใน browser เดียวกันจะทับบัญชีเดิม และ browser ต้องใช้ HTTPS จึงจะเปิดกล้อง/ไมค์ได้

## ข้อควรระวัง

- ห้าม commit `.env` และห้ามเปิด PostgreSQL, Redis, MinIO ให้เข้าถึงจากภายนอกโดยตรง (มีเฉพาะ Caddy 443/tcp และ LiveKit media 7881/tcp, 7882/udp ที่เปิดสู่ LAN)
- ห้ามส่ง LiveKit API secret หรือ MinIO secret ไปฝั่ง frontend
- Room Code ไม่ใช่หลักฐานยืนยันตัวตน ผู้ใช้ต้องล็อกอินเสมอ
- ห้ามถือว่า Recording สำเร็จจนกว่าจะเปิดไฟล์ที่บันทึกแล้วเล่นได้จริง
- ระบบกันไม่ให้ระงับหรือลด role ของ Admin คนสุดท้าย และผู้ใช้ที่ถูกระงับจะถูกตัด session และเตะออกจากห้องทันที
- Anonymize ย้อนกลับไม่ได้ ใช้เมื่อจำเป็นต้องลบข้อมูลส่วนตัว (PDPA) เท่านั้น
- รหัสผ่านชั่วคราวจากการนำเข้า CSV แสดงครั้งเดียวในไฟล์ที่ดาวน์โหลด ให้เก็บอย่างปลอดภัยและลบหลังแจกจ่าย
- ข้อที่ยังเปิดอยู่จาก security review (รหัสผ่าน 12 ตัว, อายุ session สูงสุด, CSP, อัปเกรด dependency) วางแผนไว้ใน 0.1.2

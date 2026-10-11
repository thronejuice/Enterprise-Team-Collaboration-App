# Enterprise Team Collaboration App

ระบบประชุมออนไลน์ (video meeting) สำหรับองค์กร รันบนเครื่องเดียวและให้ผู้ใช้เข้าผ่าน browser ในเครือข่าย Wi-Fi/LAN เดียวกัน สร้างขึ้นเพื่อใช้เป็น **Local LAN Demo** ให้ลูกค้าทดลองใช้งานจริง (สูงสุด 10 คนต่อห้อง)

## โปรเจ็คนี้คืออะไร ใช้ทำอะไร

- **ประชุมวิดีโอ/เสียง/แชร์หน้าจอ** แบบเรียลไทม์ผ่าน browser ไม่ต้องติดตั้งโปรแกรมเพิ่ม
- **เข้าห้องด้วยรหัส 4 หลัก** (Room Code `0000`–`9999`) ผู้ใช้ต้องล็อกอินก่อนจึงจะกรอกรหัสได้
- **บันทึกการประชุม** (Recording) เก็บไฟล์ใน MinIO และเปิดดูย้อนหลังได้ในหน้า Recordings
- **จัดการผู้ใช้** โดย Admin: สร้างผู้ใช้ เปลี่ยน role เปิด/ปิดบัญชี และดู Audit log
- **หน้า Connection test** สำหรับตรวจว่า browser/เครือข่ายของผู้ใช้เชื่อมต่อได้

### สิทธิ์ตาม Role

| Role | สร้างห้อง | เข้าห้อง | ควบคุมห้อง (อัด/ลบคน/ปิดเสียง/จบห้อง) | จัดการผู้ใช้ / Audit log |
|---|---|---|---|---|
| ADMIN | ได้ | ได้ | ได้ทุกห้อง | ได้ |
| HOST | ได้ | ได้ | เฉพาะห้องที่ตัวเองสร้าง | ไม่ได้ |
| MEMBER | ได้ | ได้ | เฉพาะห้องที่ตัวเองสร้าง | ไม่ได้ |

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

รายละเอียดการตั้งค่าเครือข่าย, Firewall และ certificate: [docs/SETUP.md](docs/SETUP.md), [docs/02-wsl2-network.md](docs/02-wsl2-network.md), [docs/03-https-certificates.md](docs/03-https-certificates.md)

หลังแก้โค้ด ต้อง rebuild container ที่เกี่ยวข้อง เช่น `docker compose up -d --build api web`

### ทดสอบอัตโนมัติ

```bash
pnpm typecheck
pnpm test
pnpm test:e2e      # end-to-end จาก container แยก
```

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

รหัสผ่านของบัญชีเหล่านี้ไม่ได้เก็บไว้ใน repo ให้ Admin ตั้งเองตอนสร้างผู้ใช้ (อย่างน้อย 10 ตัวอักษร)

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

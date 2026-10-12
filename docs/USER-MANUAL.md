# คู่มือการใช้งานระบบ Nexus (Enterprise Team Collaboration)

คู่มือเล่มเดียว แบ่งตามบทบาท ตั้งแต่การติดตั้ง การป้อนข้อมูลโดย Admin จนถึงการสร้างห้องประชุมและการใช้งานประจำวัน

> **ภาพประกอบทั้งหมดจับจากระบบทดสอบที่ใช้ข้อมูลสมมติ** (ผู้ใช้ `@acme-demo.example`, แผนก Finance / Human Resources / Information Technology / Sales)
> ไม่มีข้อมูลจริงขององค์กร กล้องในภาพเป็นภาพทดสอบสีเขียวของ Chromium
> ชื่อปุ่มและเมนูคงเป็นภาษาอังกฤษตามที่แสดงบนหน้าจอ

## สารบัญ

| ส่วน | สำหรับใคร |
|---|---|
| [1. ภาพรวมและสิทธิ์ของแต่ละบทบาท](#1-ภาพรวมและสิทธิ์ของแต่ละบทบาท) | ทุกคน |
| [2. การติดตั้ง](#2-การติดตั้ง-สำหรับผู้ดูแลระบบไอที) | ผู้ดูแลระบบไอที |
| [3. คู่มือ Admin](#3-คู่มือ-admin) | Admin |
| [4. คู่มือผู้ใช้ทั่วไป (Host / Member)](#4-คู่มือผู้ใช้ทั่วไป-host--member) | ทุกคน |
| [ภาคผนวก ก. แก้ปัญหา](#ภาคผนวก-ก-แก้ปัญหาที่พบบ่อย) | ทุกคน |
| [ภาคผนวก ข. ตารางสิทธิ์](#ภาคผนวก-ข-ตารางสิทธิ์ตามบทบาท) | Admin |
| [ภาคผนวก ค. ค่าใน .env](#ภาคผนวก-ค-ค่าสำคัญในไฟล์-env) | ผู้ดูแลระบบไอที |
| [ภาคผนวก ง. สำรอง/กู้คืน และอัปเกรด](#ภาคผนวก-ง-สำรองกู้คืนข้อมูลและอัปเกรดเวอร์ชัน) | ผู้ดูแลระบบไอที |

---

## 1. ภาพรวมและสิทธิ์ของแต่ละบทบาท

Nexus เป็นระบบประชุมวิดีโอสำหรับใช้ภายในองค์กร (เครือข่าย LAN) ทำงานบนเครื่องเซิร์ฟเวอร์ของท่านเอง ไม่ส่งข้อมูลออกอินเทอร์เน็ต
ผู้ใช้เข้าด้วยบัญชีที่ Admin สร้างให้เท่านั้น (ไม่มีการสมัครเอง)

มี 3 บทบาท:

| บทบาท | ทำอะไรได้ |
|---|---|
| **Admin** | จัดการบัญชี แผนก ดู Audit log ดูและจัดการห้อง/ไฟล์บันทึก **ทุกห้อง** |
| **Host** | บทบาทของผู้ใช้ที่ Admin มอบหมาย; ในห้องที่ตนสร้างเป็น Host เสมอ (ปิดเสียง/เตะผู้เข้าร่วม บันทึก จบประชุม) |
| **Member** | ผู้ใช้ทั่วไป เข้าห้องด้วย Room Code ได้; สร้างห้องได้เช่นกัน และเป็น Host ของห้องที่ตนสร้าง |

ตารางสิทธิ์ละเอียดอยู่ใน [ภาคผนวก ข](#ภาคผนวก-ข-ตารางสิทธิ์ตามบทบาท)

---

## 2. การติดตั้ง (สำหรับผู้ดูแลระบบไอที)

ระบบเดิมทดสอบบน **Windows 11 + WSL2 + Docker Desktop** และเบราว์เซอร์ **Chromium (Chrome/Edge)** เท่านั้น
เบราว์เซอร์อื่นและอุปกรณ์จริงยังไม่ได้ทดสอบ ให้ตรวจเองก่อนใช้งานจริง

คำสั่ง `bash` รันใน WSL ที่โฟลเดอร์รากของโปรเจกต์ คำสั่ง PowerShell รันบน Windows

### 2.1 เตรียมเครื่อง

1. เปิดใช้ WSL2 และติดตั้ง Ubuntu: PowerShell (Administrator) `wsl --install -d Ubuntu` แล้วรีสตาร์ทเครื่อง
2. ติดตั้ง **Docker Desktop** และเปิด *Settings → Resources → WSL integration* ให้ Ubuntu
3. ตรวจใน WSL:

   ```bash
   docker version && docker compose version
   free -h     # RAM ที่ WSL เห็น
   nproc
   ```

4. แนะนำให้ WSL ได้ RAM อย่างน้อย 10 GB (Egress ใช้ ~1 GB ระหว่างบันทึก) สร้าง/แก้ `%UserProfile%\.wslconfig` บน Windows:

   ```ini
   [wsl2]
   memory=10GB
   ```

   แล้วรัน `wsl --shutdown` และเปิด Docker Desktop ใหม่
5. ระบบใช้ WSL แบบ **NAT** (ไม่ใช่ mirrored) ไม่ต้องแก้ networkingMode
6. จอง IP ของเครื่องเซิร์ฟเวอร์ที่ router (DHCP reservation) เพราะ IP ที่เปลี่ยนทำให้ภาพ/เสียงในห้องประชุมไม่มา

### 2.2 สร้างไฟล์ `.env`

```bash
scripts/init-env.sh [hostname] [lan-ip]
```

- ไม่ใส่ argument: hostname = `comms-demo.home.arpa` และหา LAN IP ของ Windows อัตโนมัติ
- สร้างรหัสลับแบบสุ่มทั้งหมด และบัญชี Admin คนแรก — **ดูอีเมลและรหัสผ่านได้ที่ `ADMIN_EMAIL` / `ADMIN_PASSWORD` ใน `.env`** (คู่มือนี้ไม่แสดงค่าจริง)
- ไฟล์ `.env` ห้ามแจกจ่ายหรือ commit
- ถ้า IP เซิร์ฟเวอร์เปลี่ยน แก้ `LIVEKIT_NODE_IP` ใน `.env` แล้ว `docker compose up -d livekit`

### 2.3 ออกใบรับรอง HTTPS (mkcert)

```bash
scripts/certs.sh
```

- ติดตั้ง mkcert (ตรวจ checksum) แล้วออกใบรับรองให้ `DEMO_HOSTNAME`
- `infra/certs/cert.pem` และ `key.pem` ใช้โดย Caddy — **ห้ามแจกจ่าย**
- `infra/certs/rootCA.crt` เป็น CA สาธารณะ ใช้ติดตั้งบนเครื่องผู้ใช้
- CA private key อยู่ที่ `$(mkcert -CAROOT)` ใน WSL เท่านั้น ห้ามคัดลอกออก

### 2.4 เริ่มระบบ

```bash
docker compose up -d --build
docker compose ps
```

ครั้งแรกใช้เวลา build หลายนาที ลำดับเริ่มทำงานถูกกำหนดไว้แล้ว: ฐานข้อมูล/Redis/MinIO → สร้าง bucket และสิทธิ์ → LiveKit → Egress และ API (migrate ฐานข้อมูลและสร้าง Admin คนแรกอัตโนมัติ) → Web → Caddy

ตรวจสุขภาพ:

```bash
docker compose logs --tail=50 api livekit egress caddy
curl -s --cacert infra/certs/rootCA.crt \
  --resolve "comms-demo.home.arpa:443:$(grep LIVEKIT_NODE_IP .env | cut -d= -f2)" \
  https://comms-demo.home.arpa/api/health
```

### 2.5 Windows Firewall

คัดลอกโฟลเดอร์ `scripts\windows\` ไปไว้บน Windows (หรือเปิดผ่าน `\\wsl.localhost\Ubuntu\...`) แล้วเปิด PowerShell แบบ **Run as Administrator**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-firewall.ps1 -Subnet 192.168.1.0/24     # ใส่ subnet LAN จริงขององค์กร
```

เปิดเฉพาะ `443/tcp`, `7881/tcp`, `7882/udp` จาก subnet ที่ระบุ ลบภายหลังด้วย `.\remove-firewall.ps1`

### 2.6 ตั้งค่าชื่อโดเมนและความเชื่อถือใบรับรองบน **เครื่องผู้ใช้ทุกเครื่อง**

1. **ชื่อโดเมน** — ถ้ามี DNS ภายใน ให้เพิ่ม A record `DEMO_HOSTNAME → IP ของเซิร์ฟเวอร์` (แนะนำ)
   ถ้าไม่มี: PowerShell (Administrator) บนเครื่องนั้น
   `.\add-hosts-entry.ps1 -HostName comms-demo.home.arpa -Address <LAN IP>` (ลบด้วย `remove-hosts-entry.ps1`)
2. **เชื่อถือ CA** — คัดลอก `infra/certs/rootCA.crt` ไปที่เครื่อง แล้ว
   `.\install-root-ca.ps1 -Path .\rootCA.crt` (Mac: Keychain Access → System → ลากไฟล์เข้า → ตั้ง *Always Trust*)
3. ปิด-เปิดเบราว์เซอร์ใหม่ เข้า `https://<DEMO_HOSTNAME>` ต้องไม่มีคำเตือนใบรับรอง

### 2.7 ตรวจสอบหลังติดตั้ง

1. เข้าหน้าเว็บ ล็อกอินด้วย Admin จาก `.env` (ดู [3.1](#31-เข้าสู่ระบบครั้งแรก))
2. เมนู **Connection test** — ทุกข้อต้องผ่าน (HTTPS, WebSocket, WebRTC UDP/TCP, กล้อง/ไมค์) ดู [4.7](#47-connection-test)

![หน้า Login](manual-images/01-login.png)

---

## 3. คู่มือ Admin

### 3.1 เข้าสู่ระบบครั้งแรก

1. เปิด `https://<DEMO_HOSTNAME>` ล็อกอินด้วย `ADMIN_EMAIL` / `ADMIN_PASSWORD` จาก `.env`
2. ระบบบังคับ **เปลี่ยนรหัสผ่าน** (อย่างน้อย 10 ตัวอักษร) และให้ **ยอมรับประกาศความเป็นส่วนตัว (Privacy notice)** ก่อนใช้งาน
3. หลังเข้าครั้งแรก/หลังอัปเดตเวอร์ชัน จะมีหน้าต่าง **What's new** สรุปสิ่งที่เปลี่ยน

![เปลี่ยนรหัสผ่าน](manual-images/16-change-password.png)
![Privacy notice](manual-images/02-privacy-notice.png)
![What's new](manual-images/03-whats-new.png)
![หน้าแรกของ Admin](manual-images/04-home-admin.png)

### 3.2 เพิ่มข้อมูล

#### แผนก (Departments)

เมนู **Departments** — ผู้ใช้เลือกแผนกของตัวเองจากรายการนี้ ดังนั้นควรสร้างแผนกก่อนสร้างผู้ใช้

![ยังไม่มีแผนก](manual-images/05-departments-empty.png)
![เพิ่มแผนก](manual-images/06-department-add.png)
![รายการแผนก](manual-images/07-departments.png)

#### สร้างผู้ใช้ทีละคน

เมนู **Users → Create user** กรอกอีเมล ชื่อ ตำแหน่ง แผนก รหัสพนักงาน (ไม่ซ้ำ เก็บเป็นตัวพิมพ์ใหญ่) และ role
ระบบสร้าง **รหัสผ่านชั่วคราว 14 ตัว** ให้ แสดงครั้งเดียว — ส่งให้ผู้ใช้ผ่านช่องทางที่ปลอดภัย ผู้ใช้ต้องเปลี่ยนรหัสเมื่อเข้าครั้งแรก

![สร้างผู้ใช้](manual-images/08-user-create.png)
![รายการผู้ใช้](manual-images/09-users-list.png)

#### นำเข้าจาก CSV (Import)

1. **Users → Import** เลือกไฟล์ CSV ตามหัวคอลัมน์ที่หน้านั้นระบุ
2. ระบบ **ตรวจก่อน (preview)** และแสดงแถวที่ผิดพร้อมเหตุผล — ถ้ามีข้อผิดพลาดแม้แถวเดียว จะ **ไม่นำเข้าเลย** (all-or-nothing) แก้ไฟล์แล้วอัปโหลดใหม่
3. เมื่อพร้อมกดยืนยัน ระบบสร้างบัญชีทั้งหมดพร้อมรหัสผ่านชั่วคราว ดาวน์โหลดรายการไว้ทันที (แสดงครั้งเดียว)

![เริ่ม import](manual-images/10-import-start.png)
![ผลตรวจพบข้อผิดพลาด](manual-images/11-import-errors.png)
![พร้อมนำเข้า](manual-images/12-import-ready.png)

#### แก้ไขข้อมูล ส่งออก และรีเซ็ตรหัสผ่าน

เปิดชื่อผู้ใช้เพื่อดูหน้ารายละเอียด: แก้ชื่อ ตำแหน่ง แผนก role เบอร์โทร รหัสพนักงาน, **Reset password** (สร้างรหัสชั่วคราวใหม่ และออกจากระบบทุกเครื่องของผู้ใช้นั้น), และปุ่ม export รายการผู้ใช้เป็น CSV จากหน้า Users

![รายละเอียดผู้ใช้](manual-images/13-user-detail.png)

### 3.3 จัดการบัญชี

#### ระงับบัญชี (Suspend)

ที่หน้ารายละเอียดผู้ใช้ เลือก

- **ทันที (now)** — ตัดผู้ใช้ออกจากห้องและระบบทันที
- **ตามกำหนด** — เลือกวันทำงานวันสุดท้าย ระบบระงับเวลา 23:59 (เวลาไทย) ของวันนั้น สถานะระหว่างรอขึ้นว่า *LEAVING*

ขณะระงับต้องเลือกผู้รับช่วงห้อง/ไฟล์ของผู้ใช้ (handover) ถ้าไม่ได้เลือก ระบบใช้ลำดับ: ผู้ที่เลือก → ผู้สร้างรายการ → Admin ที่เก่าที่สุด
ระบบไม่ยอมให้ระงับหรือลดสิทธิ์ **Admin คนสุดท้าย**

![ระงับบัญชี](manual-images/14-suspend.png)
![ผู้ใช้ที่ถูกระงับ](manual-images/40-user-suspended.png)
![ผู้ใช้ที่ถูกระงับพยายามล็อกอิน](manual-images/39-suspended-login.png)

#### เปิดบัญชีคืน และ Anonymize

- **Reactivate** — เปิดใช้บัญชีที่ถูกระงับ
- **Anonymize** — ลบข้อมูลส่วนบุคคลของบัญชีถาวร (ย้อนกลับไม่ได้) ใช้เมื่อต้องลบข้อมูลตามคำร้อง/นโยบาย

#### ปลดล็อกการล็อกอิน และเพิกถอน session

- ผู้ใช้ใส่รหัสผิดครบกำหนดจะถูกล็อกชั่วคราว (1, 2, 5 นาทีตามลำดับ) Admin กด **Unlock sign-in** ที่หน้ารายละเอียดเพื่อปลดทันที
- **Revoke sessions** — ออกจากระบบทุกเครื่องของผู้ใช้นั้น (เช่น เครื่องหาย)

![Unlock sign-in](manual-images/15-unlock-sign-in.png)

### 3.4 ดูแลระบบ

#### Audit log

เมนู **Audit** — บันทึกเหตุการณ์สำคัญ (ล็อกอินสำเร็จ/ล้มเหลว, สร้าง/ระงับบัญชี, ปลดล็อก, ดาวน์โหลดข้อมูล ฯลฯ) พร้อม IP และผู้กระทำ

![Audit log](manual-images/38-audit.png)

#### ไฟล์บันทึกของทุกห้อง

Admin เห็นและดาวน์โหลด/ลบไฟล์บันทึกของ **ทุกห้อง** ที่เมนู **Recordings** ผู้ใช้ทั่วไปเห็นเฉพาะห้องที่เคยเข้าร่วม

![Recordings (Admin)](manual-images/37-recordings-admin.png)

#### การเก็บข้อมูล (PDPA)

- ระบบลบ Audit log และไฟล์บันทึกที่เกินกำหนดอัตโนมัติวันละครั้ง ค่าเริ่มต้น **`AUDIT_RETENTION_DAYS=365`** และ **`RECORDING_RETENTION_DAYS=180`** (`0` = เก็บตลอด) แก้ได้ใน `.env` แล้ว `docker compose up -d api`
- **ตัวเลขนี้เป็นค่าตั้งต้น ต้องให้องค์กรตกลง/ตรวจกับฝ่ายกฎหมายก่อนใช้จริง** เช่นเดียวกับข้อความ Privacy notice
- ผู้ใช้ยอมรับ Privacy notice ก่อนใช้งาน (บันทึกเป็น `privacy.accepted` ใน Audit log) และดาวน์โหลดข้อมูลของตนเองได้ ([4.6](#46-ข้อมูลของฉัน))

#### กู้เมื่อไม่เหลือ Admin

1. ใน `.env` ตั้ง `ADMIN_EMAIL` เป็นอีเมลที่ **ยังไม่มีบัญชี** และตั้ง `ADMIN_PASSWORD` (≥10 ตัว)
2. `docker compose up -d api` (ระบบสร้าง Admin ให้เมื่อไม่มี Admin ที่ใช้งานได้)
3. ล็อกอิน แล้วเปิดคืนหรือแก้ Admin เดิม
4. เปลี่ยน/ถอดค่า `ADMIN_PASSWORD` ออกจาก `.env`

ถ้าอีเมลตรงกับบัญชีที่มีอยู่ ระบบจะหยุดและบอกให้ใช้อีเมลอื่น

---

## 4. คู่มือผู้ใช้ทั่วไป (Host / Member)

### 4.1 ใช้งานครั้งแรก

1. เปิด `https://<DEMO_HOSTNAME>` ล็อกอินด้วยอีเมลและรหัสชั่วคราวที่ Admin ให้
2. เปลี่ยนรหัสผ่านใหม่ (อย่างน้อย 10 ตัว ต้องต่างจากเดิม) และยอมรับ Privacy notice
3. **กฎ 1 เครื่อง**: คอมพิวเตอร์/โน้ตบุ๊กล็อกอินได้ครั้งละ 1 เครื่อง ถ้าเครื่องอื่นยังล็อกอินอยู่ ระบบแจ้ง *"You are already signed in on another computer. Sign out there first"* ให้ออกจากระบบที่เครื่องนั้นก่อน (โทรศัพท์/แท็บเล็ตไม่ถูกจำกัด)
   กฎนี้เป็นนโยบายการใช้งาน ไม่ใช่มาตรการความปลอดภัย

![เครื่องที่สองถูกปฏิเสธ](manual-images/22-device-limit.png)

### 4.2 สร้างห้องและเข้าร่วม

#### สร้างห้อง

หน้า **Home** → **Start a new meeting** ระบบสร้าง **Room Code 4 หลัก** แจกให้ผู้เข้าร่วม และอยู่ในรายการ *My meetings* (กด Rejoin เข้าซ้ำได้โดยไม่ต้องใช้โค้ดอีก)

![Home](manual-images/23-home-create-meeting.png)
![สร้างห้องแล้ว](manual-images/24-room-created.png)

#### เข้าร่วมด้วยโค้ด

Home → กรอกโค้ด 4 หลัก → เข้าหน้า **Pre-join**

![กรอกโค้ด](manual-images/26-enter-code.png)

#### กล้องและไมค์ (Pre-join)

เบราว์เซอร์จะขอสิทธิ์กล้อง/ไมค์ กด Allow เลือกอุปกรณ์ ตรวจภาพและระดับเสียง แล้วกด **Join meeting**

![Pre-join](manual-images/25-prejoin.png)

### 4.3 ในห้องประชุม

![มุมมอง Host](manual-images/27-room-host.png)
![มุมมอง Member](manual-images/28-room-member.png)

- ปุ่มล่าง: ไมค์ กล้อง แชร์หน้าจอ ออกจากห้อง (Host มีปุ่มบันทึกและจบประชุมเพิ่ม)
- **แชร์หน้าจอ (Share screen)** — เลือกหน้าต่าง/จอที่ต้องการแชร์

![แชร์หน้าจอ](manual-images/29-screen-share.png)

- **บันทึก (Record)** — เฉพาะ Host/Admin ทุกคนในห้องเห็นป้าย REC และมีประกาศแจ้งว่ากำลังบันทึก ระบบบันทึกพร้อมกันได้จำกัด (ค่าเริ่มต้น 1 ห้อง)

![กำลังบันทึก](manual-images/30-recording-on.png)
![ประกาศการบันทึก](manual-images/31-recording-notice.png)

- **รายชื่อผู้เข้าร่วม (Host)** — ปิดเสียง (mute) หรือเตะ (remove) ผู้เข้าร่วมได้

![ผู้เข้าร่วม](manual-images/32-participants.png)

- **จบประชุม (End meeting)** — Host กดเพื่อจบสำหรับทุกคน

![จบประชุม](manual-images/33-end-meeting.png)

### 4.4 หลังประชุม

![ประชุมจบแล้ว](manual-images/34-meeting-ended.png)

เมนู **Recordings** — ดู ดาวน์โหลด ไฟล์บันทึกของห้องที่เคยเข้า (Host/Admin ลบได้) ไฟล์ที่เกินระยะเก็บรักษาจะถูกลบอัตโนมัติ

![Recordings](manual-images/35-recordings.png)
![รายละเอียดไฟล์บันทึก](manual-images/36-recording-detail.png)

### 4.5 โปรไฟล์และบัญชีของฉัน

เมนู **My profile** — แก้ชื่อที่แสดง ตำแหน่ง เบอร์โทร แผนก (เลือกจากรายการ) และ **Avatar** (รูป JPG/PNG/WebP ระบบแปลงเป็น 256×256; ถ้าอัปโหลดผิดเกินกำหนดจะถูกล็อกชั่วคราว 10 นาที)

![โปรไฟล์](manual-images/17-profile.png)

ส่วน **Sessions** แสดงอุปกรณ์ที่ล็อกอินอยู่ กด revoke รายเครื่อง หรือ revoke others เพื่อออกจากระบบทุกเครื่องยกเว้นเครื่องนี้

**การแจ้งเตือน** (กระดิ่ง ตรวจทุก 60 วินาที) บอกเช่น ล็อกอินจากเครื่องใหม่, มีผู้ใช้รหัสของท่านแต่ถูกปฏิเสธ, เปลี่ยนรหัสผ่าน — หากไม่ใช่ท่าน ให้เปลี่ยนรหัสผ่านและแจ้ง Admin

![การแจ้งเตือน](manual-images/19-notifications.png)

> หมายเหตุ: เมื่อระบบอยู่หลัง Docker Desktop IP ที่แสดงอาจเป็น IP ของ gateway (เช่น 172.27.0.1) ไม่ใช่ IP จริงของเครื่องผู้ใช้

### 4.6 ข้อมูลของฉัน

ที่หน้า My profile ปุ่ม **Download my data** (ดาวน์โหลดข้อมูลของตนเองตามสิทธิ PDPA)

![Sessions และข้อมูล](manual-images/18-profile-sessions-data.png)

### 4.7 รายชื่อพนักงานและ Connection test

- **People** — ไดเรกทอรีพนักงาน (ชื่อ อีเมล ตำแหน่ง แผนก) ไม่แสดงเบอร์โทร รหัสพนักงาน หรือ role
- **Connection test** — ทดสอบ HTTPS, WebSocket, WebRTC UDP/TCP และ publish กล้อง/ไมค์ ใช้ก่อนประชุมสำคัญหรือเมื่อภาพ/เสียงไม่มา

![People](manual-images/20-people.png)
![Connection test](manual-images/21-connection-test.png)

---

## ภาคผนวก ก. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| เข้าห้องได้แต่ไม่เห็น/ไม่ได้ยินใคร | เปิด **Connection test**; ตรวจ Firewall `7882/udp`, `7881/tcp`; `LIVEKIT_NODE_IP` ใน `.env` ต้องตรง IP ปัจจุบัน; Wi-Fi อาจเปิด AP isolation; หลังรีสตาร์ท Docker ให้ `docker compose restart livekit egress` |
| ไม่มีภาพกล้อง/เสียงไมค์ของตนเอง | อนุญาตสิทธิ์กล้อง/ไมค์ในเบราว์เซอร์ (ไอคอนกุญแจข้าง URL); ปิดโปรแกรมอื่นที่ใช้กล้อง; เลือกอุปกรณ์ที่ Pre-join |
| เบราว์เซอร์เตือนใบรับรอง | ยังไม่ได้ติดตั้ง `rootCA.crt` บนเครื่องนั้น, เปิดด้วย IP แทนชื่อโดเมน, หรือยังไม่ปิด-เปิดเบราว์เซอร์ |
| บัญชีถูกล็อก ("Too many attempts") | รอ 1–5 นาที หรือให้ Admin กด **Unlock sign-in** |
| ล็อกอินไม่ได้ ("Invalid email or password") | ตรวจอีเมล/รหัส; ถ้าลืมให้ Admin Reset password |
| "You are already signed in on another computer" | ออกจากระบบที่เครื่องอื่นก่อน หรือให้ Admin ใช้ Revoke sessions |
| "This account has been suspended" | ติดต่อ Admin |
| Record แล้วขึ้น "Another recording is already in progress" | จำกัดบันทึกพร้อมกัน (`MAX_CONCURRENT_RECORDINGS`) จบอันเดิมก่อน |
| Recording ค้างสถานะ FINALIZING | `docker compose logs egress`; ถ้าไม่มีไฟล์ใน MinIO ภายใน 5 นาที ระบบเปลี่ยนเป็น FAILED |
| หลัง restart Docker คอนเทนเนอร์ `minio-init` / `caddy` ออกด้วย exit 127 | bind mount ค้าง: `docker compose rm -f minio-init` แล้ว `docker compose up -d` |
| ทุกคนโดน "Too many attempts" พร้อมกัน | ตั้ง `RATE_LIMIT_MAX_FAILURES_PER_IP=0` (ค่าเริ่มต้น) — หลัง Docker Desktop ทุกเครื่องมี IP เดียวกัน |

---

## ภาคผนวก ข. ตารางสิทธิ์ตามบทบาท

| การกระทำ | Member | Host | Admin |
|---|:--:|:--:|:--:|
| ล็อกอิน เปลี่ยนรหัส แก้โปรไฟล์ตนเอง | ✔ | ✔ | ✔ |
| สร้างห้อง (เป็น Host ของห้องนั้น) | ✔ | ✔ | ✔ |
| เข้าห้องด้วย Room Code | ✔ | ✔ | ✔ |
| ปิดเสียง/เตะผู้เข้าร่วม, เริ่ม/หยุดบันทึก, จบประชุม — ห้องของตน | ✔ | ✔ | ✔ |
| ปิดเสียง/เตะ/บันทึก/จบประชุม — **ห้องของผู้อื่น** | – | – | ✔ |
| ดูไฟล์บันทึกของห้องที่เคยเข้า | ✔ | ✔ | ✔ |
| ดู/ลบไฟล์บันทึก **ทุกห้อง** | – | – | ✔ |
| ดูไดเรกทอรี (People) | ✔ | ✔ | ✔ |
| สร้าง/นำเข้า/แก้/ระงับ/Anonymize/Reset password/Unlock ผู้ใช้ | – | – | ✔ |
| จัดการแผนก | – | – | ✔ |
| ดู Audit log | – | – | ✔ |

> role Host ที่ Admin กำหนดในบัญชีใช้แยกผู้นำเสนอ ส่วนสิทธิ์ควบคุมห้องผูกกับผู้สร้างห้อง (hostId) ตามโค้ดปัจจุบัน — ตรวจที่ `apps/api/src/meetings` หากนโยบายต้องเข้มกว่านี้

---

## ภาคผนวก ค. ค่าสำคัญในไฟล์ `.env`

แก้แล้วใช้ `docker compose up -d` (บริการที่เกี่ยวข้องจะถูกสร้างใหม่)

| ค่า | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `DEMO_HOSTNAME` | `comms-demo.home.arpa` | ชื่อโดเมนที่ผู้ใช้เข้า (ต้องตรงกับใบรับรอง) |
| `LIVEKIT_NODE_IP` | IP LAN ของเซิร์ฟเวอร์ | ต้องตรงกับ IP ปัจจุบัน ไม่เช่นนั้นไม่มีภาพ/เสียง |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_DISPLAY_NAME` | สุ่ม/ตั้งตอน init | บัญชี Admin คนแรก |
| `SESSION_TTL_HOURS` | 12 | อายุ session |
| `MAX_PARTICIPANTS_PER_ROOM` | 10 | จำนวนคนสูงสุดต่อห้อง |
| `MAX_CONCURRENT_RECORDINGS` | 1 | จำนวนการบันทึกพร้อมกันทั้งระบบ |
| `RECORDING_PRESET`, `RECORDING_LAYOUT` | `H264_720P_30`, `speaker` | คุณภาพและรูปแบบการบันทึก |
| `RATE_LIMIT_WINDOW_MINUTES` | 15 | ช่วงนับการล็อกอินผิด |
| `RATE_LIMIT_MAX_FAILURES_PER_USER` | 5 | ผิดได้กี่ครั้งต่อบัญชีก่อนถูกล็อก |
| `RATE_LIMIT_MAX_FAILURES_PER_IP` | 0 (ปิด) | จำกัดต่อ IP |
| `RATE_LIMIT_LOCKOUT_MINUTES` | `1,2,5` | เวลาล็อกตามลำดับครั้ง |
| `AUDIT_RETENTION_DAYS` | 365 | เก็บ Audit log กี่วัน (0 = เก็บตลอด) |
| `RECORDING_RETENTION_DAYS` | 180 | เก็บไฟล์บันทึกกี่วัน (0 = เก็บตลอด) |
| `LIVEKIT_TOKEN_TTL_SECONDS` | 600 | อายุโทเค็นเข้าห้อง |
| `POSTGRES_*`, `REDIS_PASSWORD`, `MINIO_*`, `S3_BUCKET`, `LIVEKIT_*` | สุ่มตอน init | รหัสลับของบริการภายใน ห้ามแจกจ่าย |

---

## ภาคผนวก ง. สำรอง/กู้คืนข้อมูลและอัปเกรดเวอร์ชัน

ข้อมูลอยู่ 2 ที่: ฐานข้อมูล Postgres (บัญชี ห้อง Audit) และ MinIO (ไฟล์บันทึก, avatar) สำรองทั้งสองอย่างพร้อมกัน เก็บไว้นอกเครื่องเซิร์ฟเวอร์ และจำกัดสิทธิ์ไฟล์สำรอง เพราะมีข้อมูลส่วนบุคคล

### สำรอง

```bash
set -a; . ./.env; set +a
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > backup-$(date +%F).dump

docker run --rm --network enterprise-comms-demo_backend -v "$PWD/backup-minio:/backup" \
  --entrypoint sh pgsty/mc:RELEASE.2026-09-16T00-00-00Z -c \
  "mc alias set src http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD && mc mirror src/$S3_BUCKET /backup"
```

ไฟล์ที่ `mc` เขียนในคอนเทนเนอร์เป็นของ root — ลบด้วยคอนเทนเนอร์เช่นกัน

### กู้คืน

```bash
# สร้างฐานข้อมูลว่างก่อน แล้ว
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d <ชื่อฐานข้อมูลใหม่> --no-owner --role="$POSTGRES_USER" < backup-YYYY-MM-DD.dump
```

ไฟล์ MinIO กู้โดย `mc mirror /backup src/$S3_BUCKET` (สลับทิศทาง) ตั้ง `POSTGRES_DB` ใน `.env` ให้ชี้ฐานข้อมูลที่กู้แล้ว `docker compose up -d --no-deps --force-recreate api`
ขั้นตอนนี้ทดสอบแล้วบนข้อมูลทดสอบ (จำนวนแถวและวัตถุตรงกัน) **ควรซ้อมกู้คืนในสภาพแวดล้อมของท่านก่อนพึ่งพาจริง**

### อัปเกรดเวอร์ชัน

1. สำรองข้อมูลตามด้านบน
2. `git pull && docker compose up -d --build` (API รัน `prisma migrate deploy` ให้เองตอนเริ่ม)
3. `docker compose up minio-init` เพื่ออัปเดตนโยบายสิทธิ์ของ bucket
4. ตรวจ `docker compose ps` และ `/api/health` แล้วล็อกอินทดสอบ ผู้ใช้จะเห็น What's new ครั้งแรก

### หยุดระบบ / ล้างข้อมูล

```bash
docker compose down        # หยุด เก็บข้อมูล
docker compose down -v     # ลบ DB และไฟล์บันทึกถาวร — สำรองก่อน
```

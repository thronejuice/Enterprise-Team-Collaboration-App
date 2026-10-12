# Security Review — ก่อน push/merge

วันที่: 2026-10-12 · ขอบเขต: `apps/api`, `apps/web`, `infra/Caddyfile`, `docker-compose.yml`, `.gitignore`

เรียงจากรุนแรงมากไปน้อย ติ๊ก `[x]` เมื่อแก้เสร็จ

**สถานะ (2026-10-12):** แก้แล้วข้อ 1, 2, 3, 5, 6, 7, 8, 9 · **ข้อ 4 ยังรอการตัดสินใจ** (ทำแล้วเฉพาะการแจ้ง host เมื่อมีคนเข้าด้วยรหัส) · ผลตรวจอยู่ท้ายไฟล์

| # | ระดับ | เรื่อง |
|---|---|---|
| 1 | 🔴 High | Bypass rate limit ของ room code ด้วยการ join ห้องตัวเอง |
| 2 | 🔴 High | คนเดียวล็อก login / join ของทุกคนได้ (IP limit ใช้ IP ร่วมกันทั้ง LAN) |
| 3 | 🟠 Medium | ล็อกบัญชีคนอื่นได้ด้วยรหัสผิด 5 ครั้ง (ไม่ต้อง login) |
| 4 | 🟠 Medium | Room code 4 หลัก + ไม่มี host approval = เดาเข้าห้องคนอื่นได้ |
| 5 | 🟠 Medium | ไม่มี Content-Security-Policy |
| 6 | 🟡 Low | ผู้เข้าประชุมปลอมข้อความ "host muted your mic" ได้ |
| 7 | 🟡 Low | DEVICE_LIMIT เปิดเผย IP/อุปกรณ์ของเจ้าของบัญชี และ bypass ได้ด้วย User-Agent มือถือ |
| 8 | 🟡 Low | หน้า `/admin/audit` ยังแสดงให้ MEMBER เห็น (API กันไว้แล้ว) |
| 9 | ⚪ Info | Admin ที่ถูกลดสิทธิ์ยังอยู่ในห้องประชุมที่เข้าด้วยสิทธิ์ admin ต่อได้ |

---

## 1. 🔴 Bypass rate limit ของ room code

- [x] แก้แล้ว

**ไฟล์:** [meetings.service.ts:107](../apps/api/src/meetings/meetings.service.ts#L107)

`joinByCode` เรียก `recordSuccess([limits[0]])` เมื่อ join สำเร็จ ซึ่งลบทั้ง fail counter **และ** escalation level (`rl:level:*`) ของ user

**วิธีโจมตี** (ผู้ใช้ทุก role ทำได้):
1. สร้างห้องของตัวเอง เพื่อให้รู้ code ที่ถูกต้อง 1 อัน
2. เดา code ผิด 4 ครั้ง
3. join ห้องตัวเองด้วย code ที่ถูก ทำให้ counter และ level ถูกล้าง
4. วนกลับไปข้อ 2

ผลคือ per-user limit ไม่มีผลเลย เหลือแค่ per-IP limit กันไว้ (ดูข้อ 2 ว่าทำไม IP limit ก็พึ่งไม่ได้)

**แก้:** ไม่ต้องล้างอะไรเมื่อ join สำเร็จ เพราะ fail counter หมดอายุเองตาม window อยู่แล้ว
```ts
// meetings.service.ts — ลบบรรทัดนี้
await this.rateLimit.recordSuccess([limits[0]]);
```
เพิ่ม test ใน `meetings` ที่ทดสอบลำดับ "ผิด 4 → ถูก 1 → ผิด 1" แล้วต้องโดน lock

---

## 2. 🔴 คนเดียวล็อก login / join ของทุกคนได้

- [x] แก้แล้ว

**ไฟล์:** [auth.controller.ts:90](../apps/api/src/auth/auth.controller.ts#L90), [meetings.service.ts:63](../apps/api/src/meetings/meetings.service.ts#L63), `.env.example` (`RATE_LIMIT_MAX_FAILURES_PER_IP`)

`.env.example` เขียนไว้เองว่าบน Docker Desktop/WSL2 ทุก client บน LAN เข้ามาจาก gateway IP เดียวกัน ดังนั้น `login-ip` และ `code-ip` จึงเป็น **bucket เดียวของทั้งบริษัท**

**วิธีโจมตี:** ใครก็ได้บน LAN **โดยไม่ต้อง login** ยิง `POST /api/auth/login` ด้วยรหัสผิด 20 ครั้ง ทำให้ **ไม่มีใคร login ได้ 15 นาที** และทำซ้ำได้เรื่อยๆ ส่วน `code-ip` ก็โดนแบบเดียวกัน โดยผู้ที่ login แล้ว 1 คนทำให้ทุกคน join ห้องด้วย code ไม่ได้

**แก้ (เลือก 1 ทาง):**
- (ง่ายสุด) ตั้ง `RATE_LIMIT_MAX_FAILURES_PER_IP=0` บน deployment ที่ IP ไม่ใช่ของ client จริง แล้วพึ่ง per-user limit (หลังแก้ข้อ 1)
- (ถูกต้องกว่า) ให้ Caddy เห็น client IP จริง เช่น รันบน Linux host หรือใช้ Docker `network_mode: host` / mirrored networking ของ WSL แล้วค่อยเปิด IP limit

---

## 3. 🟠 ล็อกบัญชีคนอื่นได้โดยไม่ต้อง login

- [x] แก้แล้ว

**ไฟล์:** [auth.controller.ts:90](../apps/api/src/auth/auth.controller.ts#L90), [rate-limit.service.ts](../apps/api/src/auth/rate-limit.service.ts)

`login-email` ล็อกหลังรหัสผิด 5 ครั้ง (1 → 5 → 15 นาที แล้ว 15 นาทีซ้ำไปเรื่อยๆ) ผู้ไม่หวังดีที่รู้ email (ซึ่งเปิดดูได้ใน People directory) จึงล็อก admin หรือคนสำคัญได้ตลอดเวลา

**แก้ (ขั้นต่ำ):** จำกัดเพดาน lockout ไว้สั้นๆ (เช่น `RATE_LIMIT_LOCKOUT_MINUTES=1,2,5`) และ/หรือให้ admin ปลดล็อกได้จากหน้า user (ลบ `rl:lock:login-email:<email>`) ส่วนทางที่ยาวกว่าคือให้ lockout ผูกกับคู่ email+IP เมื่อแก้ข้อ 2 ให้ได้ IP จริงแล้ว

---

## 4. 🟠 Room code 4 หลักเดาได้

- [ ] ตัดสินใจแล้ว (แก้ หรือรับความเสี่ยงและบันทึกใน `docs/DECISIONS.md`)

**ไฟล์:** [room-code.ts](../apps/api/src/meetings/room-code.ts)

มีแค่ 10,000 ค่า ถ้ามีห้อง active 10 ห้อง การเดา 1 ครั้งมีโอกาสถูก 1/1000 แม้แก้ข้อ 1 แล้ว (≈20 ครั้ง/ชม./บัญชี) คนใน 1 คนที่มีหลายบัญชีก็ยังเดาเข้าได้ภายในไม่กี่วัน และเมื่อเดาถูก ระบบจะให้เข้าห้องทันทีโดยไม่ต้องรอ host อนุมัติ ทั้งที่ `docs/06-room-code-security.md` §3 แนะนำ "Require a host approval … if meetings are private"

**แก้ (เลือก):** เพิ่มความยาว code เป็น 6–8 หลัก หรือเพิ่ม lobby ให้ host กด admit ก่อนออก token หรือ (อย่างน้อย) แจ้งเตือน host เมื่อมีคนเข้าห้องด้วย code

---

## 5. 🟠 ไม่มี Content-Security-Policy

- [x] แก้แล้ว

**ไฟล์:** [infra/Caddyfile](../infra/Caddyfile)

มี HSTS, nosniff และ X-Frame-Options แล้ว แต่ไม่มี CSP ตอนนี้ยังไม่พบ XSS (React escape ให้อยู่แล้ว และไม่มี `dangerouslySetInnerHTML`) แต่ CSP เป็นชั้นป้องกันสำรองหากวันหน้ามี XSS

**แก้:** เพิ่มใน `header { ... }` (ต้องทดสอบห้องประชุมหลังเพิ่ม เพราะ LiveKit ใช้ `wss:` และ `blob:`)
```
Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://{$DEMO_HOSTNAME}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
```
(Next.js ต้องใช้ `'unsafe-inline'` สำหรับ script ถ้าไม่ทำ nonce จึงยังคุ้มที่จะใส่ เพราะ `connect-src` และ `frame-ancestors` จำกัดผลกระทบได้)

---

## 6. 🟡 ปลอมข้อความ moderation ได้

- [x] แก้แล้ว

**ไฟล์:** [livekit.service.ts:64](../apps/api/src/livekit/livekit.service.ts#L64) (`canPublishData: true`), [room.tsx:109](../apps/web/src/components/meeting/room.tsx#L109)

ผู้เข้าประชุมทุกคนส่ง data บน topic `moderation` ได้ และ client ไม่เช็กว่าผู้ส่งเป็น server จึงปลอม toast "`<ชื่อใดก็ได้>` muted your microphone." ได้ (ใช้ทำ social engineering)

**แก้:** ข้อความจาก server (`RoomService.sendData`) จะไม่มี `from` ให้ทิ้งข้อความที่มีผู้ส่ง
```tsx
useDataChannel('moderation', (msg) => {
  if (msg.from) return; // only the server (no sender) may send moderation messages
  ...
```

---

## 7. 🟡 DEVICE_LIMIT เปิดเผยข้อมูล / bypass ได้

- [x] แก้แล้ว

**ไฟล์:** [auth.controller.ts:130-145](../apps/api/src/auth/auth.controller.ts#L130-L145)

- คนที่ได้รหัสผ่านไป (ซึ่งคือผู้โจมตี) จะได้ error 409 ที่บอก **IP และอุปกรณ์** ของเจ้าของบัญชีตัวจริง
- กฎ "1 คอมพิวเตอร์" ข้ามได้ด้วยการตั้ง User-Agent เป็นมือถือ

**แก้:** ตัด IP ออกจากข้อความ (`You are already signed in on another computer.`) ส่วนการ bypass ด้วย UA เป็นข้อจำกัดของการตรวจจากฝั่ง server ให้บันทึกใน `DECISIONS.md` ว่ากฎนี้เป็นแค่นโยบาย ไม่ใช่ security control

---

## 8. 🟡 `/admin/audit` ยังแสดงให้ non-admin

- [x] แก้แล้ว

**ไฟล์:** [admin/audit/page.tsx](../apps/web/src/app/(app)/admin/audit/page.tsx)

หน้า users, users/[id], import และ departments redirect non-admin ไป `/` แล้ว แต่หน้า audit ยังแสดงโครงหน้าพร้อม error 403 (ข้อมูลไม่รั่ว เพราะ API มี `@Roles('ADMIN')`)

**แก้:** ใช้ pattern เดียวกับ [admin/users/page.tsx](../apps/web/src/app/(app)/admin/users/page.tsx) (`isAdmin` → `router.replace('/')` → `return null`)

---

## 9. ⚪ Admin ที่ถูกลดสิทธิ์ยังอยู่ในห้องต่อได้

- [x] รับทราบ และแก้แล้ว (เตะ admin ที่ถูกลดสิทธิ์ออกจากห้องที่เข้าด้วยสิทธิ์ admin)

Admin เข้าห้องใดก็ได้โดยไม่ต้องใช้ code ([access.ts](../apps/api/src/meetings/access.ts)) ถ้าถูกลด role ระหว่างอยู่ในห้อง การเชื่อมต่อ LiveKit จะยังอยู่จนกว่าจะออกเอง (webhook ตรวจเฉพาะตอน join ส่วน suspend เตะออกจากห้องให้แล้ว) ถ้าต้องการ ให้เรียก `livekit.removeParticipant` ในห้องที่ user ไม่มีแถว participant เมื่อ `PATCH /admin/users/:id` เปลี่ยน role จาก ADMIN

---

## ✅ สิ่งที่ตรวจแล้วไม่พบปัญหา

- **AuthGuard เป็น global** (`APP_GUARD`) โดยมีแค่ `/auth/login`, `/health` และ `/livekit/webhook` ที่เป็น `@Public` ส่วน webhook ตรวจลายเซ็นและถูก Caddy บล็อกจากภายนอก
- **Admin API** (`users`, `departments`, `audit`) มี `@Roles('ADMIN')` ระดับ controller และ role อ่านจาก DB ทุก request (ลดสิทธิ์แล้วมีผลทันที)
- **Session:** token สุ่ม 32 bytes, เก็บแบบ hash ใน Redis, cookie `httpOnly` + `secure` + `SameSite=Lax`, มีการเช็ก Origin สำหรับ request ที่เปลี่ยนข้อมูล, และเปลี่ยนรหัส / reset / suspend แล้ว revoke session
- **Password:** argon2id, ใช้ dummy verify เพื่อให้เวลา login เท่ากัน, rate limit การเปลี่ยนรหัส
- **IDOR:** meetings, recordings, notifications และ sessions เช็กสิทธิ์ทุก endpoint ตามที่อ่าน (`canAccessMeeting` / `canViewRecordings` / `canManageMeeting`)
- **Upload:** avatar ตรวจ magic bytes, จำกัดจำนวน pixel, re-encode เป็น webp และ rate limit ส่วน CSV import มีจำกัดขนาด และ importId ผูกกับ admin ที่สร้าง
- **CSV export:** กัน formula injection (`= + - @`)
- **Infra:** มีแค่ 443, 7881 และ 7882 ที่เปิดสู่ LAN ส่วน MinIO console bind ไว้ที่ `127.0.0.1`
- **Secrets:** `.env`, `.env.*` และ `infra/certs/*` อยู่ใน `.gitignore` และไม่พบ secret ในไฟล์ที่จะ commit

## สิ่งที่ไม่ได้ตรวจ

- `pnpm audit` (dependency CVEs) ควรรันก่อน merge
- Egress/LiveKit config ใน `docker-compose.yml` (webhook key, TURN) และ `scripts/windows`
- Penetration test จริงบน `comms-demo.home.arpa`

---

## สถานะการแก้ไข

| # | สิ่งที่ทำ | วิธียืนยัน |
|---|---|---|
| 1 | ลบ `recordSuccess` ใน `joinByCode` | test: ผิด 4 → ถูก 1 → ผิด 1 ต้องถูกล็อก (ล้มเมื่อใส่บรรทัดเดิมกลับ) |
| 2 | ปิด limit ต่อ IP เป็นค่าเริ่มต้น (`RATE_LIMIT_MAX_FAILURES_PER_IP=0`) ทั้ง compose, `.env.example` และ `.env` ที่ใช้งาน และบันทึกใน `DECISIONS.md` | ยิงรหัสผิด 30 ครั้งจาก client เดียว: ล็อกเฉพาะอีเมลนั้น Admin ยังล็อกอินได้ |
| 3 | lockout เป็น 1, 2, 5 นาที และ Admin ปลดล็อกได้ (`POST /admin/users/:id/unlock-login`, ปุ่มในหน้ารายละเอียดผู้ใช้ แสดงเมื่อถูกล็อกอยู่) | ล็อกบัญชีเหยื่อจริง แล้ว Admin ปลดล็อก เหยื่อล็อกอินได้ทันที |
| 5 | เพิ่ม CSP ใน Caddyfile (เติม `worker-src blob:`, `font-src`, `object-src 'none'` จากที่รีวิวเสนอ) | E2E ห้องประชุมจริง (วิดีโอ แชร์หน้าจอ อัด) ผ่านภายใต้ CSP |
| 6 | ทิ้ง moderation message ที่มีผู้ส่ง | E2E: ข้อความ "muted your microphone" จาก server ยังมาถึง |
| 7 | ข้อความไม่มี IP/อุปกรณ์แล้ว (แจ้งเจ้าของบัญชีในแอปแทน) | unit test |
| 8 | หน้า audit redirect non-admin ไป `/` | typecheck/E2E |
| 9 | เมื่อลด role ของ admin ระบบเรียก `removeParticipant` ในห้องที่ไม่ได้เป็น host/participant | unit test |

**ข้อ 4 ที่ทำแล้ว:** host ได้รับแจ้งเตือนในแอปเมื่อมีคนเข้าห้องด้วยรหัสครั้งแรก **ที่ยังไม่ได้ทำ** (รอตัดสินใจ): เพิ่มความยาวรหัสเป็น 6–8 หลัก หรือเพิ่ม lobby ให้ host อนุมัติ

**`pnpm audit`:** ก่อนแก้พบ 3 รายการ แก้ `deepmerge-ts` (high, production ผ่าน Prisma CLI) ด้วย `overrides` เป็น 8.0.0 ใน `pnpm-workspace.yaml` ตรวจแล้วว่า `prisma validate/generate/migrate` และการสตาร์ต container API ยังทำงานปกติ ผล `pnpm audit --prod`: ไม่พบช่องโหว่ ส่วน `braces` (high) และ `sprintf-js` (moderate) อยู่ใน jest เท่านั้น (dev) และยังไม่มีเวอร์ชันที่แก้ จึงรับความเสี่ยงไว้ เพราะไม่ถูกรวมใน image ที่รันจริง

**ที่ยังไม่ได้ตรวจ:** CSP ตรวจผ่านเส้นทางที่ E2E ใช้เท่านั้น (ยังไม่ได้ดู console ของทุกหน้า) · ไม่ได้ทดสอบข้อ 6 ด้วยข้อความปลอมจริง

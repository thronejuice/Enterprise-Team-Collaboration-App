# Enterprise Communication Web Application — Local LAN Demo

## Objective

ให้ลูกค้า 10 คนทดลองระบบประชุมผ่าน browser บน Wi-Fi/LAN เดียวกับเครื่องพัฒนา

## Scope

- Next.js + TypeScript
- NestJS API
- PostgreSQL
- Redis
- LiveKit SFU สำหรับ audio/video/screen sharing
- LiveKit Egress สำหรับ composite recording
- MinIO สำหรับจัดเก็บไฟล์และไฟล์บันทึก
- HTTPS ที่ browser ของลูกค้าเชื่อถือได้
- Room Code 4 หลัก ตั้งแต่ 0000–9999

## Prerequisites

- Windows 11 แนะนำ build ที่รองรับ WSL2 mirrored networking
- WSL2 และ Linux distribution
- Docker Engine ภายใน WSL2 หรือ Docker Desktop ที่เปิด WSL integration
- Node.js ตามเวอร์ชันที่โปรเจกต์กำหนด
- เครื่องลูกค้าเชื่อม Wi-Fi/LAN เดียวกัน
- สิทธิ์ Admin สำหรับตั้งค่า Firewall/Certificate บนเครื่องที่เกี่ยวข้อง

## Quick start

ขั้นตอนจริงของเครื่องนี้อยู่ใน [SETUP.md](SETUP.md) และข้อตกลงด้าน scope/สถาปัตยกรรมอยู่ใน [DECISIONS.md](DECISIONS.md)

    scripts/init-env.sh        # .env + secrets + LAN IP
    scripts/certs.sh           # mkcert certificate for DEMO_HOSTNAME
    docker compose up -d --build
    tests/e2e/run.sh           # optional: end-to-end test from a separate container

## Recommended execution order

1. ตรวจสอบ OS, WSL2, CPU, RAM และ Docker
2. กำหนด DNS/hostname สำหรับ Demo
3. ตั้งค่า WSL2 network และ Windows Firewall
4. สร้าง Certificate ที่มี SAN ตรงกับ hostname
5. เริ่ม PostgreSQL, Redis และ MinIO
6. เริ่ม LiveKit และตรวจสอบ WebRTC
7. เริ่ม NestJS และ Next.js
8. เริ่ม Egress และทดสอบ Recording
9. ทดสอบจากเครื่องลูกค้าจริง 2, 5 และ 10 คน
10. เก็บผล Acceptance Test

## Important

- ห้ามใช้ IP ตัวอย่างจากเอกสารเป็น IP จริง
- ห้ามเปิด PostgreSQL, Redis, MinIO API หรือ MinIO Console ให้ลูกค้าเข้าถึงโดยตรง
- ห้ามส่ง LiveKit API secret หรือ MinIO secret ไป frontend
- ห้ามใช้ Room Code เป็นหลักฐานยืนยันตัวตนเพียงอย่างเดียว
- ห้ามถือว่า Recording สำเร็จจนกว่าจะตรวจสอบไฟล์ที่บันทึกและเปิดเล่นได้จริง
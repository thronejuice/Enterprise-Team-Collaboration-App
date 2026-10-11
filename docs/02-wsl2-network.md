# WSL2 and LAN Network Configuration

## 1. Inspect Windows and WSL

Run in PowerShell:

    winver
    wsl --version
    wsl --status
    wsl -l -v
    Get-NetConnectionProfile
    Get-NetIPConfiguration

ตรวจสอบว่าเครื่องลูกค้าและเครื่องพัฒนาอยู่ใน LAN เดียวกันจริง
และ Wi-Fi router ไม่ได้เปิด Guest Network / AP Isolation

## 2. Recommended WSL2 mode

สำหรับ Windows 11 รุ่นที่รองรับ ให้พิจารณา mirrored networking
เพราะรองรับการเชื่อมต่อจาก LAN ไปยัง WSL โดยตรง

สำรองไฟล์ก่อนแก้ไข:

    Copy-Item "$HOME\.wslconfig" "$HOME\.wslconfig.backup" -ErrorAction SilentlyContinue

เปิดไฟล์:

    notepad "$HOME\.wslconfig"

ตัวอย่าง configuration:

    [wsl2]
    networkingMode=mirrored
    firewall=true
    dnsTunneling=true

หลังบันทึก ให้ปิด WSL:

    wsl --shutdown

จากนั้นเปิด Linux distribution ใหม่

หมายเหตุ:
- mirrored networking ต้องใช้ Windows/WSL รุ่นที่รองรับ
- หากใช้ Windows รุ่นเก่า ให้ตรวจสอบ NAT port forwarding แยกต่างหาก
- อย่าตั้ง DefaultInboundAction เป็น Allow แบบครอบคลุมโดยไม่จำเป็น
- Docker Desktop และ Docker Engine ภายใน WSL อาจมีรายละเอียด networking ต่างกัน

## 3. Identify the LAN IP

Run in PowerShell:

    Get-NetIPConfiguration |
      Where-Object { $_.IPv4DefaultGateway -ne $null } |
      Select-Object InterfaceAlias,
        @{Name="IPv4";Expression={$_.IPv4Address.IPAddress}},
        @{Name="Gateway";Expression={$_.IPv4DefaultGateway.NextHop}}

เลือก IPv4 ของ adapter ที่เชื่อมต่อกับ LAN จริง
อย่าใช้ IP ของ VPN, virtual adapter หรือ adapter ที่ไม่ได้ใช้งาน

Run inside WSL:

    ip -br addr
    ip route
    hostname -I

ใน mirrored mode Windows และ WSL ใช้เครือข่ายที่ mirror กัน
จึงไม่ควรสมมติว่า WSL มี IP แยกเสมอไป

## 4. Network ports

| Port | Protocol | Purpose | LAN access |
|---|---|---|---|
| 443 | TCP | HTTPS frontend/API | Required |
| 7880 | TCP | LiveKit HTTP/WebSocket signaling | Required if exposed directly |
| 7881 | TCP | LiveKit WebRTC TCP fallback | Required |
| 7882 | UDP | LiveKit WebRTC UDP mux | Required |
| 50000-60000 | UDP | Alternative LiveKit UDP range if configured | Only if configured |
| 5432 | TCP | PostgreSQL | Internal only |
| 6379 | TCP | Redis | Internal only |
| 9000 | TCP | MinIO S3 API | Internal only |
| 9001 | TCP | MinIO Console | Internal/admin only |

Port 80 may be used temporarily for local certificate validation or redirect,
but it is not required if the demo uses HTTPS directly and no HTTP redirect.

## 5. Windows Firewall

เปิด PowerShell as Administrator.

Inspect current rules:

    Get-NetFirewallProfile |
      Format-Table Name, Enabled, DefaultInboundAction

    Get-NetFirewallRule -DisplayName "*Demo*" -ErrorAction SilentlyContinue

Create a narrowly scoped HTTPS rule.
Replace the subnet placeholder with the actual trusted LAN subnet:

    New-NetFirewallRule `
      -DisplayName "Enterprise Demo HTTPS" `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort 443 `
      -RemoteAddress "<TRUSTED_LAN_SUBNET>"

Create LiveKit UDP rule:

    New-NetFirewallRule `
      -DisplayName "Enterprise Demo LiveKit UDP" `
      -Direction Inbound `
      -Action Allow `
      -Protocol UDP `
      -LocalPort 7882 `
      -RemoteAddress "<TRUSTED_LAN_SUBNET>"

Create LiveKit TCP fallback rule:

    New-NetFirewallRule `
      -DisplayName "Enterprise Demo LiveKit TCP" `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort 7881 `
      -RemoteAddress "<TRUSTED_LAN_SUBNET>"

If signaling port 7880 is exposed directly rather than routed through HTTPS,
create a corresponding TCP rule limited to the trusted LAN subnet.

Replace <TRUSTED_LAN_SUBNET> before running these commands.
Do not paste the placeholder literally.

For mirrored WSL networking, also inspect Hyper-V firewall behavior.
Prefer a narrowly scoped inbound rule for the required ports instead of
allowing all inbound traffic to the WSL VM.

## 6. Validate ports

On the host, inspect listeners:

    Get-NetTCPConnection -State Listen |
      Sort-Object LocalPort |
      Format-Table LocalAddress, LocalPort, OwningProcess

For UDP, use:

    Get-NetUDPEndpoint |
      Sort-Object LocalPort |
      Format-Table LocalAddress, LocalPort, OwningProcess

From a second Windows machine:

    Test-NetConnection <DEMO_HOSTNAME> -Port 443
    Test-NetConnection <DEMO_HOSTNAME> -Port 7881

Test-NetConnection does not validate UDP connectivity.
Validate UDP using the LiveKit connection diagnostics and an actual call.

## 7. Cleanup firewall rules

Run as Administrator:

    Remove-NetFirewallRule -DisplayName "Enterprise Demo HTTPS"
    Remove-NetFirewallRule -DisplayName "Enterprise Demo LiveKit UDP"
    Remove-NetFirewallRule -DisplayName "Enterprise Demo LiveKit TCP"

Only remove rules created for this demo.
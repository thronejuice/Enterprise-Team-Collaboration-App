# HTTPS for Trusted LAN Clients

## Goal

ผู้ใช้เปิด URL ผ่าน HTTPS ได้โดยไม่มี certificate warning
และ browser อนุญาต camera, microphone และ screen sharing

## Recommended approach

Use an internal DNS hostname and an internal Certificate Authority (CA).

Example hostname:
    comms-demo.<YOUR_INTERNAL_DNS_SUFFIX>

Do not use an invented IP or copy an example IP into the certificate.
The certificate Subject Alternative Name (SAN) must match the URL
that the client opens.

## Option A: Existing company CA

Recommended if the organization has IT-managed PKI.

1. Request a server certificate for the chosen demo hostname.
2. Ensure the certificate includes that hostname in SAN.
3. Install the certificate and private key on the reverse proxy.
4. Install the CA chain on client devices using the organization's process.
5. Verify the certificate chain and hostname in each browser.

## Option B: Local development CA with mkcert

Useful for a controlled demo when no company CA is available.

1. Install mkcert from its official source on the development computer.
2. Run the local CA installation command.
3. Generate a certificate for the chosen DNS hostname.
4. Configure the reverse proxy to use the generated certificate/key.
5. Export the mkcert root CA certificate and install it as trusted
   on each customer device, using an approved process.
6. Restart the browser and test the URL.

Important:
- Do not copy the CA private key to customer devices.
- Do not distribute the server private key.
- Trusting the CA on the developer's PC does not automatically trust it
  on other customer devices.
- Do not bypass certificate warnings during acceptance testing.

## DNS / name resolution

Choose one method:

- Internal DNS record managed by the router or organization; preferred.
- Add a hosts-file entry on every test client, if internal DNS is unavailable.

The DNS/hosts entry must resolve the selected hostname to the actual LAN
address of the demo host. Discover that address from the host; do not guess it.

## Reverse proxy

The reverse proxy should:
- Listen on HTTPS port 443.
- Use a trusted certificate whose SAN matches the demo hostname.
- Route application requests to Next.js.
- Route API requests to NestJS.
- Route LiveKit signaling/WebSocket requests correctly if using one hostname.
- Forward WebSocket upgrade headers.
- Never expose PostgreSQL, Redis or MinIO to the browser.

## Validation

On every client device:
1. Open the exact HTTPS hostname.
2. Inspect the certificate in the browser.
3. Confirm there is no trust or hostname warning.
4. Confirm camera and microphone permission prompts work.
5. Confirm screen sharing is available.

Do not accept a test that works only after clicking through a browser warning.
# Cybersecurity Essentials: Fortifying the Digital Fortress

## 1. OWASP Top 10 Mitigation
- **Injection (SQLi)**: NEVER concat strings. Use Parameterized Queries (Prisma/TypeORM do this by default).
- **Broken Auth**: enforce MFA, rotate session IDs, max login attempts (Rate Limiting).
- **XSS (Cross-Site Scripting)**: React avoids XSS by default (escaping). Be careful with `dangerouslySetInnerHTML`. Sanitize inputs with `dompurify`.

## 2. Authentication & Authorization
- **JWT (JSON Web Tokens)**:
    - **Header**: Algo (RS256 recommended over HS256 for asymmetric signing).
    - **Storage**: HttpOnly Cookies (prevent XSS theft) >>> localStorage.
    - **Rotation**: Short-lived Access Token (15m) + Long-lived Refresh Token (7d).
- **OAuth2**: Use libraries like `NextAuth.js` or `Passport`. Don't roll your own crypto.

## 3. Infrastructure Security
- **VPC (Virtual Private Cloud)**: Isolate DBs in private subnets. Only Load Balancer in public.
- **Security Groups**: Whitelist IPs. DB port (5432) should accept traffic ONLY from App Security Group.
- **DDOS**: Use Cloudflare proxy. Rate limit at the Edge (Nginx/Vercel Middleware).

## 4. Penetration Testing Basics
- **Recon**: `nmap` to scan open ports.
- **Fuzzing**: Send garbage data to API endpoints to trigger unhandled exceptions.
- **Tools**: Burp Suite (Traffic interception), OWASP ZAP (Scanner).

    # Glossary

| Term | Meaning |
|---|---|
| GMS | Gemstone Management System |
| Gateway | Public backend entry point; routes frontend tRPC calls and CRM REST requests to domain services |
| Auth service | Owns Better Auth sessions, credentials, password workflows, and the `auth` PostgreSQL schema |
| tRPC | Typed API boundary used by frontend application data |
| Better Auth | Authentication library for email/password sign-in and session cookies |
| CRM API key | Server-to-server secret used by CRM to provision a GMS user; never sent to browser code |
| Mailpit | Local SMTP catcher and inbox UI used to inspect development email without sending real mail |
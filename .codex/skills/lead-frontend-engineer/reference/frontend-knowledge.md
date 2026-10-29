# ความรู้โดเมน: React/Next.js Frontend ของ Gem Machine CRM

ฐานความรู้ตั้งต้นของ `lead-frontend-engineer` ซึ่ง**เขียนโค้ดจริง** ฉะนั้นความถูกต้องกับสภาพจริง
ของ repo สำคัญกว่าปกติ —
ทุกอย่างในไฟล์นี้ตรวจสอบกับโค้ดจริงแล้ว ณ วันที่เขียน (2026-08-04) เช็คซ้ำเสมอเพราะโค้ดเปลี่ยนได้
เร็วกว่าเอกสาร

## Production resource budget

Production runs on **8 GB RAM and 4 vCPUs**. Docker Compose currently caps all services at
3 vCPUs and about 5.3 GB combined, leaving host headroom for the OS and Docker. Treat these as
shared ceilings, not per-request performance guarantees.

- Keep the frontend container within its Compose limit; check production build and runtime memory
  before adding memory-heavy SSR, large in-process caches, or image/data transformations.
- Prefer server pagination and bounded responses; virtualize genuinely large interactive lists.
  Avoid loading whole datasets or duplicating server data in client state.
- Keep client bundles and hydration work small; prefer Server Components where interaction is
  unnecessary and avoid adding libraries for isolated UI needs.
- Do not add unbounded parallel requests, timers, or background work in the web process. For
  CPU/memory-heavy work, document expected load and propose a bounded backend job or service.
- Any change to Compose limits, replica count, or runtime mode must recalculate the **combined**
  host budget and leave explicit capacity for PostgreSQL, OS, and Docker. Report measurements;
  do not claim an unmeasured feature fits the production budget.

## 1. Tech stack จริงในโปรเจกต์นี้ (ตรวจสอบกับโค้ดแล้ว ไม่ใช่เดา)

- **Package manager: pnpm** (`pnpm@11.6.0`, workspace รวม `frontend` + `backend-api-*` — ดู
  `pnpm-workspace.yaml`) **ห้ามใช้ `npm`/`yarn` เด็ดขาด** รันคำสั่งแบบ `pnpm --filter frontend
  <script>` (หรือ `pnpm -r <script>` จาก root เพื่อรันทุก workspace) `frontend/package.json`
  script `lint` ตอนนี้เป็นแค่ alias ของ `tsc --noEmit` (ยังไม่มี ESLint/Biome ติดตั้ง) และ
  **ยังไม่มี test runner เลย** (ไม่มี jest/vitest/playwright ใน devDependencies) — ห้ามอ้างว่า
  "เทสผ่านแล้ว" หรือสร้างคำสั่ง `pnpm test` ที่ไม่มีจริงขึ้นมาเอง การไม่มี test infra คือสิ่งที่
  ต้องรายงาน ไม่ใช่สิ่งที่ต้องหลบเลี่ยงเงียบ ๆ
- **Tailwind CSS v4** แบบ CSS-first config: `frontend/src/app/globals.css` เริ่มด้วย `@import
  "tailwindcss"` **ไม่มี `tailwind.config.js`** — token/สี custom ต้องอยู่ใน `@theme`/CSS custom
  property ใน `globals.css` ไม่ใช่ไฟล์ config JS ที่ไม่มีอยู่จริง
- **tRPC** โครงที่มีอยู่แล้วในโปรเจกต์ — ต่อยอดจากของเดิม อย่าสร้างใหม่ซ้อน:
  `frontend/src/server/trpc.ts` (`initTRPC`) + `frontend/src/server/routers/app.ts` (router) +
  `frontend/src/shared/api/trpc.ts` (`createTRPCReact<AppRouter>()`) +
  `frontend/src/app/api/trpc/[trpc]/route.ts` (Next.js route handler) — เพิ่ม procedure ใหม่ใน
  router แล้วเรียกผ่าน typed `trpc` client เท่านั้น ห้าม `fetch` เข้า endpoint tRPC เอง
- **TanStack Query** ต่อผ่าน React bindings ของ tRPC ไม่ได้เรียกตรง ๆ `QueryClient` factory กลาง
  อยู่ที่ `frontend/src/shared/query/query-client.ts` (staleTime 30s, gcTime 5m, ไม่
  refetch-on-focus, mutation retry 0) สร้างครั้งเดียวใน `frontend/src/app/providers.tsx` แต่ละ
  feature มี data hook ของตัวเองที่ `features/<name>/api/use-<thing>-query.ts` — ดูตัวอย่างจริง
  ที่ `features/system-health/api/use-system-health-query.ts` (wrap `trpc.<procedure>.useQuery`
  พร้อม option เฉพาะ feature เช่น `refetchInterval`)
- **Zustand — สำหรับ UI-only state เท่านั้น ห้ามเก็บข้อมูลจาก server**: ตัวอย่างจริงในโปรเจกต์คือ
  `frontend/src/features/approval/store/use-approval-ui-store.ts` (เก็บแค่
  `selectedApprovalId`/`isDetailsOpen` ไม่มีอะไรที่ fetch จาก server เลย) — Zustand store ที่
  cache ข้อมูลจาก API คือบั๊ก ไม่ใช่ทางเลือกสไตล์การเขียนโค้ด
- **โครงสร้างแบบ feature-sliced**: `frontend/src/features/<domain>/{model,store,api,components}/`
  พร้อม barrel export `index.ts`, `frontend/src/shared/` สำหรับโค้ดใช้ร่วมข้าม feature,
  `frontend/src/server/` สำหรับ tRPC router `features/system-health/` คือตัวอย่างที่สมบูรณ์ที่สุด
  (มีทั้ง query hook + component) ส่วน `features/approval/`, `features/auth/`,
  `features/notification/` ตอนนี้มีแค่ `model/*.types.ts` (บวก UI store สำหรับ approval) — ยังไม่มี
  component หรือ API hook เลย ดังนั้นการสร้างส่วนที่ขาดคืองานถัดไปของ agent นี้โดยตรง ไม่ใช่การ
  เบี่ยงเบนจาก convention ที่มีอยู่ ทำตามโครงนี้เสมอสำหรับ feature ใหม่ อย่าคิดโครงสร้างใหม่เอง
- **`.ai/ownership.yaml`** กำหนด scope ตาม feature folder (`frontend-approval`, `frontend-auth`,
  `frontend-notification`, `frontend-system-health`, และ `frontend-shared` ที่ mark `exclusive`)
  ตามกติกา "หนึ่ง scope มีเจ้าของทำงานพร้อมกันได้แค่คนเดียว ข้ามgroup ต้อง handoff" — เช็คก่อนแตะ
  feature folder ที่อาจมีคนอื่นทำงานอยู่ และระวังเป็นพิเศษกับ `frontend/src/shared/**` ที่ mark
  exclusive ไว้

**หมายเหตุสี**: `features/system-health/components/system-health-dashboard.tsx` (โค้ดเดิมที่มี
อยู่แล้ว) ใช้สี Tailwind ปกติ (`slate-*`, `sky-*`, `emerald-500`, `amber-400`, `#0c4971` แบบ
hardcode) ซึ่งอาจไม่ตรงกับ design tokens ที่กำหนดไว้ในเอกสารปัจจุบัน — ถือเป็นหนี้เทคนิคที่มีอยู่ก่อน
ไม่ใช่แบบที่ควร copy ต่อ งานใหม่ให้ใช้ token และ pattern ที่มีใน frontend หากต้องแก้ของเก่าด้วยให้
แยก scope และแจ้งผลกระทบไว้ก่อน
(อาจเป็นงานแยกต่างหาก ไม่ใช่ผลพลอยได้ระหว่างทำงานอื่น)

## 2. หลักที่ต้องทำตามเสมอ (Non-negotiables)

- **Server state ต้องอยู่ใน TanStack Query เท่านั้น — ห้ามอยู่ใน global store, ห้าม `useEffect` +
  `useState`** การตัดสินใจข้อเดียวนี้ตัดปัญหา loading flag/race condition/stale data ไปเกือบหมด
  การเอาข้อมูล API ไปไว้ใน Zustand/Redux คือความผิดพลาดเชิงสถาปัตยกรรมที่พบบ่อยที่สุดใน React
- **ห้าม `useEffect` ที่มีหน้าที่แค่ derive/sync state** — คำนวณระหว่าง render แทน effect มีไว้
  sync กับสิ่งที่อยู่ **นอก** React เท่านั้น
- **Loading, error, empty คือส่วนหนึ่งของงาน** ไม่ใช่ ticket ที่ค่อยทำทีหลัง (ตรงกับกติกา 5 สถานะ
  ของ feature และ requirement)
- **ทุก dependency มีต้นทุนที่ผู้ใช้ต้องดาวน์โหลด** เช็ค `react-libraries.md` (ถ้ามี preload) ก่อน,
  เลือกใช้ platform API (`Intl`, `fetch`, `URLSearchParams`) ก่อนเพิ่ม library, เช็คสถานะ
  maintenance/ความเข้ากันได้กับ React version ปัจจุบันก่อนเพิ่มอะไรที่ไม่คุ้นเคย ห้าม pin เวอร์ชัน
  จากความจำ บอกต้นทุน bundle เมื่อเพิ่มอะไรใหม่
- **Virtualize list ที่เกิน ~200 แถว** filter/paginate ฝั่ง server สำหรับ set ใหญ่ ถ้า backend
  paginate ไม่ได้ นั่นคือคำขอไปทีม backend ไม่ใช่ workaround ฝั่ง client
- **ห้าม block main thread** — งาน parse/crypto หนัก ๆ ไปที่ Web Worker
- **Memoization ต้องมีเหตุผลจาก profile จริง ไม่ใช่ใส่พร่ำเพรื่อ**
- **ไม่มีความลับในโค้ดฝั่ง client** ทุกอย่างที่ bundle ไปคือของสาธารณะ ห้าม PII ใน URL/localStorage/
  analytics payload
- **Authorization เป็นหน้าที่ backend** ซ่อนปุ่มคือ UX ไม่ใช่ security ห้ามนำเสนอ client-side check
  เป็นมาตรการความปลอดภัย
- **Accessibility เป็นส่วนหนึ่งของ "เสร็จ"**: semantic element, label, alt text, keyboard
  operability, focus management ตอนเปลี่ยนหน้า/เปิด modal — ตรงกับหัวข้อ Accessibility ใน design
  design spec ที่เกี่ยวข้อง
- **ห้ามคำนวณเวลา/วันที่/locale ระหว่าง render โดยตรง** — `Date.now()`, `new Date()`,
  `.toLocaleString()` แบบไม่ระบุ `timeZone` ที่เรียกตรง ๆ ใน render จะได้ค่าไม่เท่ากันระหว่าง SSR
  (เซิร์ฟเวอร์เรนเดอร์ตอนหนึ่ง) กับ client (hydrate อีกตอนหนึ่ง ห่างกันเป็น ms และอาจคนละ timezone/
  ICU) → React error "hydration mismatch" (เจอจริงในโปรเจกต์นี้ตอนทำ SLA countdown + timeline
  timestamp — ดูหัวข้อ 7)

## 3. เวลา/วันที่ ต้องปลอดภัยจาก hydration mismatch เสมอ

ค่าที่ "ตอนนี้กี่โมง" (countdown, "อัปเดตล่าสุดเมื่อไหร่") **เปลี่ยนได้ทุกครั้งที่ render** — SSR
กับ client hydrate คนละ instant กันเสมอ ห้ามให้ค่าที่ต่างกันหลุดออกมาเป็น text ที่ React ต้องเทียบ
ตอน hydrate สองแบบที่ต้องแยกกันแก้:

**(a) ค่าที่ขึ้นกับ "ตอนนี้" จริง ๆ** (SLA countdown, relative time เช่น "5 นาทีที่แล้ว"): ใช้
`useNow()` จาก `frontend/src/shared/hooks/use-now.ts` — คืนค่า `null` จนกว่าจะ mount เสร็จ (SSR
กับ first paint จึงเรนเดอร์ placeholder เดียวกันเป๊ะ) แล้วค่อยอัปเดตเป็นเวลาจริงฝั่ง client เท่านั้น
ห้ามเรียก `Date.now()` ตรง ๆ ใน component ที่ต้อง SSR — ส่ง `now` เป็น parameter เข้าฟังก์ชัน pure
เสมอ (ดู `features/approval/lib/sla.ts`, `features/approval/components/approval-table.tsx` เป็น
ตัวอย่างจริงที่แก้แล้ว)

**(b) ค่าที่เป็น timestamp คงที่แต่ format ด้วย locale** (เช่น timeline log, `createdAt`):
ตัว**ค่า**ไม่เปลี่ยน แต่ `.toLocaleString()`/`.toLocaleDateString()` แบบไม่ระบุ option อาจได้ผลลัพธ์
ต่างกันระหว่าง Node ICU (server) กับ browser ICU (client) แก้ด้วยการระบุทุก option ให้ครบรวม
`timeZone` เสมอ — ห้ามปล่อย default:
```ts
const formatter = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
```
สร้าง formatter ไว้ระดับ module (นอก component) ครั้งเดียว ไม่สร้างใหม่ทุก render — ดู
`features/approval/components/approval-detail-panel.tsx` เป็นตัวอย่าง

**เช็คก่อน merge**: grep หา `Date.now()`, `new Date()` ที่ไม่ได้มาจาก prop/argument, และ
`.toLocaleString(` / `.toLocaleDateString(` ที่ไม่มี `timeZone` ใน component ที่ render ระหว่าง
SSR (ทุก "use client" component ในหน้าแรกที่ผู้ใช้เห็น ไม่ใช่แค่ที่ทำงานหลัง interaction) — ถ้าเจอ
ให้ไล่ไปที่ (a) หรือ (b) ด้านบนแล้วแก้ตามแพทเทิร์นนั้น

## 4. Next.js mode

Server/client boundary คือการตัดสินใจแรกของทุกงาน: server component เป็นค่าเริ่มต้น, `"use
client"` เฉพาะที่จำเป็น (leaf component), `server-only` บน module ที่มีความลับ, ทุก Server Action
ต้อง validate + เช็คสิทธิ์เหมือน public endpoint, authorization จริงอยู่ที่ data-access layer ไม่ใช่
middleware (บทเรียนจาก CVE-2025-29927 — middleware ถูก bypass ได้ ใช้แค่ทำ UX redirect ไม่ใช่
security boundary), ทุก mutation ต้องระบุว่า revalidate อะไร, ต้องมี shared Redis cacheHandler
ทันทีที่แอปรันมากกว่า 1 replica การแนะนำว่า**ไม่ควร**ใช้ Next.js (เช่น Vite SPA หลัง login) หรือไม่
ควร migrate มา ก็เป็นคำตอบที่ถูกต้องได้ถ้า requirement ไม่คุ้มความซับซ้อน

## 5. Refactoring mode

เมื่องานคือ refactor (โครงสร้างหรือ performance) เปลี่ยนกระบวนการทำงาน:
- **มี safety net ก่อนแก้บรรทัดแรก**: characterization test ตรึงพฤติกรรมปัจจุบัน, type เข้มงวด,
  visual regression สำหรับงาน UI หนัก, บันทึก performance baseline ถ้าเป้าหมายคือ performance —
  ไม่มี net ไม่ refactor
- **commit ที่ refactor ต้องไม่เปลี่ยนพฤติกรรม, commit ที่เปลี่ยนพฤติกรรมต้องไม่ refactor** —
  1 transformation ต่อ 1 commit, verify ครบ (`tsc --noEmit`, lint, test ถ้ามี) ทุก step, revert
  ถ้า step ไหน fail แทนที่จะ debug ต่อ
- **การ migrate ใหญ่ใช้ strangler fig** — pattern ใหม่อยู่ข้างของเก่า ทำทีละ feature ไม่ big-bang
  rewrite
- **Performance refactor ต้องมีตัวเลขก่อน/หลัง** (profile, bundle diff, INP) ถ้า "performance"
  เปลี่ยนพฤติกรรมที่สังเกตได้ ต้องบอกตรง ๆ ว่านั่นไม่ใช่ behavior-preserving แล้ว

## 6. จัดการ UX ที่ยังไม่ชัด

ทวน requirement และ design spec ใน `docs/design/` ก่อน หากไม่มี spec ให้ใช้ component, token,
และ interaction pattern ที่มีใน frontend พร้อมระบุสมมติฐานในงาน ครอบคลุม success, loading, empty,
error และ partial state เท่าที่ feature ต้องใช้ ถ้าความไม่ชัดเปลี่ยน flow หรือผลลัพธ์สำคัญ ให้ถาม
ผู้ใช้ก่อนลงมือ ไม่ต้องรอหรือประสานงานกับ agent อื่น

## 7. คำสั่ง verify

```
pnpm --filter frontend typecheck && pnpm --filter frontend build
```

`lint` ตอนนี้คือ `tsc --noEmit` ซ้ำ (ไม่มี linter แยก) และไม่มีคำสั่ง test — อย่าอ้างว่ารันเทสแล้ว
ถ้าไม่มีคำสั่งให้รันจริง ห้ามรายงานว่างานเสร็จถ้ายังไม่ได้ typecheck+build จริง

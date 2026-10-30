# SwasthyaConnect Clinic Management System

A modern, comprehensive clinic management platform designed to streamline patient appointments, simplify doctor scheduling, and deliver automated communications.

## 🌟 Key Features

### 🏥 Patient Portal
* **Family & Multi-Patient Support**: Add and manage multiple patients (such as elderly relatives and children who do not have a mobile phone or require assistance) under a single mobile number.
* **Self-Service Appointments**: Easily view upcoming visits, track past consultations, and manage bookings directly from the portal.
* **Instant Online Booking**: Book appointments effortlessly by selecting from real-time available clinic time slots.

### 🩺 Doctor Dashboard
* **Secure Access**: Dedicated, secure portal for doctors and clinic staff.
* **Daily Overview**: At-a-glance dashboard displaying today's appointments, completed visits, and total patient counts.
* **Patient Insights**: Comprehensive patient profiles featuring calculated age, chief complaints, and past consultation history.
* **Schedule & Leave Blocking**: Block specific time slots or full dates for planned surgeries, procedures, or vacations so patients cannot book appointments during those slots.
* **Schedule Management**: Full control over daily shifts, patient queues, and appointment flows.

### 🌐 Digital Presence for Your Clinic
Create a comprehensive digital presence to showcase your practice:
* **Clinic Timings**: Display clear morning and evening shift hours and operational days.
* **Location**: Share clinic address and map directions for easy patient navigation.
* **Featured Products**: Highlight clinic-recommended medicines, health supplements, or wellness products.
* **Consultation / Follow-up Fees**: Transparently display charges for initial consultations and follow-up visits.
* **YouTube Videos**: Embed educational videos, health tips, and clinic introduction videos.

### 📅 Smart Scheduling System
* **Dynamic Slot Generation**: Automatically divides clinic shifts into convenient appointment slots based on configured consultation durations.
* **Conflict Prevention**: Real-time slot management prevents double booking and automatically hides booked or blocked slots.
* **Flexible Timezone Support**: Configured to display and manage appointments accurately in the clinic's local timezone.

### 💬 Automated WhatsApp Notifications
* **Booking Confirmations**: Instantly sends patients confirmation messages with clinic details, directions, and appointment times.
* **Reminders & Alerts**: Automated appointment reminders and instant notifications for any schedule changes or cancellations.
* **Doctor Daily Summaries**: Delivers a daily schedule overview and real-time patient cancellation updates directly to the doctor's WhatsApp.

### 🔐 Patient Access
* **4-digit PIN**: patients choose a PIN on their first booking and use it with their mobile number to view or cancel appointments. No OTP, so it works for patients who book with a relative or at the front desk.
* **Forgotten PIN**: reset with a WhatsApp code, or ask the clinic to reset it from the patient page.

### 🏢 Many Clinics, One Codebase
* Each clinic is reached by its own hostname and has its own data, branding, team and settings.
* Roles per clinic: owner, doctor and front desk. An operator console manages clinics, hostnames and plan features.

## Development

Requires **Node 22** (see `.nvmrc`).

```powershell
npm ci --legacy-peer-deps
copy .env.local.example .env.local   # then fill in the values
npm run dev
```

| Command | Purpose |
|---|---|
| `npx tsc --noEmit` | Type-check |
| `npm test` | Unit tests (in-memory Firestore fake) |
| `npm run check:tenant` | Guard: all clinic data goes through the tenant-scoped accessor |
| `npm run build` | Production build |
| `.\deploy.ps1 [-Environment staging]` | Deploy to Cloud Run |

## Documentation
* [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — concepts, environment variables, day-to-day, background jobs
* [`docs/ROLLOUT.md`](docs/ROLLOUT.md) — production roll-out and data migration
* [`docs/CUSTOM_DOMAINS.md`](docs/CUSTOM_DOMAINS.md) — giving a clinic a hostname
* [`docs/UI_KIT.md`](docs/UI_KIT.md) — shared components, colours, error wording and breakpoints; [`docs/ACCESSIBILITY_AUDIT.md`](docs/ACCESSIBILITY_AUDIT.md) — the audit behind them
* [`docs/WHATSAPP_NOTIFICATIONS.md`](docs/WHATSAPP_NOTIFICATIONS.md) — messages, templates and their variables

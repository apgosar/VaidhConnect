# WhatsApp Notification System Documentation

This document describes all automated WhatsApp messages sent by the Clinic Management Application, including message triggers, recipients, delivery rules, template names, and dynamic parameters.

---

## Overview of Notification Flow

```
                                  APPOINTMENT BOOKED
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
           Booked > 24h before    Booked 1h–24h before    Booked < 1h before
                  │                       │                       │
      • Booking Confirmation  • Booking Confirmation  • Booking Confirmation
        (Immediate)             (Immediate)             (Immediate)
                  │                       │           • Appointment Reminder
                  │                       │             (Immediate)
      • Reminder 24h Before               │
        (24h before appt)                 │
                  │                       │
      • Reminder 1h Before    • Reminder 1h Before
        (1h before appt)        (1h before appt)
```

---

## 1. Patient Notifications

### 1.1 Appointment Booking Confirmation
- **WhatsApp Template:** `appt_booking_confirmation`
- **Recipient:** Patient (`patient.phone`)
- **Trigger:** Immediate upon successful booking of an appointment (`POST /api/appointments`).
- **Template Parameters:**
  1. `patientName`: Patient's full name (e.g. `John Doe`)
  2. `doctorName`: Doctor's name (e.g. `Dr. Rajesh Sharma`)
  3. `appointmentTime`: Formatted appointment date and time (e.g. `September 5, 2026 at 10:30 AM`)
  4. `clinicPhone`: Clinic contact phone number / name

---

### 1.2 Appointment Reminders
- **WhatsApp Template:** `appt_reminder`
- **Recipient:** Patient (`patient.phone`)
- **Template Parameters:**
  1. `patientName`: Patient's full name
  2. `doctorName`: Doctor's name
  3. `appointmentTime`: Formatted appointment date and time
  4. `clinicPhone`: Clinic contact phone number
  5. `directionsUrl`: Google Maps directions link for the clinic
- **Delivery Rules:**

| Booking Lead Time | Immediate on Booking | 24 Hours Before | 1 Hour Before |
| :--- | :--- | :--- | :--- |
| **Booked > 24h before** | Booking Confirmation | ✅ 24h Reminder | ✅ 1h Reminder |
| **Booked 1h to 24h before** | Booking Confirmation | ❌ Skipped | ✅ 1h Reminder |
| **Booked < 1h before** (Last Minute) | Booking Confirmation + ✅ **Immediate Reminder** | ❌ Skipped | ❌ Skipped (already sent immediately) |

*Note:* Scheduled reminders are processed periodically via `/api/cron/reminders`. Each appointment maintains boolean flags (`reminderSent24h`, `reminderSent1h`) in Firestore to guarantee that no duplicate reminders are sent.

---

### 1.3 Appointment Cancellation
- **WhatsApp Template:** `appt_cancellation`
- **Recipient:** Patient (`patient.phone`)
- **Trigger:** Immediate when an appointment status is updated to `CANCELLED` (via `PATCH /api/appointments/[id]`). Triggered either when a doctor cancels from the dashboard or when a patient cancels their booking.
- **Template Parameters:**
  1. `patientName`: Patient's full name
  2. `appointmentTime`: Formatted appointment date and time
  3. `clinicPhone`: Clinic contact phone number

---

## 2. Doctor Notifications

### 2.1 Daily Morning Schedule Summary
- **WhatsApp Template:** `daily_summary_morning`
- **Recipient:** Doctor (Sent to private `whatsappPhone` if configured in Settings, otherwise falls back to `clinicPhone`)
- **Trigger:** Scheduled daily cron (`POST /api/cron/daily-summary`) at the doctor's configured **Daily WhatsApp Summary Time** (default: 10:00 AM; fully customizable in Doctor Settings).
- **Template Parameters:**
  1. `doctorName`: Doctor's name
  2. `appointmentCount`: Total count of appointments booked for today
  3. `date`: Today's formatted date (e.g. `September 1, 2026`)
  4. `scheduleList`: Line-by-line schedule of today's booked appointments (`10:00 AM - Patient Name - Phone Number`)

---

### 2.2 Real-Time Same-Day Schedule Updates
- **WhatsApp Template:** `daily_summary_update`
- **Recipient:** Doctor (Sent to private `whatsappPhone` if configured, otherwise falls back to `clinicPhone`)
- **Trigger:** Any same-day schedule changes (new patient booking or cancellation) that occur **after the doctor's morning summary time** (e.g. after 10:00 AM).
  - *Rationale:* Before the morning summary time, changes are automatically included in the upcoming morning summary. After the morning summary, real-time updates are sent immediately so the doctor is never in a blind spot regarding same-day changes.
- **Template Parameters:**
  1. `doctorName`: Doctor's name
  2. `cancelledPatientName`: Details of the change (e.g. `Jane Doe` or `New booking: John Smith`)
  3. `remainingCount`: Total remaining booked appointments for today
  4. `scheduleList`: Full updated line-by-line schedule for the rest of today

---

## 3. Summary Reference Table

| Notification Type | Template Name | Recipient | When is it sent? | Trigger Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| **Booking Confirmation** | `appt_booking_confirmation` | Patient | Immediately upon booking | `POST /api/appointments` |
| **24h Reminder** | `appt_reminder` | Patient | 24 hours before appointment | `POST /api/cron/reminders` |
| **1h Reminder** | `appt_reminder` | Patient | 1 hour before appointment | `POST /api/cron/reminders` |
| **Immediate Reminder** | `appt_reminder` | Patient | Immediately upon booking if booked < 1h in advance | `POST /api/appointments` |
| **Cancellation Notification** | `appt_cancellation` | Patient | Immediately upon appointment cancellation | `PATCH /api/appointments/[id]` |
| **Daily Morning Summary** | `daily_summary_morning` | Doctor | Daily at doctor's configured summary time (default 10:00 AM) | `POST /api/cron/daily-summary` |
| **Real-time Schedule Update** | `daily_summary_update` | Doctor | On same-day booking/cancellation after summary time | `POST /api/appointments`, `PATCH /api/appointments/[id]` |

---

## 4. WhatsApp Audit Log in Doctor Portal

All outgoing WhatsApp messages (both successes and failures) are logged to the `whatsapp_logs` Firestore collection and can be reviewed in real time under the **WhatsApp Logs** tab in the Doctor Dashboard:
- **Status:** Color-coded `sent` or `failed` badges
- **Message Type:** Booking Confirmation, Reminder, Cancellation, Daily Summary, Schedule Update
- **Recipient & Phone Number:** Display name and destination phone number
- **Template & Parameters:** Full expandable view of the parameters sent
- **Timestamp:** Exact date and time when the message was dispatched

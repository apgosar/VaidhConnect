# WhatsApp notifications

One WhatsApp Business number sends every message for **all clinics**, so each
template carries the clinic's name. Templates are created once in Meta Business
Manager (language **English**, body only, no header/footer/buttons) and used by
every clinic. The code that sends them is `lib/whatsapp.ts`; the triggers are in
`lib/modules/notifications.ts`, `reminders.ts`, `dailySummary.ts` and `patientAccess.ts`.

**Credentials** (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) come from the
environment: a permanent system-user token, never the 24-hour test token.

## Rules for writing templates (Meta rejects otherwise)
- A variable can't be the first or last thing in the body: end with fixed text, even just a full stop after a sentence.
- Variables are numbered `{{1}}`, `{{2}}`… in order of appearance, and the code sends them in exactly that order. Changing the wording or the order means changing `lib/whatsapp.ts` too.
- No two variables side by side without text between them.
- Variable values can't contain newlines, tabs or 4+ spaces. The sender flattens multi-line values (a schedule list) into one line separated by ` | `.
- Meta needs example values for every variable when you submit a template.

## Messages

| Template | Category | To | Sent when |
|---|---|---|---|
| `appt_booking_confirmation` | Utility | Patient | Immediately after a booking (patient or front desk) |
| `appt_cancellation` | Utility | Patient | When an appointment is cancelled by the patient or the clinic |
| `appt_reminder` | Utility | Patient | 24 h and 1 h before the appointment (cron) |
| `daily_summary_morning` | Utility | Doctor | Each morning at the doctor's chosen summary hour (cron) |
| `daily_summary_update` | Utility | Doctor | Same-day booking or cancellation made after the summary hour |
| `patient_pin_reset` | Authentication | Patient | Patient asks to reset their PIN |

### 1. `appt_booking_confirmation`
```
Hi {{1}}, your appointment at {{2}} with Dr. {{3}} has been confirmed for {{4}}. If you have any questions or need to change your booking, please call the clinic on {{5}}. We look forward to seeing you.
```
{{1}} patient name · {{2}} clinic name · {{3}} doctor name (without "Dr.") · {{4}} date and time (e.g. `4 November 2026 at 10:30 AM`) · {{5}} clinic phone

### 2. `appt_cancellation`
```
Hi {{1}}, your appointment at {{2}} scheduled for {{3}} has been cancelled. If you would like to book again or have any questions, please call the clinic on {{4}}. Thank you.
```
{{1}} patient name · {{2}} clinic name · {{3}} date and time · {{4}} clinic phone

### 3. `appt_reminder`
```
Appointment reminder from {{1}}: Hi {{2}}, this is a reminder for your appointment with Dr. {{3}} on {{4}}. Clinic contact: {{5}}. Directions: {{6}}. See you soon.
```
{{1}} clinic name · {{2}} patient name · {{3}} doctor name · {{4}} date and time · {{5}} clinic phone · {{6}} maps link (or "Contact clinic for directions" when the clinic has none)

### 4. `daily_summary_morning`
```
Good morning Dr. {{1}}. Here is the schedule for {{2}} on {{3}}. You have {{4}} appointment(s): {{5}}. Have a great day.
```
{{1}} doctor name · {{2}} clinic name · {{3}} date · {{4}} appointment count · {{5}} schedule on one line (`10:00 AM - Asha Rao - +91… | 10:30 AM - …`)

### 5. `daily_summary_update`
```
Schedule update for Dr. {{1}} at {{2}}: {{3}}. Total appointments today: {{4}}. Updated schedule: {{5}}. Thank you.
```
{{1}} doctor name · {{2}} clinic name · {{3}} what changed (`New booking by Asha Rao for 10:30 AM` or `Cancellation by Ravi Kumar for 10:30 AM`) · {{4}} appointments left today in total · {{5}} updated schedule on one line

### 6. `patient_pin_reset`
Authentication template with a "copy code" button. Meta fixes the wording (`{{1}} is your verification code.`), so the clinic name can't appear here. The code is sent twice, as the body variable and as the button's parameter. Choose a 10-minute expiry.
{{1}} 6-digit code

## When messages go out

**Booking**
- Always: booking confirmation.
- Booked less than an hour before the slot: confirmation only. The reminder would arrive seconds later saying the same thing, and the booking marks it as already sent.

**Reminders** (`POST /api/cron/reminders`, every 15 minutes)

| Booked how far ahead | 24 h reminder | 1 h reminder |
|---|---|---|
| More than 24 h | sent | sent |
| 1–24 h | skipped | sent |
| Under 1 h | skipped | skipped |

Each appointment carries `reminderSent24h` and `reminderSent1h` flags, so a reminder is never sent twice.

**Doctor messages**
- Morning summary: `POST /api/cron/daily-summary` runs hourly and sends once per day at the doctor's summary hour (default 10:00, set in Settings).
- Update: changes made before the summary hour are folded into the morning summary. Changes made after it send an update straight away, so the doctor always has the current schedule.
- Both go to the doctor's private WhatsApp number if set in Settings, otherwise the clinic phone.

**PIN reset**
- Patient taps "Forgot your PIN?" or "Confirm my number" → a code goes to their own WhatsApp. Limits: 1 per minute and 5 per hour per phone, 10 per hour per IP.

## A message shows "sent" but never arrives
"sent" in the logs means Meta accepted it; it doesn't promise delivery. Delivery failures reach Meta's webhooks, which this app doesn't read. Check, in order:
1. The WhatsApp Business Account has a **payment method** (otherwise Meta accepts, then fails with error 131042).
2. If the sender is a Meta test number, the recipient must be on its allowed-recipients list.
3. The recipient number is correct and has WhatsApp.

## Logs
Every attempt, success or failure, is saved to the clinic's `whatsapp_logs` and shown under **WhatsApp Logs** in the doctor dashboard: status, message type, recipient, template and parameters, time and, for failures, Meta's error text (for example `(#131008) Required parameter is missing`).

Clinics whose plan has the WhatsApp feature switched off don't send; the attempt is logged as failed with the reason.

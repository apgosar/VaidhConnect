import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { Txt, accentOf } from './common'
import { FONT_LATIN } from './fonts'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: FONT_LATIN, fontSize: 10, color: '#1e293b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, borderBottomWidth: 2, borderBottomStyle: 'solid', paddingBottom: 12 },
  clinicName: { fontSize: 18, fontWeight: 700 },
  subtitle: { fontSize: 10, color: '#475569', marginTop: 2 },
  receiptBox: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 16, marginBottom: 20, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#f1f5f9' },
  label: { color: '#64748b', fontSize: 10 },
  value: { fontWeight: 700, fontSize: 10, textAlign: 'right', maxWidth: '65%' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#e2e8f0', paddingTop: 8, textAlign: 'center' },
  footerText: { fontSize: 8, color: '#94a3b8' },
})

export interface ReceiptDocProps {
  payment: { id: string; amount: number; mode: string; /** Formatted in the clinic's timezone. */ paidOnText: string; paidDateText: string; notes?: string | null }
  patient: { name: string; phone: string }
  visit: { dateTimeText: string; chiefComplaint?: string | null }
  doctor: { name: string; clinicName: string; address?: string; phone?: string; primary?: string }
}

export function ReceiptDocument({ payment, patient, visit, doctor }: ReceiptDocProps) {
  const accent = accentOf(doctor.primary, '#065F46')
  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Txt style={styles.value}>{value}</Txt>
    </View>
  )

  return (
    <Document title={`Receipt - ${patient.name}`} author={doctor.clinicName}>
      <Page size="A5" style={styles.page}>
        <View style={[styles.header, { borderBottomColor: accent }]}>
          <View style={{ flex: 1 }}>
            <Txt style={[styles.clinicName, { color: accent }]}>{doctor.clinicName}</Txt>
            <Txt style={styles.subtitle}>{`Dr. ${doctor.name}`}</Txt>
            {doctor.address && <Txt style={[styles.subtitle, { fontSize: 9 }]}>{doctor.address}</Txt>}
            {doctor.phone && <Txt style={[styles.subtitle, { fontSize: 9 }]}>{`Tel: ${doctor.phone}`}</Txt>}
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={{ fontSize: 9, color: '#64748b' }}>{`RECEIPT# ${payment.id.slice(0, 8).toUpperCase()}`}</Text>
            <Text style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{payment.paidDateText}</Text>
          </View>
        </View>

        <View style={styles.receiptBox}>
          <Text style={{ fontSize: 16, fontWeight: 700, color: accent, marginBottom: 4 }}>Payment Receipt</Text>
          <Txt style={{ fontSize: 28, fontWeight: 700, color: accent }}>{`₹${payment.amount.toFixed(2)}`}</Txt>
        </View>

        <Row label="Patient Name" value={patient.name} />
        <Row label="Phone" value={patient.phone} />
        <Row label="Appointment" value={visit.dateTimeText} />
        {visit.chiefComplaint ? <Row label="For" value={visit.chiefComplaint} /> : null}
        <Row label="Payment Mode" value={payment.mode} />
        <Row label="Paid On" value={payment.paidOnText} />
        {payment.notes ? <Row label="Notes" value={payment.notes} /> : null}

        <View style={styles.footer} fixed>
          <Txt style={styles.footerText}>{`Thank you for visiting ${doctor.clinicName}. This is a computer generated receipt.`}</Txt>
        </View>
      </Page>
    </Document>
  )
}

'use client'

import { PDFDownloadLink, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { format, parseISO } from 'date-fns'
import { X } from 'lucide-react'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, borderBottom: '2px solid #10B981', paddingBottom: 12 },
  clinicName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#065F46' },
  subtitle: { fontSize: 10, color: '#475569', marginTop: 2 },
  receiptBox: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 16, marginBottom: 20, textAlign: 'center' },
  receiptTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#065F46', marginBottom: 4 },
  receiptAmount: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#065F46' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottom: '1px solid #f1f5f9' },
  label: { color: '#64748b', fontSize: 10 },
  value: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTop: '1px solid #e2e8f0', paddingTop: 8, textAlign: 'center' },
  footerText: { fontSize: 8, color: '#94a3b8' },
})

interface ReceiptDocProps {
  payment: { id: string; amount: string; mode: string; paidAt: string; notes?: string }
  patient: { name: string; phone: string }
  appointment: { id: string; startTime: string; chiefComplaint?: string }
  doctor: { name: string; clinicName: string; address?: string; phone?: string }
}

function ReceiptDocument({ payment, patient, appointment, doctor }: ReceiptDocProps) {
  return (
    <Document title={`Receipt - ${patient.name}`}>
      <Page size="A5" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.clinicName}>{doctor.clinicName}</Text>
            <Text style={styles.subtitle}>Dr. {doctor.name}</Text>
            {doctor.address && <Text style={{ ...styles.subtitle, fontSize: 9 }}>{doctor.address}</Text>}
            {doctor.phone && <Text style={{ ...styles.subtitle, fontSize: 9 }}>Tel: {doctor.phone}</Text>}
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={{ fontSize: 9, color: '#64748b' }}>
              RECEIPT#{payment.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
              {format(parseISO(payment.paidAt), 'dd MMM yyyy')}
            </Text>
          </View>
        </View>

        {/* Amount */}
        <View style={styles.receiptBox}>
          <Text style={styles.receiptTitle}>Payment Receipt</Text>
          <Text style={styles.receiptAmount}>₹{Number(payment.amount).toFixed(2)}</Text>
        </View>

        {/* Details */}
        <View style={styles.row}>
          <Text style={styles.label}>Patient Name</Text>
          <Text style={styles.value}>{patient.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Phone</Text>
          <Text style={styles.value}>{patient.phone}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Appointment Date</Text>
          <Text style={styles.value}>{format(parseISO(appointment.startTime), 'dd MMM yyyy, hh:mm a')}</Text>
        </View>
        {appointment.chiefComplaint && (
          <View style={styles.row}>
            <Text style={styles.label}>For</Text>
            <Text style={styles.value}>{appointment.chiefComplaint}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.label}>Payment Mode</Text>
          <Text style={styles.value}>{payment.mode}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Paid On</Text>
          <Text style={styles.value}>{format(parseISO(payment.paidAt), 'dd MMM yyyy, hh:mm a')}</Text>
        </View>
        {payment.notes && (
          <View style={styles.row}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{payment.notes}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Thank you for visiting {doctor.clinicName}. This is a computer generated receipt.</Text>
        </View>
      </Page>
    </Document>
  )
}

interface ReceiptPDFProps extends ReceiptDocProps {
  onClose: () => void
}

export default function ReceiptPDF({ payment, patient, appointment, doctor, onClose }: ReceiptPDFProps) {
  const filename = `Receipt_${patient.name.replace(/\s/g, '_')}_${format(parseISO(payment.paidAt), 'ddMMMyyyy')}.pdf`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="card p-6 max-w-sm w-full text-center space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Download Receipt</h3>
          <button onClick={onClose} className="btn btn-ghost p-2"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-500">Receipt for ₹{Number(payment.amount).toFixed(2)} is ready.</p>
        <PDFDownloadLink
          document={<ReceiptDocument payment={payment} patient={patient} appointment={appointment} doctor={doctor} />}
          fileName={filename}
          className="btn btn-success w-full"
        >
          {({ loading }) => loading ? 'Generating...' : '⬇️ Download Receipt PDF'}
        </PDFDownloadLink>
        <button onClick={onClose} className="btn btn-ghost w-full text-sm">Close</button>
      </div>
    </div>
  )
}

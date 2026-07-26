'use client'

import { PDFDownloadLink, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { format, parseISO } from 'date-fns'
import type { Medicine } from '@/lib/constants'
import { X } from 'lucide-react'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, borderBottom: '2px solid #3B82F6', paddingBottom: 12 },
  clinicName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1e40af' },
  doctorName: { fontSize: 11, color: '#475569', marginTop: 2 },
  qualifications: { fontSize: 9, color: '#64748b', marginTop: 2 },
  rxBig: { fontSize: 48, color: '#DBEAFE', position: 'absolute', right: 40, top: 30, fontFamily: 'Helvetica-Bold' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  patientRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  patientField: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 4, padding: 8 },
  fieldLabel: { fontSize: 8, color: '#94a3b8', marginBottom: 2 },
  fieldValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  diagnosisBox: { backgroundColor: '#EFF6FF', borderRadius: 6, padding: 10, marginBottom: 16 },
  diagnosisText: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1e40af' },
  medTable: { width: '100%' },
  medHeader: { flexDirection: 'row', backgroundColor: '#3B82F6', borderRadius: 4, padding: '5 8', marginBottom: 4 },
  medHeaderCell: { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  medRow: { flexDirection: 'row', padding: '5 8', borderBottom: '1px solid #f1f5f9' },
  medCell: { fontSize: 9 },
  col1: { width: '30%' },
  col2: { width: '18%' },
  col3: { width: '22%' },
  col4: { width: '15%' },
  col5: { width: '15%' },
  notes: { backgroundColor: '#fefce8', borderRadius: 6, padding: 10, marginBottom: 16 },
  notesText: { fontSize: 9, color: '#713f12' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTop: '1px solid #e2e8f0', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#94a3b8' },
  signature: { borderTop: '1px solid #94a3b8', marginTop: 40, paddingTop: 4, fontSize: 9, textAlign: 'center' },
})

interface PrescriptionData {
  id: string
  diagnosis?: string
  medicines: Medicine[]
  notes?: string
}

interface PrescriptionPDFDocProps {
  prescription: PrescriptionData
  patient: { name: string; phone: string; dob: string }
  appointment: { startTime: string; chiefComplaint?: string }
  doctor: { name: string; clinicName: string; qualifications?: string; address?: string; phone?: string }
}

function PrescriptionDocument({ prescription, patient, appointment, doctor }: PrescriptionPDFDocProps) {
  const apptDate = format(parseISO(appointment.startTime), 'dd MMM yyyy')
  const dobDate = format(parseISO(patient.dob), 'dd MMM yyyy')
  
  return (
    <Document title={`Prescription - ${patient.name} - ${apptDate}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.rxBig}>Rx</Text>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.clinicName}>{doctor.clinicName}</Text>
            <Text style={styles.doctorName}>Dr. {doctor.name}</Text>
            {doctor.qualifications && <Text style={styles.qualifications}>{doctor.qualifications}</Text>}
            {doctor.address && <Text style={styles.qualifications}>{doctor.address}</Text>}
            {doctor.phone && <Text style={styles.qualifications}>Tel: {doctor.phone}</Text>}
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={{ fontSize: 9, color: '#64748b' }}>Date: {apptDate}</Text>
          </View>
        </View>

        {/* Patient Info */}
        <View style={styles.patientRow}>
          <View style={styles.patientField}>
            <Text style={styles.fieldLabel}>PATIENT NAME</Text>
            <Text style={styles.fieldValue}>{patient.name}</Text>
          </View>
          <View style={styles.patientField}>
            <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
            <Text style={styles.fieldValue}>{dobDate}</Text>
          </View>
          <View style={styles.patientField}>
            <Text style={styles.fieldLabel}>CONTACT</Text>
            <Text style={styles.fieldValue}>{patient.phone}</Text>
          </View>
        </View>

        {/* Chief Complaint */}
        {appointment.chiefComplaint && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Chief Complaint</Text>
            <Text style={{ fontSize: 10, color: '#475569' }}>{appointment.chiefComplaint}</Text>
          </View>
        )}

        {/* Diagnosis */}
        {prescription.diagnosis && (
          <View style={styles.diagnosisBox}>
            <Text style={{ fontSize: 8, color: '#1e40af', marginBottom: 2 }}>DIAGNOSIS</Text>
            <Text style={styles.diagnosisText}>{prescription.diagnosis}</Text>
          </View>
        )}

        {/* Medicines Table */}
        {prescription.medicines.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prescribed Medicines</Text>
            <View style={styles.medTable}>
              <View style={styles.medHeader}>
                <Text style={[styles.medHeaderCell, styles.col1]}>Medicine</Text>
                <Text style={[styles.medHeaderCell, styles.col2]}>Dosage</Text>
                <Text style={[styles.medHeaderCell, styles.col3]}>Frequency</Text>
                <Text style={[styles.medHeaderCell, styles.col4]}>Duration</Text>
                <Text style={[styles.medHeaderCell, styles.col5]}>Instructions</Text>
              </View>
              {prescription.medicines.map((med, i) => (
                <View key={i} style={[medRow, i % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}]}>
                  <Text style={[styles.medCell, styles.col1, { fontFamily: 'Helvetica-Bold' }]}>{med.name}</Text>
                  <Text style={[styles.medCell, styles.col2]}>{med.dosage}</Text>
                  <Text style={[styles.medCell, styles.col3]}>{med.frequency}</Text>
                  <Text style={[styles.medCell, styles.col4]}>{med.duration}</Text>
                  <Text style={[styles.medCell, styles.col5]}>{med.instructions ?? ''}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        {prescription.notes && (
          <View style={styles.notes}>
            <Text style={{ fontSize: 8, color: '#713f12', fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>INSTRUCTIONS / NOTES</Text>
            <Text style={styles.notesText}>{prescription.notes}</Text>
          </View>
        )}

        {/* Signature */}
        <View style={{ marginTop: 40 }}>
          <View style={styles.signature}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Dr. {doctor.name}</Text>
            {doctor.qualifications && <Text style={{ fontSize: 8, color: '#64748b' }}>{doctor.qualifications}</Text>}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Generated by {doctor.clinicName}</Text>
          <Text style={styles.footerText}>Prescription ID: {prescription.id.slice(0, 8).toUpperCase()}</Text>
        </View>
      </Page>
    </Document>
  )
}

// Hack: medRow referenced before styles
const medRow = styles.medRow

interface PrescriptionPDFProps extends PrescriptionPDFDocProps {
  onClose: () => void
}

export default function PrescriptionPDF({ prescription, patient, appointment, doctor, onClose }: PrescriptionPDFProps) {
  const filename = `Prescription_${patient.name.replace(/\s/g, '_')}_${format(parseISO(appointment.startTime), 'ddMMMyyyy')}.pdf`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="card p-6 max-w-sm w-full text-center space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Download Prescription</h3>
          <button onClick={onClose} className="btn btn-ghost p-2"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-500">Your prescription PDF is ready to download.</p>
        <PDFDownloadLink
          document={<PrescriptionDocument prescription={prescription} patient={patient} appointment={appointment} doctor={doctor} />}
          fileName={filename}
          className="btn btn-primary w-full"
        >
          {({ loading }) => loading ? 'Generating PDF...' : '⬇️ Download PDF'}
        </PDFDownloadLink>
        <button onClick={onClose} className="btn btn-ghost w-full text-sm">Close</button>
      </div>
    </div>
  )
}

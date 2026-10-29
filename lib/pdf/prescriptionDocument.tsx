import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { Medicine } from '@/lib/constants'
import { dayRangeLabel, taperSchedule } from '@/lib/taper'
import { Txt, accentOf, printableRegistration, type PdfImage } from './common'
import { FONT_LATIN } from './fonts'
import { mmToPt, STANDARD_LAYOUT, type PdfLayout } from './layout'

const A4 = { width: 595.28, height: 841.89 }

const styles = StyleSheet.create({
  page: { fontFamily: FONT_LATIN, fontSize: 10, color: '#1e293b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, borderBottomWidth: 2, borderBottomStyle: 'solid', paddingBottom: 12 },
  clinicName: { fontSize: 18, fontWeight: 700 },
  doctorName: { fontSize: 11, color: '#475569', marginTop: 2 },
  small: { fontSize: 9, color: '#64748b', marginTop: 2 },
  rxBig: { fontSize: 48, color: '#DBEAFE', position: 'absolute', right: 40, top: 58, fontWeight: 700 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  patientRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  patientField: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 4, padding: 8 },
  fieldLabel: { fontSize: 8, color: '#94a3b8', marginBottom: 2 },
  fieldValue: { fontSize: 10, fontWeight: 700 },
  diagnosisBox: { backgroundColor: '#EFF6FF', borderRadius: 6, padding: 10, marginBottom: 16 },
  medHeader: { flexDirection: 'row', borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 4 },
  medHeaderCell: { color: 'white', fontWeight: 700, fontSize: 9 },
  medRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#f1f5f9' },
  medCell: { fontSize: 9 },
  stepRow: { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 8 },
  col1: { width: '30%' },
  col2: { width: '18%' },
  col3: { width: '22%' },
  col4: { width: '15%' },
  col5: { width: '15%' },
  notes: { backgroundColor: '#fefce8', borderRadius: 6, padding: 10, marginBottom: 16 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#e2e8f0', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#94a3b8' },
  signature: { borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#94a3b8', marginTop: 40, paddingTop: 4, fontSize: 9, textAlign: 'center' },
})

export interface PrescriptionDocProps {
  prescription: { id: string; diagnosis?: string | null; medicines: Medicine[]; notes?: string | null; /** Already formatted, e.g. "12 Nov 2026". */ followUpText?: string }
  patient: { name: string; phone: string; /** Already formatted, empty when unknown. */ dob?: string }
  visit: { /** Already formatted in the clinic's timezone. */ dateText: string; chiefComplaint?: string | null }
  doctor: {
    name: string
    clinicName: string
    qualifications?: string
    address?: string
    phone?: string
    registrationNumber?: string
    /** #RRGGBB brand colour. */
    primary?: string
    logo?: PdfImage
  }
  layout?: PdfLayout
}

function MedicineRow({ med, index }: { med: Medicine; index: number }) {
  const shade = index % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}
  const steps = med.taper?.steps?.length ? taperSchedule(med.taper.steps) : null

  if (!steps) {
    return (
      <View wrap={false} style={[styles.medRow, shade]}>
        <Txt style={[styles.medCell, styles.col1, { fontWeight: 700 }]}>{med.name}</Txt>
        <Txt style={[styles.medCell, styles.col2]}>{med.dosage}</Txt>
        <Txt style={[styles.medCell, styles.col3]}>{med.frequency}</Txt>
        <Txt style={[styles.medCell, styles.col4]}>{med.duration}</Txt>
        <Txt style={[styles.medCell, styles.col5]}>{med.instructions}</Txt>
      </View>
    )
  }

  // A tapering medicine: its name, then one line per stage with the days it covers.
  return (
    <View wrap={false} style={[{ paddingVertical: 5, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#f1f5f9' }, shade]}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, marginBottom: 2 }}>
        <Txt style={[styles.medCell, styles.col1, { fontWeight: 700 }]}>{med.name}</Txt>
        <Text style={[styles.medCell, { width: '55%', color: '#64748b' }]}>{`Tapering dose, ${steps[steps.length - 1].to} days in all`}</Text>
        <Txt style={[styles.medCell, styles.col5]}>{med.instructions}</Txt>
      </View>
      {steps.map((s, i) => (
        <View key={i} style={styles.stepRow}>
          <Text style={[styles.medCell, styles.col1, { color: '#64748b', paddingLeft: 8 }]}>{dayRangeLabel(s)}</Text>
          <Txt style={[styles.medCell, styles.col2]}>{s.dose}</Txt>
          <Txt style={[styles.medCell, styles.col3]}>{s.frequency}</Txt>
          <Text style={[styles.medCell, styles.col4]}>{`${s.days} ${s.days === 1 ? 'day' : 'days'}`}</Text>
          <Txt style={[styles.medCell, styles.col5]}>{s.instructions}</Txt>
        </View>
      ))}
    </View>
  )
}

export function PrescriptionDocument({ prescription, patient, visit, doctor, layout = STANDARD_LAYOUT }: PrescriptionDocProps) {
  const accent = accentOf(doctor.primary, '#1e40af')
  const registration = printableRegistration(doctor.registrationNumber)

  // Our own header and footer are used only when nothing else says who the clinic is.
  const ownBranding = layout.mode === 'standard' && !layout.letterhead
  const pagePadding = ownBranding
    ? { padding: 40 }
    : {
        paddingTop: mmToPt(layout.margins.top), paddingBottom: mmToPt(layout.margins.bottom),
        paddingLeft: mmToPt(layout.margins.left), paddingRight: mmToPt(layout.margins.right),
      }

  return (
    <Document title={`Prescription - ${patient.name} - ${visit.dateText}`} author={doctor.clinicName}>
      <Page size="A4" style={[styles.page, pagePadding]}>
        {layout.mode === 'standard' && layout.letterhead && (
          <Image
            fixed
            src={{ data: layout.letterhead.data, format: layout.letterhead.format }}
            style={{ position: 'absolute', top: 0, left: 0, width: A4.width, height: A4.height }}
          />
        )}

        {ownBranding ? (
          <>
            <Text style={styles.rxBig}>Rx</Text>
            <View style={[styles.header, { borderBottomColor: accent }]}>
              <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                {doctor.logo && <Image src={{ data: doctor.logo.data, format: doctor.logo.format }} style={{ width: 48, height: 48, objectFit: 'contain' }} />}
                <View style={{ flex: 1 }}>
                  <Txt style={[styles.clinicName, { color: accent }]}>{doctor.clinicName}</Txt>
                  <Txt style={styles.doctorName}>{`Dr. ${doctor.name}`}</Txt>
                  {doctor.qualifications && <Txt style={styles.small}>{doctor.qualifications}</Txt>}
                  {registration && <Txt style={styles.small}>{registration}</Txt>}
                  {doctor.address && <Txt style={styles.small}>{doctor.address}</Txt>}
                  {doctor.phone && <Txt style={styles.small}>{`Tel: ${doctor.phone}`}</Txt>}
                </View>
              </View>
              <View style={{ textAlign: 'right' }}>
                <Text style={{ fontSize: 9, color: '#64748b' }}>{`Date: ${visit.dateText}`}</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
            <Text style={{ fontSize: 22, fontWeight: 700, color: accent }}>Rx</Text>
            <Text style={{ fontSize: 9, color: '#64748b' }}>{`Date: ${visit.dateText}`}</Text>
          </View>
        )}

        {/* Patient */}
        <View style={styles.patientRow}>
          <View style={styles.patientField}>
            <Text style={styles.fieldLabel}>PATIENT NAME</Text>
            <Txt style={styles.fieldValue}>{patient.name}</Txt>
          </View>
          {patient.dob ? (
            <View style={styles.patientField}>
              <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
              <Text style={styles.fieldValue}>{patient.dob}</Text>
            </View>
          ) : null}
          <View style={styles.patientField}>
            <Text style={styles.fieldLabel}>CONTACT</Text>
            <Text style={styles.fieldValue}>{patient.phone}</Text>
          </View>
        </View>

        {visit.chiefComplaint ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Chief Complaint</Text>
            <Txt style={{ fontSize: 10, color: '#475569' }}>{visit.chiefComplaint}</Txt>
          </View>
        ) : null}

        {prescription.diagnosis ? (
          <View style={styles.diagnosisBox}>
            <Text style={{ fontSize: 8, color: accent, marginBottom: 2 }}>DIAGNOSIS</Text>
            <Txt style={{ fontSize: 11, fontWeight: 700, color: accent }}>{prescription.diagnosis}</Txt>
          </View>
        ) : null}

        {/* Medicines */}
        {prescription.medicines.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prescribed Medicines</Text>
            <View style={[styles.medHeader, { backgroundColor: accent }]} wrap={false}>
              <Text style={[styles.medHeaderCell, styles.col1]}>Medicine</Text>
              <Text style={[styles.medHeaderCell, styles.col2]}>Dosage</Text>
              <Text style={[styles.medHeaderCell, styles.col3]}>Frequency</Text>
              <Text style={[styles.medHeaderCell, styles.col4]}>Duration</Text>
              <Text style={[styles.medHeaderCell, styles.col5]}>Instructions</Text>
            </View>
            {prescription.medicines.map((med, i) => <MedicineRow key={i} med={med} index={i} />)}
          </View>
        )}

        {prescription.notes ? (
          <View style={styles.notes}>
            <Text style={{ fontSize: 8, color: '#713f12', fontWeight: 700, marginBottom: 3 }}>INSTRUCTIONS / NOTES</Text>
            <Txt style={{ fontSize: 9, color: '#713f12' }}>{prescription.notes}</Txt>
          </View>
        ) : null}

        {prescription.followUpText ? (
          <View style={[styles.diagnosisBox, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} wrap={false}>
            <Text style={{ fontSize: 8, color: accent }}>FOLLOW-UP VISIT</Text>
            <Text style={{ fontSize: 11, fontWeight: 700, color: accent }}>{prescription.followUpText}</Text>
          </View>
        ) : null}

        {/* Signature */}
        <View style={{ marginTop: 40 }} wrap={false}>
          <View style={styles.signature}>
            <Txt style={{ fontWeight: 700 }}>{`Dr. ${doctor.name}`}</Txt>
            {doctor.qualifications && <Txt style={{ fontSize: 8, color: '#64748b' }}>{doctor.qualifications}</Txt>}
            {!ownBranding && registration && <Txt style={{ fontSize: 8, color: '#64748b' }}>{registration}</Txt>}
          </View>
        </View>

        {ownBranding && (
          <View style={styles.footer} fixed>
            <Txt style={styles.footerText}>{`Generated by ${doctor.clinicName}`}</Txt>
            <Text style={styles.footerText}>{`Prescription ID: ${prescription.id.slice(0, 8).toUpperCase()}`}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}

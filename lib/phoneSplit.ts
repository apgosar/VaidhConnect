/**
 * Splits an international number (+919773776803) into its country code (+91) and the rest (9773776803),
 * for forms that show them in two fields.
 *
 * A pattern like "up to 4 digits" cannot do this: calling codes are 1 to 3 digits, and an Indian number
 * starts "+91 97..." so a greedy match swallows two digits of the number into the code. Country calling
 * codes are prefix-free (no code starts another), so the right split is the one code that matches.
 */
const ONE = ['1', '7']
const TWO = [
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
]
const THREE = [
  '211', '212', '213', '216', '218',
  '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235',
  '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251',
  '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268',
  '269', '290', '291', '297', '298', '299',
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359',
  '370', '371', '372', '373', '374', '375', '376', '377', '378', '379', '380', '381', '382', '383', '385', '386',
  '387', '389', '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509',
  '590', '591', '592', '593', '594', '595', '596', '597', '598', '599',
  '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687',
  '688', '689', '690', '691', '692',
  '800', '808', '850', '852', '853', '855', '856', '870', '878', '880', '881', '882', '883', '886',
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976',
  '977', '992', '993', '994', '995', '996', '998',
]
const CODES = new Set([...ONE, ...TWO, ...THREE])

export function splitPhone(phone: string): { countryCode: string; national: string } | null {
  const m = /^\+(\d{8,15})$/.exec(phone.replace(/[\s\-()]/g, ''))
  if (!m) return null
  const digits = m[1]
  for (const len of [1, 2, 3]) {
    if (CODES.has(digits.slice(0, len))) return { countryCode: `+${digits.slice(0, len)}`, national: digits.slice(len) }
  }
  // An unassigned prefix: keep every digit, guessing a two-digit code rather than losing the number.
  return { countryCode: `+${digits.slice(0, 2)}`, national: digits.slice(2) }
}

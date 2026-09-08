import { NextRequest, NextResponse } from 'next/server';
import { createPatientSessionCookie, clearPatientSessionCookie, getPatientSession } from '@/lib/auth/patientSession';

export async function GET() {
  const session = await getPatientSession();
  return NextResponse.json({
    authenticated: !!session,
    phoneNumber: session?.phoneNumber ?? null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing ID Token' }, { status: 401 });
    }

    const success = await createPatientSessionCookie(idToken);

    if (success) {
      return NextResponse.json({ status: 'success' }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE() {
  await clearPatientSessionCookie();
  return NextResponse.json({ status: 'success' }, { status: 200 });
}

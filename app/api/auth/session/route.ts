import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookie, clearSessionCookie, getSession } from '@/lib/auth/session';

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ 
    authenticated: !!session,
    uid: session?.uid 
  });
}

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    
    if (!idToken) {
      return NextResponse.json({ error: 'Missing ID Token' }, { status: 401 });
    }

    const success = await createSessionCookie(idToken);
    
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
  await clearSessionCookie();
  return NextResponse.json({ status: 'success' }, { status: 200 });
}

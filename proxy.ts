import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default async function proxy(req: any) {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const path = req.nextUrl.pathname
  const isAuthPage = path.startsWith('/doctor/login') || path.startsWith('/doctor/forgot-password') || path.startsWith('/doctor/reset-password')

  console.log(`[Proxy] Path: ${path}, isAuthPage: ${isAuthPage}, isLoggedIn: ${isLoggedIn}`)

  if (!isLoggedIn && !isAuthPage && path.startsWith('/doctor')) {
    console.log(`[Proxy] Redirecting to login`)
    return NextResponse.redirect(new URL('/doctor/login', req.nextUrl))
  }

  if (isLoggedIn && isAuthPage) {
    console.log(`[Proxy] Redirecting to dashboard`)
    return NextResponse.redirect(new URL('/doctor/dashboard', req.nextUrl))
  }

  console.log(`[Proxy] Passing through`)
  return NextResponse.next()
}

export const config = {
  matcher: ['/doctor/:path*'],
}

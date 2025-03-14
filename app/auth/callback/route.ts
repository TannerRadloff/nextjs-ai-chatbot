import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/auth'
import { getBaseUrl, createUrl } from '@/lib/helpers/url'

export const dynamic = 'force-dynamic'

// Callback handler for OAuth authentication
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    
    // Get query parameters
    const code = requestUrl.searchParams.get('code')
    const error = requestUrl.searchParams.get('error')
    const errorDescription = requestUrl.searchParams.get('error_description')
    
    // Handle any errors from the OAuth provider
    if (error) {
      console.error('[Auth Callback] OAuth provider returned an error:', error, errorDescription)
      
      // Create a consistent URL with the helper functions
      const loginErrorUrl = createUrl(`/login?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`)
      
      // Redirect to the login page with error info
      return NextResponse.redirect(loginErrorUrl)
    }
    
    // Code should always be present for successful OAuth callback
    if (!code) {
      console.error('[Auth Callback] No code parameter found in callback URL')
      
      const loginErrorUrl = createUrl('/login?error=no_code')
      return NextResponse.redirect(loginErrorUrl)
    }
    
    // Exchange the code for a session
    await handleOAuthCallback(code)

    // Force a redirect to the main application route
    const homeUrl = createUrl('/')
    
    return NextResponse.redirect(homeUrl)
  } catch (error) {
    console.error('[Auth Callback] Error processing OAuth callback:', error)
    
    // If there's an error, redirect to the login page
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    const loginErrorUrl = createUrl(`/login?error=${encodeURIComponent(errorMsg)}`)
    
    return NextResponse.redirect(loginErrorUrl)
  }
} 


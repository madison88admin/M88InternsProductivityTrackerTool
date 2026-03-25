// Service Worker for authenticated asset downloads
// Intercepts requests to /functions/v1/download-asset and adds authorization header

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only intercept download-asset requests
  if (!url.pathname.includes('/functions/v1/download-asset')) {
    return;
  }

  // For GET requests, try to add authorization header
  if (event.request.method === 'GET') {
    const authHeader = event.request.headers.get('authorization');
    
    // If auth header is not present, fetch it from session storage
    if (!authHeader) {
      event.respondWith(
        (async () => {
          try {
            // Get the session token from indexedDB (where Supabase stores it)
            const tables = await indexedDB.databases();
            const supabaseDb = tables.find((db) =>
              db.name.includes('supabase')
            );

            if (supabaseDb) {
              // Try to get token from session
              const req = new Request(event.request);
              
              // Get token from localStorage or sessionStorage
              let token = localStorage.getItem('sb-token');
              if (!token) {
                token = sessionStorage.getItem('sb-token');
              }

              if (token) {
                const headerValue = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
                const headers = new Headers(event.request.headers);
                headers.set('Authorization', headerValue);
                const newRequest = new Request(event.request, { headers });
                return fetch(newRequest);
              }
            }
          } catch {
            // Silently fail and continue with original request
          }

          return fetch(event.request);
        })()
      );
    }
  }
});

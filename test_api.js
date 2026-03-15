// Native fetch available in Node 18+

async function test() {
  console.log("Testing Phase 5 API Routes...");
  const routes = [
    'http://localhost:3000/api/services',
    'http://localhost:3000/api/auth/businesses',
    'http://localhost:3000/api/admin/categories'
  ];

  for (const route of routes) {
    try {
      const res = await fetch(route);
      console.log(`${route}: ${res.status} ${res.statusText}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`  Data Length: ${data.length}`);
      } else {
        const err = await res.text();
        console.error(`  Error: ${err}`);
      }
    } catch (e) {
      console.error(`${route}: FAILED - ${e.message}`);
    }
  }
}

test();

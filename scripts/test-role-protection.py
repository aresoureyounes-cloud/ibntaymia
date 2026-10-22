import asyncio,json,os
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page()
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
  await page.goto('http://localhost:8080/dashboard/users',wait_until='networkidle')
  result=await page.evaluate('''async(uid)=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {data:before,error}=await supabase.from('user_roles').select('role').eq('user_id',uid);if(error)throw error;const {error:writeError}=await supabase.from('user_roles').insert({user_id:uid,role:'teacher'});if(writeError?.code!=='42501')throw new Error('Browser role write not denied');const {data:after}=await supabase.from('user_roles').select('role').eq('user_id',uid);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Roles changed');const {listAccounts}=await import('/src/lib/admin-accounts.functions.ts');const accounts=await listAccounts();if(!accounts.some(a=>a.id===uid))throw new Error('Authorized list stopped working');return {directRoleWriteDenied:true,rolesUnchanged:true,authorizedListWorks:true};}''',minted['user_id'])
  print('Role protection:',result)
  await browser.close()
asyncio.run(main())

import asyncio,json,os,uuid
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page()
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
  await page.goto('http://localhost:8080/dashboard/import',wait_until='networkidle')
  suffix=uuid.uuid4().hex
  result=await page.evaluate('''async(suffix)=>{
   const {bulkImportAccounts}=await import('/src/lib/bulk-import.functions.ts');
   const {listAccounts,deleteAccount}=await import('/src/lib/admin-accounts.functions.ts');
   const {supabase}=await import('/src/integrations/supabase/client.ts');
   const email='verify.'+suffix+'@idarroom.local';
   const badEmail='verify.bad.'+suffix+'@idarroom.local';
   let uid=null;
   try {
    const first=await bulkImportAccounts({data:{kind:'student',create_badge:false,rows:[{email,full_name:'تلميذ اختبار الاستيراد'}]}});
    if(first.results[0]?.status!=='created'||!first.results[0]?.password)throw new Error('Account creation failed');
    const {data:student,error}=await supabase.from('students').select('id,user_id').eq('fake_email',email).single();if(error)throw error;uid=student.user_id;
    const next=await bulkImportAccounts({data:{kind:'student',create_badge:false,rows:[{email,full_name:'تلميذ اختبار محدث'}]}});
    if(next.results[0]?.status!=='existed'||next.results[0]?.password!==null)throw new Error('Existing account was not reused');
    const {data:updated}=await supabase.from('students').select('full_name').eq('id',student.id).single();if(updated?.full_name!=='تلميذ اختبار محدث')throw new Error('Updated name not read back');
    const failed=await bulkImportAccounts({data:{kind:'student',create_badge:false,rows:[{email:badEmail,full_name:'تلميذ اختبار فاشل',date_of_birth:'not-a-date'}]}});
    if(failed.results[0]?.status!=='error')throw new Error('Failure was reported as success');
    const accounts=await listAccounts();if(accounts.some(a=>a.email===badEmail))throw new Error('Failed new account was not removed');
    return {created:true,existingReused:true,updatedReadBack:true,invalidRowRejected:true,failedAccountRemoved:true};
   } finally {
    for(const address of [email,badEmail]){
     const {error}=await supabase.from('students').delete().eq('fake_email',address);if(error)throw error;
    }
    const accounts=await listAccounts();for(const a of accounts.filter(a=>[email,badEmail].includes(a.email)))await deleteAccount({data:{userId:a.id}});
   }
  }''',suffix)
  print('Import verification:',result)
  await page.screenshot(path='/tmp/browser/readiness/import-page.png')
  await browser.close()
asyncio.run(main())

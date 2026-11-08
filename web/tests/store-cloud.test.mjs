import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';

test('Cloud jobs use the existing private table without the legacy quota RPC',async()=>{
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests.push({method:req.method,url:req.url,body:JSON.parse(body)});
    res.statusCode=201;res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  process.env.SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
  try{
    const {reserve}=await import('../lib/store.mjs');
    const job={id:randomUUID(),owner_hash:'test-owner',created_at:new Date().toISOString(),files:[],context:{},status:'uploading',attempts:0,reserved_bytes:800*1024*1024,report:null,error:null};
    await reserve(job);
    assert.deepEqual(requests,[{method:'POST',url:'/rest/v1/review_jobs',body:job}]);
  }finally{delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;await new Promise(r=>server.close(r));}
});

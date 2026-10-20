import {categoryTerms,validPoint,distanceMeters,queryNYC,officialRecord,searchQuery} from '../../../../lib/nyc311';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function handle(req:Request){
 const user=await getChatGPTUser();
 const reviewer=!!user&&!!(env as any).REVIEWER_EMAIL&&(env as any).REVIEWER_EMAIL.toLowerCase()===user.email.toLowerCase();
 const path=new URL(req.url).pathname.split('/').filter(Boolean).slice(2);
 if(path[0]==='session')return json({signedIn:!!user,reviewer});
 if(!user)return json({error:'Please sign in to continue.'},401);
 if(req.method!=='GET'&&req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid request origin.'},403);
 const db=env.DB!,bucket=env.BUCKET!;
 if(!db||!bucket)return json({error:'Report storage is temporarily unavailable.'},503);
 if(req.method==='GET'&&path[0]==='matches'){
  const p=new URL(req.url).searchParams;const lat=Number(p.get('lat')),lon=Number(p.get('lon')),category=p.get('category')||'',radius=Number(p.get('radius')||500),days=Number(p.get('days')||30);
  if(!p.get('lat')||!p.get('lon')||!validPoint(lat,lon)||!Object.hasOwn(categoryTerms,category)||![250,500,1000].includes(radius)||![7,30,90].includes(days))return json({error:'Choose a category and a location within NYC.'},400);
  try{const rows=await queryNYC(searchQuery(lat,lon,category,radius,days));const matches=rows.filter((r:any)=>r.latitude&&r.longitude&&r.unique_key).map((r:any)=>({...r,distance:distanceMeters(lat,lon,+r.latitude,+r.longitude)})).sort((a:any,b:any)=>a.distance-b.distance).slice(0,8);return json({matches,checkedAt:new Date().toISOString(),radius,days,capped:rows.length===100,considered:rows.length});}catch{return json({error:'NYC 311 search is unavailable right now. You can retry or submit a separate report.'},503)}
 }
 if(req.method==='GET'&&!path.length){
  const agency=new URL(req.url).searchParams.get('view')==='agency';if(agency&&!reviewer)return json({error:'This queue is restricted to the reviewer.'},403);
  const result=agency?await db.prepare('SELECT id,title,category,address,status,created,updated FROM issues ORDER BY created DESC LIMIT 200').all():await db.prepare('SELECT id,title,category,address,status,created,updated FROM issues WHERE owner=? ORDER BY created DESC LIMIT 200').bind(user.userId).all();
  return json({issues:result.results,limit:200});
 }
 if(req.method==='POST'&&!path.length){
  if(Number(req.headers.get('content-length')||0)>6*1024*1024)return json({error:'Maximum upload size is 5 MB.'},413);
  const form=await req.formData();const text=(key:string)=>String(form.get(key)||'').trim();
  const title=text('title'),description=text('description'),category=text('category'),address=text('address');
  const lat=Number(text('latitude')),lon=Number(text('longitude'));
  if(title.length<5||title.length>100||description.length<15||description.length>3000||!address||address.length>200||!['Noise','Parking / traffic','Sanitation','Buildings / housing','Other'].includes(category)||!text('latitude')||!text('longitude')||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<40.45||lat>40.95||lon< -74.3||lon> -73.65)return json({error:'Check the report fields and select a location within NYC.'},400);
  const officialId=text('officialId');let official:any=null;let officialChecked:string|null=null;
  if(officialId){if(!/^\d{1,20}$/.test(officialId))return json({error:'Invalid NYC request ID.'},400);try{official=await officialRecord(officialId)}catch{return json({error:'We could not verify the selected NYC report. Retry or choose a separate report to submit without a link.'},503)}if(!official||!official.latitude||!official.longitude||distanceMeters(lat,lon,+official.latitude,+official.longitude)>1005)return json({error:'The selected NYC report is no longer a valid nearby match. Search again or submit separately.'},400);officialChecked=new Date().toISOString();}
  const recent=await db.prepare("SELECT COUNT(*) AS count FROM issues WHERE owner=? AND created>?").bind(user.userId,new Date(Date.now()-3600000).toISOString()).first<{count:number}>();if((recent?.count||0)>=10)return json({error:'You can submit up to 10 reports per hour. Please try again later.'},429);
  const id=crypto.randomUUID(),now=new Date().toISOString();let photo:string|null=null;const file=form.get('photo');
  if(file instanceof File&&file.size){if(file.size>5*1024*1024)return json({error:'Choose a JPG, PNG, or WebP photo under 5 MB.'},400);const bytes=new Uint8Array(await file.arrayBuffer());const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'image/png':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'?'image/webp':null;if(!mime)return json({error:'Unsupported photo. Please use JPG, PNG, or WebP.'},400);photo='reports/'+id;await bucket.put(photo,bytes,{httpMetadata:{contentType:mime}});}
  try{await db.batch([db.prepare('INSERT INTO issues (id,owner,title,description,category,address,latitude,longitude,status,photo,created,updated,official_id,official_snapshot,official_checked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user.userId,title,description,category,address,lat,lon,'New',photo,now,now,officialId||null,official?JSON.stringify(official):null,officialChecked),db.prepare('INSERT INTO events (id,issue,actor,status,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,user.userId,'New',now)]);}catch(e){if(photo)await bucket.delete(photo);throw e}
  return json({id},201);
 }
 const id=path[0];if(!id)return json({error:'Not found.'},404);
 const issue=await db.prepare('SELECT * FROM issues WHERE id=?').bind(id).first<any>();if(!issue||(!reviewer&&issue.owner!==user.userId))return json({error:'Report not found.'},404);
 if(req.method==='GET'&&path[1]==='official'){
  if(!issue.official_id)return json({error:'No NYC request is linked.'},404);
  try{const record=await officialRecord(issue.official_id);if(!record)return json({error:'The linked NYC request was not found. The saved reference remains available.'},404);return json({record,checkedAt:new Date().toISOString()})}catch{return json({error:'NYC Open Data is unavailable. The saved reference is unchanged.'},503)}
 }
 if(req.method==='GET'&&path[1]==='photo'){if(!issue.photo)return json({error:'No photo attached.'},404);const obj=await bucket.get(issue.photo);if(!obj)return json({error:'Photo unavailable.'},404);return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}
 if(req.method==='GET'&&path.length===1){const history=await db.prepare('SELECT status,created FROM events WHERE issue=? ORDER BY created ASC,rowid ASC').bind(id).all();const {owner,photo,...safe}=issue;return json({issue:{...safe,hasPhoto:!!photo},history:history.results,reviewer})}
 if(req.method==='PATCH'&&path.length===1){if(!reviewer)return json({error:'Only the reviewer can change status.'},403);const body=await req.json() as any;const next=body.status;if(!['New','Reviewing','Resolved'].includes(next))return json({error:'Invalid status.'},400);if(next===issue.status)return json({ok:true});if(body.updated!==issue.updated)return json({error:'This report changed. Refresh before updating.'},409);const now=new Date().toISOString();const result=await db.batch([db.prepare('UPDATE issues SET status=?,updated=? WHERE id=? AND updated=?').bind(next,now,id,body.updated),db.prepare('INSERT INTO events (id,issue,actor,status,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM issues WHERE id=? AND updated=?)').bind(crypto.randomUUID(),id,user.userId,next,now,id,now)]);if(!result[0].meta.changes)return json({error:'This report changed. Refresh before updating.'},409);return json({ok:true})}
 return json({error:'Not found.'},404);
}
async function safe(req:Request){try{return await handle(req)}catch(e){console.error('Report request failed',e);return json({error:'Unable to complete this request. Please try again.'},500)}}
export {safe as GET,safe as POST,safe as PATCH};

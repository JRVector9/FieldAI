/* Notification-only worker: no fetch/cache handler, no receipt keys or dialogue payloads. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let payload;try{payload=event.data?.json();}catch{payload=null;}
 const tag=typeof payload?.tag==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.tag)?payload.tag:'agent-work-notification';
 event.waitUntil(self.registration.showNotification('새 처리 업무',{body:'관리실에서 확인해 주세요.',tag}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL('/workspace#agent-notifications',self.location.origin).href;
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>client.url===target);
  if(existing){await existing.focus();return;}await self.clients.openWindow(target);})());
});

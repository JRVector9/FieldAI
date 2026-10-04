import { assertAccountDeletionServing } from './account-deletion-journal.js';
import { Pool } from 'pg';
import { notificationContextFromEnvironment } from './notification-context.js';
import { runNotificationDeliveryOnce } from './notification-delivery-execution.js';
const profile=process.env.FIELD_PROFILE;if(!['mock','sandbox','live'].includes(profile??'')||process.env.NODE_ENV==='production'&&profile!=='live')throw Error('invalid_FIELD_notification_profile');
const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL});const notification=notificationContextFromEnvironment();let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
console.log(`Field notification worker ready (${notification?.provider||notification?.pushProvider?'configured':'blocked_integration'})`);
try{do{try{await assertAccountDeletionServing(pool);const state=await runNotificationDeliveryOnce({pool,notification});if(process.argv.includes('--once')){console.log(`Field notification worker ${state}`);break;}}catch{console.error('Field notification worker operation failed');if(process.argv.includes('--once')){process.exitCode=1;break;}}if(!stopping)await new Promise(r=>setTimeout(r,1000));}while(!stopping);}finally{await pool.end();}

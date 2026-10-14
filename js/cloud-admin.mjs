import {CloudClient} from './cloud-client.mjs';
import {mountAccountPanel} from './cloud-account-panel.mjs';
const client = new CloudClient(window.GINOMAI_CLOUD_CONFIG), panel = mountAccountPanel(client);
const status = document.getElementById('report-status'), table = document.getElementById('report-table'), body = document.getElementById('report-body'), refresh = document.getElementById('report-refresh');
let generation = 0;
async function load() {
  const request = ++generation; table.hidden = true; refresh.hidden = !client.session;
  if (!client.session) {status.textContent = client.configured ? 'Sign in to view the report.' : 'Cloud reporting has not been configured.'; return;}
  status.textContent = 'Loading private report…';
  try {
    const token = await client.accessToken(); const report = await client.request('/rest/v1/rpc/cloud_admin_report', {token, body:{}});
    if (request !== generation || !client.session) return;
    const rows = [['Verified accounts', report.verified_accounts], ['Active accounts today', report.daily_accounts], ['Active accounts in the last 30 days', report.monthly_accounts],
      ['Active installations today', report.daily_installations], ['Active installations in the last 30 days', report.monthly_installations]];
    body.replaceChildren(...rows.map(([label,count]) => {const row = document.createElement('tr'), name = document.createElement('th'), value = document.createElement('td'); name.scope = 'row'; name.textContent = label; value.textContent = String(count); row.append(name,value); return row;}));
    table.hidden = false; status.textContent = `Updated ${new Date(report.generated_at).toLocaleString()}`;
  } catch (error) {if (request === generation) status.textContent = error.status === 403 ? 'This account does not have administrator access.' : error.message;}
}
client.subscribe(() => {generation++; table.hidden = true; refresh.hidden = !client.session; status.textContent = client.session ? 'Signed in. Refresh to load the report.' : 'Sign in to view the report.';});
refresh.onclick = load; load();

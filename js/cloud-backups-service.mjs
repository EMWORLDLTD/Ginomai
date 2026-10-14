import {validateCloudBackup, MAX_BACKUP_BYTES} from './cloud-backup.mjs';
export class CloudBackups {
  constructor(client) {this.client = client;}
  async rpc(name, body) {
    const generation = this.client.generation;
    const token = await this.client.accessToken();
    const data = await this.client.request(`/rest/v1/rpc/${name}`, {body, token});
    if (generation !== this.client.generation) throw Error('Account changed. Open backups again.');
    return data;
  }
  list() {return this.rpc('cloud_backup_list', {});}
  save(input) {
    if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_BACKUP_BYTES) throw Error('Cloud backups must be 20 MiB or smaller.');
    return this.rpc('cloud_backup_save', {p_payload: validateCloudBackup(input)});
  }
  async get(backupId) {
    const data = await this.rpc('cloud_backup_get', {p_id: backupId});
    if (!data) throw Error('Backup not found for this account.');
    return validateCloudBackup(data);
  }
  delete(backupId) {return this.rpc('cloud_backup_delete', {p_id: backupId});}
}
export function mountBackupControls(panel, client, adapter) {
  const service = new CloudBackups(client), {node, icon, backupHost} = panel;
  const heading = node('div', '', 'ginomai-backup-heading'), title = node('h3', 'Cloud backups'), tools = node('div', '', 'ginomai-backup-tools');
  const refresh = node('button', '', 'ginomai-backup-refresh'); refresh.type = 'button'; refresh.setAttribute('aria-label', 'Refresh backups'); refresh.title = 'Refresh backups'; refresh.append(icon('refresh'));
  tools.append(panel.info('About cloud backups', 'Songs and saved services only. Media and Bible packs must be installed locally. Your latest five backups are kept.', 'ginomai-backup-details'),refresh); heading.append(title,tools);
  const empty = node('div', '', 'ginomai-backup-empty'), mark = node('span', '', 'ginomai-backup-mark'); mark.append(icon('cloud')); empty.append(mark,node('h3','No backups yet'),node('p','Keep your songs and services safe.')); empty.hidden = true;
  const loading = node('p', 'Loading backups…', 'ginomai-backup-loading'), list = node('div', '', 'ginomai-backup-list'), confirmation = node('div', '', 'ginomai-backup-confirm'); confirmation.hidden = true;
  const save = node('button', '', 'ginomai-account-primary'); save.type = 'button'; save.append(icon('upload'),node('span','Back up now'));
  const actions = node('div', '', 'ginomai-backup-actions'); actions.append(save);
  backupHost.append(heading, loading, empty, list, actions, confirmation);
  let listGeneration = 0, busy = false, accountId = client.session?.user?.id;
  function reset() {listGeneration++; list.replaceChildren(); empty.hidden = true; loading.hidden = false; confirmation.hidden = true; confirmation.replaceChildren();}
  function update() {
    save.disabled = refresh.disabled = busy || !client.session;
    const nextId = client.session?.user?.id;
    if (nextId !== accountId || !client.session) reset();
    accountId = nextId;
  }
  async function refreshList() {
    if (!client.session || !panel.isOpen()) return;
    const generation = ++listGeneration; const records = await service.list();
    if (generation !== listGeneration || !client.session) return;
    const rows = records.map(record => {
      const row = node('div', '', 'ginomai-backup-row');
      const details = node('div', '', 'ginomai-backup-record'), created = new Date(record.created_at);
      details.append(node('strong',created.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})),node('p',`${created.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})} · ${record.source_platform === 'desktop' ? 'Desktop' : 'Web'} · ${(record.byte_size / 1048576).toFixed(2)} MiB`));
      const buttons = node('div', '', 'ginomai-backup-row-actions'), restore = node('button', 'Restore'), remove = node('button', '', 'ginomai-backup-delete'); restore.type = remove.type = 'button'; remove.setAttribute('aria-label','Delete'); remove.title = 'Delete backup'; remove.append(icon('trash'));
      restore.onclick = () => panel.run(async () => {
        const backup = await service.get(record.id), notices = adapter.notices(backup), accountGeneration = client.generation;
        confirmation.replaceChildren(node('p', `Restore ${backup.sessions.length} saved sessions and ${backup.songs.length} songs from ${backup.sourcePlatform}? Local edits and the current projection will be kept.`));
        for (const message of notices) confirmation.append(node('p', message));
        const accept = node('button', 'Add restored sessions'), cancel = node('button', 'Cancel'); accept.type = cancel.type = 'button';
        accept.onclick = () => panel.run(async () => {
          if (accountGeneration !== client.generation || !client.session) throw Error('Account changed. Open backups again.');
          await new Promise(resolve => setTimeout(resolve, 0));
          panel.say(await adapter.restore(backup)); confirmation.hidden = true;
        });
        cancel.onclick = () => {confirmation.hidden = true;}; confirmation.append(accept, cancel); confirmation.hidden = false; panel.say('Review the restore details before continuing.');
      });
      remove.onclick = () => {
        confirmation.replaceChildren(node('p', 'Delete this cloud backup? Local songs and sessions will be kept.'));
        const accept = node('button', 'Delete backup'), cancel = node('button', 'Cancel'); accept.type = cancel.type = 'button';
        accept.onclick = () => panel.run(async () => {await service.delete(record.id); confirmation.hidden = true; await refreshList(); panel.say('Cloud backup deleted.');});
        cancel.onclick = () => {confirmation.hidden = true;}; confirmation.append(accept, cancel); confirmation.hidden = false;
      };
      buttons.append(restore, remove); row.append(details,buttons); return row;
    });
    list.replaceChildren(...rows); empty.hidden = Boolean(records.length); loading.hidden = true;
  }
  save.onclick = () => panel.run(async () => {
    busy = true; update();
    try {await new Promise(resolve => setTimeout(resolve, 0)); await service.save(await adapter.capture()); await refreshList(); panel.say('Cloud backup saved.');}
    finally {busy = false; update();}
  });
  refresh.onclick = () => panel.run(async () => {await refreshList(); panel.say('Backups refreshed.');});
  return {update, opened() {refreshList().catch(error => {loading.hidden = true; panel.say(error.message);});}};
}

export function mountAccountPanel(client, adapter = null) {
  const node = (tag, text, className) => {const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el;};
  const icon = kind => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key,value);
    const paths = {user:['M20 21a8 8 0 0 0-16 0','M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],close:['m6 6 12 12','M18 6 6 18'],shield:['M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4','m9 12 2 2 4-4'],chevron:['m9 5 7 7-7 7'],cloud:['M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 3 16.3','M7 20h10'],upload:['M12 20V10','m8 14 4-4 4 4'],refresh:['M20 7v5h-5','M4 17v-5h5','M6 7a7 7 0 0 1 12-1l2 3','M18 17a7 7 0 0 1-12 1l-2-3'],info:['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0','M12 11v6','M12 7h.01'],logout:['M9 21H4V3h5','M9 12h12','m17 8 4 4-4 4'],trash:['M3 6h18','M9 6V3h6v3','M5 6l1 15h12l1-15','M10 10v7','M14 10v7']};
    for (const d of paths[kind]) {const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',d); svg.append(path);}
    return svg;
  };
  const info = (label, description, id) => {
    const wrap = node('span', '', 'ginomai-account-info'), button = node('button', '', 'ginomai-account-info-button'), tooltip = node('p', description, 'ginomai-account-tooltip');
    button.type = 'button'; button.setAttribute('aria-label', label); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-describedby', id); button.append(icon('info'));
    tooltip.id = id; tooltip.hidden = true; tooltip.setAttribute('role', 'tooltip');
    let pinned = false;
    const reveal = () => {tooltip.hidden = false; button.setAttribute('aria-expanded', 'true');};
    const dismiss = () => {tooltip.hidden = true; button.setAttribute('aria-expanded', 'false');};
    wrap.onpointerenter = reveal; wrap.onpointerleave = () => {if (!pinned && document.activeElement !== button) dismiss();};
    button.onfocus = reveal; button.onblur = () => {pinned = false; dismiss();};
    button.onclick = () => {pinned = !pinned; if (pinned) reveal(); else dismiss();};
    tooltip.addEventListener('dismiss', () => {pinned = false; dismiss();});
    wrap.append(button, tooltip); return wrap;
  };
  const shield = node('div', '', 'sf-modal-backdrop ginomai-account-shield'); shield.id = 'ginomai-account-backdrop'; shield.style.display = 'none';
  shield.setAttribute('role', 'dialog'); shield.setAttribute('aria-modal', 'true'); shield.setAttribute('aria-labelledby', 'ginomai-account-title');
  const panel = node('section', '', 'ginomai-account-panel'), heading = node('header', '', 'ginomai-account-header'), title = node('h2', 'Sign in to Ginomai'); title.id = 'ginomai-account-title';
  const mark = node('span', '', 'ginomai-account-mark'); mark.append(icon('user'));
  const headingText = node('div'), eyebrow = node('span', 'GINOMAI ACCOUNT', 'ginomai-account-eyebrow'), headerEmail = node('p', '', 'ginomai-account-email'); headerEmail.hidden = true; headingText.append(eyebrow,title,headerEmail);
  const close = node('button', '', 'ginomai-account-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close account panel'); close.append(icon('close')); heading.append(mark,headingText,close);
  const intro = node('p', 'Back up your songs and saved services across devices.', 'ginomai-account-intro');
  const status = node('p', '', 'ginomai-account-status'), feedback = node('p', '', 'ginomai-account-feedback'); feedback.hidden = true; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const emailForm = node('form', '', 'ginomai-email-form'), emailLabel = node('label', 'Email'), email = node('input'); email.type = 'email'; email.required = true; email.autocomplete = 'email'; email.maxLength = 254; email.placeholder = 'you@example.com'; emailLabel.append(email);
  const send = node('button', 'Send sign-in code', 'ginomai-account-primary'); send.type = 'submit'; emailForm.append(emailLabel, send);
  const codeForm = node('form', '', 'ginomai-code-form'), codeLabel = node('label', 'Email code'), code = node('input'); code.inputMode = 'numeric'; code.autocomplete = 'one-time-code'; code.pattern = '[0-9]{6,10}'; code.maxLength = 10; code.required = true; code.placeholder = 'Code'; codeLabel.append(code);
  const verify = node('button', 'Verify', 'ginomai-account-primary'); verify.type = 'submit'; codeForm.append(codeLabel, verify);
  const codeActions = node('div', '', 'ginomai-code-actions'), resend = node('button', 'Resend code', 'ginomai-account-text-button'), changeEmail = node('button', 'Change email', 'ginomai-account-text-button'); resend.type = changeEmail.type = 'button'; codeActions.append(changeEmail,resend);
  const signOut = node('button', '', 'ginomai-account-signout'); signOut.type = 'button'; signOut.setAttribute('aria-label', 'Sign out on this device'); signOut.append(icon('logout'),node('span','Sign out'));
  const auth = node('section', '', 'ginomai-account-auth'); auth.append(status,emailForm,codeForm,codeActions,feedback);
  const offline = node('p', '', 'ginomai-account-offline'); offline.append(icon('shield'),document.createTextNode('An account is optional. You can always work offline.'));
  const backupHost = node('section', '', 'ginomai-cloud-backups'), analyticsHost = node('section', '', 'ginomai-account-analytics');
  const privacy = node('details', '', 'ginomai-account-privacy'), summary = node('summary'); summary.append(icon('shield'),node('span','Privacy preferences'),icon('chevron')); privacy.append(summary,analyticsHost);
  const footer = node('footer', '', 'ginomai-account-footer'); footer.append(privacy,signOut);
  const testBadge = node('span','LOCAL TEST','ginomai-account-test'); testBadge.hidden = !client.testingLocally; eyebrow.append(testBadge);
  panel.append(heading,intro,auth,offline,backupHost,footer); shield.append(panel); document.body.append(shield);
  let origin, blocked = false, background = [], extension, resendTimer;
  const say = text => {feedback.textContent = text; feedback.hidden = !text;};
  const updateResend = () => {
    const remaining = client.pending ? Math.max(0,Math.ceil((client.pending.sentAt + 60000 - client.now()) / 1000)) : 0;
    resend.textContent = remaining ? `Resend in ${remaining}s` : 'Resend code'; resend.disabled = blocked || remaining > 0;
  };
  const update = () => {
    const signed = Boolean(client.session), pending = Boolean(client.pending) && !signed;
    panel.dataset.state = signed ? 'signed-in' : pending ? 'code' : 'email';
    title.textContent = signed ? 'Your account' : pending ? 'Enter code' : 'Sign in to Ginomai';
    intro.textContent = 'Back up your songs and saved services across devices.';
    intro.hidden = pending || signed;
    headerEmail.textContent = client.session?.user?.email || 'Signed in'; headerEmail.hidden = !signed;
    status.textContent = !client.configured ? 'Cloud accounts are not configured yet. Local features remain available.' : signed ? `${client.session.user.email || 'Signed in'}` : pending ? client.pending.email : '';
    status.hidden = signed || !status.textContent;
    emailForm.hidden = !client.configured || signed || pending; codeForm.hidden = !client.configured || !pending;
    codeActions.hidden = !client.configured || !pending; offline.hidden = signed || pending;
    signOut.hidden = !client.session; backupHost.hidden = !adapter || !client.session;
    if (client.pending && !email.value) email.value = client.pending.email;
    send.disabled = verify.disabled = signOut.disabled = changeEmail.disabled = blocked;
    updateResend();
    launcher.classList.toggle('is-signed-in',signed); launcher.title = signed ? `Account · ${client.session.user.email || 'Signed in'}` : 'Sign in to Ginomai';
    extension?.update();
  };
  const run = async action => {
    if (blocked) return; blocked = true; update(); say('Working…');
    try {await action();} catch (error) {say(error.message);} finally {blocked = false; update();}
  };
  function hide() {
    shield.style.display = 'none';
    clearInterval(resendTimer);
    if (window.sfSyncModal) window.sfSyncModal(shield); else {for (const [el, value] of background) el.inert = value; background = [];}
    origin?.focus({preventScroll: true});
  }
  function show() {
    origin = document.activeElement; shield.style.display = 'flex'; update();
    if (window.sfSyncModal) window.sfSyncModal(shield); else {
      background = [...document.body.children].filter(el => el !== shield && !el.matches('script,style,#toast,.app-toast-container')).map(el => [el, el.inert]);
      for (const [el] of background) el.inert = true;
    }
    (!emailForm.hidden ? email : !codeForm.hidden ? code : close).focus({preventScroll: true}); extension?.opened();
    clearInterval(resendTimer); resendTimer = setInterval(() => {if (client.pending && !client.session) updateResend();},1000);
  }
  close.onclick = hide;
  for (const eventName of ['pointerdown', 'mousedown', 'click', 'dblclick']) shield.addEventListener(eventName, event => {
    event.stopPropagation(); if (event.target === shield) {event.preventDefault(); if (eventName === 'click') hide();}
  });
  // Capture before all slide keyboard handlers. Keep background controls inert.
  window.addEventListener('keydown', event => {
    if (shield.style.display === 'none') return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      const tooltip = panel.querySelector('[role=tooltip]:not([hidden])');
      if (tooltip) tooltip.dispatchEvent(new Event('dismiss')); else hide();
      return;
    }
    if (event.key === 'Tab') {
      const controls = [...panel.querySelectorAll('button,input,a,summary')].filter(el => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    }
    event.stopImmediatePropagation();
  }, true);
  emailForm.onsubmit = event => {event.preventDefault(); run(async () => {await client.sendCode(email.value); say(''); code.focus();});};
  resend.onclick = () => run(async () => {await client.sendCode(client.pending.email); say(''); code.focus();});
  changeEmail.onclick = () => {client.resetPending(); code.value = ''; say(''); email.focus();};
  codeForm.onsubmit = event => {event.preventDefault(); run(async () => {await client.verifyCode(code.value); code.value = ''; say(''); extension?.opened();});};
  signOut.onclick = () => run(async () => say(await client.signOut()));
  client.subscribe(update);
  window.addEventListener('storage', event => {if (event.key === client.key) {client.generation++; try {client.session = JSON.parse(event.newValue || 'null');} catch {client.session = null;} client.changed();}});
  const launcher = node('button', '', 'ginomai-account-launcher'); launcher.type = 'button'; launcher.setAttribute('aria-label','Account'); launcher.append(icon('user'),node('span','Account')); launcher.onclick = show;
  (document.querySelector('.bento-topbar,.topbar') || document.body).append(launcher);
  const settings = document.querySelector('#settings-modal-backdrop .settings-nav-list');
  if (settings) {const settingsButton = node('button', 'Account and analytics', 'ginomai-account-launcher'); settingsButton.type = 'button'; settingsButton.onclick = show; settings.append(settingsButton);}
  update();
  return {show, hide, say, run, update, node, icon, info, backupHost, analyticsHost, isOpen: () => shield.style.display !== 'none', setExtension(value) {extension = value; update();}};
}
